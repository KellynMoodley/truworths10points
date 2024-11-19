const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const path = require('path');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// Watson Speech to Text credentials
const watsonSpeechToTextUrl = 'https://api.us-south.speech-to-text.watson.cloud.ibm.com/instances/d0fa1cd2-f3b4-4ff0-9888-196375565a8f';
const watsonSpeechToTextApiKey = 'ig_BusJMZMAOYfhcRJ-PtAf4PgjzSIMebGjszzJZ9RIj';

// HubSpot API credentials
const hubspotApiKey = 'pat-eu1-8a63beb2-b274-4166-869a-b47a4130275f'; // Replace with your HubSpot API key
const hubspotBaseUrl = 'https://api.hubapi.com';

// Store calls and conversations in memory
app.locals.currentCall = null;
app.locals.pastCalls = [];
app.locals.conversations = [];

// Serve the index.html file at the root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
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
  };
});

// Process speech input
app.post('/process-speech', async (req, res) => {
  const speechResult = req.body.SpeechResult;
  console.log(`Speech input received: ${speechResult}`);

  let botResponse = 'Thank you. Goodbye!';

  app.locals.conversations.push({
    user: speechResult,
    bot: botResponse,
  });

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
});

// Retrieve HubSpot CRM data
app.get('/hubspot-profile', async (req, res) => {
  const phone = req.query.phone;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  try {
    const response = await axios.get(
      `${hubspotBaseUrl}/contacts/v1/search/query?q=${phone}&hapikey=${hubspotApiKey}`
    );

    const contact = response.data.results[0]; // Retrieve the first matching contact
    if (contact) {
      res.json({
        name: contact.properties.firstname.value,
        email: contact.properties.email.value,
        phone:contact.properties.phone.value,
        accountnumbers: contact.properties.accountnumbers.value
      });
    } else {
      res.status(404).json({ error: 'No matching contact found' });
    }
  } catch (error) {
    console.error('Error fetching HubSpot data:', error.message);
    res.status(500).json({ error: 'Failed to fetch data from HubSpot' });
  }
});

// Endpoint to serve call data
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
