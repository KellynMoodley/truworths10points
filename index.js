const express = require('express');
const path = require('path');
const app = express();

// Serve static files (like index.html) from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log('Server running on port 3000');
});
