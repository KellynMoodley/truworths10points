const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const { IamAuthenticator } = require('ibm-watson/auth');
const SpeechToTextV1 = require('ibm-watson/speech-to-text/v1');
const twilio = require('twilio');
const fs = require('fs');

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

// Handle incoming calls
app.post('/voice', (req, res) => {
  const callSid = req.body.CallSid;
  const caller = req.body.From;
  const startTime = new Date();

  console.log(`Incoming call from ${caller} with CallSid ${callSid}`);

  const response = new twiml.VoiceResponse();
  response.say('Welcome to Truworths.');
  response.say('Press 1 to create an account.');
  response.say('Press 2 to log an issue.');

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

  app.locals.currentCall = {
    caller,
    callSid,
    startTime,
    duration: 0,
    status: 'in-progress',
  };
});

// Process speech input and route based on options
app.post('/process-speech', async (req, res) => {
  try {
    const speechResult = req.body.SpeechResult;

    if (!speechResult) {
      throw new Error('No speech input received');
    }

    console.log(`Speech input received: ${speechResult}`);

    if (speechResult.toLowerCase().includes('option 1')) {
      const response = new twiml.VoiceResponse();
      response.say('Please provide your first name and last name.');

      response.gather({
        input: 'speech',
        action: '/process-create-account',
        method: 'POST',
        voice: 'Polly.Ayanda-Neural',
        timeout: 5,
        enhanced: true,
      });

      res.type('text/xml');
      res.send(response.toString());
      return;
    } else if (speechResult.toLowerCase().includes('option 2')) {
      const response = new twiml.VoiceResponse();
      response.say('Please describe the issue you are experiencing.');

      response.gather({
        input: 'speech',
        action: '/process-log-issue',
        method: 'POST',
        voice: 'Polly.Ayanda-Neural',
        timeout: 5,
        enhanced: true,
      });

      res.type('text/xml');
      res.send(response.toString());
      return;
    } else {
      const response = new twiml.VoiceResponse();
      response.say('Invalid option selected. Goodbye!');
      response.hangup();

      res.type('text/xml');
      res.send(response.toString());
    }
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

// Process account creation (Option 1)
app.post('/process-create-account', (req, res) => {
  const speechResult = req.body.SpeechResult;

  if (!speechResult) {
    const response = new twiml.VoiceResponse();
    response.say('I did not catch your name. Please try again.');
    response.hangup();

    res.type('text/xml');
    res.send(response.toString());
    return;
  }

  console.log(`Received name and surname: ${speechResult}`);

  const [firstName, lastName] = speechResult.split(' ');
  if (!firstName || !lastName) {
    const response = new twiml.VoiceResponse();
    response.say('Please provide both your first name and last name.');
    response.hangup();

    res.type('text/xml');
    res.send(response.toString());
    return;
  }

  app.locals.pastConversations.push({
    type: 'account_creation',
    firstName,
    lastName,
    timestamp: new Date().toISOString(),
  });

  const response = new twiml.VoiceResponse();
  response.say(`Thank you, ${firstName} ${lastName}. Your account has been created successfully.`);
  response.hangup();

  res.type('text/xml');
  res.send(response.toString());
});

// Process issue logging (Option 2)
app.post('/process-log-issue', (req, res) => {
  const speechResult = req.body.SpeechResult;

  if (!speechResult) {
    const response = new twiml.VoiceResponse();
    response.say('I did not catch your issue. Please try again.');
    response.hangup();

    res.type('text/xml');
    res.send(response.toString());
    return;
  }

  console.log(`Logged issue: ${speechResult}`);

  app.locals.pastConversations.push({
    type: 'issue_log',
    issue: speechResult,
    timestamp: new Date().toISOString(),
  });

  const response = new twiml.VoiceResponse();
  response.say('Thank you for reporting your issue. We will get back to you shortly.');
  response.hangup();

  res.type('text/xml');
  res.send(response.toString());
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
