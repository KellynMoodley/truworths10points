async function fetchSummary() {
    const accountNumber = document.getElementById('accountNumber').value;
    if (!accountNumber) {
        alert('Please enter an account number.');
        return;
    }

    try {
        const response = await fetch(`/fetch-summary?account=${encodeURIComponent(accountNumber)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();
        if (!data || data.length === 0) {
            document.getElementById('summary').innerHTML = `No data for account number: ${accountNumber}`;
            return;
        }

        // Format the data into readable HTML
        const formattedText = data.map((item, index) => `<p><strong>${index + 1}. ${item}</strong></p>`).join('');

        document.getElementById('summary').innerHTML = formattedText;
    } catch (error) {
        document.getElementById('summary').innerHTML = `Error fetching data: ${error.message}`;
    }
}
