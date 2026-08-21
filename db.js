// db.js 
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = 'data';

// Collections that store MULTIPLE documents (array semantics)
const ARRAY_COLLECTIONS = new Set([
    'results',
    'meeting-minutes',
    'schedule',
    'members',
    'images',
    'tournaments', 
    'tournament-registrations' 
]);

// Collections that store ONE document (object semantics)
const SINGLE_DOC_COLLECTIONS = new Set([
    'who-we-are',
    'join-the-club',
    'presidents-letter'
]);

let client;
let db;

async function connectDB() {
    if (db) return db;

    if (!MONGO_URI) {
        throw new Error('MONGODB_URI is not defined');
    }

    client = new MongoClient(MONGO_URI, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
    });
    
    await client.connect();
    db = client.db(DB_NAME);

    console.log('MongoDB connected → database:', DB_NAME);
    
    // Create indexes for better performance
    await db.collection('tournaments').createIndex({ id: 1 }, { unique: true });
    await db.collection('tournaments').createIndex({ activePage: 1 });
    await db.collection('tournaments').createIndex({ pinned: 1 });
    await db.collection('tournaments').createIndex({ active: 1 });
    
    await db.collection('tournament-registrations').createIndex({ tournamentId: 1 });
    await db.collection('tournament-registrations').createIndex({ createdAt: 1 });

    return db;
}

/**
 * READ
 * MongoDB → frontend JSON (shape-preserving)
 */
async function readData(key) {
    try {
        // Ensure DB is connected before using it
        if (!db) {
            await connectDB();
        }
        
        const collection = db.collection(key);

        // ---------- ARRAY COLLECTIONS ----------
        if (ARRAY_COLLECTIONS.has(key)) {
            const docs = await collection.find({}).toArray();
            const cleanedDocs = docs.map(({ _id, ...rest }) => rest);
            
            // Special handling for schedule collection - ensure rich text compatibility
            if (key === 'schedule') {
                return cleanedDocs.map(event => {
                    // If detailsHtml doesn't exist but details array does, convert it
                    if (!event.detailsHtml && event.details && Array.isArray(event.details)) {
                        let html = event.details.map(line => {
                            let trimmed = line.trim();
                            if (trimmed.startsWith('•')) {
                                return `<li>${trimmed.substring(1).trim()}</li>`;
                            }
                            return `<p>${line}</p>`;
                        }).join('');
                        
                        if (html.includes('<li>') && !html.includes('<p>')) {
                            html = `<ul>${html}</ul>`;
                        }
                        
                        event.detailsHtml = html || '<p></p>';
                    }
                    
                    // Ensure detailsHtml always exists
                    if (!event.detailsHtml) {
                        event.detailsHtml = '<p></p>';
                    }
                    
                    return event;
                });
            }
            
            return cleanedDocs;
        }

        // ---------- SINGLE DOCUMENT COLLECTIONS ----------
        if (SINGLE_DOC_COLLECTIONS.has(key)) {
            const doc = await collection.findOne({});
            if (!doc) return {};
            const { _id, ...rest } = doc;
            return rest;
        }

        throw new Error(`Unknown collection type: ${key}`);
    } catch (error) {
        console.error(`Error reading ${key}:`, error.message);
        // Return appropriate empty structure based on collection type
        if (ARRAY_COLLECTIONS.has(key)) return [];
        if (SINGLE_DOC_COLLECTIONS.has(key)) return {};
        throw error;
    }
}

/**
 * WRITE
 * Frontend JSON → MongoDB
 */
async function writeData(key, data) {
    try {
        // Ensure DB is connected before using it
        if (!db) {
            await connectDB();
        }
        
        const collection = db.collection(key);

        // ---------- ARRAY COLLECTIONS ----------
        if (ARRAY_COLLECTIONS.has(key)) {
            if (!Array.isArray(data)) {
                throw new Error(`Expected array for ${key}`);
            }

            // Special handling for schedule - ensure rich text data is preserved
            if (key === 'schedule') {
                // Validate and ensure all events have detailsHtml
                const validatedData = data.map(event => {
                    // If detailsHtml is missing but details exists, convert
                    if (!event.detailsHtml && event.details && Array.isArray(event.details)) {
                        let html = event.details.map(line => {
                            let trimmed = line.trim();
                            if (trimmed.startsWith('•')) {
                                return `<li>${trimmed.substring(1).trim()}</li>`;
                            }
                            return `<p>${line}</p>`;
                        }).join('');
                        
                        if (html.includes('<li>') && !html.includes('<p>')) {
                            html = `<ul>${html}</ul>`;
                        }
                        
                        event.detailsHtml = html || '<p></p>';
                    }
                    
                    // Ensure detailsHtml always exists
                    if (!event.detailsHtml) {
                        event.detailsHtml = '<p></p>';
                    }
                    
                    return event;
                });
                
                await collection.deleteMany({});
                if (validatedData.length) {
                    await collection.insertMany(validatedData.map(item => ({ ...item })));
                }
                return { success: true };
            }

            // Default handling for other array collections
            await collection.deleteMany({});
            if (data.length) {
                await collection.insertMany(data.map(item => ({ ...item })));
            }
            return { success: true };
        }

        // ---------- SINGLE DOCUMENT COLLECTIONS ----------
        if (SINGLE_DOC_COLLECTIONS.has(key)) {
            if (Array.isArray(data)) {
                throw new Error(`Expected object for ${key}`);
            }

            await collection.deleteMany({});
            await collection.insertOne({ ...data });
            return { success: true };
        }

        throw new Error(`Unknown collection type: ${key}`);
    } catch (error) {
        console.error(`Error writing ${key}:`, error.message);
        throw error;
    }
}

module.exports = {
    connectDB,
    readData,
    writeData
};