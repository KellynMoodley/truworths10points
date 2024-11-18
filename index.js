const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const WebSocket = require('ws');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// Watson Speech to Text credentials
const watsonSpeechToTextUrl = 'wss://api.us-south.speech-to-text.watson.cloud.ibm.com/instances/d0fa1cd2-f3b4-4ff0-9888-196375565a8f/v1/recognize';
const watsonSpeechToTextApiKey = 'ig_BusJMZMAOYfhcRJ-PtAf4PgjzSIMebGjszzJZ9RIj';

// Watson Assistant credentials
const watsonAssistantOptions = {
  url: 'https://api.us-south.assistant.watson.cloud.ibm.com',
  integrationID: 'ed428f23-61fb-42c7-b5ad-45995b4c2d92',
  apiKey: 'XrmHraHtnUmM6G6w9EI_qbXSHabHgnms7sIP0rCx9XKf',
};

// Serve the index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// WebSocket server for live updates
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
});

// Broadcast live updates to clients
function sendLiveUpdatesToUI(transcription, botResponse) {
  const message = JSON.stringify({ transcription, botResponse });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Handle incoming calls
app.post('/voice', (req, res) => {
  const callSid = req.body.CallSid;
  const caller = req.body.From;

  console.log(`Incoming call from ${caller} with CallSid ${callSid}`);

  const response = new twiml.VoiceResponse();
  response.say('Hello, you are now connected. Please start speaking.');

  response.gather({
    input: 'speech',
    action: '/process-speech',
    method: 'POST',
  });

  res.type('text/xml');
  res.send(response.toString());
});

// Process speech input
app.post('/process-speech', async (req, res) => {
  const speechResult = req.body.SpeechResult;
  console.log(`Speech input received: ${speechResult}`);

  // Process with Watson Assistant
  let botResponse = 'I didn’t understand that. Goodbye!';
  if (speechResult) {
    try {
      const sessionResponse = await axios.post(
        `${watsonAssistantOptions.url}/v2/assistants/${watsonAssistantOptions.integrationID}/sessions`,
        {},
        {
          headers: {
            Authorization: `Bearer ${watsonAssistantOptions.apiKey}`,
          },
        }
      );

      const sessionId = sessionResponse.data.session_id;

      const assistantResponse = await axios.post(
        `${watsonAssistantOptions.url}/v2/assistants/${watsonAssistantOptions.integrationID}/sessions/${sessionId}/message`,
        {
          input: {
            text: speechResult,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${watsonAssistantOptions.apiKey}`,
          },
        }
      );

      botResponse = assistantResponse.data.output.generic[0]?.text || botResponse;
    } catch (error) {
      console.error('Error communicating with Watson Assistant:', error);
    }
  }

  sendLiveUpdatesToUI(speechResult, botResponse);

  const response = new twiml.VoiceResponse();
  response.say(botResponse);
  response.hangup();

  res.type('text/xml');
  res.send(response.toString());
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
