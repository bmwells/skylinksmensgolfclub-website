require('dotenv').config();
const express = require('express');
const path = require('path');
const Stripe = require('stripe');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');

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

// Handle completed payment
async function handleCompletedPayment(session) {
    console.log('Processing completed payment for session:', session.id);
    
    try {
        // Parse metadata
        let items = [];
        
        if (session.metadata.cartData) {
            // Parse the simplified cart data
            items = JSON.parse(session.metadata.cartData);
        } else {
            // Parse structured metadata
            const itemCount = parseInt(session.metadata.itemsCount || '0');
            
            for (let i = 0; i < itemCount; i++) {
                if (session.metadata[`item_${i}_type`]) {
                    const item = {
                        type: session.metadata[`item_${i}_type`],
                        name: session.metadata[`item_${i}_name`] || '',
                        price: session.metadata[`item_${i}_price`] || '0'
                    };
                    
                    if (item.type === 'tournament') {
                        try {
                            if (session.metadata[`item_${i}_mainPlayer`]) {
                                item.mainPlayer = JSON.parse(session.metadata[`item_${i}_mainPlayer`]);
                            }
                            if (session.metadata[`item_${i}_additionalPlayers`]) {
                                item.additionalPlayers = JSON.parse(session.metadata[`item_${i}_additionalPlayers`]);
                            }
                        } catch (e) {
                            console.error('Error parsing tournament data:', e);
                        }
                    } else if (item.type === 'membership') {
                        try {
                            if (session.metadata[`item_${i}_member`]) {
                                item.member = JSON.parse(session.metadata[`item_${i}_member`]);
                            }
                        } catch (e) {
                            console.error('Error parsing membership data:', e);
                        }
                    }
                    
                    items.push(item);
                }
            }
        }
        
        // Process each item
        for (const item of items) {
            if (item.type === 'membership') {
                // Handle new membership purchase
                if (item.name === 'New Membership' && item.member) {
                    await addNewMember(item.member);
                }
                // Membership renewal doesn't need action
            } else if (item.type === 'tournament') {
                // Handle tournament entry purchase
                if (item.name.includes('Tournament') && item.mainPlayer) {
                    // Determine which tournament collection to use
                    const tournamentCollection = item.name.includes('Tournament 2') 
                        ? 'monthly-tournament2-foursomes' 
                        : 'monthly-tournament-foursomes';
                    
                    await addTournamentEntry(tournamentCollection, item);
                }
            }
        }
        
        console.log('Successfully processed payment for session:', session.id);
    } catch (error) {
        console.error('Error processing payment:', error);
        throw error;
    }
}

// Add new member to members collection
async function addNewMember(memberData) {
    try {
        const db = await connectDB();
        const membersCollection = db.collection('members');
        
        // Find the highest entry number
        const highestEntry = await membersCollection.find().sort({ entryNum: -1 }).limit(1).toArray();
        const nextEntryNum = highestEntry.length > 0 ? highestEntry[0].entryNum + 1 : 1;
        
        // Create new member document
        const newMember = {
            firstName: memberData.firstName || '',
            lastName: memberData.lastName || '',
            email: memberData.email || '',
            phoneNum: memberData.phone || '', // FIXED: Should be phoneNum
            ghin: memberData.ghin ? parseInt(memberData.ghin) : null,
            entryNum: nextEntryNum,
            index: '', // New members don't have an index yet
            createdAt: new Date()
        };
        
        // Insert into database
        await membersCollection.insertOne(newMember);
        console.log('Added new member:', newMember);
        
    } catch (error) {
        console.error('Error adding new member:', error);
        throw error;
    }
}

