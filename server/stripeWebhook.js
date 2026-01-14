// server/stripeWebhook.js - UPDATED FOR DYNAMIC TOURNAMENTS
const { connectDB } = require('../db');
const { ObjectId } = require('mongodb');

async function handleCompletedPayment(session) {
    try {
        console.log('Processing completed payment for session:', session.id);
        
        const db = await connectDB();
        const registrationsCollection = db.collection('tournament-registrations');
        
        // Parse metadata
        const metadata = session.metadata || {};
        const itemCount = parseInt(metadata.itemsCount || '0');
        
        for (let i = 0; i < itemCount; i++) {
            const itemType = metadata[`item_${i}_type`];
            
            if (itemType === 'tournament') {
                try {
                    // Get tournament data from metadata
                    const tournamentId = metadata[`item_${i}_tournamentId`];
                    const mainPlayer = JSON.parse(metadata[`item_${i}_mainPlayer`] || '{}');
                    const additionalPlayers = JSON.parse(metadata[`item_${i}_additionalPlayers`] || '[]');
                    
                    if (!tournamentId) {
                        console.error('Missing tournamentId in metadata for item', i);
                        continue;
                    }
                    
                    // Create registration object
                    const registration = {
                        tournamentId: tournamentId,
                        stripeSessionId: session.id,
                        paymentAmount: parseFloat(metadata[`item_${i}_price`] || '0'),
                        createdAt: new Date(session.created * 1000),
                        updatedAt: new Date(session.created * 1000),
                        cartOption: mainPlayer.cartOption || '',
                        startTime: mainPlayer.startingTime || 'Doesn\'t Matter',
                        sidePot: mainPlayer.sidePots === 'true',
                        roulette: mainPlayer.roulette === 'true'
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
                            memberId: null // Will be populated later if member found
                        };
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
                        }
                    }
                    
                    // Match additional players
                    for (let j = 2; j <= 4; j++) {
                        const playerKey = `player${j}`;
                        if (registration[playerKey]) {
                            const member = await findMember(membersCollection, registration[playerKey]);
                            if (member) {
                                registration[playerKey].memberId = member._id;
                            }
                        }
                    }
                    
                    // Save registration to database
                    await registrationsCollection.insertOne(registration);
                    
                    console.log(`Registration saved for tournament ${tournamentId}, session ${session.id}`);
                    
                } catch (error) {
                    console.error('Error processing tournament registration:', error);
                }
            }
        }
        
    } catch (error) {
        console.error('Error handling completed payment:', error);
    }
}

// Helper function to find member
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