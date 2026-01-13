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

router.post('/contact', async (req, res) => {
    try {
        const { firstName, lastName, email, topic, message } = req.body;
        
        // Validate required fields
        if (!firstName || !lastName || !email || !message) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        
        // Create email content
        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: process.env.GMAIL_USER, // Sending to yourself
            replyTo: email, // So you can reply directly to the sender
            subject: `Contact Form: ${firstName} ${lastName}, ${email}, ${topic}`,
            text: `Message:\n${message}\n\n` +
                  `---\nSent from Skylinks Men's Golf Club website`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                    <h2 style="color: #2a5c3d;">Skylinks Website Contact from ${firstName} ${lastName}</h2>
                    <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
                    <p><strong>Topic:</strong> ${topic}</p>
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
        
        console.log('Contact form email sent:', info.messageId);
        
        res.json({ 
            success: true, 
            message: 'Contact form submitted successfully',
            messageId: info.messageId
        });
        
    } catch (error) {
        console.error('Error sending contact form email:', error);
        res.status(500).json({ 
            error: 'Failed to send message. Please try again later.',
            details: error.message 
        });
    }
});

module.exports = router;