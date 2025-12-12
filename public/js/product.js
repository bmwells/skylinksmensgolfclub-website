// public/js/product.js
(function () {
    'use strict';

    const PRODUCTS = {
        'new-membership': {
            id: 'new-membership',
            name: 'New Membership',
            price: 109.00,
            image: 'https://images.squarespace-cdn.com/content/v1/678d4161123ed24a1ff89f0e/1737310564165-5B2JME2T5UIES3LHANX0/P1099387.jpg?format=1500w',
        },
        'membership-renewal': {
            id: 'membership-renewal',
            name: 'Membership Renewal',
            price: 89.00,
            image: 'https://images.squarespace-cdn.com/content/v1/678d4161123ed24a1ff89f0e/1737310564180-A6BUTVFM57WRUBYJ8836/P1099410.JPG?format=1500w',
        }
    };

    let currentProduct;
    let openBtn, backdrop, cancelBtn, saveBtn;
    let isInitialized = false;

    function getCurrentProduct() {
        const body = document.body;
        const productId = body.getAttribute('data-product-id');

        if (productId && PRODUCTS[productId]) {
            return PRODUCTS[productId];
        }

        const pageTitle = document.title.toLowerCase();
        if (pageTitle.includes('renewal')) {
            return PRODUCTS['membership-renewal'];
        }

        const productTitle = document.querySelector('.product-title');
        if (productTitle) {
            const titleText = productTitle.textContent.toLowerCase();
            if (titleText.includes('renewal')) {
                return PRODUCTS['membership-renewal'];
            }
        }

        return PRODUCTS['new-membership'];
    }

    function getModalElements() {
        return {
            openBtn: document.getElementById('open-member-modal'),
            backdrop: document.getElementById('member-modal-backdrop'),
            cancelBtn: document.getElementById('member-modal-cancel'),
            saveBtn: document.getElementById('member-modal-save')
        };
    }

    // Name validation: only letters and spaces, exactly two words
    function validateName(name) {
        const trimmedName = name.trim();
        
        // Check for exactly two words
        const words = trimmedName.split(/\s+/).filter(word => word.length > 0);
        if (words.length !== 2) {
            return {
                valid: false,
                message: 'Please enter exactly two words (first and last name)'
            };
        }
        
        // Check each word contains only letters, hyphens, or apostrophes (for names like O'Brien or Mary-Jane)
        const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ'\-]+$/;
        for (const word of words) {
            if (!nameRegex.test(word)) {
                return {
                    valid: false,
                    message: 'Name can only contain letters, hyphens, or apostrophes. No numbers or special characters.'
                };
            }
        }
        
        // Check for reasonable name lengths
        if (words[0].length < 2 || words[1].length < 2) {
            return {
                valid: false,
                message: 'Both first and last name should be at least 2 characters long'
            };
        }
        
        if (words[0].length > 30 || words[1].length > 30) {
            return {
                valid: false,
                message: 'Name parts are too long'
            };
        }
        
        return { valid: true };
    }

    // Phone number formatting function
    function formatPhoneNumber(value) {
        // Remove all non-numeric characters
        const numbers = value.replace(/\D/g, '');
        
        if (numbers.length === 0) return '';
        
        if (numbers.length <= 3) {
            return `(${numbers}`;
        }
        
        if (numbers.length <= 6) {
            return `(${numbers.slice(0, 3)}) ${numbers.slice(3)}`;
        }
        
        return `(${numbers.slice(0, 3)}) ${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
    }

    // GHIN validation: only numbers, max 8 digits
    function validateGHIN(ghin) {
        if (!ghin.trim()) {
            return {
                valid: false,
                message: 'GHIN number is required'
            };
        }
        
        // Remove any non-numeric characters
        const cleanGHIN = ghin.replace(/\D/g, '');
        
        if (cleanGHIN.length === 0) {
            return {
                valid: false,
                message: 'GHIN must contain only numbers'
            };
        }
        
        if (cleanGHIN.length > 8) {
            return {
                valid: false,
                message: 'GHIN cannot exceed 8 digits'
            };
        }
        
        return { valid: true, cleanValue: cleanGHIN };
    }

    function openModal() {
        if (!backdrop) return;
        backdrop.classList.add('active');
        backdrop.setAttribute('aria-hidden', 'false');

        // Clear inputs
        const inputs = backdrop.querySelectorAll('input, textarea');
        inputs.forEach(input => input.value = '');

        // Initialize global autocomplete
        setTimeout(() => {
            if (typeof initMemberAutocomplete === 'function') {
                initMemberAutocomplete();
            }
        }, 100);

        const firstInput = backdrop.querySelector('input');
        if (firstInput) setTimeout(() => firstInput.focus(), 100);
    }

    function closeModal() {
        if (!backdrop) return;
        backdrop.classList.remove('active');
        backdrop.setAttribute('aria-hidden', 'true');
    }

    function getQuantity() {
        return 1;
    }

    function validateForm() {
        const nameInput = document.getElementById('modal-name');
        const emailInput = document.getElementById('modal-email');
        const ghinInput = document.getElementById('modal-ghin');

        // Name validation
        if (!nameInput || !nameInput.value.trim()) {
            alert('Please provide your full name.');
            nameInput?.focus();
            return false;
        }

        const nameValidation = validateName(nameInput.value);
        if (!nameValidation.valid) {
            alert(nameValidation.message);
            nameInput.focus();
            nameInput.select();
            return false;
        }

        // Email validation
        if (!emailInput || !emailInput.value.trim()) {
            alert('Please provide your email address.');
            emailInput?.focus();
            return false;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailInput.value.trim())) {
            alert('Please provide a valid email address.');
            emailInput.focus();
            emailInput.select();
            return false;
        }

        // GHIN validation
        if (!ghinInput) {
            alert('GHIN field not found.');
            return false;
        }

        const ghinValidation = validateGHIN(ghinInput.value);
        if (!ghinValidation.valid) {
            alert(ghinValidation.message);
            ghinInput.focus();
            ghinInput.select();
            return false;
        }

        // Update GHIN field with clean value
        ghinInput.value = ghinValidation.cleanValue;

        return true;
    }

    function buildCartItem() {
        const nameInput = document.getElementById('modal-name');
        const emailInput = document.getElementById('modal-email');
        const phoneInput = document.getElementById('modal-phone');
        const ghinInput = document.getElementById('modal-ghin');

        // Format name properly (capitalize first letter of each word)
        let formattedName = nameInput.value.trim();
        formattedName = formattedName
            .split(/\s+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');

        return {
            name: currentProduct.name,
            price: currentProduct.price,
            image: currentProduct.image,
            quantity: getQuantity(),
            form: {
                name: formattedName,
                email: emailInput ? emailInput.value.trim() : '',
                phone: phoneInput ? phoneInput.value.trim() : '',
                ghin: ghinInput ? ghinInput.value.trim() : '',
            }
        };
    }

    function showAddToCartFeedback() {
        if (!openBtn) return;

        const addText = openBtn.querySelector('.add-to-cart-text');
        const addedText = openBtn.querySelector('.cart-added-text');

        addText.style.display = 'none';
        addedText.style.display = 'inline';

        setTimeout(() => {
            addedText.style.display = 'none';
            addText.style.display = 'inline';
        }, 1300);
    }

    function handleSave() {
        if (!validateForm()) return;

        const item = buildCartItem();

        if (typeof addToCart === 'function') {
            addToCart(item);
            showAddToCartFeedback();
        }

        closeModal();
    }

    function bindEvents() {
        const elements = getModalElements();
        openBtn = elements.openBtn;
        backdrop = elements.backdrop;
        cancelBtn = elements.cancelBtn;
        saveBtn = elements.saveBtn;

        if (openBtn) {
            openBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openModal();
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                closeModal();
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                handleSave();
            });
        }

        // Add real-time validation for name field
        const nameInput = document.getElementById('modal-name');
        if (nameInput) {
            nameInput.addEventListener('input', function(e) {
                // Prevent numbers from being typed
                if (/\d/.test(e.data)) {
                    this.value = this.value.replace(/\d/g, '');
                }
            });
            
            nameInput.addEventListener('blur', function() {
                const trimmedValue = this.value.trim();
                if (trimmedValue) {
                    // Auto-capitalize first letter of each word
                    this.value = trimmedValue
                        .split(/\s+/)
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ');
                }
            });
        }

        // Add real-time formatting for phone field
        const phoneInput = document.getElementById('modal-phone');
        if (phoneInput) {
            phoneInput.addEventListener('input', function(e) {
                const cursorPosition = this.selectionStart;
                const originalLength = this.value.length;
                
                // Format the phone number
                this.value = formatPhoneNumber(this.value);
                
                // Adjust cursor position
                const newLength = this.value.length;
                const lengthDifference = newLength - originalLength;
                const newCursorPosition = cursorPosition + lengthDifference;
                
                this.setSelectionRange(newCursorPosition, newCursorPosition);
            });
            
            // Only allow numbers and parentheses/dash (for backspace/delete)
            phoneInput.addEventListener('keydown', function(e) {
                // Allow navigation keys, delete, backspace, tab
                if ([8, 9, 13, 37, 38, 39, 40, 46].includes(e.keyCode)) {
                    return;
                }
                
                // Allow numbers only
                if (!/\d/.test(e.key)) {
                    e.preventDefault();
                }
            });
        }

        // Add real-time validation for GHIN field
        const ghinInput = document.getElementById('modal-ghin');
        if (ghinInput) {
            ghinInput.addEventListener('input', function(e) {
                // Remove non-numeric characters
                this.value = this.value.replace(/\D/g, '');
                
                // Limit to 8 digits
                if (this.value.length > 8) {
                    this.value = this.value.slice(0, 8);
                }
            });
            
            // Only allow numbers
            ghinInput.addEventListener('keydown', function(e) {
                // Allow navigation keys, delete, backspace, tab
                if ([8, 9, 13, 37, 38, 39, 40, 46].includes(e.keyCode)) {
                    return;
                }
                
                // Allow numbers only
                if (!/\d/.test(e.key)) {
                    e.preventDefault();
                }
            });
        }
    }

    function initProductModal() {
        if (isInitialized) return;

        currentProduct = getCurrentProduct();

        setTimeout(() => {
            bindEvents();
            isInitialized = true;
            console.log("Product modal initialized.");
        }, 50);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProductModal);
    } else {
        initProductModal();
    }

})();