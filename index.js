const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// Store calls in memory (for demo purposes, consider using a database for production)
app.locals.calls = [];

// Serve the index.html file at the root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle incoming calls
app.post('/voice', (req, res) => {
  const callStatus = req.body.CallStatus;
  const callSid = req.body.CallSid;
  const caller = req.body.From;
  const startTime = new Date(); // Record the start time of the call

  console.log(`Call from ${caller} with CallSid ${callSid} has status: ${callStatus}`);

  // Respond to Twilio with TwiML (XML response)
  const response = new twiml.VoiceResponse();
  response.say('Thank you for calling Kellyn. Goodbye!');
  response.hangup();

  res.type('text/xml');
  res.send(response.toString());

  // Store the call data, including the start time
  app.locals.calls.unshift({
    caller,
    callStatus,
    callSid,
    startTime,
    duration: 0 // Placeholder for duration, updated when call completes
  });
});

// Endpoint to serve the current and past call data to the frontend
app.get('/call-data', (req, res) => {
  // Calculate duration for the ongoing call if it exists
  const calls = app.locals.calls.map(call => {
    if (call.callStatus === 'in-progress') {
      call.duration = Math.floor((new Date() - call.startTime) / 1000); // Duration in seconds
    }
    return call;
  });
  
  // Separate the current call (if ongoing) from past calls
  const [currentCall, ...pastCalls] = calls;
  
  res.json({ currentCall, pastCalls });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
