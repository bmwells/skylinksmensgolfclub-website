// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const Stripe = require('stripe');
const { MongoClient } = require('mongodb');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DOMAIN = process.env.DOMAIN || `http://localhost:${PORT}`;

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'skylinks';

let db;
let membersCollection;

// Stripe (unchanged)
const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripe = Stripe(stripeSecret);

// MongoDB connection
async function connectToMongoDB() {
    try {
        if (!MONGODB_URI) {
            console.warn('MONGODB_URI not set');
            return;
        }

        const client = await MongoClient.connect(MONGODB_URI);
        db = client.db(DB_NAME);
        membersCollection = db.collection('members');

        // Ensure text index
        await membersCollection.createIndex(
            { firstName: 'text', lastName: 'text' },
            { name: 'member_name_text_index' }
        );

        console.log(`MongoDB connected → DB: ${DB_NAME}, Collection: members`);
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
    }
}
connectToMongoDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static
app.use(express.static(path.join(__dirname, 'public')));

// ------------------------------------
// MEMBERS SEARCH API 
// ------------------------------------
app.get('/api/members/search', async (req, res) => {
    try {
        if (!membersCollection) return res.json([]);

        const q = req.query.q?.trim();
        if (!q || q.length < 3) return res.json([]);

        const tokens = q
            .split(/\s+/)
            .filter(Boolean)
            .map(t =>
                new RegExp(
                    t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                    'i'
                )
            );

        const query = {
            $and: tokens.map(regex => ({
                $or: [
                    { firstName: regex },
                    { lastName: regex }
                ]
            }))
        };

        const members = await membersCollection
            .find(query)
            .project({
                _id: 0,
                firstName: 1,
                lastName: 1,
                email: 1,
                phoneNum: 1,
                ghin: 1,
                index: 1,
                entryNum: 1
            })
            .limit(20)
            .toArray();

        res.json(members);
    } catch (err) {
        console.error('Member search error:', err);
        res.status(500).json([]);
    }
});

// Health
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mongodb: membersCollection ? 'connected' : 'disconnected'
    });
});

// Catch-all
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running → ${DOMAIN}`);
});
