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
//app.use(cors());
// CORS Configuration
app.use(cors({
  origin: ['https://truworths-5d9b0467377c.herokuapp.com/'],
//  origin:'*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use(express.static(__dirname));

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

// N8N Webhook Function
async function callN8nWebhook(fileUrl) {
  try {
    console.log('Calling N8N Webhook with URL:', fileUrl);
    console.log('Full Axios Config:', {
      method: 'get',
      url: 'https://kkarodia.app.n8n.cloud/webhook/call_url',
      params: { myUrl: fileUrl }
    });

    const response = await axios({
      method: 'get',
      url: 'https://kkarodia.app.n8n.cloud/webhook/call_url',
      params: { myUrl: fileUrl },
      timeout: 100000 // 10 second timeout
    });

    console.log('Webhook Response Status:', response.status);
    console.log('Webhook Response Data:', response.data);
    return response.data;
  } catch (error) {
    console.error('N8N Webhook Error Details:', {
      message: error.message,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : 'No response',
      config: error.config
    });
    throw error;
  }
}

// Supabase File Check Function
async function checkFileAndLog() {
  try {
    // Get the public URL of the file
    const { data, error } = supabase
      .storage
      .from('truworths')
      .getPublicUrl('+27815952073.txt');

    if (error) {
      console.error('Error fetching file:', error.message);
      return null;
    }

    // Check if the URL is valid
    const response = await fetch(data.publicUrl);
    if (response.ok) {
      console.log('File found successfully');
      console.log('File URL:', data.publicUrl);
      
      // Call N8N webhook with file URL
      const webhookResult = await callN8nWebhook(data.publicUrl);
      return webhookResult;
    } else {
      console.error('File not found or inaccessible');
      return null;
    }
  } catch (err) {
    console.error('Unexpected error:', err.message);
    throw err;
  }
}

// Backend (index.js)
app.get('/check-file', async (req, res) => {
  try {
    const result = await checkFileAndLog();
    res.json({ 
      message: 'File check completed', 
      data: result?.response?.output_text  || 'No data received'
      
    });
  } catch (err) {
    console.error('Error in file check route:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/webhook-data', async (req, res) => {
  try {
    const result = await checkFileAndLog();
    res.json({ 
      message: 'Webhook data retrieved', 
      response: result?.response?.text || 'No data received'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Download conversation endpoint
app.get('/download-conversation/:callSid', async (req, res) => {
  try {
    const callSid = req.params.callSid;
    const call = app.locals.pastCalls.find(c => c.callSid === callSid);

    if (!call || !call.conversations) {
      return res.status(404).send('Conversation not found');
    }

    const caller = call.caller|| 'Unknown'; // Access the caller (phone number) from the call object

    const now = new Date(); 
    const timestamp = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Johannesburg',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(now);

    const conversationText = call.conversations.map(conv => `
       Date: ${timestamp}
       Truworths customer: Option ${conv.user}
       Truworths agent: ${conv.bot} 
    `).join('');


    // Define a filename for the uploaded file
    const fileName = `${caller}_${callSid}.txt`;

    // Upload the conversation text to Supabase storage
   // const { data, error } = await supabase
    //  .storage
    //  .from('truworths')
    //  .upload(fileName, conversationText, {
    //    cacheControl: '3600',
    //    contentType: 'text/plain',
    //    upsert: false
    //  });

   // if (error) {
    //  console.error('Supabase upload error:', error);
    //  return res.status(500).send('Error uploading conversation to Supabase');
    //} else {
    //  console.log('Conversation uploaded successfully:', data);
    //}

    // Send the conversation text as a downloadable file
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.send(conversationText);
  } catch (error) {
    console.error('Error in /download-conversation:', error.message);
    res.status(500).send('Internal Server Error');
  }
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
  response.say('Press 1 to review your account.');

  response.gather({
    input: 'dtmf speech',
    action: '/process-speech',
    method: 'POST',
    numDigits: 1,
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
    const speechResult= req.body.Digits; 
    //const speechResult = req.body.SpeechResult;

    if (!speechResult) {
      throw new Error('No speech input received');
    }

   // console.log(`Speech input received: ${speechResult}`);

    //let botResponse = 'Your issue has been saved. An agent will review and get back to you. Goodbye!';

    //if (speechResult.toLowerCase().includes('review account')) {
    if (speechResult === '1'){
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

    const conversationEntry = {
      timestamp: new Date().toISOString(),
      user: speechResult,
      bot: botResponse,
    };
    app.locals.conversations.push(conversationEntry);
        
    response.hangup();

    
    if (app.locals.currentCall) {
      const currentCall = app.locals.currentCall;
      const callDuration = Math.floor((new Date() - currentCall.startTime) / 1000);
      currentCall.duration = callDuration;
      currentCall.status = 'completed';
      currentCall.conversations = app.locals.conversations;
      const now = new Date(); 
      const timestamp = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Johannesburg',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(now);
      
      const conversationText = currentCall.conversations.map(conv => `
        Date: ${timestamp}
        Truworths customer: Option ${conv.user}
        Truworths agent: ${conv.bot} 
      `).join('');
      
      // Define a filename for the uploaded file
      const fileName = `${currentCall.caller}_${currentCall.callSid}.txt`;

      const fileNamephone= `${currentCall.caller}.txt`;
      
      // Upload the conversation text to Supabase storage
      const { data, error } = await supabase
        .storage
        .from('truworths')
        .upload(fileName, conversationText, {
         cacheControl: '3600',
         contentType: 'text/plain',
          upsert: false
      });

      
     if (error) {
       console.error('Supabase upload error:', error);
      return res.status(500).send('Error uploading conversation to Supabase');
    } else {
       console.log('Conversation uploaded successfully:', data);
      }


try {
  // Step 1: Download the existing file content
  const { data: existingFile, error: downloadError } = await supabase
    .storage
    .from('truworths')
    .download(fileNamephone);
  
   console.log('Starting the try block');

  let existingContent = '';

  if (existingFile) {
    // Convert the file content to a string
    existingContent = await existingFile.text();
  } else if (downloadError && downloadError.status !== 404) {
    // Handle errors other than "file not found"
    throw new Error(downloadError.message);
  }

  // Step 2: Append the new content to the existing content
  const updatedContent = `${existingContent}\n${conversationText}`;

  // Step 3: Upload the updated content back to the file
  const { error: uploadError } = await supabase
    .storage
    .from('truworths')
    .upload(fileNamephone, updatedContent, {
      cacheControl: '3600',
      contentType: 'text/plain',
      upsert: true, // Overwrite the file with updated content
    });
  
 
console.log('Existing content:', existingContent);
console.log('Updated content:', updatedContent);


  if (uploadError) {
    throw new Error(uploadError.message);
  }

  console.log('File updated successfully!');
} catch (error) {
  console.error('Error appending to file:', error.message);
  // Upload the conversation text to Supabase storage
  const { data, error } = await supabase
    .storage
    .from('truworths')
    .upload(fileNamephone, conversationText, {
      cacheControl: '3600',
      contentType: 'text/plain',
      upsert: false
   });
}
    

      
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

app.post('/handle-no-speech', async (req, res) => {
  try {
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
      
      // Handle conversations
      if (!app.locals.conversations || app.locals.conversations.length === 0) {
        currentCall.conversations = [{
          timestamp: new Date().toISOString(),
          user: 'No conversation recorded',
          bot: 'No response'
        }];
      } else {
        currentCall.conversations = app.locals.conversations;
      }
    
      const now = new Date(); 
      const timestamp = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Johannesburg',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(now);
      
      const conversationText = currentCall.conversations.map(conv => `
        Date: ${timestamp}
        Truworths customer: Option ${conv.user}
        Truworths agent: ${conv.bot} 
      `).join('');

      
      // Define a filename for the uploaded file
      const fileName = `${currentCall.caller}_${currentCall.callSid}.txt`;
      
      // Upload the conversation text to Supabase storage
      const { data, error } = await supabase
        .storage
        .from('truworths')
        .upload(fileName, conversationText, {
          cacheControl: '3600',
          contentType: 'text/plain',
          upsert: false
        });
      
      if (error) {
        console.error('Supabase upload error:', error);
        return res.status(500).send('Error uploading conversation to Supabase');
      } else {
        console.log('Conversation uploaded successfully:', data);
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
  } catch (error) {
    console.error('Error in /handle-no-speech:', error.message);
    res.status(500).send('Internal Server Error');
  }
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
app.post('/status-callback', async (req, res) => {
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
      //currentCall.conversations = app.locals.conversations;
      // Ensure conversations are captured
      if (app.locals.conversations.length > 0) {
        currentCall.conversations = app.locals.conversations;
      } else {
        // If no conversations, create a default entry
        currentCall.conversations = [{
          timestamp: new Date().toISOString(),
          user: 'No conversation recorded',
          bot: 'No response'
        }];
      }

      const now = new Date(); 
      const timestamp = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Johannesburg',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(now);
      
      const conversationText = currentCall.conversations.map(conv => `
        Date: ${timestamp}
        Truworths customer: ${conv.user}
        Truworths agent: ${conv.bot} 
      `).join('');
      
      // Define a filename for the uploaded file
      const fileName = `${currentCall.caller}_${currentCall.callSid}.txt`;
      
      // Upload the conversation text to Supabase storage
      const { data, error } = await supabase
        .storage
        .from('truworths')
        .upload(fileName, conversationText, {
          cacheControl: '3600',
          contentType: 'text/plain',
          upsert: false
        });
      
      if (error) {
        console.error('Supabase upload error:', error);
        return res.status(500).send('Error uploading conversation to Supabase');
      } else {
        console.log('Conversation uploaded successfully:', data);
      }

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
