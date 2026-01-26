// server/stripeWebhook.js - FIXED WITH CORRECT METADATA KEYS
const { connectDB } = require('../db');
const { ObjectId } = require('mongodb');

async function handleCompletedPayment(session) {
    try {
        console.log('=== STARTING PAYMENT PROCESSING ===');
        console.log('Session ID:', session.id);
        console.log('Payment Status:', session.payment_status);
        console.log('=== ALL METADATA ===');
        console.log(JSON.stringify(session.metadata, null, 2));
        
        const db = await connectDB();
        const registrationsCollection = db.collection('tournament-registrations');
        
        // Parse metadata
        const metadata = session.metadata || {};
        const itemCount = parseInt(metadata.itemsCount || '0');
        console.log('Item count:', itemCount);
        
        // Debug: List all metadata keys
        console.log('=== ALL METADATA KEYS ===');
        Object.keys(metadata).forEach(key => {
            console.log(`${key}: ${metadata[key]}`);
        });
        
        for (let i = 0; i < itemCount; i++) {
            const itemType = metadata[`item_${i}_type`];
            console.log(`\n=== Processing item ${i} of type: ${itemType} ===`);
            
            if (itemType === 'tournament') {
                try {
                    // Get tournament data from metadata
                    const tournamentId = metadata[`item_${i}_tournamentId`];
                    console.log(`Tournament ID: ${tournamentId}`);
                    
                    if (!tournamentId) {
                        console.error('ERROR: Missing tournamentId in metadata for item', i);
                        continue;
                    }
                    
                    // Debug: Show all item-specific metadata
                    console.log(`=== Item ${i} Metadata ===`);
                    Object.keys(metadata).forEach(key => {
                        if (key.startsWith(`item_${i}_`)) {
                            console.log(`${key}: ${metadata[key]}`);
                        }
                    });
                    
                    // Parse player data - USING CORRECT METADATA KEYS
                    let mainPlayer = {};
                    let additionalPlayers = [];
                    
                    // Get the data using the correct keys from stripe.js
                    // mp = main player, ap = additional players
                    const mainPlayerData = metadata[`item_${i}_mp`];
                    const additionalPlayersData = metadata[`item_${i}_ap`];
                    
                    console.log(`Main player data (item_${i}_mp) present: ${!!mainPlayerData}`);
                    console.log(`Additional players data (item_${i}_ap) present: ${!!additionalPlayersData}`);
                    
                    // Parse main player (mp)
                    if (mainPlayerData) {
                        try {
                            if (typeof mainPlayerData === 'string') {
                                mainPlayer = JSON.parse(mainPlayerData);
                            } else if (typeof mainPlayerData === 'object') {
                                mainPlayer = mainPlayerData;
                            }
                            console.log('✅ Main player parsed successfully:', mainPlayer);
                        } catch (parseError) {
                            console.error('❌ Error parsing mainPlayer JSON:', parseError);
                            console.error('Raw mainPlayer string:', mainPlayerData);
                        }
                    } else {
                        console.log('⚠️ No mainPlayer data found (item_${i}_mp missing)');
                    }
                    
                    // Parse additional players (ap)
                    if (additionalPlayersData) {
                        try {
                            if (typeof additionalPlayersData === 'string') {
                                additionalPlayers = JSON.parse(additionalPlayersData);
                            } else if (typeof additionalPlayersData === 'object') {
                                additionalPlayers = additionalPlayersData;
                            }
                            console.log(`✅ Additional players parsed successfully: ${additionalPlayers.length} players`);
                            additionalPlayers.forEach((player, idx) => {
                                console.log(`  Player ${idx + 2}:`, player);
                            });
                        } catch (parseError) {
                            console.error('❌ Error parsing additionalPlayers JSON:', parseError);
                            console.error('Raw additionalPlayers string:', additionalPlayersData);
                        }
                    } else {
                        console.log('⚠️ No additionalPlayers data found (item_${i}_ap missing)');
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
                    
                    console.log('\n=== Creating Player Objects ===');
                    
                    // Add player1
                    if (mainPlayer && (mainPlayer.name || mainPlayer.fullName)) {
                        registration.player1 = {
                            name: mainPlayer.name || mainPlayer.fullName || '',
                            email: mainPlayer.email || '',
                            phoneNum: mainPlayer.phone || mainPlayer.phoneNum || '',
                            ghin: mainPlayer.ghin ? parseInt(mainPlayer.ghin) : null,
                            entryNum: null, // Not in metadata from stripe.js
                            index: '', // Not in metadata from stripe.js
                            sidePot: mainPlayer.sidePots === 'true' || mainPlayer.sidePot === true,
                            roulette: mainPlayer.roulette === 'true' || mainPlayer.roulette === true,
                            memberId: null
                        };
                        console.log('✅ Added player1:', registration.player1.name);
                    } else {
                        console.log('⚠️ Could not create player1 - missing data in mainPlayer object');
                        console.log('Main player object:', mainPlayer);
                    }
                    
                    // Add additional players
                    if (additionalPlayers && additionalPlayers.length > 0) {
                        console.log(`Processing ${additionalPlayers.length} additional players`);
                        
                        for (let j = 0; j < Math.min(additionalPlayers.length, 3); j++) {
                            const playerKey = `player${j + 2}`;
                            const player = additionalPlayers[j];
                            
                            if (player && (player.name || player.fullName)) {
                                registration[playerKey] = {
                                    name: player.name || player.fullName || '',
                                    email: player.email || '',
                                    phoneNum: player.phone || player.phoneNum || '',
                                    ghin: player.ghin ? parseInt(player.ghin) : null,
                                    entryNum: null, // Not in metadata from stripe.js
                                    index: '', // Not in metadata from stripe.js
                                    sidePot: player.sidePots === 'true' || player.sidePot === true,
                                    roulette: player.roulette === 'true' || player.roulette === true,
                                    memberId: null
                                };
                                console.log(`✅ Added ${playerKey}:`, registration[playerKey].name);
                            } else if (player) {
                                console.log(`⚠️ Player ${j + 2} has no name data:`, player);
                                registration[playerKey] = null;
                            } else {
                                console.log(`⚠️ Player ${j + 2} is undefined or null`);
                                registration[playerKey] = null;
                            }
                        }
                        
                        // Ensure remaining slots are null
                        for (let j = additionalPlayers.length; j < 3; j++) {
                            const playerKey = `player${j + 2}`;
                            registration[playerKey] = null;
                            console.log(`➡️ Set ${playerKey} to null (no player data)`);
                        }
                    } else {
                        console.log('No additional players to process');
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
                            // Update entryNum and index from member data
                            registration.player1.entryNum = member.entryNum || null;
                            registration.player1.index = member.index || '';
                            console.log('✅ Matched player1 with member:', member._id);
                            console.log('  Updated entryNum:', member.entryNum);
                            console.log('  Updated index:', member.index);
                        } else {
                            console.log('❌ No member found for player1');
                        }
                    }
                    
                    // Match additional players if they exist
                    for (let j = 2; j <= 4; j++) {
                        const playerKey = `player${j}`;
                        if (registration[playerKey]) {
                            const member = await findMember(membersCollection, registration[playerKey]);
                            if (member) {
                                registration[playerKey].memberId = member._id;
                                // Update entryNum and index from member data
                                registration[playerKey].entryNum = member.entryNum || null;
                                registration[playerKey].index = member.index || '';
                                console.log(`✅ Matched ${playerKey} with member:`, member._id);
                                console.log(`  Updated ${playerKey} entryNum:`, member.entryNum);
                                console.log(`  Updated ${playerKey} index:`, member.index);
                            } else {
                                console.log(`❌ No member found for ${playerKey}`);
                            }
                        }
                    }
                    
                    // Save registration to database
                    console.log('\n=== Saving Registration ===');
                    console.log('Final registration object:', JSON.stringify(registration, null, 2));
                    
                    const result = await registrationsCollection.insertOne(registration);
                    console.log(`✅ Registration saved with ID: ${result.insertedId}`);
                    console.log(`=== COMPLETED PROCESSING FOR TOURNAMENT ${tournamentId} ===\n`);
                    
                } catch (error) {
                    console.error('❌ ERROR processing tournament registration:', error);
                    console.error(error.stack);
                }
            } else {
                console.log(`Skipping item type: ${itemType}`);
            }
        }
        
        console.log('=== PAYMENT PROCESSING COMPLETE ===');
        
    } catch (error) {
        console.error('❌ CRITICAL ERROR handling completed payment:', error);
        console.error(error.stack);
    }
}

// Helper function to find member with email matching
async function findMember(membersCollection, player) {
    try {
        let member = null;
        
        // 1. Try by email (most reliable if email is provided)
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
        }
        
        // 4. Try by phone number (remove formatting for comparison)
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