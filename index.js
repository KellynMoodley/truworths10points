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
            properties: ['firstname', 'lastname','email','mobilenumber', 'customerid', 'accountnumbers','highvalue', 'delinquencystatus','segmentation','outstandingbalance','missedpayment' ]
        };

        const response = await axios.post(url, query, {
            headers: {
               Authorization: `Bearer ${ACCESS_TOKEN}`,
               'Content-Type': 'application/json'
            }
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
  response.say('Welcome to Truworths.');
  response.say('Press 1 to create an account');
  response.say('Press 2 to log an issue');
  response.say('Press 3 to review account');

  // Use Gather with enhanced settings
  response.gather({
    input: 'speech',
    action: '/process-speech',
    method: 'POST',
    voice: 'Polly.Ayanda-Neural',
    timeout: 5,
    enhanced: true  // Enable enhanced speech recognition
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

// Process speech using Watson
app.post('/process-speech', async (req, res) => {
  try {
    const speechResult = req.body.SpeechResult;
    
    if (!speechResult) {
      throw new Error('No speech input received');
    }

    console.log(`Speech input received: ${speechResult}`);

    // Generate bot response based on the transcription
    let botResponse = 'Thank you for your message. Goodbye!';

    // Log the conversation
    const conversationEntry = {
      timestamp: new Date().toISOString(),
      user: speechResult,
      bot: botResponse,
    };
    app.locals.conversations.push(conversationEntry);

    // Write conversation to file
    const conversationFilePath = 'C:\\Users\\KMoodley\\Desktop\\Truworths\\conversations.txt';
    
    // Ensure the directory exists
    const directory = 'C:\\Users\\KMoodley\\Desktop\\Truworths';
    if (!fs.existsSync(directory)){
      fs.mkdirSync(directory, { recursive: true });
    }

    // Append conversation to file
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

    // Create TwiML response
    const response = new twiml.VoiceResponse();
    response.say(botResponse);
    response.hangup();

    // Update call status
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
    
    // Gather speech input again
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
