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
        
        // Get all registrations for this tournament
        const registrations = await registrationsCollection.find({ 
            tournamentId: tournamentId 
        }).sort({ startTime: 1, createdAt: 1 }).toArray();
        
        // Enrich with member data if available
        const enrichedRegistrations = await Promise.all(registrations.map(async (registration) => {
            const enrichedRegistration = { ...registration };
            
            // Enrich each player with full member data if they have a memberId
            for (let i = 1; i <= 4; i++) {
                const playerKey = `player${i}`;
                if (registration[playerKey] && registration[playerKey].memberId) {
                    try {
                        const membersCollection = db.collection('members');
                        const member = await membersCollection.findOne({ 
                            _id: new ObjectId(registration[playerKey].memberId) 
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
                    }
                }
            }
            
            return enrichedRegistration;
        }));
        
        // Remove _id fields
        const sanitizedRegistrations = enrichedRegistrations.map(({ _id, ...rest }) => rest);
        
        res.json(sanitizedRegistrations);
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

module.exports = router;