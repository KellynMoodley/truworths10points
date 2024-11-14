const express = require('express');
const bodyParser = require('body-parser');
const { twiml } = require('twilio');
const { Server } = require('socket.io');
const WebSocket = require('ws');
const SpeechToText = require('ibm-watson/speech-to-text/v1');
const { IamAuthenticator } = require('ibm-watson/auth');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

// Watson STT setup
const speechToText = new SpeechToText({
  authenticator: new IamAuthenticator({
    apikey: 'ig_BusJMZMAOYfhcRJ-PtAf4PgjzSIMebGjszzJZ9RIj',  // Replace with your API key
  }),
  serviceUrl: 'https://api.us-south.speech-to-text.watson.cloud.ibm.com/instances/d0fa1cd2-f3b4-4ff0-9888-196375565a8f',  // Your region URL
});

// Serve the index.html file at the root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle incoming calls and stream audio for transcription
app.post('/voice', (req, res) => {
  const response = new twiml.VoiceResponse();

  // Start gathering audio
  response.startGather({
    action: '/process_audio', // Where audio will be streamed for transcription
    method: 'POST',
  });
  
  response.say('Please speak after the beep.');
  response.hangup();

  res.type('text/xml');
  res.send(response.toString());
});

// Process the audio stream and send it to Watson STT
app.post('/process_audio', (req, res) => {
  const audioStream = req.body;  // Audio data from Twilio

  const ws = new WebSocket('wss://stream.watsonplatform.net/speech-to-text/api/v1/recognize');

  ws.on('open', () => {
    console.log('Connected to Watson Speech-to-Text');
    ws.send(audioStream);  // Send the audio stream to Watson STT
  });

  ws.on('message', (data) => {
    const transcription = JSON.parse(data);
    const text = transcription.results[0].alternatives[0].transcript;

    // Emit transcribed text to frontend
    io.emit('speech-to-text', text);
  });

  ws.on('close', () => {
    console.log('Disconnected from Watson Speech-to-Text');
  });

  res.send('Audio processed');
});

// WebSocket setup for real-time conversation on frontend
io.on('connection', (socket) => {
  console.log('A user connected');
  
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Start the server
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
