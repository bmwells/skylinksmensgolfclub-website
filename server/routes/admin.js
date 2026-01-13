// server/routes/admin.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { JWT_SECRET, TOKEN_EXPIRY, requireAdmin } = require('../auth');

// ADMIN LOGIN WITH JWT
router.post('/login', (req, res) => {
    const { password } = req.body;

    if (password === process.env.ADMIN_PW) {
        // Create JWT token that expires in 24 hours
        const token = jwt.sign(
            { 
                admin: true, 
                timestamp: Date.now(),
                role: 'admin'
            },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRY }
        );
        
        return res.json({ 
            success: true, 
            token,
            expiresIn: TOKEN_EXPIRY
        });
    }

    res.status(401).json({ error: 'Invalid password' });
});

// Token validation endpoint
router.get('/validate', requireAdmin, (req, res) => {
    res.json({ 
        valid: true, 
        user: req.user,
        expiresIn: TOKEN_EXPIRY,
        timestamp: new Date().toISOString() 
    });
});

module.exports = router;