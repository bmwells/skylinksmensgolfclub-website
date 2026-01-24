// server/routes/tournamentManager.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { connectDB } = require('../../db');
const { requireAdmin } = require('../auth');
const { 
    parseExcelFile, 
    parseCsvTsvFile, 
    createExcelWorkbook, 
    createCsvTsvText 
} = require('../utils/tournamentImportExport');

// Get tournament registrations
router.get('/:tournamentId', requireAdmin, async (req, res) => {
    try {
        const tournamentId = req.params.tournamentId;
        const db = await connectDB();
        const collection = db.collection('tournament-registrations');
        
        // Get all entries for this tournament
        const entries = await collection.find({ tournamentId: tournamentId }).toArray();
        
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
router.put('/foursome/:tournamentId/:entryId', requireAdmin, async (req, res) => {
    try {
        const { tournamentId, entryId } = req.params;
        const { player1, startTime, cartOption, sidePot, roulette } = req.body;
        
        const db = await connectDB();
        const collection = db.collection('tournament-registrations');
        const membersCollection = db.collection('members');
        
        // Get the entry
        const entry = await collection.findOne({ 
            _id: new ObjectId(entryId),
            tournamentId: tournamentId 
        });
        
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
                    const member = await membersCollection.findOne({ 
                        _id: new ObjectId(player1.memberId) 
                    });
                    
                    if (member) {
                        playerObject = {
                            memberId: member._id,
                            name: `${member.firstName} ${member.lastName}`,
                            email: player1.email || member.email || '',
                            phoneNum: player1.phoneNum || player1.phone || member.phoneNum || '',
                            ghin: member.ghin,
                            entryNum: member.entryNum,
                            index: player1.index || member.index || '',
                            sidePot: player1.sidePot || false,
                            roulette: player1.roulette || false
                        };
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
                    phoneNum: player1.phoneNum || player1.phone || '',
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
            }
        }
        
        // Update other fields
        if (startTime !== undefined) updateData.startTime = startTime;
        if (cartOption !== undefined) updateData.cartOption = cartOption;
        if (sidePot !== undefined) updateData.sidePot = sidePot;
        if (roulette !== undefined) updateData.roulette = roulette;
        
        // Update the entry
        await collection.updateOne(
            { _id: new ObjectId(entryId), tournamentId: tournamentId },
            { $set: { ...updateData, updatedAt: new Date() } }
        );
        
        res.json({ 
            success: true,
            message: 'Foursome updated successfully'
        });
        
    } catch (error) {
        console.error('Error updating foursome details:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

// Update tournament registration (add/replace/remove player)
router.put('/:tournamentId/:entryId', requireAdmin, async (req, res) => {
    try {
        const { tournamentId, entryId } = req.params;
        const { playerNumber, action, memberId, memberData } = req.body;
        
        const db = await connectDB();
        const collection = db.collection('tournament-registrations');
        const membersCollection = db.collection('members');
        
        // Get the entry
        const entry = await collection.findOne({ 
            _id: new ObjectId(entryId),
            tournamentId: tournamentId 
        });
        
        if (!entry) {
            return res.status(404).json({ error: 'Entry not found' });
        }
        
        const playerKey = `player${playerNumber}`;
        let updateData = {};
        
        if (action === 'remove') {
            updateData[playerKey] = null;
        } else if (action === 'replace' || action === 'add') {
            let playerObject = {};
            
            // First, try to find member by memberId if provided
            if (memberId) {
                try {
                    const member = await membersCollection.findOne({ _id: new ObjectId(memberId) });
                    if (member) {
                        playerObject = {
                            memberId: member._id,
                            name: `${member.firstName} ${member.lastName}`,
                            email: member.email || '',
                            phoneNum: member.phoneNum || '',
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
                
                // Try to find by GHIN first
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
                    playerObject = {
                        memberId: foundMember._id,
                        name: `${foundMember.firstName} ${foundMember.lastName}`,
                        email: foundMember.email || '',
                        phoneNum: foundMember.phoneNum || '',
                        ghin: foundMember.ghin,
                        entryNum: foundMember.entryNum,
                        index: foundMember.index || ''
                    };
                } else {
                    // No member found, create player object from memberData
                    playerObject = {
                        memberId: null,
                        name: `${memberData.firstName || ''} ${memberData.lastName || ''}`.trim(),
                        email: memberData.email || '',
                        phoneNum: memberData.phoneNum || memberData.phone || '',
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
            { _id: new ObjectId(entryId), tournamentId: tournamentId },
            { $set: { ...updateData, updatedAt: new Date() } }
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating tournament entry:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create empty registration
router.post('/:tournamentId', requireAdmin, async (req, res) => {
    try {
        const tournamentId = req.params.tournamentId;
        const db = await connectDB();
        const collection = db.collection('tournament-registrations');
        
        // Create empty registration
        const emptyRegistration = {
            tournamentId: tournamentId,
            createdAt: new Date(),
            updatedAt: new Date(),
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
        
        const result = await collection.insertOne(emptyRegistration);
        
        // Get the created entry
        const createdEntry = await collection.findOne({ _id: result.insertedId });
        
        res.json({ 
            success: true, 
            entry: createdEntry 
        });
    } catch (error) {
        console.error('Error creating empty registration:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Remove entire registration
router.delete('/:tournamentId/:entryId', requireAdmin, async (req, res) => {
    try {
        const { tournamentId, entryId } = req.params;
        
        const db = await connectDB();
        const collection = db.collection('tournament-registrations');
        
        const result = await collection.deleteOne({ 
            _id: new ObjectId(entryId),
            tournamentId: tournamentId 
        });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Entry not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error removing tournament entry:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Import tournament data from file
router.post('/import/:tournamentId', requireAdmin, async (req, res) => {
    try {
        const tournamentId = req.params.tournamentId;
        
        if (!req.files || !req.files.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const file = req.files.file;
        const fileName = file.name.toLowerCase();
        
        if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.csv') && !fileName.endsWith('.tsv')) {
            return res.status(400).json({ error: 'Invalid file type. Only .xlsx, .csv, and .tsv files are allowed.' });
        }
        
        const db = await connectDB();
        const collection = db.collection('tournament-registrations');
        
        let registrations = [];
        
        if (fileName.endsWith('.xlsx')) {
            registrations = await parseExcelFile(file.data);
        } else if (fileName.endsWith('.csv') || fileName.endsWith('.tsv')) {
            const delimiter = fileName.endsWith('.tsv') ? '\t' : ',';
            registrations = parseCsvTsvFile(file.data, delimiter);
        }
        
        // Add tournamentId to each registration
        registrations = registrations.map(reg => ({
            ...reg,
            tournamentId: tournamentId,
            createdAt: new Date(),
            updatedAt: new Date()
        }));
        
        // Clear existing data for this tournament
        await collection.deleteMany({ tournamentId: tournamentId });
        
        // Insert new data
        if (registrations.length > 0) {
            await collection.insertMany(registrations);
        }
        
        res.json({ 
            success: true, 
            importedCount: registrations.length,
            message: `Successfully imported ${registrations.length} registrations`
        });
        
    } catch (error) {
        console.error('Error importing tournament data:', error);
        res.status(500).json({ error: 'Error importing file: ' + error.message });
    }
});

// Export tournament data to file
router.get('/export/:tournamentId', requireAdmin, async (req, res) => {
    try {
        const tournamentId = req.params.tournamentId;
        const format = req.query.format || 'xlsx';
        
        if (!['xlsx', 'csv', 'tsv'].includes(format)) {
            return res.status(400).json({ error: 'Invalid format. Must be xlsx, csv, or tsv.' });
        }
        
        const db = await connectDB();
        const collection = db.collection('tournament-registrations');
        
        // Get all entries for this tournament
        const entries = await collection.find({ tournamentId: tournamentId }).toArray();
        
        if (format === 'xlsx') {
            const buffer = await createExcelWorkbook(entries);
            
            res.setHeader('Content-Disposition', `attachment; filename="${tournamentId}-registrations.xlsx"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buffer);
            
        } else if (format === 'csv' || format === 'tsv') {
            const delimiter = format === 'tsv' ? '\t' : ',';
            
            const csvData = createCsvTsvText(entries, delimiter);
            
            res.setHeader('Content-Disposition', `attachment; filename="${tournamentId}-registrations.${format}"`);
            res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'text/tab-separated-values');
            res.send(csvData);
        }
        
    } catch (error) {
        console.error('Error exporting tournament data:', error);
        res.status(500).json({ error: 'Error exporting file: ' + error.message });
    }
});

module.exports = router;