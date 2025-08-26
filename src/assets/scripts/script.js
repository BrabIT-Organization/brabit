const form = document.querySelector('#contact-form');
form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const data = new FormData(form);
    const request = new Request('/api/contact', {
        method: 'POST',
        body: data
    });
    const response = await fetch(request);
    const result = await response.text();
    alert(result);
    this.reset();
})