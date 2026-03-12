// server/routes/contact.js
const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

// Create reusable transporter object using Gmail
const createTransporter = () => {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        }
    });
};

// Whitelist of common legitimate email domains
const trustedEmailDomains = [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'aol.com', 'icloud.com', 'protonmail.com', 'proton.me',
    'me.com', 'mac.com', 'comcast.net', 'att.net', 'verizon.net',
    'sbcglobal.net', 'msn.com', 'live.com', 'rocketmail.com'
];

// Helper function to detect extreme gibberish only
function isExtremeGibberish(text) {
    if (!text || text.length < 3) return false;
    
    // Only flag EXTREME cases that would never be legitimate
    const extremePatterns = [
        /[A-Z]{15,}/, // 15+ consecutive caps (very rare in real text)
        /[a-z0-9]{30,}/, // 30+ random lowercase/numbers (very rare)
        /(.)\1{8,}/, // 9+ repeated characters (very rare)
        /^[A-Za-z0-9]{40,}$/, // 40+ alphanumeric with no spaces (likely a token)
        /[bcdfghjklmnpqrstvwxyz]{15,}/i // 15+ consecutive consonants (very rare in real words)
    ];
    
    for (const pattern of extremePatterns) {
        if (pattern.test(text)) {
            console.log(`Extreme gibberish pattern matched: ${pattern}`);
            return true;
        }
    }
    
    return false;
}

// Helper function specifically for detecting dotted email gibberish
// Like: o.ho.ma.g.i.q.ah.o.z.81@gmail.com
function isDottedEmailGibberish(email) {
    if (!email || !email.includes('@')) return false;
    
    const localPart = email.split('@')[0];
    const domain = email.split('@')[1];
    
    // Check if domain is trusted - if it's a known good domain, be more lenient
    const isTrustedDomain = trustedEmailDomains.includes(domain.toLowerCase());
    
    // Pattern for dotted gibberish: many single-letter segments separated by dots
    // Like: o.ho.ma.g.i.q.ah.o.z
    if (localPart.includes('.')) {
        const segments = localPart.split('.');
        
        // Count single-letter segments
        const singleLetterSegments = segments.filter(s => s.length === 1).length;
        const totalSegments = segments.length;
        
        // If more than half the segments are single letters AND there are at least 4 segments
        // AND the domain is not trusted, it's likely bot-generated
        if (totalSegments >= 4 && singleLetterSegments > totalSegments / 2) {
            console.log(`Dotted email gibberish detected: ${email}`);
            return true;
        }
        
        // Also check for patterns like "a.b.c.d.e.f.g" (all single letters)
        if (segments.every(s => s.length === 1) && segments.length >= 5) {
            console.log(`All single-letter segments detected: ${email}`);
            return true;
        }
    }
    
    return false;
}

// Helper function to check for extremely random email local parts
function isRandomEmailLocalPart(email) {
    if (!email || !email.includes('@')) return false;
    
    const localPart = email.split('@')[0];
    const domain = email.split('@')[1];
    
    // If domain is trusted, be more lenient
    const isTrustedDomain = trustedEmailDomains.includes(domain.toLowerCase());
    if (isTrustedDomain) return false;
    
    // Check for patterns like:
    // - All lowercase letters with numbers, 20+ chars (likely auto-generated)
    // - Mixed case with numbers, 15+ chars (likely auto-generated)
    // - No vowels at all in a long string (very suspicious)
    
    const randomPatterns = [
        /^[a-z0-9]{20,}$/, // 20+ lowercase letters/numbers
        /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])[A-Za-z0-9]{15,}$/, // Mixed case + numbers, 15+
        /^[bcdfghjklmnpqrstvwxyz0-9]{15,}$/i // 15+ consonants + numbers (no vowels)
    ];
    
    for (const pattern of randomPatterns) {
        if (pattern.test(localPart)) {
            console.log(`Random email local part detected: ${email}`);
            return true;
        }
    }
    
    return false;
}

