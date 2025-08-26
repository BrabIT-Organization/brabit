interface Contact {
    name: String,
    email: String,
    message: String
}

async function parseFormData(request) : Promise<Contact> {
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    return await request.json();
  } else if (contentType.includes("form-data") || contentType.includes("x-www-form-urlencoded")) {
    const formData = await request.formData();

    return {
      name: formData.get("name"),
      email: formData.get("email"),
      message: formData.get("message"),
    //   "cf-turnstile-response": formData.get("cf-turnstile-response"),
    };
  }

  return null;
}

export const onRequestPost: PagesFunction<Env> = async({request, env}) => {
    const formData = await parseFormData(request);
    return new Response(`Hallo ${formData?.name}. Bedankt voor jouw bericht. We komen snel bij u terug.`);
}