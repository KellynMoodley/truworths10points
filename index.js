const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const { IamAuthenticator } = require('ibm-watson/auth');
const SpeechToTextV1 = require('ibm-watson/speech-to-text/v1');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());
app.use(express.json());

// Watson Speech to Text Configuration
const speechToText = new SpeechToTextV1({
  authenticator: new IamAuthenticator({
    apikey: process.env.watson_speech_to_text_api_key,
  }),
  serviceUrl: process.env.watson_speech_to_text_url,
});

// Twilio Configuration
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

// Persistent Data Storage Functions
const saveData = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

const loadData = (filePath) => {
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return [];
};

// Initialize Data Storage
const CALLS_FILE = 'pastCalls.json';
app.locals.pastCalls = loadData(CALLS_FILE);
app.locals.currentCall = null;
app.locals.conversations = [];

// Root Endpoint
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Download Conversation Endpoint
app.get('/download-conversation/:callSid', (req, res) => {
  const callSid = req.params.callSid;
  const call = app.locals.pastCalls.find((c) => c.callSid === callSid);

  if (!call || !call.conversations) {
    return res.status(404).send('Conversation not found');
  }

  const conversationText = call.conversations
    .map(
      (conv) => `User: ${conv.user || 'N/A'}\nBot: ${conv.bot || 'N/A'}\n---\n`
    )
    .join('');

  if (!conversationText) {
    return res.status(404).send('No conversations available for this call.');
  }

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=conversation_${callSid}.txt`
  );
  res.send(conversationText);
});

// HubSpot Contact Search Endpoint
app.post('/api/search', async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  try {
    const url = 'https://api.hubapi.com/crm/v3/objects/contacts/search';
    const query = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'mobilenumber',
              operator: 'EQ',
              value: phone,
            },
          ],
        },
      ],
      properties: [
        'firstname',
        'lastname',
        'email',
        'mobilenumber',
        'customerid',
        'accountnumbers',
        'highvalue',
        'delinquencystatus',
        'segmentation',
        'outstandingbalance',
        'missedpayment',
      ],
    };

    const response = await axios.post(url, query, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    res.json(response.data.results);
  } catch (error) {
    console.error('Error searching contacts:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to search contacts. Please try again later.' });
  }
});

// Handle Incoming Calls
app.post('/voice', (req, res) => {
  const callSid = req.body.CallSid;
  const caller = req.body.From;
  const startTime = new Date();

  console.log(`Incoming call from ${caller} with CallSid ${callSid}`);

  const response = new twiml.VoiceResponse();
  response.say('Welcome to Truworths.');
  response.say('How can I assist? Start speaking.');
  response.say('Or say REVIEW ACCOUNT to know your payment details');
  response.say('Or say create ticket');

  response.gather({
    input: 'speech',
    action: '/process-speech',
    method: 'POST',
    voice: 'Polly.Ayanda-Neural',
    timeout: 5,
    enhanced: true,
  });

  // Add statusCallback for call status updates
  response.redirect({ method: 'POST' }, '/status-callback');

  res.type('text/xml');
  res.send(response.toString());

  app.locals.currentCall = {
    caller,
    callSid,
    startTime,
    duration: 0,
    status: 'in-progress',
  };
});

// Process Speech Input
app.post('/process-speech', async (req, res) => {
  try {
    const speechResult = req.body.SpeechResult;

    if (!speechResult) {
      throw new Error('No speech input received');
    }

    console.log(`Speech input received: ${speechResult}`);

    let botResponse = 'Thank you for your message. Goodbye!';

    if (speechResult.toLowerCase().includes('review account')) {
      const phone = req.body.From;

      if (!phone) {
        botResponse = "I couldn't retrieve your phone number. Please provide it.";
      } else {
        try {
          const url = 'https://api.hubapi.com/crm/v3/objects/contacts/search';
          const query = {
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: 'mobilenumber',
                    operator: 'EQ',
                    value: phone,
                  },
                ],
              },
            ],
            properties: ['firstname', 'lastname', 'outstandingbalance'],
          };

          const response = await axios.post(url, query, {
            headers: {
              Authorization: `Bearer ${ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
          });

          const contact = response.data.results[0];

          if (contact) {
            const { firstname, lastname, outstandingbalance } = contact.properties;
            botResponse = `Based on your account, your name is ${firstname}, your surname is ${lastname}, and your balance is ${outstandingbalance}.`;
          } else {
            botResponse = "I couldn't find your account details.";
          }
        } catch (error) {
          console.error('Error fetching contact details from HubSpot:', error.response?.data || error.message);
          botResponse = "There was an issue retrieving your account details. Please try again later.";
        }
      }
    }

    const conversationEntry = {
      timestamp: new Date().toISOString(),
      user: speechResult,
      bot: botResponse,
    };
    app.locals.conversations.push(conversationEntry);

    const response = new twiml.VoiceResponse();
    response.say(botResponse);
    response.hangup();

    if (app.locals.currentCall) {
      const currentCall = app.locals.currentCall;
      const callDuration = Math.floor((new Date() - currentCall.startTime) / 1000);
      currentCall.duration = callDuration;
      currentCall.status = 'completed';
      currentCall.conversations = app.locals.conversations;
      app.locals.pastCalls.push(currentCall);
      saveData(CALLS_FILE, app.locals.pastCalls);
      app.locals.currentCall = null;
      app.locals.conversations = [];
    }

    res.type('text/xml');
    res.send(response.toString());
  } catch (error) {
    console.error('Error processing speech:', error);

    const response = new twiml.VoiceResponse();
    response.say('I did not catch that. Could you please repeat?');

    response.gather({
      input: 'speech',
      action: '/process-speech',
      method: 'POST',
      voice: 'Polly.Ayanda-Neural',
      timeout: 5,
      enhanced: true,
    });

    res.type('text/xml');
    res.send(response.toString());
  }
});

// Status Callback for Call Updates
app.post('/status-callback', (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;

  console.log(`Status update for CallSid ${callSid}: ${callStatus}`);

  if (app.locals.currentCall && app.locals.currentCall.callSid === callSid) {
    if (['completed', 'failed', 'no-answer'].includes(callStatus)) {
      const currentCall = app.locals.currentCall;
      currentCall.duration = Math.floor((new Date() - currentCall.startTime) / 1000);
      currentCall.status = callStatus;
      app.locals.pastCalls.push(currentCall);
      saveData(CALLS_FILE, app.locals.pastCalls);
      app.locals.currentCall = null;
      app.locals.conversations = [];
    }
  }

  res.sendStatus(200);
});

// Start Server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
