document.addEventListener("DOMContentLoaded", () => {
  const thumbsUpBtn = document.getElementById("thumbsUp");
  const thumbsDownBtn = document.getElementById("thumbsDown");


  thumbsUpBtn.addEventListener("click", () => {
    feedbackMessage.textContent = "Thank you for your positive feedback! We're glad you like the content.";
    feedbackMessage.classList.remove("hidden");
    feedbackMessage.classList.add("text-green-600");
    thumbsUpBtn.classList.add("text-green-500");
    thumbsDownBtn.classList.remove("text-red-500");
  });

  thumbsDownBtn.addEventListener("click", () => {
    feedbackMessage.textContent = "We're sorry to hear that our system is not up to standard. This feedback will be used to improve this content.";
    feedbackMessage.classList.remove("hidden");
    feedbackMessage.classList.add("text-red-600");
    thumbsDownBtn.classList.add("text-red-500");
    thumbsUpBtn.classList.remove("text-green-500");
  });
});


// Update clock time every minute
function updateTime() {
    const clock = document.getElementById("clock");
    const now = new Date();
    clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  setInterval(updateTime, 1000);
  updateTime();

async function triggerFileCheck() {
  try {
    const response = await fetch('https://truworths-5d9b0467377c.herokuapp.com/check-file');
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Full response:', data);

    // Update DOM with response
    const resultElement = document.getElementById('result-container');
    resultElement.innerHTML = `
      <h3>Summary:</h3>
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
