const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = 'data';

// Collections that store MULTIPLE documents (array semantics)
const ARRAY_COLLECTIONS = new Set([
    'results',
    'meeting-minutes',
    'schedule',
    'members'
]);

// Collections that store ONE document (object semantics)
const SINGLE_DOC_COLLECTIONS = new Set([
    'monthly-tournament',
    'who-we-are',
    'presidents-letter'
]);

let client;
let db;

async function connectDB() {
    if (db) return db;

    if (!MONGO_URI) {
        throw new Error('MONGODB_URI is not defined');
    }

    client = new MongoClient(MONGO_URI);
    await client.connect();

    db = client.db(DB_NAME);

    console.log('MongoDB connected → database:', DB_NAME);
    return db;
}

/**
 * READ
 * MongoDB → frontend JSON (shape-preserving)
 */
async function readData(key) {
    const collection = db.collection(key);

    // ---------- ARRAY COLLECTIONS ----------
    if (ARRAY_COLLECTIONS.has(key)) {
        const docs = await collection.find({}).toArray();
        return docs.map(({ _id, ...rest }) => rest);
    }

    // ---------- SINGLE DOCUMENT COLLECTIONS ----------
    if (SINGLE_DOC_COLLECTIONS.has(key)) {
        const doc = await collection.findOne({});
        if (!doc) return {};

        const { _id, ...rest } = doc;
        return rest;
    }

    throw new Error(`Unknown collection type: ${key}`);
}

/**
 * WRITE
 * Frontend JSON → MongoDB
 * (preserves original data model)
 */
async function writeData(key, data) {
    const collection = db.collection(key);

    // ---------- ARRAY COLLECTIONS ----------
    if (ARRAY_COLLECTIONS.has(key)) {
        if (!Array.isArray(data)) {
            throw new Error(`Expected array for ${key}`);
        }

        await collection.deleteMany({});
        if (data.length) {
            await collection.insertMany(data.map(item => ({ ...item })));
        }
        return;
    }

    // ---------- SINGLE DOCUMENT COLLECTIONS ----------
    if (SINGLE_DOC_COLLECTIONS.has(key)) {
        if (Array.isArray(data)) {
            throw new Error(`Expected object for ${key}`);
        }

        await collection.deleteMany({});
        await collection.insertOne({ ...data });
        return;
    }

    throw new Error(`Unknown collection type: ${key}`);
}

module.exports = {
    connectDB,
    readData,
    writeData
};
