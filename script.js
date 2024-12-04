// Function to trigger the file check
// script.js - Update the fetch URLs to match the backend endpoints
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
      const webhookResponse = await fetch('https://truworths-5d9b0467377c.herokuapp.com//webhook-data');
      if (!webhookResponse.ok) {
          throw new Error(`HTTP error! Status: ${webhookResponse.status}`);
      }
      const webhookData = await webhookResponse.json();
      console.log('Webhook response:', webhookData);
      // Now you can safely manipulate the DOM
      const resultElement = document.getElementById('result-container');
      resultElement.textContent = JSON.stringify(webhookData.response.text);

  } catch (error) {
      console.error('Error:', error);
      alert('Failed to process request. See console for details.');
  }
}

// Attach event listener to the button
document.getElementById('triggerFileCheckBtn').addEventListener('click', triggerFileCheck);
