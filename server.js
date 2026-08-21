// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const Stripe = require('stripe');
const cors = require('cors');
const fs = require('fs');
const xss = require('xss');

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
        'https://www.skylinksmensgolf.com',
        'https://skylinksmensgolf.com',
        'http://localhost:3000'
        
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

// HTML sanitization middleware for rich text content using xss
app.use((req, res, next) => {
    // Only process POST/PUT requests that might contain schedule data
    if ((req.method === 'POST' || req.method === 'PUT') && 
        (req.path.includes('/api/schedule') || req.path.includes('/api/tournaments'))) {
        
        // Configure xss options - allow all common formatting tags
        const xssOptions = {
            whiteList: {
                // Text formatting
                'p': ['style', 'align'],
                'br': [],
                'b': [],
                'i': [],
                'u': [],
                'strong': [],
                'em': [],
                's': [],
                'strike': [],
                'sub': [],
                'sup': [],
                'small': [],
                'big': [],
                'font': ['size', 'color', 'face', 'style'],
                'span': ['style', 'class'],
                'div': ['style', 'align', 'class'],
                'blockquote': ['style'],
                'pre': ['style'],
                'code': ['style'],
                // Headings
                'h1': ['style', 'align'],
                'h2': ['style', 'align'],
                'h3': ['style', 'align'],
                'h4': ['style', 'align'],
                'h5': ['style', 'align'],
                'h6': ['style', 'align'],
                // Lists
                'ul': ['style'],
                'ol': ['style'],
                'li': ['style'],
                // Links
                'a': ['href', 'target', 'style'],
                // Tables (optional)
                'table': ['style', 'border', 'cellpadding', 'cellspacing'],
                'tr': ['style'],
                'td': ['style', 'colspan', 'rowspan'],
                'th': ['style', 'colspan', 'rowspan'],
                // Media
                'img': ['src', 'alt', 'width', 'height', 'style'],
                // Other
                'hr': ['style'],
                'center': ['style']
            },
            css: {
                whiteList: {
                    'color': true,
                    'background-color': true,
                    'font-size': true,
                    'font-family': true,
                    'font-weight': true,
                    'font-style': true,
                    'text-decoration': true,
                    'text-align': true,
                    'margin': true,
                    'padding': true,
                    'border': true,
                    'width': true,
                    'height': true,
                    'display': true
                }
            },
            stripIgnoreTag: false,
            stripIgnoreTagBody: ['script', 'style']
        };
        
        if (req.body && Array.isArray(req.body)) {
            // If it's an array of events
            req.body = req.body.map(event => {
                if (event.detailsHtml) {
                    event.detailsHtml = xss(event.detailsHtml, xssOptions);
                }
                return event;
            });
        } else if (req.body && req.body.detailsHtml) {
            // If it's a single event object
            req.body.detailsHtml = xss(req.body.detailsHtml, xssOptions);
        }
    }
    next();
});

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

// Generic data routes - UPDATED to handle schedule with rich text
app.use('/api', (req, res, next) => {
    // Log when schedule data is being processed
    if (req.path === '/schedule' && req.method === 'POST') {
        console.log('📝 Saving schedule with rich text content');
    }
    next();
}, genericRoutes);

// Contact routes
app.use('/api', contactRoutes);

