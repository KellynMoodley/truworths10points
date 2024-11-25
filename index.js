const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const { IamAuthenticator } = require("ibm-cloud-sdk-core");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

// Watson Speech to Text Configuration
const WATSON_API_KEY = "YOUR_WATSON_S2T_API_KEY";
const WATSON_URL = "YOUR_WATSON_S2T_URL";

// Endpoint to handle Twilio Media Streams
app.post("/twilio-media", (req, res) => {
  res.send(`
    <Response>
      <Connect>
        <Stream url="wss://https://truworths-5d9b0467377c.herokuapp.com//media-stream" />
      </Connect>
    </Response>
  `);
});

// WebSocket for Twilio Media Streams
const twilioStreamServer = new WebSocket.Server({ noServer: true });

// Handle incoming Twilio WebSocket connections
twilioStreamServer.on("connection", (twilioSocket) => {
  console.log("Twilio Media Stream connected");

  // Set up Watson Speech to Text WebSocket
  const watsonSocket = new WebSocket(
    `${WATSON_URL}/v1/recognize?model=en-US_BroadbandModel`,
    [],
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`apikey:${WATSON_API_KEY}`).toString("base64")}`,
      },
    }
  );

  // Send initial configuration to Watson
  watsonSocket.on("open", () => {
    watsonSocket.send(
      JSON.stringify({
        action: "start",
        contentType: "audio/l16;rate=16000",
        interimResults: true,
      })
    );
    console.log("Watson Speech to Text WebSocket connected");
  });

  // Forward audio from Twilio to Watson
  twilioSocket.on("message", (data) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.event === "media" && parsed.media.payload) {
        const audioBuffer = Buffer.from(parsed.media.payload, "base64");
        watsonSocket.send(audioBuffer);
      }
    } catch (error) {
      console.error("Error processing Twilio media stream:", error);
    }
  });

  // Handle Watson transcription results
  watsonSocket.on("message", (message) => {
    const result = JSON.parse(message);
    if (result.results && result.results.length > 0) {
      const transcript = result.results[0].alternatives[0].transcript;
      console.log("Transcription:", transcript);
    }
  });

  // Handle Twilio socket close
  twilioSocket.on("close", () => {
    console.log("Twilio Media Stream disconnected");
    watsonSocket.close();
  });

  // Handle Watson socket close
  watsonSocket.on("close", () => {
    console.log("Watson Speech to Text WebSocket disconnected");
  });
});

// Start the server
const server = app.listen(3000, () => {
  console.log("Server running on port 3000");
});

// Upgrade HTTP server to WebSocket server for Twilio
server.on("upgrade", (request, socket, head) => {
  if (request.url === "/media-stream") {
    twilioStreamServer.handleUpgrade(request, socket, head, (ws) => {
      twilioStreamServer.emit("connection", ws, request);
    });
  }
});
