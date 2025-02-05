const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

const axios = require('axios');

async function fetchSummary() {
    const accountNumber = document.getElementById('accountNumber').value;
    if (!accountNumber) {
        alert('Please enter an account number.');
        return;
    }
    try {
        const response = await axios.get(`https://kkarodia.app.n8n.cloud/webhook/447e15a0-6001-402e-93ef-0f3aad7110cd?account=${encodeURIComponent(accountNumber)}`);
        document.getElementById('summary').innerText = JSON.stringify(response.data, null, 2);
    } catch (error) {
        document.getElementById('summary').innerText = 'No data for account number: ' + accountNumber;
    }
}
