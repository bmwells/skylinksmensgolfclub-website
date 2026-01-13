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

// Get tournament entries
router.get('/:tournamentId', requireAdmin, async (req, res) => {
    try {
        const tournamentId = req.params.tournamentId;
        const collectionName = tournamentId === 'tournament2' 
            ? 'monthly-tournament2-foursomes' 
            : 'monthly-tournament-foursomes';
        
        const db = await connectDB();
        const collection = db.collection(collectionName);
        
        // Get all entries
        const entries = await collection.find({}).toArray();
        
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
                // Match patterns like: "8:00 AM", "8 AM", "8:00AM", "8:00 A.M.", "8 A.M."
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
                        // FIX: Handle both string and object ID formats
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
        
        console.log('Received update request:', req.body);
        
        const collectionName = tournamentId === 'tournament2' 
            ? 'monthly-tournament2-foursomes' 
            : 'monthly-tournament-foursomes';
        
        const db = await connectDB();
        const collection = db.collection(collectionName);
        const membersCollection = db.collection('members');
        
        // Get the entry
        const entry = await collection.findOne({ _id: new ObjectId(entryId) });
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
                    // Try to find the member by ID
                    const member = await membersCollection.findOne({ 
                        _id: new ObjectId(player1.memberId) 
                    });
                    
                    if (member) {
                        // Found member, create player object from member
                        playerObject = {
                            memberId: member._id,
                            name: `${member.firstName} ${member.lastName}`,
                            email: player1.email || member.email || '',
                            phoneNum: player1.phoneNum || player1.phone || member.phoneNum || '', // STANDARDIZED
                            ghin: member.ghin,
                            entryNum: member.entryNum,
                            index: player1.index || member.index || '',
                            sidePot: player1.sidePot || false,
                            roulette: player1.roulette || false
                        };
                    } else {
                        console.log('Member not found by ID:', player1.memberId);
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
                    phoneNum: player1.phoneNum || player1.phone || '', // STANDARDIZED
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
                console.log('Setting player1:', playerObject);
            }
        }
        
        // Update other fields - always include them
        if (startTime !== undefined) updateData.startTime = startTime;
        if (cartOption !== undefined) updateData.cartOption = cartOption;
        if (sidePot !== undefined) updateData.sidePot = sidePot;
        if (roulette !== undefined) updateData.roulette = roulette;
        
        console.log('Final update data:', updateData);
        
        // Update the entry
        const result = await collection.updateOne(
            { _id: new ObjectId(entryId) },
            { $set: updateData }
        );
        
        console.log('Update result:', result);
        
        res.json({ 
            success: true,
            message: 'Foursome updated successfully',
            data: updateData
        });
        
    } catch (error) {
        console.error('Error updating foursome details:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
});

// Update tournament entry (add/replace/remove player)
router.put('/:tournamentId/:entryId', requireAdmin, async (req, res) => {
    try {
        const { tournamentId, entryId } = req.params;
        const { playerNumber, action, memberId, memberData } = req.body;
        
        const collectionName = tournamentId === 'tournament2' 
            ? 'monthly-tournament2-foursomes' 
            : 'monthly-tournament-foursomes';
        
        const db = await connectDB();
        const collection = db.collection(collectionName);
        const membersCollection = db.collection('members');
        
        // Get the entry
        const entry = await collection.findOne({ _id: new ObjectId(entryId) });
        if (!entry) {
            return res.status(404).json({ error: 'Entry not found' });
        }
        
        const playerKey = `player${playerNumber}`;
        let updateData = {};
        
        if (action === 'remove') {
            // Remove player from slot
            updateData[playerKey] = null;
        } else if (action === 'replace' || action === 'add') {
            // Initialize player object
            let playerObject = {};
            
            // First, try to find member by memberId if provided
            if (memberId) {
                try {
                    const member = await membersCollection.findOne({ _id: new ObjectId(memberId) });
                    if (member) {
                        // Found member by ID, create player object from member
                        playerObject = {
                            memberId: member._id,
                            name: `${member.firstName} ${member.lastName}`,
                            email: member.email || '',
                            phoneNum: member.phoneNum || '', // STANDARDIZED
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
                
                // Try to find by GHIN first (most unique)
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
                    // Found member by search criteria
                    playerObject = {
                        memberId: foundMember._id,
                        name: `${foundMember.firstName} ${foundMember.lastName}`,
                        email: foundMember.email || '',
                        phoneNum: foundMember.phoneNum || '', // STANDARDIZED
                        ghin: foundMember.ghin,
                        entryNum: foundMember.entryNum,
                        index: foundMember.index || ''
                    };
                } else {
                    // No member found, create player object from memberData
                    // This is for non-members playing in tournaments
                    playerObject = {
                        memberId: null,
                        name: `${memberData.firstName || ''} ${memberData.lastName || ''}`.trim(),
                        email: memberData.email || '',
                        phoneNum: memberData.phoneNum || memberData.phone || '', // STANDARDIZED
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
            { _id: new ObjectId(entryId) },
            { $set: updateData }
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating tournament entry:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create empty foursome
router.post('/:tournamentId', requireAdmin, async (req, res) => {
    try {
        const tournamentId = req.params.tournamentId;
        const collectionName = tournamentId === 'tournament2' 
            ? 'monthly-tournament2-foursomes' 
            : 'monthly-tournament-foursomes';
        
        const db = await connectDB();
        const collection = db.collection(collectionName);
        
        // Create empty foursome
        const emptyFoursome = {
            createdAt: new Date(),
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
        
        const result = await collection.insertOne(emptyFoursome);
        
        // Get the created entry
        const createdEntry = await collection.findOne({ _id: result.insertedId });
        
        res.json({ 
            success: true, 
            entry: createdEntry 
        });
    } catch (error) {
        console.error('Error creating empty foursome:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Remove entire foursome
router.delete('/:tournamentId/:entryId', requireAdmin, async (req, res) => {
    try {
        const { tournamentId, entryId } = req.params;
        
        const collectionName = tournamentId === 'tournament2' 
            ? 'monthly-tournament2-foursomes' 
            : 'monthly-tournament-foursomes';
        
        const db = await connectDB();
        const collection = db.collection(collectionName);
        
        const result = await collection.deleteOne({ _id: new ObjectId(entryId) });
        
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
        const collectionName = tournamentId === 'tournament2' 
            ? 'monthly-tournament2-foursomes' 
            : 'monthly-tournament-foursomes';
        
        // Check if file was uploaded
        if (!req.files || !req.files.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const file = req.files.file;
        const fileName = file.name.toLowerCase();
        
        // Check file extension
        if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.csv') && !fileName.endsWith('.tsv')) {
            return res.status(400).json({ error: 'Invalid file type. Only .xlsx, .csv, and .tsv files are allowed.' });
        }
        
        const db = await connectDB();
        const collection = db.collection(collectionName);
        
        let foursomes = [];
        
        if (fileName.endsWith('.xlsx')) {
            // Parse Excel file
            foursomes = await parseExcelFile(file.data);
        } else if (fileName.endsWith('.csv') || fileName.endsWith('.tsv')) {
            // Parse CSV/TSV file
            const delimiter = fileName.endsWith('.tsv') ? '\t' : ',';
            foursomes = parseCsvTsvFile(file.data, delimiter);
        }
        
        // Clear existing data
        await collection.deleteMany({});
        
        // Insert new data
        if (foursomes.length > 0) {
            await collection.insertMany(foursomes);
        }
        
        res.json({ 
            success: true, 
            importedCount: foursomes.length,
            message: `Successfully imported ${foursomes.length} foursomes`
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
        const collectionName = tournamentId === 'tournament2' 
            ? 'monthly-tournament2-foursomes' 
            : 'monthly-tournament-foursomes';
        
        if (!['xlsx', 'csv', 'tsv'].includes(format)) {
            return res.status(400).json({ error: 'Invalid format. Must be xlsx, csv, or tsv.' });
        }
        
        const db = await connectDB();
        const collection = db.collection(collectionName);
        
        // Get all entries
        const entries = await collection.find({}).toArray();
        
        if (format === 'xlsx') {
            // Create Excel workbook
            const buffer = await createExcelWorkbook(entries);
            
            // Set headers for download
            const tournamentName = tournamentId === 'tournament2' ? 'monthly-tournament2' : 'monthly-tournament';
            res.setHeader('Content-Disposition', `attachment; filename="${tournamentName}-foursomes.xlsx"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buffer);
            
        } else if (format === 'csv' || format === 'tsv') {
            const delimiter = format === 'tsv' ? '\t' : ',';
            
            // Create CSV/TSV
            const csvData = createCsvTsvText(entries, delimiter);
            
            // Set headers for download
            const tournamentName = tournamentId === 'tournament2' ? 'monthly-tournament2' : 'monthly-tournament';
            res.setHeader('Content-Disposition', `attachment; filename="${tournamentName}-foursomes.${format}"`);
            res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'text/tab-separated-values');
            res.send(csvData);
        }
        
    } catch (error) {
        console.error('Error exporting tournament data:', error);
        res.status(500).json({ error: 'Error exporting file: ' + error.message });
    }
});

module.exports = router;