// Add tournament entry to tournament management collection
async function addTournamentEntry(collectionName, itemData) {
    try {
        const db = await connectDB();
        const tournamentCollection = db.collection(collectionName);
        const membersCollection = db.collection('members');
        
        // Create foursome object
        const foursome = {
            createdAt: new Date(),
            stripeSessionId: itemData.stripeSessionId || '',
            paymentAmount: parseFloat(itemData.price) || 0,
            player1: await getOrCreatePlayerData(itemData.mainPlayer),
            player2: null,
            player3: null,
            player4: null,
            cartOption: itemData.mainPlayer?.cartOption || '',
            startTime: itemData.mainPlayer?.startingTime || '',
            sidePot: itemData.mainPlayer?.sidePots === 'true',
            roulette: itemData.mainPlayer?.roulette === 'true'
        };
        
        // Process additional players
        if (itemData.additionalPlayers && itemData.additionalPlayers.length > 0) {
            const additionalPlayers = itemData.additionalPlayers;
            
            if (additionalPlayers.length > 0) {
                foursome.player2 = await getOrCreatePlayerData(additionalPlayers[0]);
            }
            if (additionalPlayers.length > 1) {
                foursome.player3 = await getOrCreatePlayerData(additionalPlayers[1]);
            }
            if (additionalPlayers.length > 2) {
                foursome.player4 = await getOrCreatePlayerData(additionalPlayers[2]);
            }
        }
        
        // Insert into database
        await tournamentCollection.insertOne(foursome);
        console.log('Added tournament entry to', collectionName, ':', foursome);
        
    } catch (error) {
        console.error('Error adding tournament entry:', error);
        throw error;
    }
}

// Helper function to get or create player data
async function getOrCreatePlayerData(playerData) {
    const db = await connectDB();
    const membersCollection = db.collection('members');
    
    if (!playerData || !playerData.ghin) {
        return null;
    }
    
    // Try to find existing member by GHIN
    const existingMember = await membersCollection.findOne({ 
        ghin: parseInt(playerData.ghin) 
    });
    
    if (existingMember) {
        // Return reference to existing member
        return {
            memberId: existingMember._id,
            name: `${playerData.firstName} ${playerData.lastName}`,
            email: playerData.email || existingMember.email,
            phoneNum: playerData.phone || playerData.phoneNum || existingMember.phoneNum || '', // STANDARDIZED
            ghin: parseInt(playerData.ghin),
            entryNum: existingMember.entryNum,
            index: playerData.index || existingMember.index || ''
        };
    }
    
    // If not found, just return the player data without creating a member
    // Non-members can play in tournaments
    return {
        memberId: null, // No member ID
        name: `${playerData.firstName} ${playerData.lastName}`,
        email: playerData.email || '',
        phoneNum: playerData.phone || playerData.phoneNum || '', // STANDARDIZED
        ghin: parseInt(playerData.ghin),
        entryNum: null, // No entry number for non-members
        index: playerData.index || ''
    };
}

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
// TOURNAMENT MANAGER API ENDPOINTS
// --------------------

