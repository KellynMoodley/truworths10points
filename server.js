const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/fetch-summary', async (req, res) => {
    const accountNumber = req.query.account;
    try {
        const response = await axios.get(`https://kkarodia.app.n8n.cloud/webhook/447e15a0-6001-402e-93ef-0f3aad7110cd?account=${encodeURIComponent(accountNumber)}`);
        res.json(response.data);
    } catch (error) {
        res.status(404).json({ error: 'No data found' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
