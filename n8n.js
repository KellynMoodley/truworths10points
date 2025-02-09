async function fetchSummary() {
    const accountNumber = document.getElementById('accountNumber').value;
    const summaryElement = document.getElementById('summary');

    if (!accountNumber) {
        alert('Please enter an account number.');
        return;
    }

    try {
        summaryElement.innerText = 'Loading...';
        summaryElement.classList.add('loading');

        const response = await fetch(`/fetch-summary?account=${encodeURIComponent(accountNumber)}`);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Formatting output to ensure each key-value pair appears on a new line
        summaryElement.innerText = Object.entries(data)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');

    } catch (error) {
        summaryElement.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    } finally {
        summaryElement.classList.remove('loading');
    }
}
