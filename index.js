const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const { IamAuthenticator } = require('ibm-watson/auth');
const SpeechToTextV1 = require('ibm-watson/speech-to-text/v1');
const twilio = require('twilio');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;
const { createClient } = require('@supabase/supabase-js');


// Configure middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());
app.use(express.json());

require('dotenv').config();

// Watson configuration
const speechToText = new SpeechToTextV1({
  authenticator: new IamAuthenticator({
    apikey: process.env.watson_speech_to_text_api_key,
  }),
  serviceUrl: process.env.watson_speech_to_text_url,
});

// Twilio configuration
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const ACCESS_TOKEN = process.env.access_token;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)

// Store calls and conversations in memory
app.locals.currentCall = null;
app.locals.pastCalls = [];
app.locals.conversations = [];
app.locals.pastConversations = [];

// Root endpoint
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Download conversation endpoint
app.get('/download-conversation/:callSid', (req, res) => {
  const callSid = req.params.callSid;
  const call = app.locals.pastCalls.find(c => c.callSid === callSid);

  if (!call || !call.conversations) {
    return res.status(404).send('Conversation not found');
  }

  const conversationText = call.conversations.map(conv => `
     Truworths customer: ${conv.user}
     Truworths agent: ${conv.bot} 
  `).join('');

  // Upload to Supabase instead of downloading
  const uploadResult = await uploadConversationToSupabase(conversationText, callSid);

  // Send back the public URL
    res.json({
      message: 'Conversation uploaded successfully',
      publicUrl: uploadResult.publicUrl
    });
  } catch (error) {
    console.error('Upload failed:', error);
    res.status(500).send('Failed to upload conversation');
  }

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename=conversation_${callSid}.txt`);
  res.send(conversationText);
});




// Download KPIs endpoint
app.get('/download-kpis', (req, res) => {
  const totalCalls = app.locals.pastCalls.length;
  const totalDuration = app.locals.pastCalls.reduce((acc, call) => acc + call.duration, 0);
  const avgCallTime = totalCalls > 0 ? (totalDuration / totalCalls).toFixed(2) : 0;

  // Generate KPI text
  let kpiText = `Truworths KPI Report\n\n`;
  kpiText += `Total Calls: ${totalCalls}\n`;
  kpiText += `Total Duration: ${totalDuration} seconds\n`;
  kpiText += `Average Call Duration: ${avgCallTime} seconds\n\n`;

  // Set headers for file download
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename=Truworths_KPI_Report.txt');
  res.send(kpiText);
});


// HubSpot contact search endpoint
app.post('/api/search', async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  try {
    const url = 'https://api.hubapi.com/crm/v3/objects/contacts/search';
    const query = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "mobilenumber",
              operator: "EQ",
              value: phone
            }
          ]
        }
      ],
      properties: ['firstname', 'lastname', 'email', 'mobilenumber', 'customerid', 'accountnumbers', 'highvalue', 'delinquencystatus', 'segmentation', 'outstandingbalance', 'missedpayment','promisetopay','paymentmethodhistory','lastmissedpaymentdate','ptpdate','bestpaymentdate','amounttopay']
    };

    const response = await axios.post(url, query, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    res.json(response.data.results);
  } catch (error) {
    console.error('Error searching contacts:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to search contacts. Please try again later.' });
  }
});

// Handle incoming calls
app.post('/voice', (req, res) => {
  const callSid = req.body.CallSid;
  const caller = req.body.From;
  const startTime = new Date();

  console.log(`Incoming call from ${caller} with CallSid ${callSid}`);

  const response = new twiml.VoiceResponse();
  response.say('Welcome to Truworths.');
  response.say('Say REVIEW account to receive your profile.');
  response.say('or start speaking and an agent will review your case.');

  response.gather({
    input: 'speech',
    action: '/process-speech',
    method: 'POST',
    voice: 'Polly.Ayanda-Neural',
    timeout: 5,
    enhanced: true,
    actionFallback: '/handle-no-speech'
  });

  // Add statusCallback for call status updates
  response.redirect({ method: 'POST' }, '/status-callback');

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

// Process speech using Watson and handle option 3
app.post('/process-speech', async (req, res) => {
  try {
    const speechResult = req.body.SpeechResult;

    if (!speechResult) {
      throw new Error('No speech input received');
    }

    console.log(`Speech input received: ${speechResult}`);

    let botResponse = 'Your issue has been saved. An agent will review and get back to you. Goodbye!';

    if (speechResult.toLowerCase().includes('review account')) {
      const phone = req.body.From;

      if (!phone) {
        botResponse = "I couldn't retrieve your phone number. Please provide it.";
      } else {
        try {
          const url = 'https://api.hubapi.com/crm/v3/objects/contacts/search';
          const query = {
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: 'mobilenumber',
                    operator: 'EQ',
                    value: phone
                  }
                ]
              }
            ],
            properties: ['firstname', 'lastname', 'outstandingbalance']
          };

          const response = await axios.post(url, query, {
            headers: {
              Authorization: `Bearer ${ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            }
          });

          const contact = response.data.results[0];

          if (contact) {
            const { firstname, lastname, outstandingbalance } = contact.properties;
            botResponse = `Based on your account, your name is ${firstname}, your surname is ${lastname}, and your balance is ${outstandingbalance}.`;
          } else {
            botResponse = "I couldn't find your account details.";
          }
        } catch (error) {
          console.error('Error fetching contact details from HubSpot:', error.response?.data || error.message);
          botResponse = "There was an issue retrieving your account details. Please try again later.";
        }
      }
    }

    const response = new twiml.VoiceResponse();
    response.say(botResponse);
    response.hangup();

    const conversationEntry = {
      timestamp: new Date().toISOString(),
      user: speechResult,
      bot: botResponse,
    };
    app.locals.conversations.push(conversationEntry);

    
    if (app.locals.currentCall) {
      const currentCall = app.locals.currentCall;
      const callDuration = Math.floor((new Date() - currentCall.startTime) / 1000);
      currentCall.duration = callDuration;
      currentCall.status = 'completed';
      currentCall.conversations = app.locals.conversations;
      app.locals.pastCalls.push(currentCall); // Push the current call to pastCalls
      app.locals.pastConversations.push(...app.locals.conversations); // Ensure all conversations are added to pastConversations
      app.locals.currentCall = null; // Clear current call
      app.locals.conversations = []; // Clear the current conversations array for the next call
    }


    res.type('text/xml');
    res.send(response.toString());
  } catch (error) {
    console.error('Error processing speech:', error);

    const response = new twiml.VoiceResponse();
    response.say('I did not catch that. Could you please repeat?');

    response.gather({
      input: 'speech',
      action: '/process-speech',
      method: 'POST',
      voice: 'Polly.Ayanda-Neural',
      timeout: 5,
      enhanced: true,
      actionFallback: '/handle-no-speech'
    });

    res.type('text/xml');
    res.send(response.toString());
  }
});

