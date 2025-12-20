require('dotenv').config();
const express = require('express');
const path = require('path');
const Stripe = require('stripe');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const { connectDB, readData, writeData } = require('./db');

const app = express();

// --------------------
// JWT CONFIGURATION
// --------------------
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_EXPIRY = '24h'; // Tokens expire in 24 hours

// --------------------
// ADMIN AUTH
// --------------------
// No more adminTokens Set() - tokens are stateless with JWT

// Initialize Stripe only if key exists
let stripe;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = Stripe(process.env.STRIPE_SECRET_KEY);
}

// --------------------
// MIDDLEWARE
// --------------------
app.use(cors({
    origin: [
        'https://skylinksmensgolfclub-website.vercel.app',  // Vercel domain
        'http://localhost:3000',         // Local development
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight OPTIONS requests
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --------------------
// ADMIN LOGIN WITH JWT
// --------------------
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;

    if (password === process.env.ADMIN_PW) {
        // Create JWT token that expires in 24 hours
        const token = jwt.sign(
            { 
                admin: true, 
                timestamp: Date.now(),
                role: 'admin'
            },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRY }
        );
        
        return res.json({ 
            success: true, 
            token,
            expiresIn: TOKEN_EXPIRY
        });
    }

    res.status(401).json({ error: 'Invalid password' });
});

// JWT validation middleware
function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : authHeader;

    if (!token) {
        return res.status(403).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Check if token has admin privilege
        if (decoded.admin) {
            req.user = decoded; // Attach user info to request
            return next();
        }
        
        throw new Error('Not an admin token');
    } catch (error) {
        console.error('JWT verification failed:', error.message);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(403).json({ 
                error: 'Token expired',
                code: 'TOKEN_EXPIRED'
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(403).json({ 
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }
        
        return res.status(403).json({ 
            error: 'Unauthorized',
            code: 'UNAUTHORIZED'
        });
    }
}

// Token validation endpoint
app.get('/api/admin/validate', requireAdmin, (req, res) => {
    res.json({ 
        valid: true, 
        user: req.user,
        expiresIn: TOKEN_EXPIRY,
        timestamp: new Date().toISOString() 
    });
});

// --------------------
// MEMBER AUTOCOMPLETE API
// --------------------
app.get('/api/members/search', async (req, res) => {
    try {
        const q = (req.query.q || '').toLowerCase();
        if (q.length < 2) return res.json([]);

        const members = await readData('members');

        const results = members
            .filter(m =>
                `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)
            )
            .slice(0, 10);

        res.json(results);
    } catch (error) {
        console.error('Error searching members:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --------------------
// MONTHLY TOURNAMENT
// --------------------
app.get('/api/monthly-tournament', async (req, res) => {
    try {
        const data = await readData('monthly-tournament');
        res.json(data);
    } catch (error) {
        console.error('Error reading monthly tournament:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/monthly-tournament', requireAdmin, async (req, res) => {
    try {
        await writeData('monthly-tournament', req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Error writing monthly tournament:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
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
        try {
            const data = await readData(key);
            res.json(data);
        } catch (error) {
            console.error(`Error reading ${key}:`, error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    app.post(`/api/${key}`, requireAdmin, async (req, res) => {
        try {
            await writeData(key, req.body);
            res.json({ success: true });
        } catch (error) {
            console.error(`Error writing ${key}:`, error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

// --------------------
// HEALTH CHECK ENDPOINT
// --------------------
app.get('/api/health', async (req, res) => {
    try {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            jwtEnabled: true
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
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
// CONNECT TO DATABASE AND EXPORT APP
// --------------------
// Database connections will be established lazily when API endpoints are called
// This is the optimal pattern for serverless environments like Vercel

// --------------------
// EXPORT FOR VERCEL SERVERLESS
// --------------------
module.exports = app;