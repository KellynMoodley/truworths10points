async function triggerFileCheck() {
    try {
        // Update the URL to include the correct port and path
        const response = await fetch('https://truworths-5d9b0467377c.herokuapp.com/check-file');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
  
        const data = await response.json();
        console.log('File check response:', data);
  
        // After successful file check, fetch webhook data
        const webhookResponse = await fetch('https://truworths-5d9b0467377c.herokuapp.com/webhook-data');
        if (!webhookResponse.ok) {
            throw new Error(`HTTP error! Status: ${webhookResponse.status}`);
        }
        const webhookData = await webhookResponse.json();
        console.log('Webhook response:', webhookData);
        // Now you can safely manipulate the DOM
        const resultElement = document.getElementById('result-container');
        
        if (webhookData && webhookData.response) {
            // Assuming the webhook response has a structure like { response: { text: 'your data here' } }
            resultElement.textContent = webhookData.response.text || 'No text content in response';
        } else {
            resultElement.textContent = 'Webhook response did not contain valid data.';
        }
    } catch (error) {
        console.error('Error:', error);
    
        // Show error in the result container
        const resultElement = document.getElementById('result-container');
        resultElement.textContent = `Error: ${error.message}`;
       }
}
  
  // Attach event listener to the button
  document.getElementById('triggerFileCheckBtn').addEventListener('click', triggerFileCheck);
