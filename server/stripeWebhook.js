// server/stripeWebhook.js
const { ObjectId } = require('mongodb');
const { connectDB } = require('../db');

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

module.exports = {
    handleCompletedPayment
};