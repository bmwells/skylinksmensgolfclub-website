// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const Stripe = require('stripe');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.DOMAIN || `http://localhost:${PORT}`;

const DATA_DIR = path.join(__dirname, 'data');

// Data file paths
const dataFiles = {
    results: path.join(DATA_DIR, 'results.json'),
    'meeting-minutes': path.join(DATA_DIR, 'meeting-minutes.json'),
    schedule: path.join(DATA_DIR, 'schedule.json'),
    'monthly-tournament': path.join(DATA_DIR, 'monthly-tournament.json'),
    'presidents-letter': path.join(DATA_DIR, 'presidents-letter.json'),
    'who-we-are': path.join(DATA_DIR, 'who-we-are.json')
};

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'skylinks';

let db;
let membersCollection;

// --------------------
// Simple in-memory token store (can move to sessions/JWT later)
// --------------------
const adminTokens = new Set();

// Stripe
const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripe = Stripe(stripeSecret);

// MongoDB
async function connectToMongoDB() {
    try {
        if (!MONGODB_URI) return;

        const client = await MongoClient.connect(MONGODB_URI);
        db = client.db(DB_NAME);
        membersCollection = db.collection('members');

        await membersCollection.createIndex(
            { firstName: 'text', lastName: 'text' },
            { name: 'member_name_text_index' }
        );

        console.log(`MongoDB connected → ${DB_NAME}`);
    } catch (err) {
        console.error(err.message);
    }
}
connectToMongoDB();

// Initialize data directory and files
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize data files with appropriate defaults
function initializeDataFiles() {
    // Results - array of tournament results
    if (!fs.existsSync(dataFiles.results)) {
        fs.writeFileSync(dataFiles.results, JSON.stringify([], null, 2));
    }
    
    // Meeting Minutes - array of meetings with entries
    if (!fs.existsSync(dataFiles['meeting-minutes'])) {
        const defaultMeetingMinutes = [
            {
                date: "11/13/25",
                title: "General Meeting",
                entries: [
                    {
                        type: "attendance",
                        attendees: [
                            "Ted Lewandowski - President",
                            "Tom Sochecki – Vice President",
                            "Troy Ward - Treasurer"
                        ]
                    },
                    {
                        type: "general",
                        title: "Overview",
                        content: "Meeting overview content here..."
                    }
                ],
                nextMeeting: {
                    date: "December 10th, 2025",
                    location: "Skylinks Cafe",
                    time: "18:00 (6:00 PM)"
                }
            }
        ];
        fs.writeFileSync(dataFiles['meeting-minutes'], JSON.stringify(defaultMeetingMinutes, null, 2));
    }
    
    // Schedule - array of scheduled events
    if (!fs.existsSync(dataFiles.schedule)) {
        fs.writeFileSync(dataFiles.schedule, JSON.stringify([], null, 2));
    }
    
    // Monthly Tournament - array of monthly tournaments
    if (!fs.existsSync(dataFiles['monthly-tournament'])) {
        fs.writeFileSync(dataFiles['monthly-tournament'], JSON.stringify([], null, 2));
    }
    
    // President's Letter - single document with title and content
    if (!fs.existsSync(dataFiles['presidents-letter'])) {
        const presidentsLetter = {
            title: "President's Letter",
            content: "Welcome to the Skylinks Men's Golf Club!",
            date: new Date().toISOString().split('T')[0]
        };
        fs.writeFileSync(dataFiles['presidents-letter'], JSON.stringify(presidentsLetter, null, 2));
    }
    
    // Who We Are - single document with sections
    if (!fs.existsSync(dataFiles['who-we-are'])) {
        const whoWeAre = {
            title: "Who We Are",
            content: "The Skylinks Men's Golf Club is a community of golf enthusiasts...",
            sections: []
        };
        fs.writeFileSync(dataFiles['who-we-are'], JSON.stringify(whoWeAre, null, 2));
    }
}

initializeDataFiles();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static
app.use(express.static(path.join(__dirname, 'public')));

// --------------------
// ADMIN AUTH
// --------------------
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;

    if (password === process.env.ADMIN_PW) {
        const token = crypto.randomBytes(24).toString('hex');
        adminTokens.add(token);
        return res.json({ success: true, token });
    }

    res.status(401).json({ error: 'Invalid password' });
});

function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    
    // Handle both "Bearer <token>" and plain token
    let token;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7); // Remove "Bearer " prefix
    } else {
        token = authHeader; // Plain token
    }
    
    if (token && adminTokens.has(token)) {
        return next();
    }
    res.status(403).json({ error: 'Unauthorized' });
}

// --------------------
// GENERIC DATA API HELPER FUNCTIONS
// --------------------
function readDataFile(fileKey) {
    try {
        const filePath = dataFiles[fileKey];
        if (!filePath || !fs.existsSync(filePath)) {
            throw new Error(`Data file for ${fileKey} not found`);
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        console.error(`Error reading ${fileKey} file:`, err);
        throw err;
    }
}

function writeDataFile(fileKey, data) {
    try {
        const filePath = dataFiles[fileKey];
        if (!filePath) {
            throw new Error(`Data file path for ${fileKey} not defined`);
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error(`Error writing ${fileKey} file:`, err);
        throw err;
    }
}

// --------------------
// RESULTS API
// --------------------
app.get('/api/results', (req, res) => {
    try {
        const data = readDataFile('results');
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read results data' });
    }
});

app.post('/api/results', requireAdmin, (req, res) => {
    try {
        writeDataFile('results', req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save results' });
    }
});

// --------------------
// MEETING MINUTES API
// --------------------
app.get('/api/meeting-minutes', (req, res) => {
    try {
        const data = readDataFile('meeting-minutes');
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read meeting minutes' });
    }
});

app.post('/api/meeting-minutes', requireAdmin, (req, res) => {
    try {
        writeDataFile('meeting-minutes', req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save meeting minutes' });
    }
});

// --------------------
// SCHEDULE API (placeholder)
// --------------------
app.get('/api/schedule', (req, res) => {
    try {
        const data = readDataFile('schedule');
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read schedule' });
    }
});

app.post('/api/schedule', requireAdmin, (req, res) => {
    try {
        writeDataFile('schedule', req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save schedule' });
    }
});

// --------------------
// MONTHLY TOURNAMENT API (placeholder)
// --------------------
app.get('/api/monthly-tournament', (req, res) => {
    try {
        const data = readDataFile('monthly-tournament');
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read monthly tournament data' });
    }
});

app.post('/api/monthly-tournament', requireAdmin, (req, res) => {
    try {
        writeDataFile('monthly-tournament', req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save monthly tournament data' });
    }
});

// --------------------
// PRESIDENT'S LETTER API (placeholder)
// --------------------
app.get('/api/presidents-letter', (req, res) => {
    try {
        const data = readDataFile('presidents-letter');
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read president\'s letter' });
    }
});

app.post('/api/presidents-letter', requireAdmin, (req, res) => {
    try {
        writeDataFile('presidents-letter', req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save president\'s letter' });
    }
});

// --------------------
// WHO WE ARE API (placeholder)
// --------------------
app.get('/api/who-we-are', (req, res) => {
    try {
        const data = readDataFile('who-we-are');
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read who we are data' });
    }
});

app.post('/api/who-we-are', requireAdmin, (req, res) => {
    try {
        writeDataFile('who-we-are', req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save who we are data' });
    }
});

// Health
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Admin routes
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Admin editor routes
app.get('/admin/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Catch-all
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running → ${DOMAIN}`);
});