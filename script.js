async function triggerFileCheck() {
  try {
    // Use a single slash for the URL
    const response = await fetch('https://truworths-5d9b0467377c.herokuapp.com/check-file');
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();
    console.log('File check response:', data);

    // Fetch webhook data
    const webhookResponse = await fetch('https://truworths-5d9b0467377c.herokuapp.com/webhook-data');
    if (!webhookResponse.ok) {
      throw new Error(`HTTP error! Status: ${webhookResponse.status}`);
    }
    const webhookData = await webhookResponse.json();
    console.log('Webhook response:', webhookData);

    // Get the response element
    const resultElement = document.getElementById('response-data');
    
    // Safely display the response
    // Adjust the path based on your actual response structure
    resultElement.textContent = webhookData.response 
      ? JSON.stringify(webhookData.response, null, 2) 
      : 'No response data available';

  } catch (error) {
    console.error('Error:', error);
    
    // Update the response container with error message
    const resultElement = document.getElementById('response-data');
    resultElement.textContent = `Error: ${error.message}`;
  }
}
