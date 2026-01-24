// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const Stripe = require('stripe');
const cors = require('cors');

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
// LOCAL DEVELOPMENT ONLY
// --------------------
if (isLocal) {
    // Serve static files for local development
    app.use(express.static(path.join(__dirname, 'public'), {
        index: 'index.html',
        redirect: false
    }));
    
    // Handle routes that should serve index.html from subdirectories
    app.get('/about', (req, res) => {
        res.sendFile(path.join(__dirname, 'public/about/index.html'));
    });
    
    app.get('/results', (req, res) => {
        res.sendFile(path.join(__dirname, 'public/results/index.html'));
    });
    
    app.get('/schedule', (req, res) => {
        res.sendFile(path.join(__dirname, 'public/schedule/index.html'));
    });
    
    app.get('/contact', (req, res) => {
        res.sendFile(path.join(__dirname, 'public/contact/index.html'));
    });
    
    app.get('/cart', (req, res) => {
        res.sendFile(path.join(__dirname, 'public/cart/index.html'));
    });
    
    // Success page
    app.get('/success', (req, res) => {
        res.sendFile(path.join(__dirname, 'public/success.html'));
    });
    
    // Admin routes
    app.get('/admin', (req, res) => {
        res.sendFile(path.join(__dirname, 'public/admin/index.html'));
    });
    
    app.get('/admin/:page', (req, res) => {
        const page = req.params.page;
        const filePath = path.join(__dirname, 'public/admin', page, 'index.html');
        const fallbackPath = path.join(__dirname, 'public/admin/index.html');
        
        if (require('fs').existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.sendFile(fallbackPath);
        }
    });
    
    // About sub-routes
    app.get('/about/:page', (req, res) => {
        const page = req.params.page;
        const filePath = path.join(__dirname, 'public/about', page, 'index.html');
        const fallbackPath = path.join(__dirname, 'public/about/index.html');
        
        if (require('fs').existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.sendFile(fallbackPath);
        }
    });
    
    // Tournament entry routes
    app.get('/tournament-entry', (req, res) => {
        res.sendFile(path.join(__dirname, 'public/tournament-entry/index.html'));
    });
    
    app.get('/tournament-entry/membership-renewal', (req, res) => {
        res.sendFile(path.join(__dirname, 'public/tournament-entry/membership-renewal/index.html'));
    });
    
    app.get('/tournament-entry/new-membership', (req, res) => {
        res.sendFile(path.join(__dirname, 'public/tournament-entry/new-membership/index.html'));
    });
    
    app.get('/tournament-entry/:tournamentId', (req, res) => {
        res.sendFile(path.join(__dirname, 'public/tournament-entry/tournament-page.html'));
    });
    
    // Fallback for local development
    app.use((req, res) => {
        res.sendFile(path.join(__dirname, 'public/index.html'));
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running locally on http://localhost:${PORT}`);
        console.log(`Main pages:`);
        console.log(`  Home: http://localhost:${PORT}/`);
        console.log(`  About: http://localhost:${PORT}/about`);
        console.log(`  Results: http://localhost:${PORT}/results`);
        console.log(`  Schedule: http://localhost:${PORT}/schedule`);
        console.log(`  Contact: http://localhost:${PORT}/contact`);
        console.log(`  Cart: http://localhost:${PORT}/cart`);
        console.log(`  Admin: http://localhost:${PORT}/admin`);
        console.log(`  Tournament Entry: http://localhost:${PORT}/tournament-entry`);
        console.log(`API: http://localhost:${PORT}/api/health`);
    });
}

// --------------------
// EXPORT FOR VERCEL SERVERLESS
// --------------------
module.exports = app;