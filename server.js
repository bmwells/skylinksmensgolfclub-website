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
// JWT CONFIGURATION
// --------------------
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_EXPIRY = '24h'; // Tokens expire in 24 hours

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
// STRIPE CHECKOUT ENDPOINTS
// --------------------
app.post('/api/create-checkout-session', async (req, res) => {
    try {
        const { cartItems, customerEmail, customerName } = req.body;
        
        if (!cartItems || cartItems.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        // Prepare line items for Stripe with numbered player format
        const lineItems = cartItems.map(item => {
            // Product name (shown on first line in Stripe)
            const productName = item.name;
            
            // Description (shown on second line in Stripe) - player info only
            let description = '';
            
            if (item.type === 'tournament') {
                const form = item.form || {};
                
                // Start building player list
                let playerList = [];
                
                // Main player (Player 1)
                if (form.name) {
                    const firstName = form.name.split(' ')[0] || '';
                    const lastName = form.name.split(' ').slice(1).join(' ') || '';
                    let mainPlayerText = `1: ${firstName} ${lastName}`;
                    if (form.ghin) mainPlayerText += `, ${form.ghin}`;
                    
                    // Add entry number with # prefix if exists
                    if (form.entryNum && form.entryNum.trim() !== '') {
                        mainPlayerText += `, #${form.entryNum}`;
                    }
                    
                    // Add index if exists
                    if (form.index && form.index.trim() !== '') {
                        mainPlayerText += `, ${form.index}`;
                    }
                    
                    if (form.startingTime) mainPlayerText += `, ${form.startingTime}`;
                    if (form.cartOption) mainPlayerText += `, ${form.cartOption}`;
                    
                    // Add add-ons for main player
                    let addons = [];
                    if (form.sidePots) addons.push('+SP');
                    if (form.roulette) addons.push('+RL');
                    if (addons.length > 0) {
                        mainPlayerText += `, ${addons.join(', ')}`;
                    }
                    
                    playerList.push(mainPlayerText);
                }
                
                // Additional players (Players 2, 3, 4)
                if (form.additionalPlayers && form.additionalPlayers.length > 0) {
                    form.additionalPlayers.forEach((player, idx) => {
                        const playerName = player.name || '';
                        if (playerName) {
                            // Format: 2: Player Name, 3: Player Name, etc.
                            let formattedName = `${idx + 2}: ${playerName}`;
                            if (player.ghin) formattedName += `, ${player.ghin}`;
                            
                            // Add entry number with # prefix for additional players if exists
                            if (player.entryNum && player.entryNum.trim() !== '') {
                                formattedName += `, #${player.entryNum}`;
                            }
                            
                            // Add index for additional players if exists
                            if (player.index && player.index.trim() !== '') {
                                formattedName += `, ${player.index}`;
                            }
                            
                            playerList.push(formattedName);
                        }
                    });
                }
                
                // Join player list
                if (playerList.length > 0) {
                    description = playerList.join('. ') + '.';
                }
                
            } else if (item.type === 'membership') {
                const form = item.form || {};
                if (form.name) {
                    const firstName = form.name.split(' ')[0] || '';
                    const lastName = form.name.split(' ').slice(1).join(' ') || '';
                    
                    description = `${firstName} ${lastName}`;
                    
                    // Add email if available
                    if (form.email) description += `, ${form.email}`;
                    
                    // Add phone if available
                    if (form.phone) description += `, ${form.phone}`;
                    
                    // Add GHIN if available
                    if (form.ghin) description += `, GHIN: ${form.ghin}`;
                }
            }

        return {
            price_data: {
                currency: 'usd',
                product_data: {
                    name: productName, // This shows on first line
                    description: description || 'Player details', // This shows on second line
                },
                unit_amount: Math.round(item.price * 100),
            },
            quantity: 1,
        };
    });

        // Prepare optimized metadata for Stripe (under 50 keys limit)
        const metadata = {
            customerName: customerName || '',
            customerEmail: customerEmail || '',
            itemsCount: cartItems.length.toString(),
            timestamp: new Date().toISOString(),
        };

        // Store item data as JSON strings to reduce key count
        cartItems.forEach((item, index) => {
            if (item.type === 'tournament') {
                const form = item.form || {};
                
                // Parse name into firstName and lastName
                const nameParts = form.name ? form.name.split(' ') : [];
                const firstName = nameParts[0] || '';
                const lastName = nameParts.slice(1).join(' ') || '';
                
                // Create main player object
                const mainPlayer = {
                    firstName: firstName,
                    lastName: lastName,
                    fullName: form.name || '',
                    email: form.email || '',
                    phone: form.phone || '',
                    ghin: form.ghin || '',
                    index: (form.index || '').toString(),
                    entryNum: (form.entryNum || '').toString(),
                    startingTime: form.startingTime || '',
                    cartOption: form.cartOption || '',
                    sidePots: (form.sidePots || false).toString(),
                    roulette: (form.roulette || false).toString(),
                    sidePotsPrice: (item.sidePotPrice || 25).toString(),
                    roulettePrice: (item.roulettePrice || 30).toString(),
                    cartOptionPrice: (form.cartOptionAddedPrice || 0).toString()
                };
                
                // Create additional players array
                const additionalPlayers = [];
                if (form.additionalPlayers && form.additionalPlayers.length > 0) {
                    form.additionalPlayers.forEach((player, playerIndex) => {
                        const playerNameParts = player.name ? player.name.split(' ') : [];
                        const playerFirstName = playerNameParts[0] || '';
                        const playerLastName = playerNameParts.slice(1).join(' ') || '';
                        
                        additionalPlayers.push({
                            firstName: playerFirstName,
                            lastName: playerLastName,
                            fullName: player.name || '',
                            email: player.email || '',
                            phone: player.phone || '',
                            ghin: player.ghin || '',
                            index: (player.index || '').toString(),
                            entryNum: (player.entryNum || '').toString()
                        });
                    });
                }
                
                // Store as JSON strings to save metadata keys
                metadata[`item_${index}_type`] = 'tournament';
                metadata[`item_${index}_name`] = item.name;
                metadata[`item_${index}_price`] = item.price.toString();
                metadata[`item_${index}_basePrice`] = (item.basePrice || 0).toString();
                metadata[`item_${index}_mainPlayer`] = JSON.stringify(mainPlayer);
                metadata[`item_${index}_additionalPlayers`] = JSON.stringify(additionalPlayers);
                
            } else if (item.type === 'membership') {
                const form = item.form || {};
                // Parse name into firstName and lastName
                const nameParts = form.name ? form.name.split(' ') : [];
                const firstName = nameParts[0] || '';
                const lastName = nameParts.slice(1).join(' ') || '';
                
                // Create member object
                const member = {
                    firstName: firstName,
                    lastName: lastName,
                    fullName: form.name || '',
                    email: form.email || '',
                    phone: form.phone || '',
                    ghin: form.ghin || ''
                };
                
                metadata[`item_${index}_type`] = 'membership';
                metadata[`item_${index}_name`] = item.name;
                metadata[`item_${index}_price`] = item.price.toString();
                metadata[`item_${index}_member`] = JSON.stringify(member);
            }
        });

        // Count metadata keys to ensure we're under limit
        const keyCount = Object.keys(metadata).length;
        console.log(`Metadata keys count: ${keyCount}`);
        
        if (keyCount > 50) {
            console.warn('Warning: Metadata key count is high, consider reducing data');
            
            // Fallback: Store all data as a single JSON string if we exceed limits
            if (keyCount > 50) {
                const simplifiedMetadata = {
                    customerName: customerName || '',
                    customerEmail: customerEmail || '',
                    itemsCount: cartItems.length.toString(),
                    timestamp: new Date().toISOString(),
                    // Store all cart data as a single JSON string
                    cartData: JSON.stringify(cartItems.map(item => ({
                        type: item.type,
                        name: item.name,
                        price: item.price,
                        form: item.form || {},
                        sidePotPrice: item.sidePotPrice,
                        roulettePrice: item.roulettePrice,
                        basePrice: item.basePrice
                    })))
                };
                
                console.log('Using simplified metadata structure');
                
                const session = await stripe.checkout.sessions.create({
                    payment_method_types: ['card'],
                    line_items: lineItems,
                    mode: 'payment',
                    success_url: `${DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${DOMAIN}/cart`,
                    customer_email: customerEmail || undefined,
                    metadata: simplifiedMetadata,
                    billing_address_collection: 'required',
                    shipping_address_collection: {
                        allowed_countries: ['US'],
                    },
                });

                return res.json({ sessionId: session.id, url: session.url });
            }
        }

        // Create Stripe checkout session with optimized metadata
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${DOMAIN}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${DOMAIN}/cart`,
            customer_email: customerEmail || undefined,
            metadata: metadata,
            billing_address_collection: 'required',
            shipping_address_collection: {
                allowed_countries: ['US'],
            },
        });

        res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Webhook endpoint for Stripe (optional, for handling post-payment events)
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
            console.log('Payment was successful for session:', session.id);
            
            // Parse metadata
            try {
                if (session.metadata.cartData) {
                    // Parse the simplified cart data
                    const cartData = JSON.parse(session.metadata.cartData);
                    console.log('Cart data:', cartData);
                } else {
                    // Parse the structured metadata
                    console.log('Structured metadata:', session.metadata);
                }
            } catch (parseError) {
                console.error('Error parsing metadata:', parseError);
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

// Get session details for success page - UPDATED to parse JSON strings
app.get('/api/checkout-session/:sessionId', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.retrieve(req.params.sessionId, {
            expand: ['line_items']
        });
        
        // Parse and organize metadata
        const formattedMetadata = {
            customerName: session.metadata.customerName || '',
            customerEmail: session.metadata.customerEmail || '',
            itemsCount: session.metadata.itemsCount || '0',
            timestamp: session.metadata.timestamp || '',
            items: []
        };
        
        // Check if we have simplified cartData
        if (session.metadata.cartData) {
            try {
                const cartData = JSON.parse(session.metadata.cartData);
                formattedMetadata.items = cartData;
            } catch (e) {
                console.error('Error parsing cartData:', e);
            }
        } else {
            // Parse structured metadata
            const items = [];
            const itemCount = parseInt(session.metadata.itemsCount || '0');
            
            for (let i = 0; i < itemCount; i++) {
                const itemKey = `item_${i}`;
                
                if (session.metadata[`item_${i}_type`]) {
                    const item = {
                        type: session.metadata[`item_${i}_type`],
                        name: session.metadata[`item_${i}_name`] || '',
                        price: session.metadata[`item_${i}_price`] || '0',
                        basePrice: session.metadata[`item_${i}_basePrice`] || '0'
                    };
                    
                    // Parse JSON strings for player/member data
                    if (item.type === 'tournament') {
                        try {
                            if (session.metadata[`item_${i}_mainPlayer`]) {
                                item.mainPlayer = JSON.parse(session.metadata[`item_${i}_mainPlayer`]);
                            }
                            if (session.metadata[`item_${i}_additionalPlayers`]) {
                                item.additionalPlayers = JSON.parse(session.metadata[`item_${i}_additionalPlayers`]);
                            }
                        } catch (e) {
                            console.error('Error parsing player data:', e);
                        }
                    } else if (item.type === 'membership') {
                        try {
                            if (session.metadata[`item_${i}_member`]) {
                                item.member = JSON.parse(session.metadata[`item_${i}_member`]);
                            }
                        } catch (e) {
                            console.error('Error parsing member data:', e);
                        }
                    }
                    
                    items.push(item);
                }
            }
            
            formattedMetadata.items = items;
        }
        
        res.json({
            id: session.id,
            amount_total: session.amount_total,
            customer_email: session.customer_email,
            payment_status: session.payment_status,
            created: new Date(session.created * 1000).toISOString(),
            line_items: session.line_items?.data || [],
            metadata: formattedMetadata
        });
    } catch (error) {
        console.error('Error retrieving session:', error);
        res.status(500).json({ error: error.message });
    }
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

app.get('/api/monthly-tournament2', async (req, res) => {
    try {
        const data = await readData('monthly-tournament2');
        res.json(data);
    } catch (error) {
        console.error('Error reading monthly tournament 2:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/monthly-tournament2', requireAdmin, async (req, res) => {
    try {
        await writeData('monthly-tournament2', req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Error writing monthly tournament 2:', error);
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
    'members',
    'images'
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
// IMAGES API ROUTES
// --------------------
app.get('/api/images', async (req, res) => {
    try {
        const data = await readData('images');
        res.json(data);
    } catch (error) {
        console.error('Error reading images:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/images', requireAdmin, async (req, res) => {
    try {
        await writeData('images', req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Error writing images:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
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
            stripeEnabled: !!process.env.STRIPE_SECRET_KEY
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
    });
}

// --------------------
// EXPORT FOR VERCEL SERVERLESS
// --------------------
module.exports = app;