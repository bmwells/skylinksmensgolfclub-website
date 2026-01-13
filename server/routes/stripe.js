// server/routes/stripe.js
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const DOMAIN = process.env.FRONTEND_DOMAIN || 'https://www.skylinksmensgolf.com/';

// Create checkout session
router.post('/create-checkout-session', async (req, res) => {
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

// Get session details for success page
router.get('/checkout-session/:sessionId', async (req, res) => {
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

module.exports = router;