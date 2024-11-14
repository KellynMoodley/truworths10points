const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// Store calls in memory
app.locals.currentCall = null;
app.locals.pastCalls = [];

// Serve the index.html file at the root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle incoming calls
app.post('/voice', (req, res) => {
  const callSid = req.body.CallSid;
  const caller = req.body.From;
  const startTime = new Date();

  // Log the incoming call
  console.log(`Incoming call from ${caller} with CallSid ${callSid}`);

  // Respond with TwiML
  const response = new twiml.VoiceResponse();
  response.say('Thank you for calling Kellyn. How are you. Today is a wonderful day. December is almost here. Hooray. I cant wait to party. Goodbye!');
  response.hangup();

  res.type('text/xml');
  res.send(response.toString());

  // Store the new current call with "in-progress" status
  app.locals.currentCall = {
    caller,
    callSid,
    startTime,
    duration: 0,
    status: 'in-progress'
  };
});

// Endpoint to handle call status updates
app.post('/status', (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;

  console.log(`Status update for CallSid ${callSid}: ${callStatus}`);

  if (app.locals.currentCall && app.locals.currentCall.callSid === callSid) {
    // If call is completed, calculate the duration, mark as "completed," and move to past calls
    if (callStatus === 'completed') {
      const endTime = new Date();
      const duration = Math.floor((endTime - app.locals.currentCall.startTime) / 1000);

      app.locals.currentCall.duration = duration;
      app.locals.currentCall.status = 'completed';

      // Move the current call to past calls
      app.locals.pastCalls.unshift(app.locals.currentCall);
      app.locals.currentCall = null;
    } else {
      // Update the status for ongoing calls
      app.locals.currentCall.status = callStatus;
    }
  }

  res.sendStatus(200);
});

// Endpoint to serve the call data to the frontend
app.get('/call-data', (req, res) => {
  // Calculate live duration for an ongoing call
  if (app.locals.currentCall && app.locals.currentCall.status === 'in-progress') {
    app.locals.currentCall.duration = Math.floor((new Date() - app.locals.currentCall.startTime) / 1000);
  }

  res.json({
    currentCall: app.locals.currentCall,
    pastCalls: app.locals.pastCalls
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
