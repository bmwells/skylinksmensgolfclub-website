// server/stripeWebhook.js - UPDATED WITH EMAIL MATCHING
const { connectDB } = require('../db');
const { ObjectId } = require('mongodb');

async function handleCompletedPayment(session) {
    try {
        console.log('=== STARTING PAYMENT PROCESSING ===');
        console.log('Session ID:', session.id);
        console.log('Payment Status:', session.payment_status);
        console.log('Metadata keys:', Object.keys(session.metadata || {}));
        console.log('Full metadata:', JSON.stringify(session.metadata, null, 2));
        
        const db = await connectDB();
        const registrationsCollection = db.collection('tournament-registrations');
        
        // Parse metadata
        const metadata = session.metadata || {};
        const itemCount = parseInt(metadata.itemsCount || '0');
        console.log('Item count:', itemCount);
        
        for (let i = 0; i < itemCount; i++) {
            const itemType = metadata[`item_${i}_type`];
            console.log(`Processing item ${i} of type: ${itemType}`);
            
            if (itemType === 'tournament') {
                try {
                    // Get tournament data from metadata
                    const tournamentId = metadata[`item_${i}_tournamentId`];
                    console.log(`Tournament ID: ${tournamentId}`);
                    
                    if (!tournamentId) {
                        console.error('ERROR: Missing tournamentId in metadata for item', i);
                        console.log('Available metadata for this item:');
                        Object.keys(metadata).forEach(key => {
                            if (key.includes(`item_${i}_`)) {
                                console.log(`${key}: ${metadata[key]}`);
                            }
                        });
                        continue;
                    }
                    
                    // Parse player data
                    let mainPlayer = {};
                    let additionalPlayers = [];
                    
                    try {
                        if (metadata[`item_${i}_mainPlayer`]) {
                            const mainPlayerStr = metadata[`item_${i}_mainPlayer`];
                            console.log('Main player raw string:', mainPlayerStr);
                            
                            if (typeof mainPlayerStr === 'string') {
                                mainPlayer = JSON.parse(mainPlayerStr);
                            } else {
                                mainPlayer = mainPlayerStr;
                            }
                            console.log('Main player parsed:', mainPlayer);
                        }
                        if (metadata[`item_${i}_additionalPlayers`]) {
                            const additionalPlayersStr = metadata[`item_${i}_additionalPlayers`];
                            console.log('Additional players raw string:', additionalPlayersStr);
                            
                            if (typeof additionalPlayersStr === 'string') {
                                additionalPlayers = JSON.parse(additionalPlayersStr);
                            } else {
                                additionalPlayers = additionalPlayersStr;
                            }
                            console.log('Additional players count:', additionalPlayers.length);
                        }
                    } catch (parseError) {
                        console.error('Error parsing JSON data:', parseError);
                        console.error('Raw mainPlayer:', metadata[`item_${i}_mainPlayer`]);
                        console.error('Raw additionalPlayers:', metadata[`item_${i}_additionalPlayers`]);
                    }
                    
                    // Create registration object
                    const registration = {
                        tournamentId: tournamentId,
                        stripeSessionId: session.id,
                        paymentAmount: parseFloat(metadata[`item_${i}_price`] || '0'),
                        basePrice: parseFloat(metadata[`item_${i}_basePrice`] || '0'),
                        createdAt: new Date(session.created * 1000),
                        updatedAt: new Date(session.created * 1000),
                        cartOption: mainPlayer.cartOption || '',
                        startTime: mainPlayer.startingTime || 'Doesn\'t Matter',
                        sidePot: mainPlayer.sidePots === 'true' || mainPlayer.sidePot === true,
                        roulette: mainPlayer.roulette === 'true' || mainPlayer.roulette === true,
                        customerEmail: session.customer_email || metadata.customerEmail || '',
                        customerName: metadata.customerName || '',
                        player1: null,
                        player2: null,
                        player3: null,
                        player4: null
                    };
                    
                    // Add player1
                    if (mainPlayer.fullName || mainPlayer.name) {
                        registration.player1 = {
                            name: mainPlayer.fullName || mainPlayer.name || '',
                            email: mainPlayer.email || '',
                            phoneNum: mainPlayer.phone || mainPlayer.phoneNum || '',
                            ghin: mainPlayer.ghin ? parseInt(mainPlayer.ghin) : null,
                            entryNum: mainPlayer.entryNum ? parseInt(mainPlayer.entryNum) : null,
                            index: mainPlayer.index || '',
                            sidePot: mainPlayer.sidePots === 'true' || mainPlayer.sidePot === true,
                            roulette: mainPlayer.roulette === 'true' || mainPlayer.roulette === true,
                            memberId: null
                        };
                        console.log('Added player1:', registration.player1.name);
                    }
                    
                    // Add additional players (always ensure player2, player3, player4 exist)
                    if (additionalPlayers && additionalPlayers.length > 0) {
                        // Process up to 3 additional players
                        const maxAdditionalPlayers = Math.min(additionalPlayers.length, 3);
                        
                        for (let j = 0; j < maxAdditionalPlayers; j++) {
                            const playerKey = `player${j + 2}`;
                            const player = additionalPlayers[j];
                            
                            if (player && (player.fullName || player.name)) {
                                registration[playerKey] = {
                                    name: player.fullName || player.name || '',
                                    email: player.email || '',
                                    phoneNum: player.phone || player.phoneNum || '',
                                    ghin: player.ghin ? parseInt(player.ghin) : null,
                                    entryNum: player.entryNum ? parseInt(player.entryNum) : null,
                                    index: player.index || '',
                                    sidePot: player.sidePots === 'true' || player.sidePot === true,
                                    roulette: player.roulette === 'true' || player.roulette === true,
                                    memberId: null
                                };
                                console.log(`Added ${playerKey}:`, registration[playerKey].name);
                            } else if (player) {
                                // Player exists but has no name - create null entry
                                registration[playerKey] = null;
                                console.log(`Added ${playerKey}: null (no player data)`);
                            }
                        }
                        
                        // Set any remaining player slots to null
                        for (let j = maxAdditionalPlayers; j < 3; j++) {
                            const playerKey = `player${j + 2}`;
                            registration[playerKey] = null;
                        }
                    } else {
                        // No additional players - ensure all are null
                        registration.player2 = null;
                        registration.player3 = null;
                        registration.player4 = null;
                    }
                    
                    // Try to match players with members
                    const membersCollection = db.collection('members');
                    
                    // Match player1 if exists
                    if (registration.player1) {
                        const member = await findMember(membersCollection, registration.player1);
                        if (member) {
                            registration.player1.memberId = member._id;
                            console.log('Matched player1 with member:', member._id);
                        }
                    }
                    
                    // Match additional players if they exist
                    for (let j = 2; j <= 4; j++) {
                        const playerKey = `player${j}`;
                        if (registration[playerKey]) {
                            const member = await findMember(membersCollection, registration[playerKey]);
                            if (member) {
                                registration[playerKey].memberId = member._id;
                                console.log(`Matched ${playerKey} with member:`, member._id);
                            }
                        }
                    }
                    
                    // Save registration to database
                    const result = await registrationsCollection.insertOne(registration);
                    console.log(`Registration saved with ID: ${result.insertedId}`);
                    console.log('Final registration:', JSON.stringify(registration, null, 2));
                    console.log(`=== COMPLETED PROCESSING FOR TOURNAMENT ${tournamentId} ===\n`);
                    
                } catch (error) {
                    console.error('ERROR processing tournament registration:', error);
                    console.error(error.stack);
                }
            } else {
                console.log(`Skipping item type: ${itemType}`);
            }
        }
        
        console.log('=== PAYMENT PROCESSING COMPLETE ===');
        
    } catch (error) {
        console.error('CRITICAL ERROR handling completed payment:', error);
        console.error(error.stack);
    }
}

