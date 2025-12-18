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
const RESULTS_FILE = path.join(DATA_DIR, 'results.json');

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
// RESULTS DATA API
// --------------------
app.get('/api/results', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
        res.json(data);
    } catch (err) {
        console.error('Error reading results file:', err);
        res.status(500).json({ error: 'Failed to read results data' });
    }
});

app.post('/api/results', requireAdmin, (req, res) => {
    try {
        fs.writeFileSync(RESULTS_FILE, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error('Error writing results file:', err);
        res.status(500).json({ error: 'Failed to save results' });
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

// Catch-all
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running → ${DOMAIN}`);
});