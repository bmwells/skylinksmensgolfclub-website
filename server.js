// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const Stripe = require('stripe');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.DOMAIN || `http://localhost:${PORT}`;

const DATA_DIR = path.join(__dirname, 'data');

// --------------------
// DATA FILE PATHS
// --------------------
const dataFiles = {
    results: path.join(DATA_DIR, 'results.json'),
    'meeting-minutes': path.join(DATA_DIR, 'meeting-minutes.json'),
    schedule: path.join(DATA_DIR, 'schedule.json'),
    'monthly-tournament': path.join(DATA_DIR, 'monthly-tournament.json'),
    'presidents-letter': path.join(DATA_DIR, 'presidents-letter.json'),
    'who-we-are': path.join(DATA_DIR, 'who-we-are.json'),
    members: path.join(DATA_DIR, 'members.json')
};

// --------------------
// ADMIN AUTH
// --------------------
const adminTokens = new Set();

// Stripe
const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripe = Stripe(stripeSecret);

// --------------------
// INIT DATA DIRECTORY
// --------------------
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// --------------------
// INIT DATA FILES
// --------------------
function initializeDataFiles() {
    for (const key of Object.keys(dataFiles)) {
        if (!fs.existsSync(dataFiles[key])) {
            fs.writeFileSync(dataFiles[key], JSON.stringify([], null, 2));
        }
    }
}
initializeDataFiles();

// --------------------
// MIDDLEWARE
// --------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --------------------
// ADMIN LOGIN
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
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : authHeader;

    if (token && adminTokens.has(token)) return next();
    res.status(403).json({ error: 'Unauthorized' });
}

// --------------------
// DATA HELPERS
// --------------------
function readDataFile(key) {
    return JSON.parse(fs.readFileSync(dataFiles[key], 'utf8'));
}

function writeDataFile(key, data) {
    fs.writeFileSync(dataFiles[key], JSON.stringify(data, null, 2));
}

// --------------------
// MEMBER AUTOCOMPLETE API (JSON)
// --------------------
app.get('/api/members/search', (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    if (q.length < 2) return res.json([]);

    const members = readDataFile('members');

    const results = members
        .filter(m =>
            `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)
        )
        .slice(0, 10);

    res.json(results);
});

// --------------------
// MONTHLY TOURNAMENT
// --------------------
app.get('/api/monthly-tournament', (req, res) => {
    res.json(readDataFile('monthly-tournament'));
});

app.post('/api/monthly-tournament', requireAdmin, (req, res) => {
    writeDataFile('monthly-tournament', req.body);
    res.json({ success: true });
});

// --------------------
// GENERIC DATA ROUTES
// --------------------
['results', 'meeting-minutes', 'schedule', 'presidents-letter', 'who-we-are'].forEach(key => {
    app.get(`/api/${key}`, (req, res) => res.json(readDataFile(key)));
    app.post(`/api/${key}`, requireAdmin, (req, res) => {
        writeDataFile(key, req.body);
        res.json({ success: true });
    });
});

// --------------------
// ADMIN ROUTES
// --------------------
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/admin/:page', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'admin', `${req.params.page}.html`);
    res.sendFile(fs.existsSync(filePath)
        ? filePath
        : path.join(__dirname, 'public', 'admin', 'index.html'));
});

// --------------------
// FALLBACK
// --------------------
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running → ${DOMAIN}`);
});
