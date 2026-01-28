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

// --------------------
// WEBHOOK HANDLER - MUST BE BEFORE ALL OTHER MIDDLEWARE!
// --------------------
app.post('/api/webhook', (req, res, next) => {
    
    // Manually handle raw body
    let data = '';
    req.on('data', chunk => {
        data += chunk;
    });
    
    req.on('end', async () => {
        try {
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            const sig = req.headers['stripe-signature'];
            
            let event;
            try {
                event = stripe.webhooks.constructEvent(data, sig, process.env.STRIPE_WEBHOOK_SECRET);
                console.log('✅ Webhook verified:', event.type);
            } catch (err) {
                console.error('❌ Webhook verification failed:', err.message);
                return res.status(400).send(`Webhook Error: ${err.message}`);
            }

            switch (event.type) {
                case 'checkout.session.completed':
                    const session = event.data.object;                    
                    try {
                        const { handleCompletedPayment } = require('./server/stripeWebhook');
                        await handleCompletedPayment(session);
                        console.log('✅ Payment processed successfully');
                    } catch (error) {
                        console.error('❌ Error handling payment:', error);
                    }
                    break;
                case 'checkout.session.async_payment_failed':
                    console.log('❌ Payment failed for session:', event.data.object.id);
                    break;
                default:
                    console.log(`ℹ️ Unhandled event type ${event.type}`);
            }

            res.json({ received: true, verified: true });
        } catch (error) {
            console.error('❌ Webhook processing error:', error);
            res.status(500).json({ error: error.message });
        }
    });
});

// GET handler for /api/webhook (should return 405)
app.get('/api/webhook', (req, res) => {
    console.log('❌ GET request to /api/webhook - returning 405');
    res.setHeader('Allow', 'POST');
    res.status(405).json({ 
        error: 'Method Not Allowed',
        allowed: ['POST'],
        message: 'This endpoint only accepts POST requests from Stripe'
    });
});


// Now add other middleware AFTER webhook
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public'), {
    index: false,
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
// DEBUG ENDPOINTS
// --------------------
app.get('/api/debug/files', (req, res) => {
    try {
        const publicDir = path.join(__dirname, 'public');
        
        // Check if membership directories exist
        const membershipRenewalPath = path.join(publicDir, 'tournament-entry', 'membership-renewal', 'index.html');
        const newMembershipPath = path.join(publicDir, 'tournament-entry', 'new-membership', 'index.html');
        const mainEntryPath = path.join(publicDir, 'tournament-entry', 'index.html');
        
        const files = {
            membershipRenewal: {
                path: 'tournament-entry/membership-renewal/index.html',
                exists: fs.existsSync(membershipRenewalPath),
                fullPath: membershipRenewalPath
            },
            newMembership: {
                path: 'tournament-entry/new-membership/index.html',
                exists: fs.existsSync(newMembershipPath),
                fullPath: newMembershipPath
            },
            mainEntry: {
                path: 'tournament-entry/index.html',
                exists: fs.existsSync(mainEntryPath),
                fullPath: mainEntryPath
            }
        };
        
        res.json({
            currentDir: __dirname,
            publicDir: publicDir,
            files: files,
            requestPath: req.path
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add debug endpoint for checking environment
app.get('/api/check-env', (req, res) => {
    res.json({
        hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
        hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
        webhookSecretLength: process.env.STRIPE_WEBHOOK_SECRET?.length,
        stripeKeyPrefix: process.env.STRIPE_SECRET_KEY?.substring(0, 8),
        environment: process.env.NODE_ENV,
        vercel: process.env.VERCEL,
        nodeVersion: process.version
    });
});

// --------------------
// HELPER FUNCTION TO SERVE HTML PAGES
// --------------------
function servePage(res, pagePath, fallbackPath = null) {
    const fullPath = path.join(__dirname, 'public', pagePath);
    const fullFallbackPath = fallbackPath ? path.join(__dirname, 'public', fallbackPath) : null;
    
    if (fs.existsSync(fullPath)) {
        res.sendFile(fullPath);
    } else if (fallbackPath && fs.existsSync(fullFallbackPath)) {
        console.log(`⚠️ Serving fallback: ${fallbackPath}`);
        res.sendFile(fullFallbackPath);
    } else {
        console.log(`❌ No file found, falling back to index.html`);
        res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
    }
}

// --------------------
// PAGE ROUTES - FIXED ORDER (MOST SPECIFIC FIRST)
// --------------------

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

// --------------------
// TOURNAMENT ENTRY ROUTES - FIXED ORDER (MOST SPECIFIC FIRST)
// --------------------

// Explicit routes for membership pages - FIRST (most specific)
app.get('/tournament-entry/membership-renewal', (req, res) => {
    servePage(res, 'tournament-entry/membership-renewal/index.html');
});

app.get('/tournament-entry/new-membership', (req, res) => {
    servePage(res, 'tournament-entry/new-membership/index.html');
});

app.get('/tournament-entry/checkout', (req, res) => {
    servePage(res, 'tournament-entry/checkout/index.html');
});

// Also handle with trailing slash
app.get('/tournament-entry/membership-renewal/', (req, res) => {
    servePage(res, 'tournament-entry/membership-renewal/index.html');
});

app.get('/tournament-entry/new-membership/', (req, res) => {
    servePage(res, 'tournament-entry/new-membership/index.html');
});

app.get('/tournament-entry/checkout/', (req, res) => {
    servePage(res, 'tournament-entry/checkout/index.html');
});

// Explicit routes for the HTML files themselves (in case browser requests them)
app.get('/tournament-entry/membership-renewal/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/tournament-entry/membership-renewal/index.html'));
});

app.get('/tournament-entry/new-membership/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/tournament-entry/new-membership/index.html'));
});

