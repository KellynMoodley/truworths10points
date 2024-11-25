// Process speech input and redirect based on the option
app.post('/process-speech', async (req, res) => {
  try {
    const speechResult = req.body.SpeechResult?.toLowerCase();
    const digitResult = req.body.Digits;

    let selectedOption = '';
    if (digitResult === '1' || speechResult?.includes('create account')) {
      selectedOption = 'create account';
    } else if (digitResult === '2' || speechResult?.includes('log an issue')) {
      selectedOption = 'log an issue';
    } else if (digitResult === '3' || speechResult?.includes('open query')) {
      selectedOption = 'open query';
    } else {
      throw new Error('Invalid input');
    }

    console.log(`User selected: ${selectedOption}`);

    let botResponse = '';
    if (selectedOption === 'create account') {
      botResponse = 'You selected Create Account. Please provide your details.';
    } else if (selectedOption === 'log an issue') {
      botResponse = 'You selected Log an Issue. Please describe your issue.';
    } else if (selectedOption === 'open query') {
      botResponse = 'You selected Open Query. Please state your query.';
    }

    // Log the conversation
    app.locals.conversations.push({
      user: speechResult || digitResult,
      bot: botResponse,
    });

    const response = new twiml.VoiceResponse();

    // Add delay before responding
    setTimeout(() => {
      response.say(botResponse);
      response.gather({
        input: 'speech',
        action: '/finalize-response',
        method: 'POST',
        timeout: 10,
        language: 'en-US',
      });

      res.type('text/xml');
      res.send(response.toString());
    }, 3000); // 3-second delay
  } catch (error) {
    console.error('Error processing speech:', error);
    const response = new twiml.VoiceResponse();
    response.say('I did not catch that. Could you please repeat?');
    response.gather({
      input: 'speech dtmf',
      action: '/process-speech',
      method: 'POST',
      timeout: 5,
      language: 'en-US',
      enhanced: true,
    });
    res.type('text/xml');
    res.send(response.toString());
  }
});

// Finalize the response and end the call
app.post('/finalize-response', (req, res) => {
  const speechResult = req.body.SpeechResult;

  console.log(`User said: ${speechResult}`);

  const botResponse = 'Thank you, goodbye!';

  // Log the final conversation
  app.locals.conversations.push({
    user: speechResult,
    bot: botResponse,
  });

  const response = new twiml.VoiceResponse();

  // Add delay before final response
  setTimeout(() => {
    response.say(botResponse);
    response.hangup();

    // Update call status
    if (app.locals.currentCall) {
      const currentCall = app.locals.currentCall;
      const callDuration = Math.floor((new Date() - currentCall.startTime) / 1000);
      currentCall.duration = callDuration;
      currentCall.status = 'completed';
      currentCall.conversations = app.locals.conversations;

      // Store completed conversations in pastConversations
      app.locals.pastConversations.push(...app.locals.conversations);

      // Reset current call and conversations
      app.locals.pastCalls.push(currentCall);
      app.locals.currentCall = null;
      app.locals.conversations = [];
    }

    res.type('text/xml');
    res.send(response.toString());
  }, 3000); // 3-second delay
});
