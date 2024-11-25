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
  response.say('Press 1 to create an account');
  response.say('Press 2 to log an issue');
  response.say('Press 3 to review account');

  response.gather({
    input: 'speech dtmf',
    action: '/process-selection',
    method: 'POST',
    voice: 'Polly.Ayanda-Neural',
    timeout: 5,
    enhanced: true
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

// Process the selection from user input (either speech or keypad)
app.post('/process-selection', async (req, res) => {
  const selection = req.body.SpeechResult || req.body.Digits;
  let botResponse = '';
  
  console.log(`User selected: ${selection}`);

  if (!selection) {
    return res.status(400).send('No input received');
  }

  // Store the conversation entry
  const storeConversation = (userInput, botReply) => {
    const conversationEntry = {
      timestamp: new Date().toISOString(),
      user: userInput,
      bot: botReply,
    };
    app.locals.conversations.push(conversationEntry);
  };

  // Handle the selected option
  if (selection === '1' || selection.toLowerCase().includes('create an account')) {
    botResponse = 'Please provide your details to create an account.';
  } else if (selection === '2' || selection.toLowerCase().includes('log an issue')) {
    botResponse = 'Please tell us what the issue is.';
  } else if (selection === '3' || selection.toLowerCase().includes('review account')) {
    botResponse = 'Please provide your phone number to retrieve your account details.';
  } else {
    botResponse = 'I didn’t understand your selection. Please try again.';
    const response = new twiml.VoiceResponse();
    response.say(botResponse);
    response.gather({
      input: 'speech dtmf',
      action: '/process-selection',
      method: 'POST',
      timeout: 5,
    });
    return res.type('text/xml').send(response.toString());
  }

  storeConversation(selection, botResponse);

  // Ask for additional information based on the selection
  const response = new twiml.VoiceResponse();
  response.say(botResponse);

  // Gather additional information if necessary
  response.gather({
    input: 'speech dtmf',
    action: '/process-additional-info',
    method: 'POST',
    timeout: 10,
  });

  res.type('text/xml');
  res.send(response.toString());
});

// Process additional information based on selection
app.post('/process-additional-info', async (req, res) => {
  const additionalInfo = req.body.SpeechResult || req.body.Digits;
  let botResponse = '';

  if (!additionalInfo) {
    return res.status(400).send('No additional information received');
  }

  // Example: If the user wants to create an account, ask for more details
  if (additionalInfo.toLowerCase().includes('create')) {
    botResponse = 'Please provide your full name.';
  } else if (additionalInfo.toLowerCase().includes('issue')) {
    botResponse = 'Can you describe the issue in more detail?';
  } else if (additionalInfo.toLowerCase().includes('review')) {
    botResponse = 'Please provide your account number to proceed with the review.';
  } else {
    botResponse = 'Sorry, I didn’t understand. Can you please repeat the information?';
  }

  // Store the conversation entry
  const storeConversation = (userInput, botReply) => {
    const conversationEntry = {
      timestamp: new Date().toISOString(),
      user: userInput,
      bot: botReply,
    };
    app.locals.conversations.push(conversationEntry);
  };

  storeConversation(additionalInfo, botResponse);

  const response = new twiml.VoiceResponse();
  response.say(botResponse);
  response.hangup();

  // Store and end the call
  if (app.locals.currentCall) {
    const currentCall = app.locals.currentCall;
    const callDuration = Math.floor((new Date() - currentCall.startTime) / 1000);
    currentCall.duration = callDuration;
    currentCall.status = 'completed';
    currentCall.conversations = app.locals.conversations;
    app.locals.pastCalls.push(currentCall);
    app.locals.currentCall = null;
    app.locals.conversations = [];
  }

  res.type('text/xml');
  res.send(response.toString());
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
