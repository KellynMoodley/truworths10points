// n8n.js
async function fetchSummary() {
    const summaryElement = document.getElementById('summary');
    const accountNumber = document.getElementById('accountNumber').value;

    if (!accountNumber) {
        summaryElement.innerHTML = '<div class="error">Please enter an account number.</div>';
        return;
    }

    try {
        // Show loading state
        summaryElement.classList.add('loading');
        summaryElement.textContent = 'Loading...';

        const response = await fetch(`/fetch-summary?account=${encodeURIComponent(accountNumber)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        // Format and display the data
        let formattedText = JSON.stringify(data, null, 2)
            .replace(/\\n/g, '\n')  // Replace explicit "\n" in string
            .replace(/\n/g, '<br>'); // Replace actual newline characters

        summaryElement.innerHTML = formattedText;
    } catch (error) {
        console.error('Error:', error);
        summaryElement.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    } finally {
        summaryElement.classList.remove('loading');
    }
}

// Add event listener for page load
document.addEventListener('DOMContentLoaded', () => {
    // Optional: Add any initialization code here
    console.log('N8N Webhook Listener initialized');
});
