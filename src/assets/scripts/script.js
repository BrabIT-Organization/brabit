const form = document.querySelector('#contact-form');
form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const resultTarget = document.querySelector('#result');
    if (resultTarget?.style?.display != 'none') {
        resultTarget.style.display = 'none';
    }
    const data = new FormData(form);
    const request = new Request('/api/contact', {
        method: 'POST',
        body: data
    });
    const response = await fetch(request);
    const result = await response.json();
    if (result.error) {
        alert(result.error);
    } else if (!result.success) {
        showResultMessage(result.message);
    } else if (result.success) {
        showResultMessage(result.message);
        this.reset();
    }
});

function showResultMessage(message) {
    if (!message || message.length == 0) {
        return;
    }
    const resultTarget = document.querySelector('#result');
    resultTarget.textContent = message;
    resultTarget.style.display = '';
}