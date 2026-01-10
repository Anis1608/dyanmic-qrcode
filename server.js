const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// MongoDB Connection
// Note: In a real app, you should handle connection errors more robustly
console.log('Connecting to MongoDB...');
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/qr_app')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Define Schema
const LinkSchema = new mongoose.Schema({
    shortId: { type: String, required: true, unique: true },
    targetUrl: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    clicks: { type: Number, default: 0 }
});

const Link = mongoose.model('Link', LinkSchema);

// Generate a random ID
const generateId = () => {
    return Math.random().toString(36).substring(2, 8);
};

// 1. Create a new Dynamic QR Code Link
app.post('/api/generate', async (req, res) => {
    const { url, type, title } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    let id = generateId();
    // Ensure ID is unique (simple collision check)
    let existing = await Link.findOne({ shortId: id });
    while (existing) {
        id = generateId();
        existing = await Link.findOne({ shortId: id });
    }

    const newLink = new Link({
        shortId: id,
        targetUrl: url
    });

    try {
        await newLink.save();

        // The URL that will be encoded in the QR code
        // We use the 'user@domain' trick. 
        // Scanners often show the 'user' part or the whole string. 
        // Example: https://Menu@my-app.com/r/123
        const host = req.get('host');
        const protocol = req.protocol;
        
        let redirectUrl = `${protocol}://${host}/r/${id}`;
        
        if (title) {
            // Sanitize title: remove spaces and special chars to make it URL-safe
            const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, '');
            if (sanitizedTitle) {
                redirectUrl = `${protocol}://${sanitizedTitle}@${host}/r/${id}`;
            }
        } else {
             // Default override as requested by user
             redirectUrl = `${protocol}://Navonmesh2026@${host}/r/${id}`;
        }
        
        const qrCodeImage = await QRCode.toDataURL(redirectUrl);
        
        res.json({
            id,
            type: 'dynamic',
            redirectUrl,
            qrCodeImage,
            targetUrl: url
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error generating QR code' });
    }
});

// 2. Redirect Endpoint
app.get('/r/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const link = await Link.findOne({ shortId: id });

        if (link) {
            // Update click count (non-blocking)
            link.clicks++;
            link.save();
            
            res.redirect(link.targetUrl);
        } else {
            res.status(404).send('Link not found or expired.');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// 3. Update the Link (The "Dynamic" part)
app.post('/api/update', async (req, res) => {
    const { id, newUrl } = req.body;
    if (!id || !newUrl) {
        return res.status(400).json({ error: 'ID and New URL are required' });
    }

    try {
        const link = await Link.findOneAndUpdate(
            { shortId: id },
            { targetUrl: newUrl },
            { new: true }
        );

        if (link) {
            res.json({ success: true, id, newUrl: link.targetUrl });
        } else {
            res.status(404).json({ error: 'QR Code ID not found' });
        }
    } catch(err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// 4. Get current info (optional, for UI)
app.get('/api/info/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const link = await Link.findOne({ shortId: id });
        if (link) {
            res.json({ id, targetUrl: link.targetUrl, clicks: link.clicks });
        } else {
            res.status(404).json({ error: 'Not found' });
        }
    } catch(err) {
        res.status(500).json({ error: 'Server Error' });
    }
});

// 5. Health Check / Ping Endpoint
app.get('/ping', (req, res) => {
    res.status(200).send('Pong');
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);

    // Self-ping to keep the server awake
    const keepAlive = () => {
        const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
        const protocol = url.startsWith('https') ? require('https') : require('http');
        
        protocol.get(`${url}/ping`, (resp) => {
            console.log(`Keep-alive ping status: ${resp.statusCode}`);
        }).on('error', (err) => {
            console.error('Keep-alive ping failed:', err.message);
        });
    };

    // Ping every 5 minutes (300000 ms)
    setInterval(keepAlive, 300000); 
    // Initial ping
    setTimeout(keepAlive, 10000); 
});