// UPDATED Helper function to find member with email matching
async function findMember(membersCollection, player) {
    try {
        let member = null;
        
        // 1. Try by email (NEW - most reliable if email is provided)
        if (player.email && player.email.trim() !== '') {
            member = await membersCollection.findOne({ 
                email: { $regex: new RegExp(`^${player.email.trim()}$`, 'i') }
            });
            if (member) {
                console.log(`Found member by email: ${player.email}`);
                return member;
            }
        }
        
        // 2. Try by GHIN
        if (player.ghin) {
            member = await membersCollection.findOne({ ghin: player.ghin });
            if (member) {
                console.log(`Found member by GHIN: ${player.ghin}`);
                return member;
            }
        }
        
        // 3. Try by name (handle different name formats)
        if (player.name && player.name.trim() !== '') {
            const fullName = player.name.trim();
            
            // Try exact full name match first (case insensitive)
            member = await membersCollection.findOne({
                $expr: {
                    $eq: [
                        { $toLower: { $concat: ["$firstName", " ", "$lastName"] } },
                        fullName.toLowerCase()
                    ]
                }
            });
            
            if (member) {
                console.log(`Found member by exact full name: ${fullName}`);
                return member;
            }
            
            // Try parsing the name into first/last
            const nameParts = fullName.split(' ');
            if (nameParts.length >= 2) {
                const firstName = nameParts[0];
                const lastName = nameParts.slice(1).join(' ');
                
                member = await membersCollection.findOne({
                    firstName: { $regex: new RegExp(`^${firstName}$`, 'i') },
                    lastName: { $regex: new RegExp(`^${lastName}$`, 'i') }
                });
                
                if (member) {
                    console.log(`Found member by parsed name: ${firstName} ${lastName}`);
                    return member;
                }
            }
            
            // Try just first name match (as fallback)
            if (nameParts.length >= 1) {
                const firstName = nameParts[0];
                member = await membersCollection.findOne({
                    firstName: { $regex: new RegExp(`^${firstName}$`, 'i') }
                });
                
                if (member) {
                    console.log(`Found member by first name only: ${firstName}`);
                    return member;
                }
            }
        }
        
        // 4. Try by entry number
        if (player.entryNum) {
            member = await membersCollection.findOne({ entryNum: player.entryNum });
            if (member) {
                console.log(`Found member by entry number: ${player.entryNum}`);
                return member;
            }
        }
        
        // 5. Try by phone number (remove formatting for comparison)
        if (player.phoneNum && player.phoneNum.trim() !== '') {
            const cleanPhone = player.phoneNum.replace(/\D/g, ''); // Remove non-digits
            if (cleanPhone.length >= 10) {
                // Try to match last 10 digits
                const lastTenDigits = cleanPhone.slice(-10);
                
                member = await membersCollection.findOne({
                    $expr: {
                        $regexMatch: {
                            input: { $replaceAll: { input: "$phoneNum", find: " ", replacement: "" } },
                            regex: lastTenDigits + "$"
                        }
                    }
                });
                
                if (member) {
                    console.log(`Found member by phone match: ${lastTenDigits}`);
                    return member;
                }
            }
        }
        
        console.log(`No member found for player: ${player.name || 'Unknown'}`);
        return null;
        
    } catch (error) {
        console.error('Error finding member:', error);
        return null;
    }
}

module.exports = {
    handleCompletedPayment
};