async function fetchSummary() {
    const accountNumber = document.getElementById('accountNumber').value;
    if (!accountNumber) {
        alert('Please enter an account number.');
        return;
    }
    try {
        const response = await fetch(`/fetch-summary?account=${encodeURIComponent(accountNumber)}`);
        const data = await response.json();
        console.log('Webhook response:', data);

        // Now you can safely manipulate the DOM
        const resultElement = document.getElementById('summary');
        resultElement.textContent = JSON.stringify(data.response.text);
        
    } catch (error) {
        document.getElementById('summary').innerText = 'No data for account number: ' + accountNumber;
    }
}
