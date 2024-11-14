const express = require('express');
const path = require('path');
const WebSocket = require('ws'); // WebSocket package for handling connections
const app = express();

// Serve the index.html directly from the root directory
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Set up WebSocket server to relay messages between phone and web assistants
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', ws => {
  console.log('WebSocket connected to web client');
  
  // Forward messages from the phone assistant to the web assistant
  ws.on('message', (message) => {
    console.log('Received message from phone assistant:', message);
    
    // Send the message to the web assistant via WebSocket
    ws.send(message);
  });
});

// Start the server
app.listen(process.env.PORT || 3000, () => {
  console.log('Server running on port 3000');
});
