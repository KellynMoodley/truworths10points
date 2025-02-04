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
      url: 'https://kkarodia.app.n8n.cloud/webhook/d1243d6b-35d5-4d00-913b-72ec5605839f',
      params: { myUrl: fileUrl }
    });

    const response = await axios({
      method: 'get',
      url: 'https://kkarodia.app.n8n.cloud/webhook/d1243d6b-35d5-4d00-913b-72ec5605839f',
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

app.post('/trigger-n8n', async (req, res) => {
  try {
    const fileUrl = req.body.fileUrl; // Assuming fileUrl is passed in the request body
    const result = await callN8nWebhook(fileUrl);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
