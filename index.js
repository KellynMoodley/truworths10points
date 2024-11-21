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

// Store calls and conversations
app.locals.currentCall = null;
app.locals.pastCalls = [];
app.locals.conversations = [];

// Serve the index.html file
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
              propertyName: "phonenumber",
              operator: "EQ",
              value: phone
            }
          ]
        }
      ],
      properties: ['firstname', 'lastname', 'city', 'message', 'accountnumbers', 'phonenumber']
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
  response.say('Hello, please tell me something.');

  response.gather({
    input: 'speech',
    action: '/process-speech',
    method: 'POST',
    timeout: 5, // Wait for speech for 5 seconds
  });

  res.type('text/xml');
  res.send(response.toString());

  // Store the call
  app.locals.currentCall = {
    caller,
    callSid,
    startTime,
    duration: 0,
    status: 'in-progress',
  };
});

// Process speech input
app.post('/process-speech', (req, res) => {
  const speechResult = req.body.SpeechResult;
  console.log(`Speech input received: ${speechResult}`);

  const response = new twiml.VoiceResponse();

  if (speechResult) {
    response.say('Thank you for speaking. Goodbye!');
  } else {
    response.say('No input detected. Goodbye!');
  }

  response.hangup();
  res.type('text/xml');
  res.send(response.toString());

  // Mark the call as completed
  completeCurrentCall();
});

// Handle call status updates
app.post('/call-status', (req, res) => {
  const { CallSid, CallStatus } = req.body;

  console.log(`Call Status Update: ${CallSid} is now ${CallStatus}`);

  if (CallStatus === 'completed') {
    completeCurrentCall();
  }

  res.sendStatus(200);
});

// Function to complete the current call
function completeCurrentCall() {
  if (app.locals.currentCall) {
    const currentCall = app.locals.currentCall;
    const callDuration = Math.floor((new Date() - currentCall.startTime) / 1000);

    currentCall.duration = callDuration;
    currentCall.status = 'completed';

    app.locals.pastCalls.push(currentCall);
    app.locals.currentCall = null;
    app.locals.conversations = [];
  }
}

// Endpoint to fetch call and conversation data
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
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
