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
    timeout: 10, // Increased timeout
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

  // Initialize bot response and next question
  let botResponse = 'I didn’t understand that. Goodbye!';
  let nextQuestion = '';

  // Simulate responses based on user input
  if (speechResult.toLowerCase().includes('register')) {
    botResponse = 'Okay, I will help you register an account. Please provide your details.';
    nextQuestion = 'Please provide your full name.';
  } else if (speechResult.toLowerCase().includes('thank you')) {
    botResponse = 'Thank you for your interest in registering. Please provide your full name.';
    nextQuestion = 'What is your full name?';
  } else if (speechResult) {
    botResponse = `Thank you, information is captured.`;
    nextQuestion = 'Goodbye';
  } else if (speechResult.toLowerCase().includes('goodbye')) {
    botResponse = 'Thank you for your time! Goodbye!';
    nextQuestion = ''; // End the conversation
  }

  // Log the conversation
  app.locals.conversations.push({
    user: speechResult,
    bot: botResponse,
  });

  // Respond with TwiML
  const response = new twiml.VoiceResponse();
  response.say(botResponse);

  // If there’s a next question, re-prompt for input
  if (nextQuestion) {
    response.gather({
      input: 'speech',
      action: '/process-speech',
      method: 'POST',
      timeout: 10, // Increased timeout
    }).say(nextQuestion);
  } else {
    // If no more questions, end the conversation
    response.hangup();

    // Mark the call as complete
    if (app.locals.currentCall) {
      const currentCall = app.locals.currentCall;
      const callDuration = Math.floor((new Date() - currentCall.startTime) / 1000);
      currentCall.duration = callDuration;
      currentCall.status = 'completed';
      app.locals.pastCalls.push(currentCall); // Add to past calls
      app.locals.currentCall = null; // Clear current call
    }
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
