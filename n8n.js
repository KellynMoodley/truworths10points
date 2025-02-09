async function fetchSummary() {
    const accountNumber = document.getElementById('accountNumber').value;
    const summaryElement = document.getElementById('summary');
    
    if (!accountNumber) {
        alert('Please enter an account number.');
        return;
    }

    try {
        summaryElement.innerText = 'Loading...';
        summaryElement.classList.add('loading');
        
        const response = await fetch(`/fetch-summary?account=${encodeURIComponent(accountNumber)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        let formattedText = JSON.stringify(data, null, 2);
        
        // Remove quotes and escape characters
        formattedText = formattedText.replace(/\\|"/g, '');

        // Find '##' and move the following text to a new line
        formattedText = formattedText.replace(/##/g, '\n\n');

        // Update the summaryElement with the formatted text
        summaryElement.innerText = formattedText;
    } catch (error) {
        summaryElement.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    } finally {
        summaryElement.classList.remove('loading');
    }
}
