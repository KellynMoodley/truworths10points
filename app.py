from flask import Flask, request, redirect
from twilio.twiml.voice_response import VoiceResponse
import requests

app = Flask(__name__)

# Replace with your Watson Assistant URL and API Key
WATSON_ASSISTANT_URL = "https://api.us-south.assistant.watson.cloud.ibm.com/instances/xxxxxx/v1/workspaces/xxxxxx/message"
API_KEY = "your_api_key"

def send_to_watson(text):
    response = requests.post(
        WATSON_ASSISTANT_URL,
        headers={"Content-Type": "application/json"},
        auth=("apikey", API_KEY),
        json={
            "input": {"text": text},
            "context": {}  # optional, can be used to pass session/context data
        }
    )
    return response.json()

@app.route("/voice", methods=["GET", "POST"])
def voice():
    """Respond to the incoming call and capture speech."""
    resp = VoiceResponse()

    # Gather speech input
    gather = resp.gather(input="speech", timeout=5, speech_timeout="auto", action="/process_speech")
    gather.say("Please say something after the beep.")

    return str(resp)

@app.route("/process_speech", methods=["GET", "POST"])
def process_speech():
    """Process the speech input and save it to a text file."""
    transcription = request.form["SpeechResult"]  # Speech result from Twilio

    # Send transcription to Watson Assistant
    watson_response = send_to_watson(transcription)
    
    # Save the result to a text file
    with open("call_transcript.txt", "a") as file:
        file.write(f"User said: {transcription}\n")
        file.write(f"Watson Assistant response: {watson_response['output']['text'][0]}\n\n")

    # Respond to the caller
    resp = VoiceResponse()
    resp.say("Thank you for your input. Goodbye.")
    return str(resp)

if __name__ == "__main__":
    app.run(debug=True)
