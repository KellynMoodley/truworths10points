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

// Enhanced call state tracking
const CallState = {
  INITIAL_MENU: 'initial_menu',
  ACCOUNT_CREATION_NAME: 'account_creation_name',
  ACCOUNT_CREATION_SURNAME: 'account_creation_surname',
  ISSUE_LOGGING: 'issue_logging',
  ACCOUNT_REVIEW: 'account_review'
};

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
  response.say('Welcome to Truworths');
  response.say('Press or say 1 to create an account');
  response.say('Press or say 2 to log an issue');
  response.say('Press or say 3 to review account');

  // Use Gather with enhanced settings
  const gather = response.gather({
    input: ['speech', 'dtmf'],
    action: '/process-input',
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
    state: CallState.INITIAL_MENU
  };
});

// Process input (speech or keypad)
app.post('/process-input', async (req, res) => {
  const call = app.locals.currentCall;
  const speechResult = req.body.SpeechResult;
  const dtmfDigit = req.body.Digits;
  const input = speechResult || dtmfDigit;

  const response = new twiml.VoiceResponse();
  let botResponse = '';

  console.log(`Received input: ${input}, Current state: ${call.state}`);

  try {
    switch (call.state) {
      case CallState.INITIAL_MENU:
        if (input === '1' || speechResult?.toLowerCase().includes('one')) {
          call.state = CallState.ACCOUNT_CREATION_NAME;
          botResponse = 'Please provide your first name';
          response.say(botResponse);
          response.gather({
            input: ['speech', 'dtmf'],
            action: '/process-input',
            method: 'POST',
            voice: 'Polly.Ayanda-Neural',
            timeout: 5,
            enhanced: true
          });
        } else if (input === '2' || speechResult?.toLowerCase().includes('two')) {
          call.state = CallState.ISSUE_LOGGING;
          botResponse = 'Please describe the issue you are experiencing';
          response.say(botResponse);
          response.gather({
            input: ['speech'],
            action: '/process-issue',
            method: 'POST',
            voice: 'Polly.Ayanda-Neural',
            timeout: 10,
            enhanced: true
          });
        } else if (input === '3' || speechResult?.toLowerCase().includes('three')) {
          call.state = CallState.ACCOUNT_REVIEW;
          botResponse = 'For account review, please provide your account number';
          response.say(botResponse);
          response.gather({
            input: ['dtmf'],
            action: '/process-account-review',
            method: 'POST',
            voice: 'Polly.Ayanda-Neural',
            timeout: 10
          });
        } else {
          botResponse = 'Invalid option. Please try again.';
          response.say(botResponse);
          response.redirect('/voice');
        }
        break;

      case CallState.ACCOUNT_CREATION_NAME:
        if (input) {
          call.accountData = { firstName: input };
          call.state = CallState.ACCOUNT_CREATION_SURNAME;
          botResponse = 'Thank you. Now, please provide your surname';
          response.say(botResponse);
          response.gather({
            input: ['speech', 'dtmf'],
            action: '/process-input',
            method: 'POST',
            voice: 'Polly.Ayanda-Neural',
            timeout: 5,
            enhanced: true
          });
        } else {
          response.say('I did not hear a name. Please try again.');
          response.redirect('/voice');
        }
        break;

      case CallState.ACCOUNT_CREATION_SURNAME:
        if (input) {
          call.accountData.lastName = input;
          botResponse = `Thank you, ${call.accountData.firstName} ${call.accountData.lastName}. Your account creation is in process.`;
          response.say(botResponse);
          response.hangup();
        } else {
          response.say('I did not hear a surname. Please try again.');
          response.redirect('/voice');
        }
        break;

      default:
        response.redirect('/voice');
    }

    // Log conversation
    const conversationEntry = {
      timestamp: new Date().toISOString(),
      user: input,
      bot: botResponse,
    };
    app.locals.conversations.push(conversationEntry);

    // Write conversation to file
    const conversationFilePath = 'C:\\Users\\KMoodley\\Desktop\\Truworths\\conversations.txt';
    const directory = 'C:\\Users\\KMoodley\\Desktop\\Truworths';
    if (!fs.existsSync(directory)){
      fs.mkdirSync(directory, { recursive: true });
    }

    fs.appendFile(conversationFilePath, 
      `Timestamp: ${conversationEntry.timestamp}\n` +
      `User: ${conversationEntry.user}\n` +
      `Bot: ${conversationEntry.bot}\n` +
      '---\n', 
      (err) => {
        if (err) {
          console.error('Error writing to conversation file:', err);
        }
      }
    );

  } catch (error) {
    console.error('Error processing input:', error);
    response.say('Sorry, there was an error processing your request.');
    response.hangup();
  }

  res.type('text/xml');
  res.send(response.toString());
});

// Additional routes like /process-issue and /process-account-review would be implemented similarly
// For brevity, they are not fully detailed in this example

// Other existing routes remain the same...

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
