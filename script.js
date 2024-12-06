async function triggerFileCheck() {
  try {
    const response = await fetch('http://localhost:3000/check-file');
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Full response:', data);

    // Update DOM with response
    const resultElement = document.getElementById('result-container');
    resultElement.innerHTML = `
      <h3>Webhook Response:</h3>
      <p>${data.data || 'No data received'}</p>
    `;
  } catch (error) {
    console.error('Error:', error);
    
    // Update DOM with error
    const resultElement = document.getElementById('result-container');
    resultElement.innerHTML = `
      <h3>Error:</h3>
      <p>${error.message}</p>
    `;
  }
}

document.getElementById('triggerFileCheckBtn').addEventListener('click', triggerFileCheck);
