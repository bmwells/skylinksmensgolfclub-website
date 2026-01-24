// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const Stripe = require('stripe');
const cors = require('cors');
const fs = require('fs');

const { connectDB } = require('./db');

const app = express();

// --------------------
// ENVIRONMENT DETECTION
// --------------------
const isVercel = process.env.VERCEL === '1';
const isProduction = process.env.NODE_ENV === 'production';
const isLocal = !isVercel && !isProduction;

console.log('Environment:', {
    isVercel,
    isProduction,
    isLocal,
    NODE_ENV: process.env.NODE_ENV
});

// --------------------
// STRIPE INITIALIZATION
// --------------------
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const DOMAIN = process.env.FRONTEND_DOMAIN || (isLocal ? 'http://localhost:3000' : 'https://www.skylinksmensgolf.com');

// --------------------
// MIDDLEWARE
// --------------------
app.use(cors({
    origin: [
        'https://skylinksmensgolfclub-website.vercel.app',
        'http://localhost:3000',
        'https://www.skylinksmensgolf.com',
        'https://skylinksmensgolf.com'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public'), {
    index: false, // Don't automatically serve index.html
    redirect: false
}));

// For file uploads in import endpoint
app.use((req, res, next) => {
    if ((req.url.includes('/api/tournament-manager/import/') || 
         req.url.includes('/api/members/import')) && 
        req.method === 'POST') {
        const busboy = require('busboy');
        const bb = busboy({ headers: req.headers });
        const fileBuffer = [];
        let fileName = '';
        const fields = {};
        
        bb.on('file', (name, file, info) => {
            fileName = info.filename;
            file.on('data', (data) => {
                fileBuffer.push(data);
            }).on('close', () => {
                // File data collected
            });
        });
        
        bb.on('field', (name, val) => {
            fields[name] = val;
        });
        
        bb.on('close', () => {
            req.body = fields;
            req.files = req.files || {};
            req.files.file = {
                name: fileName,
                data: Buffer.concat(fileBuffer)
            };
            next();
        });
        
        req.pipe(bb);
    } else {
        next();
    }
});

// --------------------
// API ROUTES
// --------------------
const adminRoutes = require('./server/routes/admin');
const stripeRoutes = require('./server/routes/stripe');
const tournamentManagerRoutes = require('./server/routes/tournamentManager');
const tournamentRoutes = require('./server/routes/tournaments');
const genericRoutes = require('./server/routes/generic');
const contactRoutes = require('./server/routes/contact');
const { handleCompletedPayment } = require('./server/stripeWebhook');

// Admin routes
app.use('/api/admin', adminRoutes);

// Stripe routes
app.use('/api', stripeRoutes);

// Tournament manager routes
app.use('/api/tournament-manager', tournamentManagerRoutes);

// Tournament data routes
app.use('/api/tournaments', tournamentRoutes);

// Generic data routes
app.use('/api', genericRoutes);

// Contact routes
app.use('/api', contactRoutes);

// --------------------
// WEBHOOK HANDLER FOR STRIPE PAYMENTS
// --------------------
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        console.log('Webhook received:', event.type);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            console.log('Payment completed for session:', session.id);
            
            try {
                await handleCompletedPayment(session);
                console.log('Payment processed successfully');
            } catch (error) {
                console.error('Error handling completed payment:', error);
            }
            break;
        case 'checkout.session.async_payment_failed':
            console.log('Payment failed for session:', event.data.object.id);
            break;
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
});

