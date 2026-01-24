// server/stripeWebhook.js
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
                            mainPlayer = JSON.parse(metadata[`item_${i}_mainPlayer`]);
                            console.log('Main player parsed:', mainPlayer.fullName);
                        }
                        if (metadata[`item_${i}_additionalPlayers`]) {
                            additionalPlayers = JSON.parse(metadata[`item_${i}_additionalPlayers`]);
                            console.log('Additional players:', additionalPlayers.length);
                        }
                    } catch (parseError) {
                        console.error('Error parsing JSON data:', parseError);
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
                        sidePot: mainPlayer.sidePots === 'true',
                        roulette: mainPlayer.roulette === 'true',
                        customerEmail: session.customer_email || metadata.customerEmail || '',
                        customerName: metadata.customerName || ''
                    };
                    
                    // Add player1
                    if (mainPlayer.fullName) {
                        registration.player1 = {
                            name: mainPlayer.fullName,
                            email: mainPlayer.email || '',
                            phoneNum: mainPlayer.phone || '',
                            ghin: mainPlayer.ghin ? parseInt(mainPlayer.ghin) : null,
                            entryNum: mainPlayer.entryNum ? parseInt(mainPlayer.entryNum) : null,
                            index: mainPlayer.index || '',
                            sidePot: mainPlayer.sidePots === 'true',
                            roulette: mainPlayer.roulette === 'true',
                            memberId: null
                        };
                        console.log('Added player1:', registration.player1.name);
                    }
                    
                    // Add additional players
                    if (additionalPlayers.length > 0) {
                        for (let j = 0; j < Math.min(additionalPlayers.length, 3); j++) {
                            const playerKey = `player${j + 2}`;
                            const player = additionalPlayers[j];
                            
                            if (player.fullName) {
                                registration[playerKey] = {
                                    name: player.fullName,
                                    email: player.email || '',
                                    phoneNum: player.phone || '',
                                    ghin: player.ghin ? parseInt(player.ghin) : null,
                                    entryNum: player.entryNum ? parseInt(player.entryNum) : null,
                                    index: player.index || '',
                                    memberId: null
                                };
                                console.log(`Added ${playerKey}:`, player.fullName);
                            }
                        }
                    }
                    
                    // Try to match players with members
                    const membersCollection = db.collection('members');
                    
                    // Match player1
                    if (registration.player1) {
                        const member = await findMember(membersCollection, registration.player1);
                        if (member) {
                            registration.player1.memberId = member._id;
                            console.log('Matched player1 with member:', member._id);
                        }
                    }
                    
                    // Match additional players
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

// Helper function to find member (unchanged)
async function findMember(membersCollection, player) {
    try {
        let member = null;
        
        // Try by GHIN first
        if (player.ghin) {
            member = await membersCollection.findOne({ ghin: player.ghin });
            if (member) return member;
        }
        
        // Try by name
        if (player.name) {
            const nameParts = player.name.split(' ');
            if (nameParts.length >= 2) {
                const firstName = nameParts[0];
                const lastName = nameParts.slice(1).join(' ');
                
                member = await membersCollection.findOne({
                    firstName: { $regex: new RegExp(`^${firstName}$`, 'i') },
                    lastName: { $regex: new RegExp(`^${lastName}$`, 'i') }
                });
                
                if (member) return member;
            }
        }
        
        // Try by entry number
        if (player.entryNum) {
            member = await membersCollection.findOne({ entryNum: player.entryNum });
            if (member) return member;
        }
        
    } catch (error) {
        console.error('Error finding member:', error);
    }
    
    return null;
}

module.exports = {
    handleCompletedPayment
};