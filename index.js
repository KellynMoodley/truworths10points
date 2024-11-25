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

// Store calls and conversations
app.locals.calls = {};

// Root endpoint
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle incoming calls
app.post('/voice', (req, res) => {
  const callSid = req.body.CallSid;
  const caller = req.body.From;
  const startTime = new Date();

  app.locals.calls[callSid] = {
    caller,
    callSid,
    startTime,
    duration: 0,
    status: 'in-progress',
    conversations: [],
  };

  const response = new twiml.VoiceResponse();
  response.say('Welcome to Truworths.');
  response.say('Say option 1 to create an account');
  response.say('Say option 2 to log an issue');
  response.say('Say option 3 to review account');

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
});

// Process speech
app.post('/process-speech', async (req, res) => {
  const callSid = req.body.CallSid;
  const speechResult = req.body.SpeechResult;

  if (!speechResult) {
    respondWithMessage(callSid, res, "I didn't catch that. Please try again.");
    return;
  }

  let botResponse;
  if (speechResult.toLowerCase().includes('option 1')) {
    botResponse = 'Please say your first name.';
  } else if (speechResult.toLowerCase().includes('option 3')) {
    botResponse = await handleAccountReview(req.body.From);
  } else {
    botResponse = 'Invalid option. Please try again.';
  }

  addConversation(callSid, speechResult, botResponse);
  respondWithMessage(callSid, res, botResponse);
});

// Helper function to handle account review
async function handleAccountReview(phone) {
  if (!phone) {
    return "I couldn't retrieve your phone number. Please provide it.";
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
      properties: ['firstname', 'lastname', 'outstandingbalance'],
    };

    const response = await axios.post(url, query, {
      headers: {
        Authorization: `Bearer ${process.env.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const contact = response.data.results[0];
    if (contact) {
      const { firstname, lastname, outstandingbalance } = contact.properties;
      return `Based on your account, your name is ${firstname}, your surname is ${lastname}, and your balance is ${outstandingbalance}.`;
    } else {
      return "I couldn't find your account details.";
    }
  } catch (error) {
    console.error('Error fetching contact details:', error.response?.data || error.message);
    return 'There was an issue retrieving your account details. Please try again later.';
  }
}

// Add conversation entry
function addConversation(callSid, user, bot) {
  if (!app.locals.calls[callSid]) return;

  const entry = {
    timestamp: new Date().toISOString(),
    user,
    bot,
  };

  app.locals.calls[callSid].conversations.push(entry);
}

// Respond with Twilio VoiceResponse
function respondWithMessage(callSid, res, message) {
  const response = new twiml.VoiceResponse();
  response.say(message);

  if (message.includes('Thank you') || message.includes('Goodbye')) {
    response.hangup();
    app.locals.calls[callSid].status = 'completed';
  } else {
    response.gather({
      input: 'speech',
      action: '/process-speech',
      method: 'POST',
      voice: 'Polly.Ayanda-Neural',
      timeout: 5,
      enhanced: true,
    });
  }

  res.type('text/xml');
  res.send(response.toString());
}

// Get call and conversation data
app.get('/call-data', (req, res) => {
  const calls = Object.values(app.locals.calls).map((call) => {
    if (call.status === 'in-progress') {
      call.duration = Math.floor((new Date() - call.startTime) / 1000);
    }
    return call;
  });

  res.json({ calls });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
