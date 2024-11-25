const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const { IamAuthenticator } = require('ibm-watson/auth');
const SpeechToTextV1 = require('ibm-watson/speech-to-text/v1');

const app = express();
const port = process.env.PORT || 3000;

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

const ACCESS_TOKEN = process.env.access_token;

// Store calls and conversations in memory
app.locals.currentCall = null;
app.locals.pastCalls = [];
app.locals.conversations = [];
app.locals.pastConversations = [];

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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
  response.say('Hello, please tell me something.');

  // Use Twilio's Record verb instead of Gather for Watson integration
  response.record({
    action: '/process-speech',
    method: 'POST',
    maxLength: 10,
    transcribe: false, // Disable Twilio transcription since we'll use Watson
    playBeep: true
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
    const recordingUrl = req.body.RecordingUrl;
    
    // Download the recording from Twilio
    const audioResponse = await axios({
      method: 'get',
      url: recordingUrl,
      responseType: 'stream'
    });

    // Configure Watson recognition parameters
    const params = {
      audio: audioResponse.data,
      contentType: 'audio/wav',
      model: 'en-US_NarrowbandModel', // Appropriate for phone calls
      wordAlternativesThreshold: 0.9,
      keywords: ['help', 'support', 'problem'], // Add relevant keywords
      keywordsThreshold: 0.5
    };

    // Perform speech recognition
    const watsonResponse = await speechToText.recognize(params);
    const transcription = watsonResponse.result.results?.[0]?.alternatives?.[0]?.transcript || '';
    
    console.log(`Watson transcription: ${transcription}`);

    // Generate bot response (you can enhance this based on the transcription)
    let botResponse = 'Thank you. Goodbye!';

    // Log the conversation
    app.locals.conversations.push({
      user: transcription,
      bot: botResponse,
    });

    // Respond with TwiML
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
    response.say('Sorry, there was an error processing your message. Goodbye.');
    response.hangup();
    res.type('text/xml');
    res.send(response.toString());
  }
});

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
