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
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL
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
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight OPTIONS requests
app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public'), {
    // Don't redirect missing files to index.html
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
// ROUTES
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

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            console.log('Payment completed for session:', session.id);
            console.log('Session metadata:', session.metadata);
            
            try {
                await handleCompletedPayment(session);
                console.log('Payment processed successfully');
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
// SUCCESS PAGE ROUTE - UPDATED
// --------------------
app.get('/success', (req, res) => {
    const successPath = path.join(__dirname, 'public', 'success.html');
    
    // Check if success.html exists
    if (fs.existsSync(successPath)) {
        res.sendFile(successPath);
    } else {
        // Fallback if success.html doesn't exist
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Payment Successful</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .success { color: green; font-size: 24px; }
                </style>
            </head>
            <body>
                <div class="success">✓ Payment Successful!</div>
                <p>Thank you for your purchase. Session ID: ${req.query.session_id || 'N/A'}</p>
                <a href="/">Return to Home</a>
            </body>
            </html>
        `);
    }
});

// --------------------
// CART PAGE ROUTE
// --------------------
app.get('/cart', (req, res) => {
    const cartPath = path.join(__dirname, 'public', 'cart.html');
    if (fs.existsSync(cartPath)) {
        res.sendFile(cartPath);
    } else {
        // Serve the fallback if cart.html doesn't exist
        next();
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
// DYNAMIC TOURNAMENT PAGES
// --------------------
app.get('/tournament-entry/:tournamentId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tournament-entry', 'tournament-page.html'));
});

// --------------------
// FALLBACK - MUST BE LAST
// --------------------
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --------------------
// START SERVER FOR LOCAL DEVELOPMENT
// --------------------
if (isLocal) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running locally on http://localhost:${PORT}`);
        console.log(`API: http://localhost:${PORT}/api/health`);
        console.log(`Admin: http://localhost:${PORT}/admin`);
        console.log(`Success Page: http://localhost:${PORT}/success`);
        console.log(`Cart: http://localhost:${PORT}/cart`);
        console.log(`Tournament Entry: http://localhost:${PORT}/tournament-entry`);
        console.log(`Stripe Checkout enabled: ${!!process.env.STRIPE_SECRET_KEY}`);
        console.log(`Stripe Webhook enabled: ${!!process.env.STRIPE_WEBHOOK_SECRET}`);
    });
}

// --------------------
// EXPORT FOR VERCEL SERVERLESS
// --------------------
module.exports = app;