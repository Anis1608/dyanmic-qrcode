const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Load database
let db = {};
if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        console.error("Error reading database:", e);
        db = {};
    }
}

// Helper to save database
const saveDb = () => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
};

// Generate a random ID
const generateId = () => {
    return Math.random().toString(36).substring(2, 8);
};

// 1. Create a new Dynamic QR Code Link
app.post('/api/generate', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const id = generateId();
    // In a real app, check for collisions
    
    db[id] = url;
    saveDb();

    // The URL that will be encoded in the QR code
    // Assuming localhost for now, but in production this should be the public domain
    // We will try to detect the host header if possible, or use a default
    // For local testing, we'll use the request protocol and host
    const redirectUrl = `${req.protocol}://${req.get('host')}/r/${id}`;

    try {
        const qrCodeImage = await QRCode.toDataURL(redirectUrl);
        res.json({
            id,
            redirectUrl,
            qrCodeImage,
            targetUrl: url
        });
    } catch (err) {
        res.status(500).json({ error: 'Error generating QR code' });
    }
});

// 2. Redirect Endpoint
app.get('/r/:id', (req, res) => {
    const { id } = req.params;
    const targetUrl = db[id];

    if (targetUrl) {
        // Simple analytics could go here (count scans)
        res.redirect(targetUrl);
    } else {
        res.status(404).send('Link not found or expired.');
    }
});

// 3. Update the Link (The "Dynamic" part)
app.post('/api/update', (req, res) => {
    const { id, newUrl } = req.body;
    if (!id || !newUrl) {
        return res.status(400).json({ error: 'ID and New URL are required' });
    }

    if (db[id]) {
        db[id] = newUrl;
        saveDb();
        res.json({ success: true, id, newUrl });
    } else {
        res.status(404).json({ error: 'QR Code ID not found' });
    }
});

// 4. Get current info (optional, for UI)
app.get('/api/info/:id', (req, res) => {
    const { id } = req.params;
    if (db[id]) {
        res.json({ id, targetUrl: db[id] });
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
