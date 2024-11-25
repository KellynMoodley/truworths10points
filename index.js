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
  response.say('Press 1 to create an account');
  response.say('Press 2 to log an issue');
  response.say('Press 3 to review account');

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

// Process input route
app.post('/process-input', async (req, res) => {
  try {
    let userInput = req.body.SpeechResult || req.body.Digits;  // Check for speech or keypad input
    if (!userInput) {
      throw new Error('No input received');
    }

    console.log(`User input received: ${userInput}`);

    let botResponse = 'Thank you for your message. Goodbye!';
    let contactDetails = null;

    // Handle speech or keypad input for different options
    if (userInput.toLowerCase().includes('option 1') || userInput === '1') {
      // Account Creation Flow
      const phone = req.body.From;
      
      botResponse = "To create an account, please provide your first name.";
      
      // New gathering step for first name
      const response = new twiml.VoiceResponse();
      response.gather({
        input: 'speech',
        action: '/capture-account-details',
        method: 'POST',
        voice: 'Polly.Ayanda-Neural',
        timeout: 5,
        enhanced: true,
        hints: 'first name'
      });
      
      res.type('text/xml');
      return res.send(response.toString());
    } else if (userInput.toLowerCase().includes('option 3') || userInput === '3') {
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

    // Log the conversation for the current call
    const conversationEntry = {
      timestamp: new Date().toISOString(),
      user: userInput,
      bot: botResponse,
    };
    app.locals.currentCall.conversations.push(conversationEntry);

    // Respond to the user
    const response = new twiml.VoiceResponse();
    response.say(botResponse);
    response.hangup();

    // When the call ends, move the conversation to pastConversations
    if (app.locals.currentCall) {
      const currentCall = app.locals.currentCall;
      const callDuration = Math.floor((new Date() - currentCall.startTime) / 1000);
      currentCall.duration = callDuration;
      currentCall.status = 'completed';
      
      // Store the conversation history under pastConversations
      app.locals.pastCalls.push(currentCall);
      app.locals.pastConversations.push(...currentCall.conversations);  // Move conversation history to pastConversations

      app.locals.currentCall = null;
      app.locals.conversations = [];
    }

    res.type('text/xml');
    res.send(response.toString());
  } catch (error) {
    console.error('Error processing input:', error);

    const response = new twiml.VoiceResponse();
    response.say('I did not catch that. Could you please repeat?');

    // Retry input
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
  }
});

// New route to capture account details
app.post('/capture-account-details', async (req, res) => {
  try {
    const firstName = req.body.SpeechResult;
    const phone = req.body.From;

    // Log first name conversation
    const firstNameConversation = {
      timestamp: new Date().toISOString(),
      user: firstName,
      bot: "Thank you. Now, please provide your last name."
    };
    app.locals.currentCall.conversations.push(firstNameConversation);

    // Gather last name
    const response = new twiml.VoiceResponse();
    response.gather({
      input: 'speech',
      action: '/capture-last-name',
      method: 'POST',
      voice: 'Polly.Ayanda-Neural',
      timeout: 5,
      enhanced: true,
      hints: 'last name'
    }, firstNameConversation.bot);
    
    res.type('text/xml');
    res.send(response.toString());
  } catch (error) {
    console.error('Error capturing first name:', error);
    const response = new twiml.VoiceResponse();
    response.say('Sorry, I did not understand. Please try again.');
    response.hangup();
    res.type('text/xml');
    res.send(response.toString());
  }
});

// Route to capture last name and email
app.post('/capture-last-name', async (req, res) => {
  try {
    const lastName = req.body.SpeechResult;
    const phone = req.body.From;

    // Log last name conversation
    const lastNameConversation = {
      timestamp: new Date().toISOString(),
      user: lastName,
      bot: "Thank you. Please provide your email address."
    };
    app.locals.currentCall.conversations.push(lastNameConversation);

    // Gather email
    const response = new twiml.VoiceResponse();
    response.gather({
      input: 'speech',
      action: '/create-hubspot-contact',
      method: 'POST',
      voice: 'Polly.Ayanda-Neural',
      timeout: 5,
      enhanced: true,
      hints: 'email address'
    }, lastNameConversation.bot);
    
    res.type('text/xml');
    res.send(response.toString());
  } catch (error) {
    console.error('Error capturing last name:', error);
    const response = new twiml.VoiceResponse();
    response.say('Sorry, I did not understand. Please try again.');
    response.hangup();
    res.type('text/xml');
    res.send(response.toString());
  }
});

// Route to create HubSpot contact
app.post('/create-hubspot-contact', async (req, res) => {
  try {
    const email = req.body.SpeechResult;
    const phone = req.body.From;

    // Retrieve first name and last name from previous conversations
    const firstName = app.locals.currentCall.conversations.find(conv => 
      conv.bot.includes("last name")
    ).user;
    const lastName = app.locals.currentCall.conversations.find(conv => 
      conv.bot.includes("email address")
    ).user;

    // Log email conversation
    const emailConversation = {
      timestamp: new Date().toISOString(),
      user: email,
      bot: "Thank you. Creating your account."
    };
    app.locals.currentCall.conversations.push(emailConversation);

    // Create contact in HubSpot
    const url = 'https://api.hubapi.com/crm/v3/objects/contacts';
    const contactData = {
      properties: {
        firstname: firstName,
        lastname: lastName,
        email: email,
        mobilenumber: phone
      }
    };

    const response = await axios.post(url, contactData, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    // Prepare final response
    const finalConversation = {
      timestamp: new Date().toISOString(),
      user: null,
      bot: "Your account has been successfully created. Thank you for choosing Truworths."
    };
    app.locals.currentCall.conversations.push(finalConversation);

    // Voice response
    const twimlResponse = new twiml.VoiceResponse();
    twimlResponse.say(finalConversation.bot);
    twimlResponse.hangup();

    // Similar to other call end logic
    if (app.locals.currentCall) {
      const currentCall = app.locals.currentCall;
      const callDuration = Math.floor((new Date() - currentCall.startTime) / 1000);
      currentCall.duration = callDuration;
      currentCall.status = 'completed';
      
      app.locals.pastCalls.push(currentCall);
      app.locals.pastConversations.push(...currentCall.conversations);

      app.locals.currentCall = null;
      app.locals.conversations = [];
    }

    res.type('text/xml');
    res.send(twimlResponse.toString());
  } catch (error) {
    console.error('Error creating HubSpot contact:', error.response?.data || error.message);
    
    const twimlResponse = new twiml.VoiceResponse();
    twimlResponse.say('Sorry, we could not create your account at this time. Please try again later.');
    twimlResponse.hangup();

    res.type('text/xml');
    res.send(twimlResponse.toString());
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
