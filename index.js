const express = require('express');
const path = require('path');
const app = express();

// Serve the index.html directly from the root directory
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log('Server running on port 3000');
});
