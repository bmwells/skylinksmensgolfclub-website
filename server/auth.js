// server/auth.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_EXPIRY = '24h';

// JWT validation middleware
function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : authHeader;

    if (!token) {
        return res.status(403).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Check if token has admin privilege
        if (decoded.admin) {
            req.user = decoded; // Attach user info to request
            return next();
        }
        
        throw new Error('Not an admin token');
    } catch (error) {
        console.error('JWT verification failed:', error.message);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(403).json({ 
                error: 'Token expired',
                code: 'TOKEN_EXPIRED'
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(403).json({ 
                error: 'Invalid token',
                code: 'INVALID_TOKEN'
            });
        }
        
        return res.status(403).json({ 
            error: 'Unauthorized',
            code: 'UNAUTHORIZED'
        });
    }
}

module.exports = {
    JWT_SECRET,
    TOKEN_EXPIRY,
    requireAdmin
};