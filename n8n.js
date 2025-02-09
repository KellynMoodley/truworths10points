async function fetchSummary() {
    const accountNumber = document.getElementById('accountNumber').value;
    if (!accountNumber) {
        alert('Please enter an account number.');
        return;
    }
    try {
        const response = await fetch(`/fetch-summary?account=${encodeURIComponent(accountNumber)}`);
        const data = await response.json();

        // Convert object to formatted text
        let formattedText = JSON.stringify(data, null, 2)

        document.getElementById('summary').innerHTML = formattedText;
        
    } catch (error) {
        document.getElementById('summary').innerHTML = 'No data for account number: ' + accountNumber;
    }
}
