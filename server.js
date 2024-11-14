const express = require('express');
const { twiml } = require('twilio');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const path = require('path');
const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// Serve the HTML file directly from the server when accessing the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Endpoint for Twilio webhook to handle incoming calls
app.post('/twilio-webhook', async (req, res) => {
    const voiceResponse = new twiml.VoiceResponse();
    
    // Call Watsonx Assistant to get a response based on the phone call's context
    const assistantResponse = await getWatsonxAssistantResponse(req.body);
    
    // Send Watson's response as speech
    voiceResponse.say(assistantResponse.text, {
        voice: 'alice',
    });

    res.type('text/xml');
    res.send(voiceResponse.toString());
});

// Function to interact with Watsonx Assistant API
async function getWatsonxAssistantResponse(callData) {
    // Call your Watsonx Assistant API endpoint with the required parameters (e.g., context, messages)
    const response = await fetch('https://api.us-south.assistant.watson.cloud.ibm.com/instances/65990e2d-697c-473b-9033-da43beb1a8ee', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${Buffer.from('apikey:XrmHraHtnUmM6G6w9EI_qbXSHabHgnms7sIP0rCx9XKf').toString('base64')}`,
        },
        body: JSON.stringify({
            input: {
                text: 'Hello from phone call!',
            },
            context: {} // You can store context information here from the call
        }),
    });
    const data = await response.json();
    return data.output;
}

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
