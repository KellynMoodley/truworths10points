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
const stream = require('stream');

const app = express();
const port = process.env.PORT || 3000;

// Configure middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());
app.use(express.json());

require('dotenv').config();

// Watson Speech to Text configuration
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

// Configure multer for handling audio files
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Store calls and conversations in memory
app.locals.currentCall = null;
app.locals.pastCalls = [];
app.locals.conversations = [];

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
              propertyName: 'mobilenumber',
              operator: 'EQ',
              value: phone,
            },
          ],
        },
      ],
      properties: [
        'firstname',
        'lastname',
        'email',
        'mobilenumber',
        'customerid',
        'accountnumbers',
        'highvalue',
        'delinquencystatus',
        'segmentation',
        'outstandingbalance',
        'missedpayment',
      ],
    };

    const response = await axios.post(url, query, {
      headers: {
        Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    res.json(response.data.results);
  } catch (error) {
    console.error('Error searching contacts:', error.message);
    res.status(500).json({ error: 'Failed to search contacts. Please try again later.' });
  }
});

// Handle incoming calls
app.post('/voice', (req, res) => {
  const { CallSid, From: caller } = req.body;
  const startTime = new Date();

  console.log(`Incoming call from ${caller} with CallSid ${CallSid}`);

  const response = new twiml.VoiceResponse();
  response.say('Hello, please tell me something.');

  response.record({
    action: '/process-speech',
    method: 'POST',
    maxLength: 10,
    playBeep: true,
    trim: 'trim-silence',
    recordingStatusCallback: '/recording-status',
    recordingStatusCallbackMethod: 'POST',
  });

  res.type('text/xml');
  res.send(response.toString());

  app.locals.currentCall = {
    caller,
    callSid: CallSid,
    startTime,
    duration: 0,
    status: 'in-progress',
  };
});

// Process recorded speech
app.post('/process-speech', async (req, res) => {
  try {
    const { RecordingUrl } = req.body;

    if (!RecordingUrl) {
      throw new Error('No recording URL received');
    }

    console.log('Recording URL:', RecordingUrl);

    const audioResponse = await axios({
      method: 'get',
      url: RecordingUrl,
      responseType: 'arraybuffer',
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN,
      },
    });

    const audioStream = new stream.PassThrough();
    audioStream.end(audioResponse.data);

    const recognizeParams = {
      audio: audioStream,
      contentType: 'audio/wav',
      model: 'en-US_NarrowbandModel',
      wordAlternativesThreshold: 0.9,
      smartFormatting: true,
    };

    const watsonResponse = await speechToText.recognize(recognizeParams);
    const transcription = watsonResponse.result.results
      ?.map(result => result.alternatives[0]?.transcript || '')
      .join(' ') || 'Unable to transcribe';

    console.log('Watson transcription:', transcription);

    app.locals.conversations.push({ user: transcription, bot: 'Thank you for your message. Goodbye!' });

    const response = new twiml.VoiceResponse();
    response.say('Thank you for your message. Goodbye!');
    response.hangup();

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
  } catch (error) {
    console.error('Error processing speech:', error.message);
    const response = new twiml.VoiceResponse();
    response.say('I did not catch that. Could you please repeat?');
    response.record({
      action: '/process-speech',
      method: 'POST',
      maxLength: 10,
      playBeep: true,
      trim: 'trim-silence',
    });

    res.type('text/xml');
    res.send(response.toString());
  }
});

// Serve call data
app.get('/call-data', (req, res) => {
  if (app.locals.currentCall?.status === 'in-progress') {
    app.locals.currentCall.duration = Math.floor(
      (new Date() - app.locals.currentCall.startTime) / 1000
    );
  }

  res.json({
    currentCall: app.locals.currentCall,
    pastCalls: app.locals.pastCalls,
    conversations: app.locals.conversations,
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
