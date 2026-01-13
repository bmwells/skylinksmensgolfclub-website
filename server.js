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
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL
});

// --------------------
// STRIPE INITIALIZATION
// --------------------
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const DOMAIN = process.env.FRONTEND_DOMAIN || (isLocal ? 'http://localhost:3000' : 'https://www.skylinksmensgolf.com/');

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

// For file uploads in import endpoint
app.use((req, res, next) => {
    if (req.url.includes('/api/tournament-manager-import/') && req.method === 'POST') {
        // Parse multipart/form-data for file uploads
        const busboy = require('busboy');
        const bb = busboy({ headers: req.headers });
        const fileBuffer = [];
        let fileName = '';
        
        bb.on('file', (name, file, info) => {
            fileName = info.filename;
            file.on('data', (data) => {
                fileBuffer.push(data);
            }).on('close', () => {
                // File data collected
            });
        });
        
        bb.on('field', (name, val) => {
            req.body = req.body || {};
            req.body[name] = val;
        });
        
        bb.on('close', () => {
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
// ROUTES
// --------------------
const adminRoutes = require('./server/routes/admin');
const stripeRoutes = require('./server/routes/stripe');
const tournamentManagerRoutes = require('./server/routes/tournamentManager');
const genericRoutes = require('./server/routes/generic');
const contactRoutes = require('./server/routes/contact');
const { handleCompletedPayment } = require('./server/stripeWebhook');

// Admin routes
app.use('/api/admin', adminRoutes);

// Stripe routes
app.use('/api', stripeRoutes);

// Tournament manager routes
app.use('/api/tournament-manager', tournamentManagerRoutes);

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
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            console.log('Payment completed for session:', session.id);
            
            try {
                await handleCompletedPayment(session);
            } catch (error) {
                console.error('Error handling completed payment:', error);
            }
            
            break;
        case 'checkout.session.async_payment_failed':
            const failedSession = event.data.object;
            console.log('Payment failed for session:', failedSession.id);
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
// START SERVER FOR LOCAL DEVELOPMENT
// --------------------
// Only start listening if NOT on Vercel
if (isLocal) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running locally on http://localhost:${PORT}`);
        console.log(`API: http://localhost:${PORT}/api/health`);
        console.log(`Admin: http://localhost:${PORT}/admin`);
        console.log(`Stripe Checkout enabled: ${!!process.env.STRIPE_SECRET_KEY}`);
        console.log(`Stripe Webhook enabled: ${!!process.env.STRIPE_WEBHOOK_SECRET}`);
    });
}

// --------------------
// EXPORT FOR VERCEL SERVERLESS
// --------------------
module.exports = app;