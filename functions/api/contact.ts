import { StatusCodes } from "http-status-codes";

interface Contact {
    name: string,
    email: string,
    message: string
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(",").map((o: string) => o.trim())
    : ["http://localhost:8788"];

  let allowedOrigin = allowedOrigins.find((allowed: string) => origin.startsWith(allowed));

  if (!allowedOrigin && origin.match(/^http:\/\/localhost:\d+$/)) {
    allowedOrigin = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowedOrigin || allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    "Access-Control-Max-Age": "86400",
  };
}

function createJsonResponse(data, status = StatusCodes.OK, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

export async function onRequestOptions({ request, env }) {
  return new Response(null, {
    status: StatusCodes.NO_CONTENT,
    headers: getCorsHeaders(request, env),
  });
}

async function checkRateLimit(env, clientIp: string) {
  const rateLimitWindowSeconds = (env.RATE_LIMIT_WINDOW_SECONDS || 60) * 1000;
  const maxRequestsPerIP = env.MAX_REQUESTS_PER_IP || 5;
  const rateLimitKey = `ratelimit-${clientIp}`;
  const attempts = await env.CONTACT_SUBMISSIONS.get(rateLimitKey);

  if (attempts && parseInt(attempts) >= maxRequestsPerIP) {
    return { limited: true };
  }

  await env.CONTACT_SUBMISSIONS.put(rateLimitKey, String((parseInt(attempts) || 0) + 1), {
    expirationTtl: rateLimitWindowSeconds / 1000,
  });

  return { limited: false };
}

async function verifyTurnstile(token: string, secretKey: string, clientIp: string) {
  const verifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

  const formData = new FormData();
  formData.append("secret", secretKey);
  formData.append("response", token);
  if (clientIp) {
    formData.append("remoteip", clientIp);
  }

  const response = await fetch(verifyUrl, {
    method: "POST",
    body: formData,
  });

  const result: any = await response.json();
  return result.success === true;
}

async function parseFormData(request: Request) : Promise<Contact> {
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    return await request.json();
  } else if (contentType.includes("form-data") || contentType.includes("x-www-form-urlencoded")) {
    const formData = await request.formData();

    return {
      name: formData.get("name")?.toString(),
      email: formData.get("email")?.toString(),
      message: formData.get("message")?.toString(),
    //   "cf-turnstile-response": formData.get("cf-turnstile-response"),
    };
  }

  return null;
}

function validateFormFields(contact: Contact, env) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const minNameLength = env.MIN_NAME_LENGTH || 2;
  const maxNameLength = env.MAX_NAME_LENGTH || 200;
  const minMessageLength = env.MIN_MESSAGE_LENGTH || 50;
  const maxMessageLength = env.MAX_MESSAGE_LENGTH || 8000;

  const {name, email, message} = contact;
  if (!name || !email || !message) {
    return { error: "All fields are required" };
  }

  if (!emailRegex.test(email)) {
    return { error: "Invalid email address" };
  }

  if (name.length < minNameLength || name.length > maxNameLength) {
    return { error: `Name must be between ${minNameLength} and ${maxNameLength} characters` };
  }

  if (message.length < minMessageLength || message.length > maxMessageLength) {
    return { error: `Message must be between ${minMessageLength} and ${maxMessageLength} characters` };
  }

  return { valid: true };
}

export const onRequestPost: PagesFunction<Env> = async({request, env}) => {
    const corsHeaders = getCorsHeaders(request, env);
    try {
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";

    // if (!env.CONTACT_SUBMISSIONS) {
    //   return createJsonResponse(
    //     { error: "Contact form is not configured properly. Please try again later." },
    //     StatusCodes.SERVICE_UNAVAILABLE,
    //     corsHeaders
    //   );
    // }

    const rateLimitResult = await checkRateLimit(env, clientIp);
    if (rateLimitResult.limited) {
      return createJsonResponse(
        { error: "Too many requests. Please try again later." },
        StatusCodes.TOO_MANY_REQUESTS,
        corsHeaders
      );
    }

    const formData = await parseFormData(request);
    if (!formData) {
      return createJsonResponse({ error: "Unsupported content type" }, StatusCodes.BAD_REQUEST, corsHeaders);
    }
    // Verify Turnstile token
    const turnstileToken = formData["cf-turnstile-response"];
    if (!turnstileToken) {
      return createJsonResponse(
        { error: "Please complete the security challenge" },
        StatusCodes.BAD_REQUEST,
        corsHeaders
      );
    }

    if (env.TURNSTILE_SECRET_KEY) {
      const isValidToken = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, clientIp);
      if (!isValidToken) {
        return createJsonResponse(
          { error: "Security challenge verification failed. Please try again." },
          StatusCodes.BAD_REQUEST,
          corsHeaders
        );
      }
    }
    let { name, email, message } = formData;
    name = (name || "").trim();
    email = (email || "").trim();
    message = (message || "").trim();

    const validation = validateFormFields({name, email, message}, env);
    if (validation.error) {
      return createJsonResponse({ error: validation.error }, StatusCodes.BAD_REQUEST, corsHeaders);
    }
    const timestamp = Date.now();
    return createJsonResponse(
      {
        success: true,
        message: "Your message has been sent successfully!",
        timestamp: new Date(timestamp).toISOString()
      },
      StatusCodes.OK,
      corsHeaders
    );
  } catch (error) {
    console.error("Error processing contact form:", error);

    return createJsonResponse(
      { error: "An internal error occurred. Please try again later." },
      StatusCodes.INTERNAL_SERVER_ERROR,
      corsHeaders
    );
  }
}