// Get tournament entries
app.get('/api/tournament-manager/:tournamentId', requireAdmin, async (req, res) => {
    try {
        const tournamentId = req.params.tournamentId;
        const collectionName = tournamentId === 'tournament2' 
            ? 'monthly-tournament2-foursomes' 
            : 'monthly-tournament-foursomes';
        
        const db = await connectDB();
        const collection = db.collection(collectionName);
        
        // Get all entries
        const entries = await collection.find({}).toArray();
        
        // Sort entries by startTime with custom logic
        const sortedEntries = entries.sort((a, b) => {
            const timeA = (a.startTime || '').toString().toLowerCase();
            const timeB = (b.startTime || '').toString().toLowerCase();
            
            // Define patterns for "Doesn't Matter" or similar
            const doesntMatterPatterns = [
                "doesn't matter",
                "doesnt matter",
                "don't care",
                "dont care",
                "no preference",
                "any time",
                "whenever",
                "flexible",
                "no specific"
            ];
            
            // Check if time contains any "doesn't matter" pattern
            const isADoesntMatter = doesntMatterPatterns.some(pattern => timeA.includes(pattern));
            const isBDoesntMatter = doesntMatterPatterns.some(pattern => timeB.includes(pattern));
            
            // "Doesn't Matter" goes to the bottom
            if (isADoesntMatter && !isBDoesntMatter) return 1;
            if (!isADoesntMatter && isBDoesntMatter) return -1;
            if (isADoesntMatter && isBDoesntMatter) {
                // If both are "Doesn't Matter", sort by createdAt or keep original order
                return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
            }
            
            // Helper function to convert time to sortable value
            const getTimeValue = (timeStr) => {
                if (!timeStr || timeStr.trim() === '') return Infinity;
                
                const normalized = timeStr.trim().toUpperCase();
                
                // Try to parse time in various formats
                // Match patterns like: "8:00 AM", "8 AM", "8:00AM", "8:00 A.M.", "8 A.M."
                const timeMatch = normalized.match(/(\d+):?(\d+)?\s*([AP]\.?M\.?)?/);
                if (!timeMatch) return Infinity;
                
                let hours = parseInt(timeMatch[1]);
                const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
                const period = timeMatch[3] ? timeMatch[3].replace(/\./g, '') : '';
                
                // Convert to 24-hour format for comparison
                if (period === 'PM' && hours < 12) hours += 12;
                if (period === 'AM' && hours === 12) hours = 0;
                
                return hours * 60 + minutes;
            };
            
            const timeValueA = getTimeValue(timeA);
            const timeValueB = getTimeValue(timeB);
            
            // Sort by time value (ascending - earlier times first)
            return timeValueA - timeValueB;
        });
        
        // Enrich with full member data
        const enrichedEntries = await Promise.all(sortedEntries.map(async (entry) => {
            const enrichedEntry = { ...entry };
            
            // Enrich each player with full member data if they have a memberId
            for (let i = 1; i <= 4; i++) {
                const playerKey = `player${i}`;
                if (entry[playerKey] && entry[playerKey].memberId) {
                    try {
                        // FIX: Handle both string and object ID formats
                        let memberId = entry[playerKey].memberId;
                        
                        // If memberId is an object with $oid property, extract it
                        if (memberId && typeof memberId === 'object' && memberId.$oid) {
                            memberId = memberId.$oid;
                        }
                        
                        // If memberId is a string, convert to ObjectId
                        if (memberId && typeof memberId === 'string') {
                            const member = await db.collection('members').findOne({ 
                                _id: new ObjectId(memberId) 
                            });
                            
                            if (member) {
                                enrichedEntry[playerKey] = {
                                    ...entry[playerKey],
                                    fullMember: {
                                        firstName: member.firstName,
                                        lastName: member.lastName,
                                        name: `${member.firstName} ${member.lastName}`,
                                        email: member.email,
                                        phoneNum: member.phoneNum,
                                        ghin: member.ghin,
                                        entryNum: member.entryNum,
                                        index: member.index
                                    }
                                };
                            }
                        }
                    } catch (error) {
                        console.error(`Error enriching player ${i}:`, error);
                    }
                }
            }
            
            return enrichedEntry;
        }));
        
        res.json(enrichedEntries);
    } catch (error) {
        console.error('Error getting tournament entries:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update foursome details (Player 1, start time, cart option, etc.)
app.put('/api/tournament-manager-foursome/:tournamentId/:entryId', requireAdmin, async (req, res) => {
    try {
        const { tournamentId, entryId } = req.params;
        const { player1, startTime, cartOption, sidePot, roulette } = req.body;
        
        console.log('Received update request:', req.body);
        
        const collectionName = tournamentId === 'tournament2' 
            ? 'monthly-tournament2-foursomes' 
            : 'monthly-tournament-foursomes';
        
        const db = await connectDB();
        const collection = db.collection(collectionName);
        const membersCollection = db.collection('members');
        
        // Get the entry
        const entry = await collection.findOne({ _id: new ObjectId(entryId) });
        if (!entry) {
            return res.status(404).json({ error: 'Entry not found' });
        }
        
        let updateData = {};
        
        // Update player1 if provided
        if (player1) {
            let playerObject = {};
            
            // Check if we have memberId
            if (player1.memberId) {
                try {
                    // Try to find the member by ID
                    const member = await membersCollection.findOne({ 
                        _id: new ObjectId(player1.memberId) 
                    });
                    
                    if (member) {
                        // Found member, create player object from member
                        playerObject = {
                            memberId: member._id,
                            name: `${member.firstName} ${member.lastName}`,
                            email: player1.email || member.email || '',
                            phoneNum: player1.phoneNum || player1.phone || member.phoneNum || '', // STANDARDIZED
                            ghin: member.ghin,
                            entryNum: member.entryNum,
                            index: player1.index || member.index || '',
                            sidePot: player1.sidePot || false,
                            roulette: player1.roulette || false
                        };
                    } else {
                        console.log('Member not found by ID:', player1.memberId);
                    }
                } catch (error) {
                    console.error('Error finding member by ID:', error);
                }
            }
            
            // If no member found or no memberId, use the provided data
            if (!playerObject.memberId && (player1.firstName || player1.lastName)) {
                playerObject = {
                    memberId: null,
                    name: `${player1.firstName || ''} ${player1.lastName || ''}`.trim(),
                    email: player1.email || '',
                    phoneNum: player1.phoneNum || player1.phone || '', // STANDARDIZED
                    ghin: player1.ghin ? parseInt(player1.ghin) : null,
                    entryNum: player1.entryNum ? parseInt(player1.entryNum) : null,
                    index: player1.index || '',
                    sidePot: player1.sidePot || false,
                    roulette: player1.roulette || false
                };
            }
            
            // Only update if we have a valid player object
            if (playerObject.name && playerObject.name.trim() !== '') {
                updateData.player1 = playerObject;
                console.log('Setting player1:', playerObject);
            }
        }
        
        // Update other fields - always include them
        if (startTime !== undefined) updateData.startTime = startTime;
        if (cartOption !== undefined) updateData.cartOption = cartOption;
        if (sidePot !== undefined) updateData.sidePot = sidePot;
        if (roulette !== undefined) updateData.roulette = roulette;
        
        console.log('Final update data:', updateData);
        
        // Update the entry
        const result = await collection.updateOne(
            { _id: new ObjectId(entryId) },
            { $set: updateData }
        );
        
        console.log('Update result:', result);
        
        res.json({ 
            success: true,
            message: 'Foursome updated successfully',
            data: updateData
        });
        
    } catch (error) {
        console.error('Error updating foursome details:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

// Update tournament entry (add/replace/remove player)
app.put('/api/tournament-manager/:tournamentId/:entryId', requireAdmin, async (req, res) => {
    try {
        const { tournamentId, entryId } = req.params;
        const { playerNumber, action, memberId, memberData } = req.body;
        
        const collectionName = tournamentId === 'tournament2' 
            ? 'monthly-tournament2-foursomes' 
            : 'monthly-tournament-foursomes';
        
        const db = await connectDB();
        const collection = db.collection(collectionName);
        const membersCollection = db.collection('members');
        
        // Get the entry
        const entry = await collection.findOne({ _id: new ObjectId(entryId) });
        if (!entry) {
            return res.status(404).json({ error: 'Entry not found' });
        }
        
        const playerKey = `player${playerNumber}`;
        let updateData = {};
        
        if (action === 'remove') {
            // Remove player from slot
            updateData[playerKey] = null;
        } else if (action === 'replace' || action === 'add') {
            // Initialize player object
            let playerObject = {};
            
            // First, try to find member by memberId if provided
            if (memberId) {
                try {
                    const member = await membersCollection.findOne({ _id: new ObjectId(memberId) });
                    if (member) {
                        // Found member by ID, create player object from member
                        playerObject = {
                            memberId: member._id,
                            name: `${member.firstName} ${member.lastName}`,
                            email: member.email || '',
                            phoneNum: member.phoneNum || '', // STANDARDIZED
                            ghin: member.ghin,
                            entryNum: member.entryNum,
                            index: member.index || ''
                        };
                    }
                } catch (error) {
                    console.error('Error finding member by ID:', error);
                }
            }
            
            // If no player object created yet and we have memberData, try to find member
            if (!playerObject.memberId && memberData) {
                let foundMember = null;
                
                // Try to find by GHIN first (most unique)
                if (memberData.ghin && memberData.ghin.toString().trim() !== '') {
                    foundMember = await membersCollection.findOne({ 
                        ghin: parseInt(memberData.ghin) 
                    });
                }
                
                // If not found by GHIN, try by name
                if (!foundMember && memberData.firstName && memberData.lastName) {
                    foundMember = await membersCollection.findOne({
                        firstName: { $regex: new RegExp(`^${memberData.firstName}$`, 'i') },
                        lastName: { $regex: new RegExp(`^${memberData.lastName}$`, 'i') }
                    });
                }
                
                // If not found by name, try by entry number
                if (!foundMember && memberData.entryNum && memberData.entryNum.toString().trim() !== '') {
                    foundMember = await membersCollection.findOne({
                        entryNum: parseInt(memberData.entryNum)
                    });
                }
                
                if (foundMember) {
                    // Found member by search criteria
                    playerObject = {
                        memberId: foundMember._id,
                        name: `${foundMember.firstName} ${foundMember.lastName}`,
                        email: foundMember.email || '',
                        phoneNum: foundMember.phoneNum || '', // STANDARDIZED
                        ghin: foundMember.ghin,
                        entryNum: foundMember.entryNum,
                        index: foundMember.index || ''
                    };
                } else {
                    // No member found, create player object from memberData
                    // This is for non-members playing in tournaments
                    playerObject = {
                        memberId: null,
                        name: `${memberData.firstName || ''} ${memberData.lastName || ''}`.trim(),
                        email: memberData.email || '',
                        phoneNum: memberData.phoneNum || memberData.phone || '', // STANDARDIZED
                        ghin: memberData.ghin && memberData.ghin.toString().trim() !== '' 
                            ? parseInt(memberData.ghin) 
                            : null,
                        entryNum: memberData.entryNum && memberData.entryNum.toString().trim() !== ''
                            ? parseInt(memberData.entryNum)
                            : null,
                        index: memberData.index || ''
                    };
                }
            }
            
            // Validate we have at least a name
            if (!playerObject.name || playerObject.name.trim() === '') {
                return res.status(400).json({ error: 'Player name is required' });
            }
            
            updateData[playerKey] = playerObject;
        }
        
        // Update the entry
        await collection.updateOne(
            { _id: new ObjectId(entryId) },
            { $set: updateData }
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating tournament entry:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create empty foursome
app.post('/api/tournament-manager/:tournamentId', requireAdmin, async (req, res) => {
    try {
        const tournamentId = req.params.tournamentId;
        const collectionName = tournamentId === 'tournament2' 
            ? 'monthly-tournament2-foursomes' 
            : 'monthly-tournament-foursomes';
        
        const db = await connectDB();
        const collection = db.collection(collectionName);
        
        // Create empty foursome
        const emptyFoursome = {
            createdAt: new Date(),
            stripeSessionId: '',
            paymentAmount: 0,
            player1: null,
            player2: null,
            player3: null,
            player4: null,
            cartOption: '',
            startTime: 'Doesn\'t Matter',
            sidePot: false,
            roulette: false
        };
        
        const result = await collection.insertOne(emptyFoursome);
        
        // Get the created entry
        const createdEntry = await collection.findOne({ _id: result.insertedId });
        
        res.json({ 
            success: true, 
            entry: createdEntry 
        });
    } catch (error) {
        console.error('Error creating empty foursome:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Remove entire foursome
app.delete('/api/tournament-manager/:tournamentId/:entryId', requireAdmin, async (req, res) => {
    try {
        const { tournamentId, entryId } = req.params;
        
        const collectionName = tournamentId === 'tournament2' 
            ? 'monthly-tournament2-foursomes' 
            : 'monthly-tournament-foursomes';
        
        const db = await connectDB();
        const collection = db.collection(collectionName);
        
        const result = await collection.deleteOne({ _id: new ObjectId(entryId) });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Entry not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error removing tournament entry:', error);
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
// CONTACT FORM EMAIL API
// --------------------
const nodemailer = require('nodemailer');

// Create reusable transporter object using Gmail
const createTransporter = () => {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        }
    });
};

app.post('/api/contact', async (req, res) => {
    try {
        const { firstName, lastName, email, topic, message } = req.body;
        
        // Validate required fields
        if (!firstName || !lastName || !email || !message) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        
        // Create email content
        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: process.env.GMAIL_USER, // Sending to yourself
            replyTo: email, // So you can reply directly to the sender
            subject: `Contact Form: ${firstName} ${lastName}, ${email}, ${topic}`,
            text: `Message:\n${message}\n\n` +
                  `---\nSent from Skylinks Men's Golf Club website`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                    <h2 style="color: #2a5c3d;">Skylinks Website Contact from ${firstName} ${lastName}</h2>
                    <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
                    <p><strong>Topic:</strong> ${topic}</p>
                    <hr style="border: 1px solid #e0e0e0; margin: 20px 0;">
                    <h3 style="color: #2a5c3d;">Message:</h3>
                    <p style="white-space: pre-wrap; background: #f9f9f9; padding: 15px; border-radius: 5px;">${message}</p>
                    <hr style="border: 1px solid #e0e0e0; margin: 20px 0;">
                    <p style="color: #666; font-size: 12px;">
                        Sent from Skylinks Men's Golf Club website<br>
                        ${new Date().toLocaleString()}
                    </p>
                </div>
            `
        };
        
        // Send email
        const transporter = createTransporter();
        const info = await transporter.sendMail(mailOptions);
        
        console.log('Contact form email sent:', info.messageId);
        
        res.json({ 
            success: true, 
            message: 'Contact form submitted successfully',
            messageId: info.messageId
        });
        
    } catch (error) {
        console.error('Error sending contact form email:', error);
        res.status(500).json({ 
            error: 'Failed to send message. Please try again later.',
            details: error.message 
        });
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