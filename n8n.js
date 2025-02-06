async function fetchSummary() {
    const accountNumber = document.getElementById('accountNumber').value;
    const summaryElement = document.getElementById('summary');

    if (!accountNumber) {
        summaryElement.textContent = 'Please enter an account number.';
        return;
    }

    try {
        const response = await fetch(`/fetch-summary?account=${encodeURIComponent(accountNumber)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Safer data access with optional chaining and fallback
        const summary = data?.response?.text 
            ? (data.response.text[1] || '') + (data.response.text[2] || '')
            : 'No summary available';

        summaryElement.textContent = summary;
        
    } catch (error) {
        console.error('Fetch error:', error);
        summaryElement.textContent = `Error fetching summary: ${error.message}`;
    }
}
