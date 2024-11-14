// index.js (Backend)

const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// Handle incoming calls
app.post('/voice', (req, res) => {
  const callStatus = req.body.CallStatus; // Twilio sends the call status (completed, busy, etc.)
  const callSid = req.body.CallSid; // Unique identifier for the call
  const caller = req.body.From; // Phone number of the caller

  console.log(`Call from ${caller} with CallSid ${callSid} has status: ${callStatus}`);

  // Respond to Twilio with TwiML (XML response)
  const response = new twiml.VoiceResponse();
  response.say('Thank you for calling. Goodbye!');
  response.hangup();

  res.type('text/xml');
  res.send(response.toString());

  // Send data to the frontend or save it as needed
  // You can emit data to a socket or send a response to your frontend here
  // For simplicity, we'll just store the data in memory for now.
  app.locals.callData = {
    caller,
    callStatus,
    callSid
  };
});

// Serve the frontend
app.use(express.static('public'));

// Endpoint to serve the latest call data to the frontend
app.get('/latest-call-data', (req, res) => {
  // Send the latest call data if it exists
  res.json(app.locals.callData || null);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
