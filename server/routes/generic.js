// server/routes/generic.js
const express = require('express');
const router = express.Router();
const { readData, writeData } = require('../../db');
const { requireAdmin } = require('../auth');

// MEMBER AUTOCOMPLETE API
router.get('/members/search', async (req, res) => {
    try {
        const q = (req.query.q || '').toLowerCase();
        if (q.length < 2) return res.json([]);

        const members = await readData('members');

        const results = members
            .filter(m =>
                `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)
            )
            .slice(0, 10);

        res.json(results);
    } catch (error) {
        console.error('Error searching members:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// MONTHLY TOURNAMENT
router.get('/monthly-tournament', async (req, res) => {
    try {
        const data = await readData('monthly-tournament');
        res.json(data);
    } catch (error) {
        console.error('Error reading monthly tournament:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/monthly-tournament', requireAdmin, async (req, res) => {
    try {
        await writeData('monthly-tournament', req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Error writing monthly tournament:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/monthly-tournament2', async (req, res) => {
    try {
        const data = await readData('monthly-tournament2');
        res.json(data);
    } catch (error) {
        console.error('Error reading monthly tournament 2:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/monthly-tournament2', requireAdmin, async (req, res) => {
    try {
        await writeData('monthly-tournament2', req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Error writing monthly tournament 2:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GENERIC DATA ROUTES
[
    'results',
    'meeting-minutes',
    'schedule',
    'presidents-letter',
    'who-we-are',
    'members',
    'images'
].forEach(key => {
    router.get(`/${key}`, async (req, res) => {
        try {
            const data = await readData(key);
            res.json(data);
        } catch (error) {
            console.error(`Error reading ${key}:`, error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    router.post(`/${key}`, requireAdmin, async (req, res) => {
        try {
            await writeData(key, req.body);
            res.json({ success: true });
        } catch (error) {
            console.error(`Error writing ${key}:`, error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
});

// IMAGES API ROUTES
router.get('/images', async (req, res) => {
    try {
        const data = await readData('images');
        res.json(data);
    } catch (error) {
        console.error('Error reading images:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/images', requireAdmin, async (req, res) => {
    try {
        await writeData('images', req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Error writing images:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;