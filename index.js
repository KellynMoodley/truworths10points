const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const path = require('path');
const axios = require('axios');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 3000;

// Watson Assistant credentials
const watsonAssistantApiKey = 'XrmHraHtnUmM6G6w9EI_qbXSHabHgnms7sIP0rCx9XKf';
const watsonAssistantUrl = 'https://api.us-south.assistant.watson.cloud.ibm.com/instances/65990e2d-697c-473b-9033-da43beb1a8ee';
const watsonAssistantIntegrationId = 'ed428f23-61fb-42c7-b5ad-45995b4c2d92';

// WebSocket server for live updates
const wss = new WebSocket.Server({ noServer: true });

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));

// Serve the index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle WebSocket connections
wss.on('connection', (socket) => {
  console.log('WebSocket connection established');
});

// Handle incoming calls
app.post('/voice', (req, res) => {
  const callSid = req.body.CallSid;
  const caller = req.body.From;

  // Log the incoming call
  console.log(`Incoming call from ${caller} with CallSid ${callSid}`);

  const response = new twiml.VoiceResponse();
  response.say('Hello, please tell me something.');

  // Gather speech input
  response.gather({
    input: 'speech',
    action: '/process-speech',
    method: 'POST',
    timeout: 5,
  });

  res.type('text/xml');
  res.send(response.toString());
});

// Process speech input
app.post('/process-speech', async (req, res) => {
  const speechResult = req.body.SpeechResult || '';
  console.log(`Speech input received: ${speechResult}`);

  let botResponse = 'I didn’t understand that. Goodbye!';
  try {
    // Call Watson Assistant action "hello"
    const watsonResponse = await axios.post(
      `${watsonAssistantUrl}/v2/integrations/${watsonAssistantIntegrationId}/messages`,
      { input: { message_type: 'text', text: speechResult } },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`apikey:${watsonAssistantApiKey}`).toString('base64')}`,
        },
      }
    );

    botResponse = watsonResponse.data.output.generic[0]?.text || botResponse;
  } catch (error) {
    console.error('Error calling Watson Assistant:', error.message);
  }

  // Send response to user
  const response = new twiml.VoiceResponse();
  response.say(botResponse);
  response.hangup();

  res.type('text/xml');
  res.send(response.toString());
});

// Upgrade HTTP server for WebSocket
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
