const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const path = require('path');
const axios = require('axios');
require('dotenv').config(); // For environment variables

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// Watson Speech to Text credentials (use environment variables)
const watsonSpeechToTextUrl = process.env.WATSON_SPEECH_TO_TEXT_URL;
const watsonSpeechToTextApiKey = process.env.WATSON_SPEECH_TO_TEXT_API_KEY;

// HubSpot Access Token (use environment variables)
const ACCESS_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;

// Store calls and conversations in memory
app.locals.currentCall = null;
app.locals.pastCalls = [];
app.locals.conversations = [];

// Serve the index.html file at the root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Search for a contact by phone number in HubSpot
async function searchByPhoneNumber(phone) {
  const url = 'https://api.hubapi.com/crm/v3/objects/contacts/search';
  const query = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: 'phonenumber',
            operator: 'EQ',
            value: phone
          }
        ]
      }
    ],
    properties: ['firstname', 'lastname', 'city', 'message', 'accountnumbers', 'phonenumber']
  };

  try {
    const response = await axios.post(url, query, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data.results[0]?.properties || null; // Return the first contact's properties or null
  } catch (error) {
    console.error('Error searching contacts:', error.response?.data || error.message);
    return null;
  }
}

// Handle incoming calls
app.post('/voice', async (req, res) => {
  const callSid = req.body.CallSid;
  const caller = req.body.From;
  const startTime = new Date();

  console.log(`Incoming call from ${caller} with CallSid ${callSid}`);

  const profile = await searchByPhoneNumber(caller);

  const response = new twiml.VoiceResponse();
  response.say('Hello, please tell me something.');
  response.gather({
    input: 'speech',
    action: '/process-speech',
    method: 'POST',
    timeout: 5,
  });

  res.type('text/xml');
  res.send(response.toString());

  app.locals.currentCall = {
    caller,
    callSid,
    startTime,
    duration: 0,
    status: 'in-progress',
    profile,
  };
});

// Process speech input
app.post('/process-speech', async (req, res) => {
  const speechResult = req.body.SpeechResult;
  console.log(`Speech input received: ${speechResult}`);

  const botResponse = 'Thank you. Goodbye!';

  app.locals.conversations.push({
    user: speechResult,
    bot: botResponse,
  });

  const response = new twiml.VoiceResponse();
  response.say(botResponse);
  response.hangup();

  if (app.locals.currentCall) {
    const currentCall = app.locals.currentCall;
    currentCall.duration = Math.floor((new Date() - currentCall.startTime) / 1000);
    currentCall.status = 'completed';
    currentCall.conversations = app.locals.conversations;

    app.locals.pastCalls.push(currentCall);
    app.locals.currentCall = null;
    app.locals.conversations = [];
  }

  res.type('text/xml');
  res.send(response.toString());
});

// Endpoint to serve call and conversation data
app.get('/call-data', (req, res) => {
  if (app.locals.currentCall && app.locals.currentCall.status === 'in-progress') {
    app.locals.currentCall.duration = Math.floor(
      (new Date() - app.locals.currentCall.startTime) / 1000
    );
  }

  res.json({
    currentCall: app.locals.currentCall,
    pastCalls: app.locals.pastCalls,
    conversations: app.locals.conversations,
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
