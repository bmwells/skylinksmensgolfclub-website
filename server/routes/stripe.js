// server/routes/stripe.js
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Helper function to format name as "N. Name"
function formatShortName(fullName) {
    if (!fullName) return '';
    
    const nameParts = fullName.trim().split(' ');
    if (nameParts.length === 0) return '';
    
    if (nameParts.length === 1) {
        // Single name, return as-is
        return nameParts[0];
    }
    
    // Get first initial and last name
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' '); // Handle multi-word last names
    
    return `${firstName.charAt(0)}. ${lastName}`;
}

// Create checkout session
router.post('/create-checkout-session', async (req, res) => {
    try {
        const { cartItems, customerEmail, customerName } = req.body;
        
        // Get DOMAIN from env and ensure it has a protocol
        let DOMAIN = process.env.FRONTEND_DOMAIN;
        
        console.log('Raw DOMAIN from env:', DOMAIN); // Debug logging
        
        if (!DOMAIN) {
            return res.status(500).json({ 
                error: 'Server configuration error: FRONTEND_DOMAIN is not set',
                message: 'Please set the FRONTEND_DOMAIN environment variable'
            });
        }
        
        // Clean and ensure proper protocol
        DOMAIN = DOMAIN.trim().replace(/\/$/, ''); // Remove trailing slash
        
        // Add protocol if missing
        if (!DOMAIN.startsWith('http://') && !DOMAIN.startsWith('https://')) {
            // For production, default to https
            const isProduction = process.env.NODE_ENV === 'production';
            const protocol = isProduction ? 'https://' : 'http://';
            DOMAIN = protocol + DOMAIN;
            console.log('Added protocol to DOMAIN:', DOMAIN);
        }
        
        console.log('Final DOMAIN for checkout:', DOMAIN);
        
        if (!cartItems || cartItems.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        // Prepare line items for Stripe
        const lineItems = cartItems.map(item => {
            // Product name (shown on first line in Stripe)
            const productName = item.name;
            
            // Description (shown on second line in Stripe)
            let description = '';
            
            if (item.type === 'tournament') {
                const form = item.form || {};
                
                // Start building player list
                let playerList = [];
                
                // Main player (Player 1)
                if (form.name) {
                    const shortName = formatShortName(form.name);
                    let mainPlayerText = `1: ${shortName}`;
                    
                    if (form.ghin) mainPlayerText += `, ${form.ghin}`;
                    
                    if (form.startingTime) mainPlayerText += `, ${form.startingTime}`;
                    if (form.cartOption) mainPlayerText += `, ${form.cartOption}`;
                    
                    let addons = [];
                    if (form.sidePots) addons.push('+SP');
                    if (form.roulette) addons.push('+RL');
                    if (addons.length > 0) {
                        mainPlayerText += `, ${addons.join(', ')}`;
                    }
                    
                    playerList.push(mainPlayerText);
                }
                
                // Additional players
                if (form.additionalPlayers && form.additionalPlayers.length > 0) {
                    form.additionalPlayers.forEach((player, idx) => {
                        const playerName = player.name || '';
                        if (playerName) {
                            const shortPlayerName = formatShortName(playerName);
                            let formattedName = `${idx + 2}: ${shortPlayerName}`;
                            
                            if (player.ghin) formattedName += `, ${player.ghin}`;
                            
                            // Add sidepot indicator for Player 2
                            if (idx === 0 && player.sidePots) {
                                formattedName += `, +SP`;
                            }
                            
                            playerList.push(formattedName);
                        }
                    });
                }
                
                if (playerList.length > 0) {
                    description = playerList.join('. ') + '.';
                }
                
            } else if (item.type === 'membership') {
                const form = item.form || {};
                if (form.name) {
                    const shortName = formatShortName(form.name);
                    description = shortName;
                    
                    if (form.email) description += `, ${form.email}`;
                    if (form.phone) description += `, ${form.phone}`;
                    if (form.ghin) description += `, GHIN: ${form.ghin}`;
                }
            }

            return {
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: productName,
                        description: description || 'Player details',
                    },
                    unit_amount: Math.round(item.price * 100),
                },
                quantity: 1,
            };
        });

        // Prepare metadata
        const metadata = {
            customerName: customerName || '',
            customerEmail: customerEmail || '',
            itemsCount: cartItems.length.toString(),
            timestamp: new Date().toISOString(),
        };

        // Store item data - MINIMAL VERSION to stay under 500 chars
        cartItems.forEach((item, index) => {
            if (item.type === 'tournament') {
                const form = item.form || {};
                
                // Create minimal main player object
                const mainPlayer = {
                    name: form.name || '',
                    email: form.email || '',
                    phone: form.phone || '',
                    ghin: form.ghin || '',
                    startingTime: form.startingTime || '',
                    cartOption: form.cartOption || '',
                    sidePots: (form.sidePots || false).toString(),
                    roulette: (form.roulette || false).toString()
                };
                
                // Create minimal additional players array - FIXED to include sidePots for Player 2
                const additionalPlayers = [];
                if (form.additionalPlayers && form.additionalPlayers.length > 0) {
                    form.additionalPlayers.forEach((player, playerIndex) => {
                        // Player data with sidePots included (only for Player 2)
                        const playerData = {
                            name: player.name || '',
                            email: player.email || '',
                            phone: player.phone || '',
                            ghin: player.ghin || ''
                        };
                        
                        // Only include sidePots for Player 2 (index 0)
                        if (playerIndex === 0) {
                            playerData.sidePots = (player.sidePots || false).toString();
                        }
                        
                        additionalPlayers.push(playerData);
                    });
                }
                
                // Store only essential data
                metadata[`item_${index}_type`] = 'tournament';
                metadata[`item_${index}_name`] = item.name;
                metadata[`item_${index}_price`] = item.price.toString();
                metadata[`item_${index}_basePrice`] = (item.basePrice || 0).toString();
                metadata[`item_${index}_tournamentId`] = item.tournamentId || '';
                
                // Store minimal main player as string
                metadata[`item_${index}_mp`] = JSON.stringify(mainPlayer);
                
                // Store additional players only if they exist
                if (additionalPlayers.length > 0) {
                    metadata[`item_${index}_ap`] = JSON.stringify(additionalPlayers);
                }
                
                // Store notes
                metadata[`item_${index}_notes`] = form.notes || '';
                
            } else if (item.type === 'membership') {
                const form = item.form || {};
                
                // Minimal member data
                const member = {
                    name: form.name || '',
                    email: form.email || '',
                    phone: form.phone || '',
                    ghin: form.ghin || ''
                };
                
                metadata[`item_${index}_type`] = 'membership';
                metadata[`item_${index}_name`] = item.name;
                metadata[`item_${index}_price`] = item.price.toString();
                metadata[`item_${index}_m`] = JSON.stringify(member);
            }
        });

        // Create Stripe checkout session
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
                    basePrice: session.metadata[`item_${i}_basePrice`] || '0',
                    tournamentId: session.metadata[`item_${i}_tournamentId`] || ''
                };
                
                // Parse JSON strings for player/member data
                if (item.type === 'tournament') {
                    try {
                        if (session.metadata[`item_${i}_mp`]) {
                            item.mainPlayer = JSON.parse(session.metadata[`item_${i}_mp`]);
                        }
                        if (session.metadata[`item_${i}_ap`]) {
                            item.additionalPlayers = JSON.parse(session.metadata[`item_${i}_ap`]);
                        }
                        item.notes = session.metadata[`item_${i}_notes`] || '';
                    } catch (e) {
                        console.error('Error parsing player data:', e);
                    }
                } else if (item.type === 'membership') {
                    try {
                        if (session.metadata[`item_${i}_m`]) {
                            item.member = JSON.parse(session.metadata[`item_${i}_m`]);
                        }
                    } catch (e) {
                        console.error('Error parsing member data:', e);
                    }
                }
                
                items.push(item);
            }
        }
        
        formattedMetadata.items = items;
        
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