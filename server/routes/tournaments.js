// server/routes/tournaments.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const { connectDB } = require('../../db');
const { requireAdmin } = require('../auth');

// Get all tournaments
router.get('/', async (req, res) => {
    try {
        const db = await connectDB();
        const collection = db.collection('tournaments');
        
        const { activePage, pinned, active } = req.query;
        let query = {};
        
        if (activePage !== undefined) {
            query.activePage = activePage === 'true';
        }
        
        if (pinned !== undefined) {
            query.pinned = pinned === 'true';
        }
        
        if (active !== undefined) {
            query.active = active === 'true';
        }
        
        const tournaments = await collection.find(query).sort({ pinned: -1, createdAt: -1 }).toArray();
        
        // Remove _id field from response
        const sanitizedTournaments = tournaments.map(({ _id, ...rest }) => rest);
        
        res.json(sanitizedTournaments);
    } catch (error) {
        console.error('Error getting tournaments:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get single tournament by ID
router.get('/:id', async (req, res) => {
    try {
        const db = await connectDB();
        const collection = db.collection('tournaments');
        
        const tournament = await collection.findOne({ id: req.params.id });
        
        if (!tournament) {
            return res.status(404).json({ error: 'Tournament not found' });
        }
        
        // Remove _id field from response
        const { _id, ...sanitizedTournament } = tournament;
        
        res.json(sanitizedTournament);
    } catch (error) {
        console.error('Error getting tournament:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create or update tournament
router.post('/:id', requireAdmin, async (req, res) => {
    try {
        const db = await connectDB();
        const collection = db.collection('tournaments');
        
        const tournamentId = req.params.id;
        const tournamentData = req.body;
        
        // Ensure id field matches URL parameter
        tournamentData.id = tournamentId;
        
        // Add timestamps
        const now = new Date();
        tournamentData.updatedAt = now;
        
        // Check if tournament exists
        const existingTournament = await collection.findOne({ id: tournamentId });
        
        if (existingTournament) {
            // Update existing tournament
            tournamentData.createdAt = existingTournament.createdAt || now;
            await collection.updateOne(
                { id: tournamentId },
                { $set: tournamentData }
            );
        } else {
            // Create new tournament
            tournamentData.createdAt = now;
            await collection.insertOne(tournamentData);
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving tournament:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete tournament
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const db = await connectDB();
        const tournamentsCollection = db.collection('tournaments');
        const registrationsCollection = db.collection('tournament-registrations');
        
        // Delete tournament
        const result = await tournamentsCollection.deleteOne({ id: req.params.id });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Tournament not found' });
        }
        
        // Also delete all registrations for this tournament
        await registrationsCollection.deleteMany({ tournamentId: req.params.id });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting tournament:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get registrations for a tournament
router.get('/:id/registrations', requireAdmin, async (req, res) => {
    try {
        const tournamentId = req.params.id;
        const db = await connectDB();
        const registrationsCollection = db.collection('tournament-registrations');
        
        // Get all registrations for this tournament WITHOUT initial sort
        const registrations = await registrationsCollection.find({ 
            tournamentId: tournamentId 
        }).toArray();
        
        // Sort manually by startTime (convert time strings to sortable format)
        registrations.sort((a, b) => {
            // Helper function to convert time string to sortable value
            const getTimeValue = (timeStr) => {
                if (!timeStr) return 999; // No time specified goes last
                if (timeStr === "Doesn't Matter") return 998;
                if (timeStr === "Not specified") return 997;
                
                try {
                    // Parse time like "6am", "10am", "2pm", "12pm", "12am"
                    const timeMatch = timeStr.toLowerCase().match(/^(\d+)(am|pm)$/);
                    if (timeMatch) {
                        let hour = parseInt(timeMatch[1]);
                        const period = timeMatch[2];
                        
                        // Convert to 24-hour format for sorting
                        if (period === 'pm' && hour < 12) {
                            hour += 12;
                        }
                        if (period === 'am' && hour === 12) {
                            hour = 0; // 12am = 0
                        }
                        
                        return hour;
                    }
                } catch (error) {
                    console.error('Error parsing time:', timeStr, error);
                }
                
                // If can't parse, sort alphabetically
                return 996;
            };
            
            const timeA = getTimeValue(a.startTime);
            const timeB = getTimeValue(b.startTime);
            
            // First sort by time
            if (timeA !== timeB) {
                return timeA - timeB;
            }
            
            // If same time, sort by creation date
            const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
            const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
            return dateA - dateB;
        });
        
        // Enrich with member data if available
        const enrichedRegistrations = await Promise.all(registrations.map(async (registration) => {
            const enrichedRegistration = { ...registration };
            
            // Enrich each player with full member data if they have a memberId
            for (let i = 1; i <= 4; i++) {
                const playerKey = `player${i}`;
                if (registration[playerKey] && registration[playerKey].memberId) {
                    try {
                        const membersCollection = db.collection('members');
                        
                        // Convert memberId to ObjectId - handle both string and ObjectId
                        let memberId = registration[playerKey].memberId;
                        
                        // If it's already an ObjectId, use it directly
                        // If it's a string, convert it
                        if (typeof memberId === 'string') {
                            // Validate it's a valid 24-character hex string
                            if (/^[0-9a-fA-F]{24}$/.test(memberId)) {
                                memberId = new ObjectId(memberId);
                            } else {
                                console.warn(`Invalid memberId format for player ${i}:`, memberId);
                                continue; // Skip enrichment for invalid ID
                            }
                        }
                        
                        const member = await membersCollection.findOne({ 
                            _id: memberId 
                        });
                        
                        if (member) {
                            enrichedRegistration[playerKey] = {
                                ...registration[playerKey],
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
                    } catch (error) {
                        console.error(`Error enriching player ${i}:`, error);
                        // Continue even if enrichment fails
                    }
                }
            }
            
            return enrichedRegistration;
        }));
        
        // Return registrations WITH _id field
        res.json(enrichedRegistrations);
        
    } catch (error) {
        console.error('Error getting tournament registrations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create registration for a tournament
router.post('/:id/registrations', requireAdmin, async (req, res) => {
    try {
        const tournamentId = req.params.id;
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
        
        // Get the created registration
        const createdRegistration = await collection.findOne({ _id: result.insertedId });
        const { _id, ...sanitizedRegistration } = createdRegistration;
        
        res.json({ 
            success: true, 
            registration: sanitizedRegistration 
        });
    } catch (error) {
        console.error('Error creating tournament registration:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update registration for a tournament - SIMPLIFIED VERSION
router.put('/:id/registrations/:registrationId', requireAdmin, async (req, res) => {
    try {
        const tournamentId = req.params.id;
        const registrationId = req.params.registrationId;
        const updateData = req.body;
        const db = await connectDB();
        const collection = db.collection('tournament-registrations');
        
        console.log('PUT request received:', {
            tournamentId,
            registrationId,
            updateData
        });
        
        // Validate registrationId is a valid ObjectId
        if (!ObjectId.isValid(registrationId)) {
            console.error('Invalid registration ID:', registrationId);
            return res.status(400).json({ error: 'Invalid registration ID format' });
        }
        
        const registrationObjectId = new ObjectId(registrationId);
        
        // Validate that the registration exists
        const existingRegistration = await collection.findOne({
            _id: registrationObjectId,
            tournamentId: tournamentId
        });
        
        if (!existingRegistration) {
            console.error('Registration not found:', registrationId);
            return res.status(404).json({ error: 'Registration not found' });
        }
        
        // Add updatedAt timestamp
        updateData.updatedAt = new Date();
        
        // Handle player data updates
        for (let i = 1; i <= 4; i++) {
            const playerKey = `player${i}`;
            if (updateData[playerKey]) {
                // Ensure player has proper fields
                if (updateData[playerKey].name) {
                    updateData[playerKey].name = updateData[playerKey].name.trim();
                }
                
                // If memberId is provided, ensure it's a string
                if (updateData[playerKey].memberId) {
                    if (typeof updateData[playerKey].memberId !== 'string') {
                        updateData[playerKey].memberId = updateData[playerKey].memberId.toString();
                    }
                } else {
                    updateData[playerKey].memberId = null;
                }
                
                // Ensure sidePot and roulette are boolean
                if (updateData[playerKey].sidePot !== undefined) {
                    updateData[playerKey].sidePot = Boolean(updateData[playerKey].sidePot);
                }
                if (updateData[playerKey].roulette !== undefined) {
                    updateData[playerKey].roulette = Boolean(updateData[playerKey].roulette);
                }
                
                // If setting to null/empty
                if (updateData[playerKey] === null || updateData[playerKey] === '') {
                    updateData[playerKey] = null;
                }
            }
        }
        
        // Handle startTime and cartOption
        if (updateData.startTime !== undefined) {
            updateData.startTime = updateData.startTime.trim();
        }
        
        if (updateData.cartOption !== undefined) {
            updateData.cartOption = updateData.cartOption.trim();
        }
        
        console.log('Update data to MongoDB:', updateData);
        
        // Update the registration
        const result = await collection.updateOne(
            { _id: registrationObjectId, tournamentId: tournamentId },
            { $set: updateData }
        );
        
        console.log('MongoDB update result:', result);
        
        if (result.modifiedCount === 0) {
            return res.status(404).json({ error: 'Registration not found or no changes made' });
        }
        
        // Get the updated registration
        const updatedRegistration = await collection.findOne({ 
            _id: registrationObjectId 
        });
        
        const { _id, ...sanitizedRegistration } = updatedRegistration;
        
        res.json({ 
            success: true, 
            registration: sanitizedRegistration 
        });
    } catch (error) {
        console.error('Error updating tournament registration:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Internal server error: ' + error.message });
    }
});

// Delete registration for a tournament - SIMPLIFIED VERSION
router.delete('/:id/registrations/:registrationId', requireAdmin, async (req, res) => {
    try {
        const tournamentId = req.params.id;
        const registrationId = req.params.registrationId;
        const db = await connectDB();
        const collection = db.collection('tournament-registrations');
        
        console.log('DELETE request received:', {
            tournamentId,
            registrationId
        });
        
        // Validate registrationId is a valid ObjectId
        if (!ObjectId.isValid(registrationId)) {
            console.error('Invalid registration ID:', registrationId);
            return res.status(400).json({ error: 'Invalid registration ID format' });
        }
        
        const registrationObjectId = new ObjectId(registrationId);
        
        // Validate that the registration exists
        const existingRegistration = await collection.findOne({
            _id: registrationObjectId,
            tournamentId: tournamentId
        });
        
        if (!existingRegistration) {
            console.error('Registration not found:', registrationId);
            return res.status(404).json({ error: 'Registration not found' });
        }
        
        // Delete the registration
        const result = await collection.deleteOne({ 
            _id: registrationObjectId 
        });
        
        console.log('MongoDB delete result:', result);
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Registration not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting tournament registration:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;