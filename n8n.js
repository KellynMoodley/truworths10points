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
            .replace(/\\n/g, '<br>')  // Replace explicit "\n" in string
            .replace(/\n/g, '<br>')    // Replace actual newline characters

        document.getElementById('summary').innerHTML = formattedText;
        
    } catch (error) {
        document.getElementById('summary').innerHTML = 'No data for account number: ' + accountNumber;
    }
}
