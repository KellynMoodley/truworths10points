async function fetchSummary() {
    const accountNumber = document.getElementById('accountNumber').value;
    if (!accountNumber) {
        alert('Please enter an account number.');
        return;
    }
    try {
        const response = await fetch(`/fetch-summary?account=${encodeURIComponent(accountNumber)}`);
        const data = await response.json();
        
        if (Array.isArray(data) && data.length > 0) {
            document.getElementById('summary').innerText = `Summary 1: ${data[0]}\nSummary 2: ${data[1] || 'N/A'}`;
        } else {
            document.getElementById('summary').innerText = 'No data found for the given account number.';
        }
    } catch (error) {
        document.getElementById('summary').innerText = 'Error fetching data.';
    }
}
