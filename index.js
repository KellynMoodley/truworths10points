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
              propertyName: "mobilenumber",
              operator: "EQ",
              value: phone
            }
          ]
        }
      ],
      properties: ['firstname', 'lastname','email','mobilenumber', 'customerid', 'accountnumbers','highvalue', 'delinquencystatus','segmentation','outstandingbalance','missedpayment']
    };

    const response = await axios.post(url, query, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
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

// Process speech using Watson and handle option 3
app.post('/process-speech', async (req, res) => {
  try {
    const speechResult = req.body.SpeechResult;

    if (!speechResult) {
      throw new Error('No speech input received');
      response.hangup();
      const conversationEntry = {
      timestamp: new Date().toISOString(),
      user: speechResult,
      bot: botResponse,
    };
    app.locals.conversations.push(conversationEntry);

  res.type('text/xml');
  res.send(response.toString());
    }

    if (speechResult.toLowerCase().includes('option 1') || 
        speechResult.toLowerCase().includes('option one')) {
      const response = new twiml.VoiceResponse();
      response.say('Please say your first name.');
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
    }


    if (speechResult.toLowerCase().includes('option 3') || 
    speechResult.toLowerCase().includes('option three'))  {
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
                    value: phone
                  }
                ]
              }
            ],
            properties: ['firstname', 'lastname', 'outstandingbalance']
          };

          const response = await axios.post(url, query, {
            headers: {
              Authorization: `Bearer ${ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            }
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
      enhanced: true
    });

    res.type('text/xml');
    res.send(response.toString());
  }
});

// Process Option 1: Create an account
app.post('/process-create-account', (req, res) => {
  const callSid = req.body.CallSid;
  const speechResult = req.body.SpeechResult?.trim();
  const currentStep = app.locals.currentCall?.currentStep || 'askFirstname';
  let botResponse;

  if (!speechResult) {
    botResponse = 'I did not catch that. Could you please repeat?';
    saveConversation(callSid, speechResult, botResponse);

    const response = new twiml.VoiceResponse();
    response.say(botResponse);
    response.gather({
      input: 'speech',
      action: '/process-create-account',
      method: 'POST',
      voice: 'Polly.Ayanda-Neural',
      timeout: 5,
    });
    res.type('text/xml');
    res.send(response.toString());
    return;
  }

  switch (currentStep) {
    case 'askFirstname':
      botResponse = `Thank you. Please say your last name.`;
      app.locals.currentCall = {
        ...app.locals.currentCall,
        firstname: speechResult,
        currentStep: 'askLastname',
      };
      break;

    case 'askLastname':
      botResponse = `Thank you. Now, please say your email address.`;
      app.locals.currentCall = {
        ...app.locals.currentCall,
        lastname: speechResult,
        currentStep: 'askEmail',
      };
      break;

    case 'askEmail':
      botResponse = `Thank you for providing your details. Your account creation process is complete.`;
      app.locals.currentCall = {
        ...app.locals.currentCall,
        email: speechResult,
        currentStep: 'completed',
      };

      // Save completed data to past conversations
      app.locals.pastConversations.push({
        firstname: app.locals.currentCall.firstname,
        lastname: app.locals.currentCall.lastname,
        email: app.locals.currentCall.email,
        timestamp: new Date().toISOString(),
      });
      break;

    default:
      botResponse = 'I did not understand. Could you repeat that?';
      break;
  }

  // Save conversation step
  saveConversation(callSid, speechResult, botResponse);

  // Generate Twilio VoiceResponse
  const response = new twiml.VoiceResponse();
  response.say(botResponse);

  if (app.locals.currentCall.currentStep !== 'completed') {
    response.gather({
      input: 'speech',
      action: '/process-create-account',
      method: 'POST',
      voice: 'Polly.Ayanda-Neural',
      timeout: 5,
    });
  } else {
    response.hangup();
  }

  res.type('text/xml');
  res.send(response.toString());
});

// Helper function to save conversation
function saveConversation(callSid, userResponse, botResponse) {
  const conversationEntry = {
    timestamp: new Date().toISOString(),
    user: userResponse,
    bot: botResponse,
  };

  if (!app.locals.currentCall) return;

  // Save current call conversation
  if (!app.locals.currentCall.conversations) {
    app.locals.currentCall.conversations = [];
  }
  app.locals.currentCall.conversations.push(conversationEntry);

  // Save to past calls for tracking
  const existingCall = app.locals.pastCalls.find((c) => c.callSid === callSid);
  if (existingCall) {
    existingCall.conversations.push(conversationEntry);
  } else {
    app.locals.pastCalls.push({
      callSid,
      conversations: [conversationEntry],
    });
  }
}



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
