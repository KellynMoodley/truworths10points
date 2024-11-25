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
  response.say('Press 1 to log an issue');
  response.say('Press 2 to review account.');
  response.say('Press 3 to speak freely. Start speaking.');

  // Gather both speech and keypad inputs
  response.gather({
    input: 'speech dtmf',
    action: '/process-input',
    method: 'POST',
    voice: 'Polly.Ayanda-Neural',
    timeout: 5,
    enhanced: true
  });

  res.type('text/xml');
  res.send(response.toString());

  // Initialize the current call and its conversation history
  app.locals.currentCall = {
    caller,
    callSid,
    startTime,
    duration: 0,
    status: 'in-progress',
    conversations: []  // Initialize an empty array to store current call conversations
  };
});

app.post('/process-input', async (req, res) => {
  try {
    let userInput = req.body.SpeechResult;  // Check for speech or keypad input
    if (!userInput) {
      throw new Error('No input received');
    }

    console.log(`User input received: ${userInput}`);

    let botResponse = 'Thank you for your message. We will save your response and have an agent look at it. Goodbye!';

    // Function to log the conversation
    function logConversation(userInput, botResponse) {
      const conversationEntry = {
        timestamp: new Date().toISOString(),
        user: userInput,
        bot: botResponse,
      };
      app.locals.currentCall.conversations.push(conversationEntry);
    }

    // Function to handle responses and gather more input
    function sendResponse(botResponse, gatherOptions = {}) {
      const response = new twiml.VoiceResponse();
      response.say(botResponse);
      if (gatherOptions.retry) {
        response.gather({
          input: 'speech dtmf',
          action: '/process-input',
          method: 'POST',
          voice: 'Polly.Ayanda-Neural',
          timeout: 5,
          enhanced: true
        });
      } else {
        response.hangup();
      }

      res.type('text/xml');
      res.send(response.toString());
    }

    if (userInput.toLowerCase().includes('option 1') || userInput === '1') {
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
            properties: ['email']
          };

          const response = await axios.post(url, query, {
            headers: {
              Authorization: `Bearer ${ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            }
          });

          const contact = response.data.results[0];

          if (contact) {
            const { email } = contact.properties;
            botResponse = `Issue will be logged. An email will be sent to ${email}.`;
          } else {
            botResponse = "I couldn't find your account details.";
          }
        } catch (error) {
          console.error('Error fetching contact details from HubSpot:', error.response?.data || error.message);
          botResponse = "There was an issue retrieving your account details. Please try again later.";
        }
      }

      logConversation(userInput, botResponse);
      sendResponse(botResponse);

    } else if (userInput.toLowerCase().includes('option 2') || userInput === '2') {
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

      logConversation(userInput, botResponse);
      sendResponse(botResponse);

    } else {
      // Default handling for other inputs
      const conversationEntry = {
        timestamp: new Date().toISOString(),
        user: userInput,
        bot: "I'm sorry, I didn't understand that option. Please try again.",
      };
      app.locals.currentCall.conversations.push(conversationEntry);
      sendResponse(conversationEntry.bot, { retry: true });
    }

  } catch (error) {
    console.error('Error processing input:', error);
    sendResponse('I did not catch that. Could you please repeat?', { retry: true });
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
