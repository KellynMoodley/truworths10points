const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const path = require('path');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// Store calls and conversations in memory
app.locals.currentCall = null;
app.locals.pastCalls = [];
app.locals.conversations = [];
app.locals.conversationState = 'greeting'; // Add state to manage the conversation flow

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
  response.say('Hello, this is Truworths. How can I help you?');

  // Gather speech input
  response.gather({
    input: 'speech',
    action: '/process-speech',
    method: 'POST',
    timeout: 5,
  });

  res.type('text/xml');
  res.send(response.toString());

  // Store the new current call with "in-progress" status
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

  let botResponse = 'I didn’t understand that. Goodbye!';
  let nextState = app.locals.conversationState;

  // Handle conversation logic based on the conversation state
  if (app.locals.conversationState === 'greeting') {
    if (speechResult.toLowerCase().includes('register')) {
      botResponse = 'Okay, I will help you register an account. Please provide your details.';
      nextState = 'registering'; // Move to next state
    } else if (speechResult.toLowerCase().includes('check status')) {
      botResponse = 'Sure, I will help you check your status.';
      nextState = 'checking-status';
    } else {
      botResponse = 'Sorry, I can only assist with account registration or status checking.';
    }
  } else if (app.locals.conversationState === 'registering') {
    // Continue with registration flow if in 'registering' state
    botResponse = `Thank you for your interest in registering. Please provide your full name.`;
    nextState = 'getting-name';
  } else if (app.locals.conversationState === 'checking-status') {
    // Handle status checking logic if needed
    botResponse = `Checking your status now. Please wait.`;
    nextState = 'status-checked';
  }

  // Log the conversation
  app.locals.conversations.push({
    user: speechResult,
    bot: botResponse,
  });

  // Respond with TwiML based on the bot's response
  const response = new twiml.VoiceResponse();
  response.say(botResponse);

  // If the conversation state has changed, we update the state
  app.locals.conversationState = nextState;

  // Optionally, keep the conversation open or end it after a response
  if (nextState === 'registering' || nextState === 'checking-status') {
    // Ask for the next piece of information (e.g., user's name)
    response.gather({
      input: 'speech',
      action: '/process-speech',
      method: 'POST',
      timeout: 5,
    });
  } else {
    response.hangup();
  }

  // Update call status to "completed" and move to pastCalls
  if (app.locals.currentCall) {
    const currentCall = app.locals.currentCall;
    const callDuration = Math.floor((new Date() - currentCall.startTime) / 1000);
    currentCall.duration = callDuration;
    currentCall.status = 'completed';
    app.locals.pastCalls.push(currentCall); // Add to past calls
    app.locals.currentCall = null; // Clear current call
  }

  res.type('text/xml');
  res.send(response.toString());
});

// Endpoint to serve call and conversation data
app.get('/call-data', (req, res) => {
  // Calculate live duration for an ongoing call
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
