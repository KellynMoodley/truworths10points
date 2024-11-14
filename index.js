// Import necessary modules
const express = require('express');
const path = require('path');
const WebSocket = require('ws'); // WebSocket package for handling connections
const twilio = require('twilio'); // Twilio package for handling SMS/voice interactions
require('dotenv').config(); // To load environment variables from .env file

const app = express();

// Serve the index.html directly from the root directory
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Set up the server with the correct port for Heroku or local
const server = app.listen(process.env.PORT || 3000, () => {
  console.log('Server running on port ' + process.env.PORT);
});

// Set up WebSocket server to relay messages between phone and web assistants
const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
  console.log('WebSocket connected to web client');
  
  // Forward messages from the phone assistant to the web assistant
  ws.on('message', (message) => {
    console.log('Received message from phone assistant:', message);
    
    // Send the message to the web assistant via WebSocket
    ws.send(message);
  });
});

// Example Twilio interaction (Voice or SMS)
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Example: Send SMS from Twilio (can be adapted to handle incoming messages or calls)
client.messages
  .create({
    body: 'Hello from Watson Assistant!',
    from: process.env.TWILIO_PHONE_NUMBER,
    to: process.env.USER_PHONE_NUMBER
  })
  .then(message => console.log('Message sent:', message.sid))
  .catch(err => console.error('Error sending message:', err));