// --------------------
// HEALTH CHECK ENDPOINT
// --------------------
app.get('/api/health', async (req, res) => {
    try {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            jwtEnabled: true,
            stripeEnabled: !!process.env.STRIPE_SECRET_KEY,
            webhookEnabled: !!process.env.STRIPE_WEBHOOK_SECRET
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
// PAGE ROUTES - FOR BOTH LOCAL AND VERCEL
// --------------------

// Helper function to serve HTML pages
function servePage(res, pagePath, fallbackPath = null) {
    const fullPath = path.join(__dirname, 'public', pagePath);
    
    if (fs.existsSync(fullPath)) {
        res.sendFile(fullPath);
    } else if (fallbackPath && fs.existsSync(path.join(__dirname, 'public', fallbackPath))) {
        res.sendFile(path.join(__dirname, 'public', fallbackPath));
    } else {
        res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
    }
}

// Home page
app.get('/', (req, res) => {
    servePage(res, 'index.html');
});

// Success page
app.get('/success', (req, res) => {
    servePage(res, 'success.html');
});

// Cart page
app.get('/cart', (req, res) => {
    servePage(res, 'cart/index.html', 'cart.html');
});

// Results page
app.get('/results', (req, res) => {
    servePage(res, 'results/index.html');
});

// Schedule page
app.get('/schedule', (req, res) => {
    servePage(res, 'schedule/index.html');
});

// Contact page
app.get('/contact', (req, res) => {
    servePage(res, 'contact/index.html');
});

// About page
app.get('/about', (req, res) => {
    servePage(res, 'about/index.html');
});

// About sub-pages
app.get('/about/:page', (req, res) => {
    const page = req.params.page;
    servePage(res, `about/${page}/index.html`, 'about/index.html');
});

// Admin page
app.get('/admin', (req, res) => {
    servePage(res, 'admin/index.html');
});

// Admin sub-pages
app.get('/admin/:page', (req, res) => {
    const page = req.params.page;
    servePage(res, `admin/${page}/index.html`, 'admin/index.html');
});

// Tournament entry
app.get('/tournament-entry', (req, res) => {
    servePage(res, 'tournament-entry/index.html');
});

// 1. Specific tournament ID route FIRST (more specific)
app.get('/tournament-entry/tournament/:tournamentId', (req, res) => {
    const tournamentId = req.params.tournamentId;
    // You might want to pass tournamentId to the page
    servePage(res, 'tournament-entry/tournament-page.html');
});

// 2. Generic page route SECOND (less specific)
app.get('/tournament-entry/:page', (req, res) => {
    const page = req.params.page;
    
    // Check for specific page names
    const validPages = ['membership-renewal', 'new-membership', 'checkout'];
    if (validPages.includes(page)) {
        servePage(res, `tournament-entry/${page}/index.html`, 'tournament-entry/index.html');
    } else {
        // Default to main tournament entry page
        servePage(res, 'tournament-entry/index.html');
    }
});

// --------------------
// FALLBACK FOR STATIC FILES
// --------------------
// This handles any static files that weren't caught by express.static
app.get('*', (req, res, next) => {
    // Check if the request is for a file with an extension
    if (req.path.match(/\.[a-zA-Z0-9]{2,4}$/)) {
        const filePath = path.join(__dirname, 'public', req.path);
        
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            next();
        }
    } else {
        next();
    }
});

// --------------------
// FINAL FALLBACK
// --------------------
app.use((req, res) => {
    servePage(res, 'index.html');
});

// --------------------
// START SERVER FOR LOCAL DEVELOPMENT
// --------------------
if (isLocal) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running locally on http://localhost:${PORT}`);
        console.log(`\nAvailable pages:`);
        console.log(`  Home: http://localhost:${PORT}/`);
        console.log(`  About: http://localhost:${PORT}/about`);
        console.log(`  Results: http://localhost:${PORT}/results`);
        console.log(`  Schedule: http://localhost:${PORT}/schedule`);
        console.log(`  Contact: http://localhost:${PORT}/contact`);
        console.log(`  Cart: http://localhost:${PORT}/cart`);
        console.log(`  Success: http://localhost:${PORT}/success`);
        console.log(`  Admin: http://localhost:${PORT}/admin`);
        console.log(`  Tournament Entry: http://localhost:${PORT}/tournament-entry`);
        console.log(`\nAPI: http://localhost:${PORT}/api/health`);
    });
}

// --------------------
// EXPORT FOR VERCEL SERVERLESS
// --------------------
module.exports = app;