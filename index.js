const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const { IamAuthenticator } = require('ibm-watson/auth');
const SpeechToTextV1 = require('ibm-watson/speech-to-text/v1');
const twilio = require('twilio');

const app = express();
const port = process.env.PORT || 3000;

// Configure middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());
app.use(express.json());

require('dotenv').config();

// Watson configuration
const speechToText = new SpeechToTextV1({
  authenticator: new IamAuthenticator({
    apikey: process.env.watson_speech_to_text_api_key,
  }),
  serviceUrl: process.env.watson_speech_to_text_url,
});

// Twilio configuration
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const ACCESS_TOKEN = process.env.access_token;

// Store calls and conversations in memory
app.locals.currentCall = null;
app.locals.pastCalls = [];
app.locals.conversations = [];
app.locals.pastConversations = [];

// Root endpoint
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// HubSpot contact search endpoint
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

    console.log(response.data);
    res.json(response.data.results);
  } catch (error) {
    console.error('Error searching contacts:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to search contacts. Please try again later.' });
  }
});

// Handle incoming calls
app.post('/voice', (req, res) => {
  const callSid = req.body.CallSid;
  const caller = req.body.From;
  const startTime = new Date();

  console.log(`Incoming call from ${caller} with CallSid ${callSid}`);

  const response = new twiml.VoiceResponse();
  response.say('Welcome to our service. Please choose an option:');
  response.say('Press 1 or say Create Account to create an account.');
  response.say('Press 2 or say Log an Issue to log an issue.');
  response.say('Press 3 or say Open Query to open a query.');

  response.gather({
    input: 'speech dtmf',
    action: '/process-speech',
    method: 'POST',
    timeout: 5,
    numDigits: 1,
    language: 'en-US',
    enhanced: true, // Enhanced speech recognition
  });

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

// Process speech input and redirect based on the option
app.post('/process-speech', async (req, res) => {
  try {
    const speechResult = req.body.SpeechResult?.toLowerCase();
    const digitResult = req.body.Digits;

    let selectedOption = '';
    if (digitResult === '1' || speechResult?.includes('create account')) {
      selectedOption = 'create account';
    } else if (digitResult === '2' || speechResult?.includes('log an issue')) {
      selectedOption = 'log an issue';
    } else if (digitResult === '3' || speechResult?.includes('open query')) {
      selectedOption = 'open query';
    } else {
      throw new Error('Invalid input');
    }

    console.log(`User selected: ${selectedOption}`);

    const response = new twiml.VoiceResponse();
    if (selectedOption === 'create account') {
      response.say('You selected Create Account. Please provide your name, email, and phone number.');
    } else if (selectedOption === 'log an issue') {
      response.say('You selected Log an Issue. Please describe your issue.');
    } else if (selectedOption === 'open query') {
      response.say('You selected Open Query. Please state your query.');
    }

    response.gather({
      input: 'speech',
      action: `/process-${selectedOption.replace(/\s/g, '-')}`,
      method: 'POST',
      timeout: 10,
      language: 'en-US',
    });

    res.type('text/xml');
    res.send(response.toString());
  } catch (error) {
    console.error('Error processing speech:', error);
    const response = new twiml.VoiceResponse();
    response.say('I did not catch that. Could you please repeat?');
    response.gather({
      input: 'speech dtmf',
      action: '/process-speech',
      method: 'POST',
      timeout: 5,
      language: 'en-US',
      enhanced: true,
    });
    res.type('text/xml');
    res.send(response.toString());
  }
});

// Serve call data
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
    pastConversations: app.locals.pastConversations,
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
