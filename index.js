const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());
app.use(express.json());

require('dotenv').config();

// Watson Speech to Text credentials
const watsonSpeechToTextUrl = 'https://api.us-south.speech-to-text.watson.cloud.ibm.com/instances/d0fa1cd2-f3b4-4ff0-9888-196375565a8f';
const watsonSpeechToTextApiKey = 'ig_BusJMZMAOYfhcRJ-PtAf4PgjzSIMebGjszzJZ9RIj';

const ACCESS_TOKEN = process.env.access_token;

// Store calls and conversations in memory
app.locals.currentCall = null;
app.locals.pastCalls = [];
app.locals.conversations = [];
app.locals.pastConversations = [];

// Serve the index.html file at the root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API Route to search contact by phone number
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

// Handle incoming calls
app.post('/voice', (req, res) => {
  const callSid = req.body.CallSid;
  const caller = req.body.From;
  const startTime = new Date();

  console.log(`Incoming call from ${caller} with CallSid ${callSid}`);

  const response = new twiml.VoiceResponse();
  response.say('Welcome! I am a Truworths agent.');
  response.gather({
    input: 'dtmf',
    action: '/process-speech',
    method: 'POST',
    numDigits: 1,
    timeout: 5,
  }).say('Press 1 to create an account. Press 2 to log an issue. Press 3 to talk to an agent.');

  response.hangup({ statusCallback: '/call-status', statusCallbackMethod: 'POST' });

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

// Process speech and DTMF input
app.post('/process-speech', (req, res) => {
  const digit = req.body.Digits;
  console.log(`Digit input received: ${digit}`);

  const response = new twiml.VoiceResponse();

  if (digit === '1') {
    response.say('Please provide your first name.');
    response.gather({
      input: 'speech',
      action: '/process-create-account',
      method: 'POST',
    });
  } else if (digit === '2') {
    response.say('Please describe your issue after the beep.');
    response.record({
      action: '/process-issue',
      method: 'POST',
      maxLength: 120,
    });
  } else if (digit === '3') {
    response.say('Connecting you to an agent. Please hold.');
    response.dial('+1234567890'); // Replace with the agent's phone number
  } else {
    response.say('Invalid option. Goodbye!');
    response.hangup();
  }

  res.type('text/xml');
  res.send(response.toString());
});

// Handle account creation details
app.post('/process-create-account', (req, res) => {
  const speechResult = req.body.SpeechResult;
  console.log(`First name received: ${speechResult}`);

  const response = new twiml.VoiceResponse();
  response.say('Thank you. Now, please say your last name.');
  response.gather({
    input: 'speech',
    action: '/process-last-name',
    method: 'POST',
  });

  res.type('text/xml');
  res.send(response.toString());
});

app.post('/process-last-name', (req, res) => {
  const lastName = req.body.SpeechResult;
  console.log(`Last name received: ${lastName}`);

  const response = new twiml.VoiceResponse();
  response.say('Got it. Finally, please say your email address.');
  response.gather({
    input: 'speech',
    action: '/process-email',
    method: 'POST',
  });

  res.type('text/xml');
  res.send(response.toString());
});

app.post('/process-email', (req, res) => {
  const email = req.body.SpeechResult;
  console.log(`Email received: ${email}`);

  const response = new twiml.VoiceResponse();
  response.say('Thank you for providing your details. Your account creation process is complete.');
  response.hangup();

  res.type('text/xml');
  res.send(response.toString());
});

// Handle issue recording
app.post('/process-issue', (req, res) => {
  const recordingUrl = req.body.RecordingUrl;
  console.log(`Issue recorded at: ${recordingUrl}`);

  const response = new twiml.VoiceResponse();
  response.say('Thank you for reporting the issue. Our team will get back to you shortly.');
  response.hangup();

  res.type('text/xml');
  res.send(response.toString());
});

// Handle call status updates
app.post('/call-status', (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;

  console.log(`Call status updated for ${callSid}: ${callStatus}`);

  if (callStatus === 'completed' && app.locals.currentCall?.callSid === callSid) {
    const completedCall = { ...app.locals.currentCall, status: 'completed' };
    app.locals.pastCalls.push(completedCall);
    app.locals.currentCall = null;
    app.locals.pastConversations.push(app.locals.conversations);
    app.locals.conversations = [];
  }

  res.sendStatus(200);
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
    pastConversations: app.locals.pastConversations,
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
