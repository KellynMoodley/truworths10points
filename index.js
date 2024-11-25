const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());
app.use(express.json());

// Watson Speech to Text credentials
const watsonSpeechToTextUrl = 'https://api.us-south.speech-to-text.watson.cloud.ibm.com/instances/d0fa1cd2-f3b4-4ff0-9888-196375565a8f';
const watsonSpeechToTextApiKey = 'ig_BusJMZMAOYfhcRJ-PtAf4PgjzSIMebGjszzJZ9RIj';

const ACCESS_TOKEN = process.env.access_token;

// Store calls and conversations in memory
app.locals.currentCall = null;
app.locals.pastCalls = [];
app.locals.conversations = [];
app.locals.pastConversations = []; // Store completed conversations

// Serve the index.html file at the root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API Route to search contact by phone number
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
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(response.data); // Log the full response to check if the data structure is correct
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
  response.say('Hello. Welcome to Truworths assistant.');
  response.say('Press 1 to create an account');
  response.say('Press 2 to open a ticket');

  response.gather({
    input: 'speech',
    action: '/process-speech',
    method: 'POST',
    voice: 'Polly.Ayanda-Neural',
    timeout: 5,
  });

  res.type('text/xml');
  res.send(response.toString());

  app.locals.currentCall = {
    caller,
    callSid,
    startTime,
    duration: 0,
    status: 'in-progress',
    timeoutId: setTimeout(() => {
      console.log(`Call from ${caller} timed out due to inactivity.`);

      const timeoutResponse = new twiml.VoiceResponse();
      timeoutResponse.say('No input received. Goodbye!');
      timeoutResponse.hangup();

      if (app.locals.currentCall) {
        app.locals.currentCall.status = 'timed-out';
        app.locals.currentCall.duration = Math.floor(
          (new Date() - app.locals.currentCall.startTime) / 1000
        );
        app.locals.currentCall.conversations = app.locals.conversations.length
          ? app.locals.conversations
          : [{ user: null, bot: 'User did not speak.' }];

        app.locals.pastCalls.push(app.locals.currentCall);
        if (app.locals.conversations.length) {
          app.locals.pastConversations.push(...app.locals.conversations);
        } else {
          app.locals.pastConversations.push({
            user: 'User did not speak.',
            bot: 'No response detected.',
          });
        }

        app.locals.currentCall = null;
        app.locals.conversations = [];
      }
    }, 8000), // 8 seconds
  };
});

// Process speech input
app.post('/process-speech', async (req, res) => {
  const speechResult = req.body.SpeechResult;
  console.log(`Speech input received: ${speechResult}`);

  let botResponse = 'Thank you. Goodbye!';

  if (app.locals.currentCall?.timeoutId) {
    clearTimeout(app.locals.currentCall.timeoutId);
  }

  app.locals.conversations.push({
    user: speechResult,
    bot: botResponse,
  });

  const response = new twiml.VoiceResponse();
  response.say(botResponse);
  response.hangup();

  if (app.locals.currentCall) {
    const currentCall = app.locals.currentCall;
    currentCall.duration = Math.floor((new Date() - currentCall.startTime) / 1000);
    currentCall.status = 'completed';
    currentCall.conversations = [...app.locals.conversations];

    app.locals.pastCalls.push(currentCall);
    app.locals.pastConversations.push(...app.locals.conversations);
    app.locals.currentCall = null;
    app.locals.conversations = [];
  }

  res.type('text/xml');
  res.send(response.toString());
});

// Endpoint to serve call and conversation data
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
