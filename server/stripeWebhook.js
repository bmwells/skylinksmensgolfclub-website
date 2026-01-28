// server/stripeWebhook.js
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
        const membersCollection = db.collection('members');
        
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
                    
                    // Create registration object WITHOUT top-level sidePot/roulette
                    const registration = {
                        tournamentId: tournamentId,
                        stripeSessionId: session.id,
                        paymentAmount: parseFloat(metadata[`item_${i}_price`] || '0'),
                        basePrice: parseFloat(metadata[`item_${i}_basePrice`] || '0'),
                        createdAt: new Date(session.created * 1000),
                        updatedAt: new Date(session.created * 1000),
                        cartOption: mainPlayer.cartOption || '',
                        startTime: mainPlayer.startingTime || 'Doesn\'t Matter',
                        // REMOVED: sidePot and roulette from top level
                        customerEmail: session.customer_email || metadata.customerEmail || '',
                        customerName: metadata.customerName || '',
                        player1: null,
                        player2: null,
                        player3: null,
                        player4: null
                    };
                    
                    console.log('\n=== Creating Player Objects ===');
                    
                    // Add player1 WITH sidePot/roulette from mainPlayer
                    if (mainPlayer && (mainPlayer.name || mainPlayer.fullName)) {
                        registration.player1 = {
                            name: mainPlayer.name || mainPlayer.fullName || '',
                            email: mainPlayer.email || '',
                            phoneNum: mainPlayer.phone || mainPlayer.phoneNum || '',
                            ghin: mainPlayer.ghin ? parseInt(mainPlayer.ghin) : null,
                            entryNum: null, // Not in metadata from stripe.js
                            index: '', // Not in metadata from stripe.js
                            // ONLY player1 gets sidePot/roulette from their data
                            sidePot: mainPlayer.sidePots === 'true' || mainPlayer.sidePot === true,
                            roulette: mainPlayer.roulette === 'true' || mainPlayer.roulette === true,
                            memberId: null
                        };
                        console.log('✅ Added player1:', registration.player1.name);
                        console.log(`  sidePot: ${registration.player1.sidePot}, roulette: ${registration.player1.roulette}`);
                    } else {
                        console.log('⚠️ Could not create player1 - missing data in mainPlayer object');
                        console.log('Main player object:', mainPlayer);
                    }
                    
                    // Add additional players with sidePot/roulette AUTOMATICALLY FALSE
                    if (additionalPlayers && additionalPlayers.length > 0) {
                        console.log(`Processing ${additionalPlayers.length} additional players (sidePot/roulette always false)`);
                        
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
                                    // Additional players ALWAYS have false for sidePot/roulette
                                    sidePot: false,
                                    roulette: false,
                                    memberId: null
                                };
                                console.log(`✅ Added ${playerKey}: ${registration[playerKey].name}`);
                                console.log(`  sidePot: false, roulette: false (auto-set for additional players)`);
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
            } else if (itemType === 'membership') {
                try {
                    console.log(`Processing new membership purchase`);
                    
                    // Get membership data from metadata
                    const memberDataStr = metadata[`item_${i}_m`];
                    if (!memberDataStr) {
                        console.error('ERROR: Missing member data in metadata for item', i);
                        continue;
                    }
                    
                    // Parse member data
                    let memberData;
                    try {
                        if (typeof memberDataStr === 'string') {
                            memberData = JSON.parse(memberDataStr);
                        } else if (typeof memberDataStr === 'object') {
                            memberData = memberDataStr;
                        }
                        console.log('✅ Member data parsed successfully:', memberData);
                    } catch (parseError) {
                        console.error('❌ Error parsing member data JSON:', parseError);
                        console.error('Raw member string:', memberDataStr);
                        continue;
                    }
                    
                    // Extract and validate member data
                    const fullName = memberData.name || '';
                    const email = memberData.email || '';
                    const phone = memberData.phone || '';
                    const ghin = memberData.ghin || '';
                    
                    if (!fullName || !email) {
                        console.error('ERROR: Missing required member data (name or email)');
                        continue;
                    }
                    
                    // Parse full name into firstName and lastName
                    const nameParts = fullName.trim().split(/\s+/);
                    let firstName = '';
                    let lastName = '';
                    
                    if (nameParts.length === 1) {
                        // Only one name provided
                        firstName = nameParts[0];
                        lastName = '';
                    } else if (nameParts.length === 2) {
                        // Standard first + last name
                        firstName = nameParts[0];
                        lastName = nameParts[1];
                    } else {
                        // Multiple parts - assume first word is first name, rest is last name
                        firstName = nameParts[0];
                        lastName = nameParts.slice(1).join(' ');
                    }
                    
                    // Format names properly
                    firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
                    lastName = lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();
                    
                    console.log(`Name parsed: First='${firstName}', Last='${lastName}'`);
                    
                    // Check if member already exists
                    const existingMember = await findExistingMember(membersCollection, email, ghin, fullName);
                    if (existingMember) {
                        console.log(`⚠️ Member already exists: ${fullName} (${email})`);
                        
                        // Update existing member with new info (if any changed)
                        const updates = {};
                        let needsUpdate = false;
                        
                        if (phone && phone !== existingMember.phoneNum) {
                            updates.phoneNum = phone;
                            needsUpdate = true;
                        }
                        if (ghin && ghin !== existingMember.ghin) {
                            updates.ghin = ghin;
                            needsUpdate = true;
                        }
                        if (firstName && firstName !== existingMember.firstName) {
                            updates.firstName = firstName;
                            needsUpdate = true;
                        }
                        if (lastName && lastName !== existingMember.lastName) {
                            updates.lastName = lastName;
                            needsUpdate = true;
                        }
                        
                        if (needsUpdate) {
                            updates.updatedAt = new Date();
                            await membersCollection.updateOne(
                                { _id: existingMember._id },
                                { $set: updates }
                            );
                            console.log(`✅ Updated existing member: ${existingMember._id}`);
                        }
                        
                        continue; // Skip creating new member
                    }
                    
                    // Get the next entryNum
                    const nextEntryNum = await getNextEntryNum(membersCollection);
                    console.log(`Next entry number: ${nextEntryNum}`);
                    
                    // Create new member object
                    const newMember = {
                        email: email.toLowerCase().trim(),
                        firstName: firstName,
                        lastName: lastName,
                        ghin: ghin || null,
                        entryNum: nextEntryNum,
                        phoneNum: phone || '',
                        index: '', // Empty index for new members
                        createdAt: new Date(session.created * 1000),
                        updatedAt: new Date(session.created * 1000),
                        membershipType: metadata[`item_${i}_name`] || 'New Membership',
                        stripeSessionId: session.id,
                        membershipPaid: true,
                        membershipPaidDate: new Date(session.created * 1000)
                    };
                    
                    console.log('Creating new member:', newMember);
                    
                    // Insert into members collection
                    const result = await membersCollection.insertOne(newMember);
                    
                    console.log(`✅ New member created with ID: ${result.insertedId}`);
                    console.log(`  Name: ${firstName} ${lastName}`);
                    console.log(`  Email: ${email}`);
                    console.log(`  Entry #: ${nextEntryNum}`);
                    console.log(`  GHIN: ${ghin || 'Not provided'}`);
                    
                } catch (error) {
                    console.error('❌ ERROR processing membership purchase:', error);
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

// Helper function to get the next entry number
async function getNextEntryNum(membersCollection) {
    try {
        // Find the member with the highest entryNum
        const result = await membersCollection
            .find({ entryNum: { $exists: true, $ne: null } })
            .sort({ entryNum: -1 })
            .limit(1)
            .toArray();
        
        if (result.length > 0 && result[0].entryNum) {
            return result[0].entryNum + 1;
        } else {
            // Start from 100 if no existing members
            return 100;
        }
    } catch (error) {
        console.error('Error getting next entry number:', error);
        return 100; // Default starting point
    }
}

// Helper function to find existing member
async function findExistingMember(membersCollection, email, ghin, fullName) {
    try {
        // Clean email for comparison
        const cleanEmail = email.toLowerCase().trim();
        
        // Try by email first (most reliable)
        if (cleanEmail) {
            const memberByEmail = await membersCollection.findOne({ 
                email: { $regex: new RegExp(`^${cleanEmail}$`, 'i') }
            });
            if (memberByEmail) return memberByEmail;
        }
        
        // Try by GHIN
        if (ghin) {
            const memberByGHIN = await membersCollection.findOne({ ghin: ghin });
            if (memberByGHIN) return memberByGHIN;
        }
        
        // Try by name as fallback
        if (fullName) {
            const nameParts = fullName.trim().split(/\s+/);
            if (nameParts.length >= 2) {
                const firstName = nameParts[0];
                const lastName = nameParts.slice(1).join(' ');
                
                const memberByName = await membersCollection.findOne({
                    firstName: { $regex: new RegExp(`^${firstName}$`, 'i') },
                    lastName: { $regex: new RegExp(`^${lastName}$`, 'i') }
                });
                if (memberByName) return memberByName;
            }
        }
        
        return null;
        
    } catch (error) {
        console.error('Error finding existing member:', error);
        return null;
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