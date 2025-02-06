async function fetchSummary() {
    const accountNumber = document.getElementById('accountNumber').value;
    if (!accountNumber) {
        alert('Please enter an account number.');
        return;
    }
    try {
        const response = await fetch(`/fetch-summary?account=${encodeURIComponent(accountNumber)}`);
        const data = await response.json();
        
        // Create a formatted display of all responses
        const summary = data.map(item => item.response.text).join('\n\n');
        document.getElementById('summary').innerText = summary;
    } catch (error) {
        document.getElementById('summary').innerText = 'No data for account number: ' + accountNumber;
    }
}
