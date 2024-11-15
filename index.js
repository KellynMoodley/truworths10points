const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const path = require('path');
const socketIo = require('socket.io');
const { SpeechToTextV1 } = require('ibm-watson/speech-to-text/v1');
const { IamAuthenticator } = require('ibm-watson/auth');

const app = express();
const port = process.env.PORT || 3000;

// Configure IBM Watson Speech to Text
const speechToText = new SpeechToTextV1({
  authenticator: new IamAuthenticator({
    apikey: 'ig_BusJMZMAOYfhcRJ-PtAf4PgjzSIMebGjszzJZ9RIj',
  }),
  serviceUrl: 'https://api.us-south.speech-to-text.watson.cloud.ibm.com/instances/d0fa1cd2-f3b4-4ff0-9888-196375565a8f',
});

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
  const gather = response.gather({
    input: 'speech',
    timeout: 3,
    action: '/process-speech',
    method: 'POST',
  });
  gather.say('Hello! How are you today?');

  res.type('text/xml');
  res.send(response.toString());

  // Initialize current call data
  app.locals.currentCall = {
    caller,
    callSid,
    startTime,
    duration: 0,
    status: 'in-progress',
    conversation: [],
  };
});

// Process user speech input
app.post('/process-speech', async (req, res) => {
  const callSid = req.body.CallSid;
  const userSpeech = req.body.SpeechResult || 'No speech detected';

  console.log(`User said: ${userSpeech}`);

  // Respond based on user speech
  const response = new twiml.VoiceResponse();

  // Example interactive response
  if (userSpeech.toLowerCase().includes('hello')) {
    response.say('Thank you, Kellyn. Goodbye.');
    response.hangup();

    // Update call data
    if (app.locals.currentCall && app.locals.currentCall.callSid === callSid) {
      app.locals.currentCall.conversation.push({ user: userSpeech, bot: 'Thank you, Kellyn. Goodbye.' });
      endCurrentCall(callSid);
    }
  } else {
    response.say('I didn’t quite catch that. Can you say that again?');
  }

  res.type('text/xml');
  res.send(response.toString());

  // Store the conversation
  if (app.locals.currentCall && app.locals.currentCall.callSid === callSid) {
    app.locals.currentCall.conversation.push({ user: userSpeech, bot: response.toString() });
  }
});

// End the current call
function endCurrentCall(callSid) {
  if (app.locals.currentCall && app.locals.currentCall.callSid === callSid) {
    const endTime = new Date();
    const duration = Math.floor((endTime - app.locals.currentCall.startTime) / 1000);

    app.locals.currentCall.duration = duration;
    app.locals.currentCall.status = 'completed';

    // Move the call to past calls
    app.locals.pastCalls.unshift(app.locals.currentCall);
    app.locals.currentCall = null;
  }
}

// Serve call data and conversation to the frontend
app.get('/call-data', (req, res) => {
  // Update live duration for an ongoing call
  if (app.locals.currentCall && app.locals.currentCall.status === 'in-progress') {
    app.locals.currentCall.duration = Math.floor((new Date() - app.locals.currentCall.startTime) / 1000);
  }

  res.json({
    currentCall: app.locals.currentCall,
    pastCalls: app.locals.pastCalls,
  });
});

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

const io = socketIo(server);

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });

  // Broadcast updates to the conversation
  setInterval(() => {
    if (app.locals.currentCall) {
      socket.emit('update', app.locals.currentCall);
    }
  }, 1000);
});
