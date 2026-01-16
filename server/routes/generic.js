// server/routes/generic.js - UPDATED
const express = require('express');
const router = express.Router();
const { readData, writeData } = require('../../db');
const { requireAdmin } = require('../auth');
const { connectDB } = require('../../db');
const { 
    parseMembersExcelFile, 
    parseMembersCsvTsvFile, 
    createMembersExcelWorkbook, 
    createMembersCsvTsvText 
} = require('../utils/memberImportExport');

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

// MEMBER IMPORT/EXPORT ENDPOINTS
router.post('/members/import', requireAdmin, async (req, res) => {
    try {
        if (!req.files || !req.files.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const file = req.files.file;
        const fileName = file.name.toLowerCase();
        const format = req.body.format || '';
        
        if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.csv') && !fileName.endsWith('.tsv')) {
            return res.status(400).json({ error: 'Invalid file type. Only .xlsx, .csv, and .tsv files are allowed.' });
        }
        
        const db = await connectDB();
        const collection = db.collection('members');
        
        let members = [];
        
        if (fileName.endsWith('.xlsx')) {
            members = await parseMembersExcelFile(file.data);
        } else if (fileName.endsWith('.csv') || fileName.endsWith('.tsv')) {
            const delimiter = fileName.endsWith('.tsv') ? '\t' : ',';
            members = parseMembersCsvTsvFile(file.data, delimiter);
        }
        
        await collection.deleteMany({});
        
        if (members.length > 0) {
            await collection.insertMany(members);
        }
        
        res.json({ 
            success: true, 
            importedCount: members.length,
            message: `Successfully imported ${members.length} members`
        });
        
    } catch (error) {
        console.error('Error importing member data:', error);
        res.status(500).json({ error: 'Error importing file: ' + error.message });
    }
});

router.get('/members/export', requireAdmin, async (req, res) => {
    try {
        const format = req.query.format || 'xlsx';
        
        if (!['xlsx', 'csv', 'tsv'].includes(format)) {
            return res.status(400).json({ error: 'Invalid format. Must be xlsx, csv, or tsv.' });
        }
        
        const db = await connectDB();
        const collection = db.collection('members');
        
        const members = await collection.find({}).toArray();
        
        if (format === 'xlsx') {
            const buffer = await createMembersExcelWorkbook(members);
            
            const timestamp = new Date().toISOString().split('T')[0];
            res.setHeader('Content-Disposition', `attachment; filename="members-${timestamp}.${format}"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buffer);
            
        } else if (format === 'csv' || format === 'tsv') {
            const delimiter = format === 'tsv' ? '\t' : ',';
            
            const csvData = createMembersCsvTsvText(members, delimiter);
            
            const timestamp = new Date().toISOString().split('T')[0];
            res.setHeader('Content-Disposition', `attachment; filename="members-${timestamp}.${format}"`);
            res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'text/tab-separated-values');
            res.send(csvData);
        }
        
    } catch (error) {
        console.error('Error exporting member data:', error);
        res.status(500).json({ error: 'Error exporting file: ' + error.message });
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