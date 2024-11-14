const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const Twilio = require('twilio');
const WebSocket = require('ws');
const app = express();

// Twilio configuration
const TWILIO_ACCOUNT_SID = 'AC9ffd84fee71230da7cd72851139e3dba';
const TWILIO_AUTH_TOKEN = '962657105287aafefa952a934b0ebb18';
const client = new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Watson Assistant configuration
const WATSON_API_KEY = 'XrmHraHtnUmM6G6w9EI_qbXSHabHgnms7sIP0rCx9XKf';
const WATSON_ASSISTANT_URL = 'https://api.us-south.assistant.watson.cloud.ibm.com/instances/65990e2d-697c-473b-9033-da43beb1a8ee';

// WebSocket server to broadcast messages
const wss = new WebSocket.Server({ port: 8080 });

// Set up body parser for JSON data
app.use(bodyParser.json());

// WebSocket connection to broadcast messages
wss.on('connection', function connection(ws) {
  console.log('New WebSocket connection established');
  ws.on('message', function incoming(message) {
    console.log('Received message:', message);
    // Here you can send messages from the phone assistant to the WebSocket client (browser)
  });
});

// Route to handle incoming Twilio phone call transcriptions
app.post('/twilio-webhook', async (req, res) => {
  const transcription = req.body.SpeechResult; // Get speech-to-text result from Twilio

  if (transcription) {
    try {
      // Send transcription to Watson Assistant
      const response = await sendToWatsonAssistant(transcription);

      // Broadcast Watson Assistant response to all connected WebSocket clients (browser)
      wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(response);
        }
      });

      // Send the Watson response back to the phone call (you could use Twilio's Text-to-Speech API here)
      res.send(`<Response><Say>${response}</Say></Response>`);
    } catch (err) {
      console.error('Error processing transcription:', err);
      res.send('<Response><Say>Sorry, I didn\'t understand that. Please try again.</Say></Response>');
    }
  } else {
    res.send('<Response><Say>No speech input detected.</Say></Response>');
  }
});

// Function to send text to Watson Assistant and get the response
async function sendToWatsonAssistant(text) {
  try {
    const response = await axios.post(WATSON_ASSISTANT_URL, {
      input: { text: text }
    }, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from('apikey:' + WATSON_API_KEY).toString('base64'),
        'Content-Type': 'application/json'
      }
    });

    const watsonResponse = response.data.output.text.join('\n');
    return watsonResponse;
  } catch (error) {
    console.error('Error communicating with Watson Assistant:', error);
    throw new Error('Error processing request');
  }
}

// Start the express server
app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