// --------------------
// FIX: Explicit route for join-the-club
// --------------------
app.get('/api/join-the-club', async (req, res) => {
    try {
        const { readData } = require('./db');
        const data = await readData('join-the-club');
        
        // Ensure the response has the expected structure
        if (!data || Object.keys(data).length === 0) {
            // Return default structure if no data exists
            return res.json({
                joinTheClub: {
                    hero: {
                        eyebrow: "Join Today",
                        title: "Become Part of *Skylinks*",
                        tagline: "Experience championship golf, build lasting friendships, and compete in exciting events throughout the season.",
                        ctaText: "Explore Membership",
                        ctaUrl: "/tournament-entry/new-membership"
                    },
                    about: {
                        label: "About Our Club",
                        title: "More Than Just Golf",
                        paragraphs: [
                            "Skylinks Men's Golf Club has been bringing together golf enthusiasts for over 30 years. Our members enjoy access to one of Southern California's premier municipal courses, along with a vibrant community of golfers who share a passion for the game.",
                            "Whether you're a scratch golfer or just starting out, you'll find a welcoming environment and opportunities to improve your game while creating lasting memories."
                        ],
                        stats: [
                            { number: "30+", label: "Years Established" },
                            { number: "200+", label: "Active Members" },
                            { number: "25+", label: "Annual Events" }
                        ]
                    },
                    benefits: {
                        label: "Member Benefits",
                        title: "Why Join Skylinks?",
                        intro: "Our members enjoy exclusive benefits and opportunities throughout the year.",
                        items: [
                            {
                                icon: "🏌️",
                                title: "Tournament Access",
                                description: "Participate in club championships, monthly events, and special tournaments.",
                                highlight: "25+ events yearly"
                            },
                            {
                                icon: "📊",
                                title: "GHIN Handicap",
                                description: "Official USGA handicap tracking included with membership.",
                                highlight: "Included"
                            },
                            {
                                icon: "🤝",
                                title: "Community",
                                description: "Connect with fellow golfers at social events and weekly games.",
                                highlight: "200+ members"
                            },
                            {
                                icon: "🏆",
                                title: "Awards & Recognition",
                                description: "Compete for club trophies and year-end honors.",
                                highlight: "Annual banquet"
                            }
                        ]
                    },
                    howToJoin: {
                        label: "Simple Process",
                        title: "How to Join",
                        intro: "Becoming a member is easy. Follow these simple steps to start your journey with Skylinks.",
                        steps: [
                            {
                                number: "01",
                                title: "Choose Your Membership",
                                description: "Select between New Membership or Membership Renewal options."
                            },
                            {
                                number: "02",
                                title: "Complete Registration",
                                description: "Fill out your personal information and golf preferences."
                            },
                            {
                                number: "03",
                                title: "Submit Payment",
                                description: "Pay securely online to activate your membership."
                            }
                        ]
                    },
                    cta: {
                        title: "Ready to Join?",
                        description: "Start your membership application today and become part of the Skylinks community.",
                        buttonText: "Join Now",
                        buttonUrl: "/tournament-entry/new-membership"
                    }
                }
            });
        }
        
        // If data exists but doesn't have joinTheClub wrapper, add it
        if (!data.joinTheClub && data.hero) {
            return res.json({ joinTheClub: data });
        }
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching join-the-club data:', error);
        res.status(500).json({ error: 'Failed to load join the club content' });
    }
});

// --------------------
// HEALTH CHECK ENDPOINT - UPDATED
// --------------------
app.get('/api/health', async (req, res) => {
    try {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            jwtEnabled: true,
            stripeEnabled: !!process.env.STRIPE_SECRET_KEY,
            webhookEnabled: !!process.env.STRIPE_WEBHOOK_SECRET,
            richTextSupport: {
                enabled: true,
                sanitization: true,
                library: 'xss',
                allowedTags: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'font', 'span', 'div', 'blockquote', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'img']
            }
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
// PAGE ROUTES
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
// START SERVER FOR LOCAL DEVELOPMENT - UPDATED
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
        console.log(`  Join Club API: http://localhost:${PORT}/api/join-the-club`);
        console.log(`Debug: http://localhost:${PORT}/api/debug/files`);
        console.log(`Env Check: http://localhost:${PORT}/api/check-env`);
        console.log(`\n📝 Rich Text Support: Enabled`);
        console.log(`  HTML Sanitization: Active (using xss library)`);
        console.log(`  Allowed HTML Tags: p, br, b, i, u, strong, em, font, span, div, blockquote, h1-h6, ul, ol, li, a, img, table, tr, td, th`);
    });
}

// --------------------
// EXPORT FOR VERCEL SERVERLESS
// --------------------
module.exports = app;