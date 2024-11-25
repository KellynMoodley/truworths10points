// Handle the issue description after the user selects option 2
app.post('/handle-issue-description', async (req, res) => {
  try {
    const issueDescription = req.body.SpeechResult;

    if (!issueDescription) {
      return res.status(400).send('No issue description received');
    }

    console.log(`Issue description received: ${issueDescription}`);

    let botResponse = `Thank you for describing your issue: ${issueDescription}. Would you like to log this issue or do something else?`;

    // Store the issue description in the conversation
    const storeConversation = (userInput, botReply) => {
      const conversationEntry = {
        timestamp: new Date().toISOString(),
        user: userInput,
        bot: botReply,
      };
      app.locals.conversations.push(conversationEntry);
    };

    // Store conversation entry after receiving the issue description
    storeConversation(issueDescription, botResponse);

    const response = new twiml.VoiceResponse();
    response.say(botResponse);

    // Ask the user what they'd like to do next
    response.gather({
      input: 'speech dtmf',
      action: '/process-speech',
      method: 'POST',
      voice: 'Polly.Ayanda-Neural',
      timeout: 5,
      enhanced: true,
    });

    res.type('text/xml');
    res.send(response.toString());

  } catch (error) {
    console.error('Error handling issue description:', error);

    const response = new twiml.VoiceResponse();
    response.say('I did not catch that. Could you please repeat your issue?');

    response.gather({
      input: 'speech',
      action: '/handle-issue-description',
      method: 'POST',
      voice: 'Polly.Ayanda-Neural',
      timeout: 5,
      enhanced: true,
    });

    res.type('text/xml');
    res.send(response.toString());
  }
});
