// server/stripeWebhook.js
const { connectDB } = require('../db');
const { ObjectId } = require('mongodb');
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

// Function to send admin notification email for new membership
async function sendAdminMembershipNotification(memberData, session) {
    try {
        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: process.env.GMAIL_USER, // Only sending to yourself (admin)
            subject: `NEW MEMBERSHIP PURCHASED - #${memberData.entryNum} - ${memberData.firstName} ${memberData.lastName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #2a5c3d 0%, #1e7b4b 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">New Membership Purchase</h1>
                        <p style="color: #e0e0e0; margin: 10px 0 0;">Skylinks Men's Golf Club</p>
                    </div>
                    
                    <div style="background: #f9f9f9; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                        <h2 style="color: #2a5c3d; margin-top: 0;">Member Details</h2>
                        
                        <div style="background: white; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #2a5c3d; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                            <h3 style="color: #2a5c3d; margin-top: 0; border-bottom: 2px solid #2a5c3d; padding-bottom: 10px;">Membership Information</h3>
                            
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 10px 0; width: 40%; color: #666;"><strong>Entry Number:</strong></td>
                                    <td style="padding: 10px 0;"><span style="background: #2a5c3d; color: white; padding: 5px 15px; border-radius: 20px; font-weight: bold;">#${memberData.entryNum}</span></td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 0; color: #666;"><strong>Full Name:</strong></td>
                                    <td style="padding: 10px 0;">${memberData.firstName} ${memberData.lastName}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 0; color: #666;"><strong>Email:</strong></td>
                                    <td style="padding: 10px 0;"><a href="mailto:${memberData.email}" style="color: #2a5c3d;">${memberData.email}</a></td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 0; color: #666;"><strong>Phone:</strong></td>
                                    <td style="padding: 10px 0;">${memberData.phoneNum || 'Not provided'}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 0; color: #666;"><strong>GHIN Number:</strong></td>
                                    <td style="padding: 10px 0;">${memberData.ghin || 'Not provided'}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 0; color: #666;"><strong>Membership Type:</strong></td>
                                    <td style="padding: 10px 0;">${memberData.membershipType}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 0; color: #666;"><strong>Payment Date:</strong></td>
                                    <td style="padding: 10px 0;">${new Date(memberData.membershipPaidDate).toLocaleDateString()} at ${new Date(memberData.membershipPaidDate).toLocaleTimeString()}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 0; color: #666;"><strong>Payment Status:</strong></td>
                                    <td style="padding: 10px 0;"><span style="background: #4CAF50; color: white; padding: 3px 10px; border-radius: 12px; font-size: 12px;">PAID</span></td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 0; color: #666;"><strong>Stripe Session ID:</strong></td>
                                    <td style="padding: 10px 0;"><code style="background: #f0f0f0; padding: 3px 6px; border-radius: 3px;">${memberData.stripeSessionId}</code></td>
                                </tr>
                            </table>
                        </div>
                        
                        <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <h4 style="color: #2a5c3d; margin: 0 0 10px;">📋 Summary</h4>
                            <p style="margin: 5px 0;"><strong>Action:</strong> ${memberData.membershipType.includes('Renewal') ? 'Membership Renewal' : 'New Member Registration'}</p>
                            <p style="margin: 5px 0;"><strong>Member since:</strong> ${new Date(memberData.createdAt).toLocaleDateString()}</p>
                        </div>
                        
                        <hr style="border: 1px solid #e0e0e0; margin: 30px 0;">
                        
                        <p style="font-size: 14px; color: #666; line-height: 1.5;">
                            This is an automated notification from the Skylinks Men's Golf Club website.<br>
                            <strong>No action required</strong> - this membership has been automatically processed and recorded.
                        </p>
                        
                        <p style="font-size: 12px; color: #999; margin-top: 30px; text-align: center;">
                            © ${new Date().getFullYear()} Skylinks Men's Golf Club<br>
                            ${new Date().toLocaleString()}
                        </p>
                    </div>
                </div>
            `
        };
        
        const transporter = createTransporter();
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Admin notification email sent for member #${memberData.entryNum}, Message ID: ${info.messageId}`);
        
    } catch (error) {
        console.error('❌ Error sending admin notification email:', error);
        // Don't throw - we don't want to fail the webhook if email fails
    }
}

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
                    
                    // Parse player data
                    let mainPlayer = {};
                    let additionalPlayers = [];
                    
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
                            additionalPlayers.forEach((player, idx) => {
                                console.log(`  Player ${idx + 2}:`, player);
                                console.log(`    sidePots: ${player.sidePots}, payForPlayer: ${player.payForPlayer}`);
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
                            entryNum: null,
                            index: '',
                            sidePot: mainPlayer.sidePots === 'true' || mainPlayer.sidePot === true,
                            roulette: mainPlayer.roulette === 'true' || mainPlayer.roulette === true,
                            memberId: null
                        };
                        console.log(`  Player1 sidePot: ${registration.player1.sidePot}, roulette: ${registration.player1.roulette}`);
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
                                // Only Player 2 (j === 0) can have sidePots
                                let playerSidePots = false;
                                if (j === 0) {
                                    // This is Player 2 - read sidePots from metadata
                                    playerSidePots = player.sidePots === true || player.sidePots === 'true';
                                    console.log(`  Player 2 sidePots from metadata: ${playerSidePots}`);
                                } else {
                                    // Player 3 and 4 never have sidePots
                                    console.log(`  Player ${j + 2} sidePots: false (only Player 2 can have sidePots)`);
                                }
                                
                                registration[playerKey] = {
                                    name: player.name || player.fullName || '',
                                    email: player.email || '',
                                    phoneNum: player.phone || player.phoneNum || '',
                                    ghin: player.ghin ? parseInt(player.ghin) : null,
                                    entryNum: null,
                                    index: '',
                                    sidePot: playerSidePots,
                                    roulette: false, // Roulette is only for player1
                                    memberId: null
                                };
                                console.log(`  ${playerKey} sidePot: ${playerSidePots}, roulette: false`);
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
                    if (registration.player1) {
                        const member = await findMember(membersCollection, registration.player1);
                        if (member) {
                            registration.player1.memberId = member._id;
                            registration.player1.entryNum = member.entryNum || null;
                            registration.player1.index = member.index || '';
                        } else {
                            console.log('❌ No member found for player1');
                        }
                    }
                    
                    for (let j = 2; j <= 4; j++) {
                        const playerKey = `player${j}`;
                        if (registration[playerKey]) {
                            const member = await findMember(membersCollection, registration[playerKey]);
                            if (member) {
                                registration[playerKey].memberId = member._id;
                                registration[playerKey].entryNum = member.entryNum || null;
                                registration[playerKey].index = member.index || '';
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
                            console.log(`✅ Updated existing member: ${fullName}`);
                            
                            // Send admin notification for membership renewal/update
                            await sendAdminMembershipNotification({
                                ...existingMember,
                                ...updates,
                                email: email,
                                membershipType: metadata[`item_${i}_name`] || 'Membership Renewal',
                                stripeSessionId: session.id,
                                membershipPaidDate: new Date(session.created * 1000),
                                createdAt: existingMember.createdAt
                            }, session);
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
                    
                    // Send admin notification for new member
                    await sendAdminMembershipNotification({
                        ...newMember,
                        _id: result.insertedId
                    }, session);
                    
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