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

// Download conversation endpoint
app.get('/download-conversation/:callSid', (req, res) => {
  const callSid = req.params.callSid;
  const call = app.locals.pastCalls.find(c => c.callSid === callSid);

  if (!call || !call.conversations) {
    return res.status(404).send('Conversation not found');
  }

  const conversationText = call.conversations.map(conv => 
    `User: ${conv.user}\nBot: ${conv.bot}\n---\n`
  ).join('');

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename=conversation_${callSid}.txt`);
  res.send(conversationText);
});

// Handle incoming calls
app.post('/voice', (req, res) => {
  const callSid = req.body.CallSid;
  const caller = req.body.From;
  const startTime = new Date();

  console.log(`Incoming call from ${caller} with CallSid ${callSid}`);

  const response = new twiml.VoiceResponse();
  response.say('Welcome to Truworths');
  response.say('Press 1 or say "create account" to create an account');
  response.say('Press 2 or say "log issue" to log an issue');
  response.say('Press 3 or say "review account" to review your account');

  response.gather({
    input: 'dtmf speech',
    action: '/process-speech',
    method: 'POST',
    numDigits: 1,
    timeout: 5,
    hints: 'create account, log issue, review account',
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

// Process speech or keypad input
app.post('/process-speech', async (req, res) => {
  try {
    const speechResult = req.body.SpeechResult || '';
    const dtmfResult = req.body.Digits || '';
    const userInput = dtmfResult || speechResult.toLowerCase();

    console.log(`User input received: ${userInput}`);

    let botResponse = '';
    const response = new twiml.VoiceResponse();

    if (userInput.includes('1') || userInput.includes('create account')) {
      botResponse = 'Please provide your name and surname after the beep.';
      response.say(botResponse);
      response.record({
        action: '/handle-name-surname',
        method: 'POST',
        maxLength: 10,
        playBeep: true,
      });
    } else if (userInput.includes('2') || userInput.includes('log issue')) {
      botResponse = 'Please describe your issue after the beep.';
      response.say(botResponse);
      response.record({
        action: '/handle-log-issue',
        method: 'POST',
        maxLength: 60,
        playBeep: true,
      });
    } else if (userInput.includes('3') || userInput.includes('review account')) {
      botResponse = 'Your account details will be reviewed shortly.';
      response.say(botResponse);
      response.hangup();
    } else {
      botResponse = 'I did not catch that. Please try again.';
      response.say(botResponse);
      response.gather({
        input: 'dtmf speech',
        action: '/process-speech',
        method: 'POST',
        numDigits: 1,
        timeout: 5,
        hints: 'create account, log issue, review account',
        enhanced: true,
      });
    }

    // Log the conversation
    const conversationEntry = {
      timestamp: new Date().toISOString(),
      user: userInput,
      bot: botResponse,
    };
    app.locals.conversations.push(conversationEntry);

    res.type('text/xml');
    res.send(response.toString());
  } catch (error) {
    console.error('Error processing input:', error);
    const response = new twiml.VoiceResponse();
    response.say('An error occurred. Please try again later.');
    res.type('text/xml');
    res.send(response.toString());
  }
});

// Handle recorded name and surname
app.post('/handle-name-surname', (req, res) => {
  const recordingUrl = req.body.RecordingUrl;

  console.log('Recorded name and surname:', recordingUrl);

  const botResponse = 'Thank you for providing your details. Goodbye!';
  const response = new twiml.VoiceResponse();
  response.say(botResponse);
  response.hangup();

  const conversationEntry = {
    timestamp: new Date().toISOString(),
    user: 'Name and surname provided (recorded)',
    bot: botResponse,
    recording: recordingUrl,
  };
  app.locals.conversations.push(conversationEntry);

  res.type('text/xml');
  res.send(response.toString());

  if (app.locals.currentCall) {
    const currentCall = app.locals.currentCall;
    currentCall.duration = Math.floor((new Date() - currentCall.startTime) / 1000);
    currentCall.status = 'completed';
    currentCall.conversations = app.locals.conversations;
    app.locals.pastCalls.push(currentCall);
    app.locals.currentCall = null;
    app.locals.conversations = [];
  }
});

// Handle log issue recording
app.post('/handle-log-issue', (req, res) => {
  const recordingUrl = req.body.RecordingUrl;

  console.log('Recorded issue:', recordingUrl);

  const botResponse = 'Thank you for describing your issue. Goodbye!';
  const response = new twiml.VoiceResponse();
  response.say(botResponse);
  response.hangup();

  const conversationEntry = {
    timestamp: new Date().toISOString(),
    user: 'Issue description provided (recorded)',
    bot: botResponse,
    recording: recordingUrl,
  };
  app.locals.conversations.push(conversationEntry);

  res.type('text/xml');
  res.send(response.toString());

  if (app.locals.currentCall) {
    const currentCall = app.locals.currentCall;
    currentCall.duration = Math.floor((new Date() - currentCall.startTime) / 1000);
    currentCall.status = 'completed';
    currentCall.conversations = app.locals.conversations;
    app.locals.pastCalls.push(currentCall);
    app.locals.currentCall = null;
    app.locals.conversations = [];
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
