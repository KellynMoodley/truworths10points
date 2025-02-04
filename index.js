const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Serve the HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Webhook test endpoint
app.post('/test-webhook', async (req, res) => {
    const { fileUrl } = req.body;
    if (!fileUrl) {
        return res.status(400).json({ error: 'Missing fileUrl parameter' });
    }

    try {
        const response = await axios.get('https://kkarodia.app.n8n.cloud/webhook/d1243d6b-35d5-4d00-913b-72ec5605839f', {
            params: { myUrl: fileUrl },
            timeout: 10000
        });

        res.json({ success: true, data: response.data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
