// Handle incoming calls
app.post('/voice', (req, res) => {
  const callSid = req.body.CallSid;
  const caller = req.body.From;
  const startTime = new Date();

  // Log the incoming call
  console.log(`Incoming call from ${caller} with CallSid ${callSid}`);

  // Respond with TwiML
  const response = new twiml.VoiceResponse();
  response.say('Welcome! I am a Truworths agent.');
  response.gather({
    input: 'dtmf',
    action: '/process-speech',
    method: 'POST',
    numDigits: 1,
    timeout: 5,
  }).say('Press 1 to create an account. Press 2 to log an issue. Press 3 to talk to an agent.');

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

// Process speech and DTMF input
app.post('/process-speech', async (req, res) => {
  const digit = req.body.Digits; // Captures DTMF input
  console.log(`Digit input received: ${digit}`);

  const response = new twiml.VoiceResponse();
  if (!response){
    response.hangup();
  }

  if (digit === '1') {
    response.say('Please provide your first name.');
    response.gather({
      input: 'speech',
      action: '/process-create-account',
      method: 'POST',
    });
  } else if (digit === '2') {
    response.say('Please describe your issue after the beep.');
    response.record({
      action: '/process-issue',
      method: 'POST',
      maxLength: 120,
    });
  } else if (digit === '3') {
    response.say('Connecting you to an agent. Please hold.');
    
  } else {
    response.say('Invalid option. Goodbye!');
    response.hangup();
  }

  res.type('text/xml');
  res.send(response.toString());
});

// Handle account creation details
app.post('/process-create-account', (req, res) => {
  const speechResult = req.body.SpeechResult;
  console.log(`First name received: ${speechResult}`);

  const response = new twiml.VoiceResponse();
  response.say(`Thank you. Now, please say your last name.`);
  response.gather({
    input: 'speech',
    action: '/process-last-name',
    method: 'POST',
  });

  res.type('text/xml');
  res.send(response.toString());
});

app.post('/process-last-name', (req, res) => {
  const lastName = req.body.SpeechResult;
  console.log(`Last name received: ${lastName}`);

  const response = new twiml.VoiceResponse();
  response.say(`Got it. Finally, please say your email address.`);
  response.gather({
    input: 'speech',
    action: '/process-email',
    method: 'POST',
  });

  res.type('text/xml');
  res.send(response.toString());
});

app.post('/process-email', (req, res) => {
  const email = req.body.SpeechResult;
  console.log(`Email received: ${email}`);

  const response = new twiml.VoiceResponse();
  response.say(`Thank you for providing your details. Your account creation process is complete.`);
  response.hangup();

  res.type('text/xml');
  res.send(response.toString());
});

// Handle issue recording
app.post('/process-issue', (req, res) => {
  const recordingUrl = req.body.RecordingUrl;
  console.log(`Issue recorded at: ${recordingUrl}`);

  const response = new twiml.VoiceResponse();
  response.say('Thank you for reporting the issue. Our team will get back to you shortly.');
  response.hangup();

  res.type('text/xml');
  res.send(response.toString());
});
