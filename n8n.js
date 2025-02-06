async function fetchSummary() {
    const accountNumber = document.getElementById('accountNumber').value;
    if (!accountNumber) {
        alert('Please enter an account number.');
        return;
    }
    try {
        const response = await fetch(`/fetch-summary?account=${encodeURIComponent(accountNumber)}`);
        const data = await response.result.json();

        document.getElementById('summary').innerText = JSON.stringify(data, null, 2);        
        
    } catch (error) {
        document.getElementById('summary').innerText = 'No data for account number: ' + accountNumber;
    }
}