// Tournament entry main page
app.get('/tournament-entry', (req, res) => {
    servePage(res, 'tournament-entry/index.html');
});

// Also handle with trailing slash
app.get('/tournament-entry/', (req, res) => {
    servePage(res, 'tournament-entry/index.html');
});

// Dynamic tournament detail pages - AFTER specific routes
app.get('/tournament-entry/:tournamentId', (req, res) => {
    const tournamentId = req.params.tournamentId;    
    // These should never be hit if the specific routes above work
    const reservedPaths = ['membership-renewal', 'new-membership', 'checkout'];
    if (reservedPaths.includes(tournamentId)) {
        console.log(`⚠️ WARNING: Reserved path ${tournamentId} hit dynamic route - routing issue!`);
        // For safety, redirect to the correct specific route
        return res.redirect(`/tournament-entry/${tournamentId}/`);
    }
    
    servePage(res, 'tournament-entry/tournament-page.html');
});

// Also handle dynamic routes with trailing slash
app.get('/tournament-entry/:tournamentId/', (req, res) => {
    const tournamentId = req.params.tournamentId;
    const reservedPaths = ['membership-renewal', 'new-membership', 'checkout'];
    if (reservedPaths.includes(tournamentId)) {
        console.log(`⚠️ WARNING: Reserved path ${tournamentId} hit dynamic route - routing issue!`);
        return;
    }
    
    servePage(res, 'tournament-entry/tournament-page.html');
});

// Tournament entry catch-all route - LAST (least specific)
app.get('/tournament-entry/*', (req, res) => {
    console.log(`⚠️ HIT: /tournament-entry/* (catch-all) for ${req.path}`);
    // Serve the main tournament entry page for any other URLs
    servePage(res, 'tournament-entry/index.html');
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
    console.log(`❌ Final fallback for: ${req.path}`);
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
        console.log(`  Membership Renewal: http://localhost:${PORT}/tournament-entry/membership-renewal`);
        console.log(`  New Membership: http://localhost:${PORT}/tournament-entry/new-membership`);
        console.log(`  Tournament Details (example): http://localhost:${PORT}/tournament-entry/tournament123`);
        console.log(`\nAPI: http://localhost:${PORT}/api/health`);
        console.log(`Debug: http://localhost:${PORT}/api/debug/files`);
        console.log(`Env Check: http://localhost:${PORT}/api/check-env`);
        console.log(`Webhook Test: http://localhost:${PORT}/api/webhook-test`);
    });
}

// --------------------
// EXPORT FOR VERCEL SERVERLESS
// --------------------
module.exports = app;