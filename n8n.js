async function fetchSummary() {
    const accountNumber = document.getElementById('accountNumber').value;
    if (!accountNumber) {
        alert('Please enter an account number.');
        return;
    }
    try {
        const response = await fetch(`/fetch-summary?account=${encodeURIComponent(accountNumber)}`);
        const data = await response.json();
        const summaryElement = document.getElementById('summary');
        
        // Clear previous content
        summaryElement.innerHTML = '';
        
        // Create and append elements for each summary point
        data.forEach((item, index) => {
            const p = document.createElement('p');
            p.textContent = item.response.text;
            summaryElement.appendChild(p);
        });
        
    } catch (error) {
        document.getElementById('summary').innerText = 'No data for account number: ' + accountNumber;
    }
}
