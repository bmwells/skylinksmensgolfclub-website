// public/js/contact.js
document.addEventListener('DOMContentLoaded', function() {
    // Try to find contact form in multiple locations
    const contactForm = document.querySelector('.contact-page-form form') || 
                       document.querySelector('.contact-section form');
    
    if (!contactForm) return;
    
    contactForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Get form data
        const firstName = document.getElementById('first-name').value.trim();
        const lastName = document.getElementById('last-name').value.trim();
        const email = document.getElementById('email').value.trim();
        const topic = document.getElementById('topic').value;
        const message = document.getElementById('message').value.trim();
        
        // Basic validation
        if (!firstName || !lastName || !email || !message) {
            alert('Please fill in all required fields.');
            return;
        }
        
        if (!isValidEmail(email)) {
            alert('Please enter a valid email address.');
            return;
        }
        
        // Disable submit button and show loading state
        const submitBtn = contactForm.querySelector('.submit-btn');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
        
        try {
            // Send to your API endpoint
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    firstName,
                    lastName,
                    email,
                    topic,
                    message
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                // Success
                alert('Thank you for your message! We will get back to you shortly.');
                contactForm.reset();
            } else {
                // Error from server
                alert(`Error: ${result.error || 'Failed to send message. Please try again.'}`);
            }
        } catch (error) {
            // Network error
            console.error('Contact form error:', error);
            alert('Network error. Please check your connection and try again.');
        } finally {
            // Re-enable button
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
    
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
});