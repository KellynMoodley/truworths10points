const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const { IamAuthenticator } = require('ibm-watson/auth');
const SpeechToTextV1 = require('ibm-watson/speech-to-text/v1');
const twilio = require('twilio');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const stream = require('stream');

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

// Configure multer for handling audio files
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Store calls and conversations in memory
app.locals.currentCall = null;
app.locals.pastCalls = [];
app.locals.conversations = [];
app.locals.pastConversations = [];

// Root endpoint
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
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
  response.say('Hello, please tell me something.');

  // Record the audio for Watson processing
  response.record({
    action: '/process-speech',
    method: 'POST',
    maxLength: 10,
    playBeep: true,
    trim: 'trim-silence',
    recordingStatusCallback: '/recording-status',
    recordingStatusCallbackMethod: 'POST'
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

// Handle recording status updates
app.post('/recording-status', (req, res) => {
  console.log('Recording status:', req.body);
  res.sendStatus(200);
});

// Process speech using Watson
app.post('/process-speech', async (req, res) => {
  try {
    const recordingUrl = req.body.RecordingUrl;
    if (!recordingUrl) {
      throw new Error('No recording URL received');
    }

    console.log('Recording URL:', recordingUrl);

    // Download the audio file from Twilio
    const audioResponse = await axios({
      method: 'get',
      url: recordingUrl,
      responseType: 'arraybuffer',
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN
      }
    });

    // Create a readable stream from the audio buffer
    const audioStream = new stream.PassThrough();
    audioStream.end(audioResponse.data);

    // Configure Watson recognition parameters
    const recognizeParams = {
      audio: audioStream,
      contentType: 'audio/wav',
      model: 'en-US_NarrowbandModel',
      wordAlternativesThreshold: 0.9,
      smartFormatting: true,
      speakerLabels: true
    };

    // Perform speech recognition
    const watsonResponse = await speechToText.recognize(recognizeParams);
    const transcription = watsonResponse.result.results
      ?.map(result => result.alternatives[0]?.transcript || '')
      .join(' ') || '';

    console.log('Watson transcription:', transcription);

    // Generate bot response based on the transcription
    let botResponse = 'Thank you for your message. Goodbye!';

    // Log the conversation
    app.locals.conversations.push({
      user: transcription,
      bot: botResponse,
    });

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
    
    // Record again
    response.record({
      action: '/process-speech',
      method: 'POST',
      maxLength: 10,
      playBeep: true,
      trim: 'trim-silence'
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
