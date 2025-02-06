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

        const data = await response.json(); // Get the array from JSON response

        // Ensure data is an array before accessing indices
        if (!Array.isArray(data) || data.length < 4) {
            throw new Error('Unexpected data format');
        }

        // Access specific indices
        const value2 = data[2]; 
        const value3 = data[3];

        // Combine them (assuming they are numbers or strings)
        const combinedData = value2 + value3;

        document.getElementById('summary').innerText = JSON.stringify(combinedData, null, 2);
    } catch (error) {
        document.getElementById('summary').innerText = `No data for account number: ${accountNumber}`;
        console.error('Error fetching summary:', error);
    }
}