// Helper function to check message for extreme spam patterns
function isExtremeSpamMessage(message) {
    if (!message) return false;
    
    // Check for messages that are just random characters
    if (isExtremeGibberish(message)) return true;
    
    // Check for very short messages with random special characters
    if (message.length < 15 && /[^a-zA-Z0-9\s]{5,}/.test(message)) {
        console.log('Short message with many special chars detected');
        return true;
    }
    
    // Check for messages that are just URLs (common in spam)
    const urlOnlyPattern = /^(https?:\/\/[^\s]+)$|^(www\.[^\s]+)$/i;
    if (urlOnlyPattern.test(message.trim())) {
        console.log('URL-only message detected');
        return true;
    }
    
    return false;
}

router.post('/contact', async (req, res) => {
    try {
        const { firstName, lastName, email, topic, message } = req.body;
        
        console.log('Contact form submission received:', {
            firstName,
            lastName,
            email,
            topic,
            messageLength: message?.length
        });
        
        // EXTREME GIBBERISH CHECKS - Only block the most obvious bots
        
        // Check name fields for extreme gibberish
        if (isExtremeGibberish(firstName) || isExtremeGibberish(lastName)) {
            console.log('⚠️ Extreme gibberish detected in name fields');
            // Silently accept to trick bot
            return res.status(200).json({ 
                success: true, 
                message: 'Message sent successfully' 
            });
        }
        
        // Check for dotted email gibberish pattern (like the one in your example)
        if (isDottedEmailGibberish(email)) {
            console.log('⚠️ Dotted email gibberish detected');
            return res.status(200).json({ 
                success: true, 
                message: 'Message sent successfully' 
            });
        }
        
        // Check for extremely random email local parts
        if (isRandomEmailLocalPart(email)) {
            console.log('⚠️ Extremely random email local part detected');
            return res.status(200).json({ 
                success: true, 
                message: 'Message sent successfully' 
            });
        }
        
        // Check message for extreme spam patterns
        if (isExtremeSpamMessage(message)) {
            console.log('⚠️ Extreme spam message detected');
            return res.status(200).json({ 
                success: true, 
                message: 'Message sent successfully' 
            });
        }
        
        // Validate required fields
        if (!firstName || !lastName || !email || !message) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Basic email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        
        // Length checks (prevent abuse)
        if (firstName.length > 50 || lastName.length > 50) {
            return res.status(400).json({ error: 'Name too long' });
        }
        
        if (message.length > 5000) {
            return res.status(400).json({ error: 'Message too long (max 5000 characters)' });
        }
        
        // Create email content
        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: process.env.GMAIL_USER,
            replyTo: email,
            subject: `Contact Form: ${firstName} ${lastName}, ${email}, ${topic || 'No topic'}`,
            text: `Name: ${firstName} ${lastName}\nEmail: ${email}\nTopic: ${topic || 'Not specified'}\n\nMessage:\n${message}\n\n---\nSent from Skylinks Men's Golf Club website`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                    <h2 style="color: #2a5c3d;">Skylinks Website Contact</h2>
                    <p><strong>From:</strong> ${firstName} ${lastName}</p>
                    <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
                    <p><strong>Topic:</strong> ${topic || 'Not specified'}</p>
                    <hr style="border: 1px solid #e0e0e0; margin: 20px 0;">
                    <h3 style="color: #2a5c3d;">Message:</h3>
                    <p style="white-space: pre-wrap; background: #f9f9f9; padding: 15px; border-radius: 5px;">${message}</p>
                    <hr style="border: 1px solid #e0e0e0; margin: 20px 0;">
                    <p style="color: #666; font-size: 12px;">
                        Sent from Skylinks Men's Golf Club website<br>
                        ${new Date().toLocaleString()}
                    </p>
                </div>
            `
        };
        
        // Send email
        const transporter = createTransporter();
        const info = await transporter.sendMail(mailOptions);
        
        console.log('✅ Contact form email sent:', info.messageId);
        
        res.json({ 
            success: true, 
            message: 'Contact form submitted successfully',
            messageId: info.messageId
        });
        
    } catch (error) {
        console.error('❌ Error sending contact form email:', error);
        res.status(500).json({ 
            error: 'Failed to send message. Please try again later.',
            details: error.message 
        });
    }
});

module.exports = router;