// Handle case where no speech is detected
app.post('/handle-no-speech', (req, res) => {
  console.log('Current Call before processing:', app.locals.currentCall);
  console.log('Current Conversations:', app.locals.conversations);

  const response = new twiml.VoiceResponse();
  response.say('No speech detected. Goodbye.');
  response.hangup();

  if (app.locals.currentCall) {
      const currentCall = app.locals.currentCall;
      const callDuration = Math.floor((new Date() - currentCall.startTime) / 1000);
      currentCall.duration = callDuration;
      currentCall.status = 'completed';
      currentCall.conversations = app.locals.conversations;

      // If no conversations, set the conversations to "Conversation not recorded"
  if (!app.locals.conversations || app.locals.conversations.length === 0 || app.locals.conversations.every(item => item === undefined)) {
      currentCall.conversations = ['Conversation not recorded'];
  } else {
      currentCall.conversations = app.locals.conversations;
  }
    
      console.log('Pushing Call:', currentCall);
      console.log('Pushing Conversations:', app.locals.conversations);

      app.locals.pastCalls.push(currentCall);
      app.locals.pastConversations.push(...app.locals.conversations);
      app.locals.currentCall = null;
      app.locals.conversations = [];

      console.log('Past Calls after pushing:', app.locals.pastCalls);
      console.log('Past Conversations after pushing:', app.locals.pastConversations);
  }
  
  res.type('text/xml');
  res.send(response.toString());
});

// Serve call data
app.get('/call-data', (req, res) => {
  if (app.locals.currentCall && app.locals.currentCall.status === 'in-progress') {
    app.locals.currentCall.duration = Math.floor(
      (new Date() - app.locals.currentCall.startTime) / 1000
    );
  }

  // Calculate the average call time and number of cases (calls)
  const totalCalls = app.locals.pastCalls.length;
  const totalDuration = app.locals.pastCalls.reduce((acc, call) => acc + call.duration, 0);
  const avgCallTime = totalCalls > 0 ? totalDuration / totalCalls : 0;

  res.json({
    currentCall: app.locals.currentCall,
    pastCalls: app.locals.pastCalls,
    totalCalls,                        // Total number of calls
    totalDuration,                     // Total duration of calls (in seconds)
    avgCallTime,
    conversations: app.locals.conversations,
    pastConversations: app.locals.pastConversations,
  });
});


// Status callback to handle call status changes
app.post('/status-callback', (req, res) => {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;

  console.log(`Status update for CallSid ${callSid}: ${callStatus}`);

  // Check if there's a current call and if it matches the CallSid from Twilio
  if (app.locals.currentCall && app.locals.currentCall.callSid === callSid) {
    // If the call is completed, failed, or no-answer, we process the conversation
    if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'no-answer' || callStatus === 'canceled' || callStatus === 'busy') {
      const currentCall = app.locals.currentCall;
      const callDuration = Math.floor((new Date() - currentCall.startTime) / 1000); // Calculate call duration

      // Update the current call's duration and status
      currentCall.duration = callDuration;
      currentCall.status = callStatus;
      currentCall.conversations = app.locals.conversations;

      // Move conversations to the past conversations array
      app.locals.pastConversations.push(...app.locals.conversations);

      // Push the current call to pastCalls
      app.locals.pastCalls.push(currentCall);

      // Clear current call and conversations for the next call
      app.locals.currentCall = null;
      app.locals.conversations = [];

  // Log for debugging
      console.log('Call terminated with status:', callStatus);
      console.log('Past Calls:', app.locals.pastCalls.length);
      console.log('Past Conversations:', app.locals.pastConversations.length);
    }
  }

  // Send an empty response to acknowledge the callback
  res.send('');
});


// Start the server
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
