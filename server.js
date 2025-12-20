require('dotenv').config();
const express = require('express');
const path = require('path');
const Stripe = require('stripe');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');

const { connectDB, readData, writeData } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.DOMAIN || `http://localhost:${PORT}`;

// --------------------
// ADMIN AUTH
// --------------------
const adminTokens = new Set();

// Stripe
const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripe = Stripe(stripeSecret);

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
// MEMBER AUTOCOMPLETE API
// --------------------
app.get('/api/members/search', async (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    if (q.length < 2) return res.json([]);

    const members = await readData('members');

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
app.get('/api/monthly-tournament', async (req, res) => {
    res.json(await readData('monthly-tournament'));
});

app.post('/api/monthly-tournament', requireAdmin, async (req, res) => {
    await writeData('monthly-tournament', req.body);
    res.json({ success: true });
});

// --------------------
// GENERIC DATA ROUTES
// --------------------
[
    'results',
    'meeting-minutes',
    'schedule',
    'presidents-letter',
    'who-we-are',
    'members'
].forEach(key => {
    app.get(`/api/${key}`, async (req, res) => {
        res.json(await readData(key));
    });

    app.post(`/api/${key}`, requireAdmin, async (req, res) => {
        await writeData(key, req.body);
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
    res.sendFile(
        fs.existsSync(filePath)
            ? filePath
            : path.join(__dirname, 'public', 'admin', 'index.html')
    );
});

// --------------------
// FALLBACK
// --------------------
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --------------------
// START SERVER AFTER DB CONNECT
// --------------------
connectDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running → ${DOMAIN}`);
        });
    })
    .catch(err => {
        console.error('Failed to start server:', err);
        process.exit(1);
    });
