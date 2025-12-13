// public/js/product.js
(function () {
    'use strict';

    const PRODUCTS = {
        'new-membership': {
            id: 'new-membership',
            name: 'New Membership',
            price: 109.00,
            image: 'https://images.squarespace-cdn.com/content/v1/678d4161123ed24a1ff89f0e/1737310564165-5B2JME2T5UIES3LHANX0/P1099387.jpg?format=1500w',
            type: 'membership',
            useAutocomplete: false 
        },
        'membership-renewal': {
            id: 'membership-renewal',
            name: 'Membership Renewal',
            price: 89.00,
            image: 'https://images.squarespace-cdn.com/content/v1/678d4161123ed24a1ff89f0e/1737310564180-A6BUTVFM57WRUBYJ8836/P1099410.JPG?format=1500w',
            type: 'membership',
            useAutocomplete: true  
        },
        'monthly-tournament': {
            id: 'monthly-tournament',
            name: 'Monthly Tournament',
            basePrice: 90.00,
            image: 'https://images.squarespace-cdn.com/content/v1/678d4161123ed24a1ff89f0e/1763488227617-G6Z4R2ORK7FEL2NJVU7H/202512Thumbnail.jpg?format=1500w',
            type: 'tournament',
            sidePotsPrice: 25.00,
            roulettePrice: 30.00,
            useAutocomplete: true 
        }
    };

    let currentProduct;
    let modalState = {
        isTournament: false,
        step: 1
    };
    
    let isInitialized = false;
    let eventListenersBound = false;

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
        
        // Check each word contains only letters, hyphens, or apostrophes
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
        const backdrop = document.getElementById('member-modal-backdrop');
        if (!backdrop) {
            console.error('Modal backdrop not found');
            return;
        }
        
        backdrop.classList.add('active');
        backdrop.setAttribute('aria-hidden', 'false');
        
        // Reset modal state
        modalState.step = 1;
        modalState.isTournament = (currentProduct.type === 'tournament');
        
        // Set up appropriate step visibility
        if (modalState.isTournament) {
            const step1 = document.getElementById('step1-content');
            const step2 = document.getElementById('step2-content');
            if (step1 && step2) {
                step1.style.display = 'block';
                step2.style.display = 'none';
            }
        }
        
        // Clear all inputs
        const inputs = backdrop.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            if (input.type === 'checkbox') {
                input.checked = false;
            } else if (input.type === 'select-one') {
                input.selectedIndex = 0;
            } else {
                input.value = '';
            }
        });

        // Initialize autocomplete if needed
        if (currentProduct.useAutocomplete) {
            setTimeout(() => {
                if (typeof initMemberAutocomplete === 'function') {
                    initMemberAutocomplete();
                }
            }, 100);
        }

        // Focus first input
        setTimeout(() => {
            const firstInput = backdrop.querySelector('input');
            if (firstInput) firstInput.focus();
        }, 150);
    }

    function closeModal() {
        const backdrop = document.getElementById('member-modal-backdrop');
        if (!backdrop) return;
        
        backdrop.classList.remove('active');
        backdrop.setAttribute('aria-hidden', 'true');
        modalState.step = 1;
    }

    function goToStep2() {
        if (!validateStep1()) return;
        
        modalState.step = 2;
        const step1 = document.getElementById('step1-content');
        const step2 = document.getElementById('step2-content');
        if (step1 && step2) {
            step1.style.display = 'none';
            step2.style.display = 'block';
            
            // Focus first input in step 2
            setTimeout(() => {
                const firstInput = step2.querySelector('input');
                if (firstInput) firstInput.focus();
            }, 100);
        }
    }

    function goToStep1() {
        modalState.step = 1;
        const step1 = document.getElementById('step1-content');
        const step2 = document.getElementById('step2-content');
        if (step1 && step2) {
            step2.style.display = 'none';
            step1.style.display = 'block';
            
            // Focus first input in step 1
            setTimeout(() => {
                const firstInput = step1.querySelector('input');
                if (firstInput) firstInput.focus();
            }, 100);
        }
    }

    function validateStep1() {
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

    function validateStep2() {
        const startingTimeSelect = document.getElementById('starting-time');
        
        // Starting time validation
        if (!startingTimeSelect || !startingTimeSelect.value) {
            alert('Please select a requested starting time.');
            startingTimeSelect?.focus();
            return false;
        }

        // Validate additional players if they have any data
        for (let i = 2; i <= 4; i++) {
            const nameInput = document.getElementById(`modal-name${i}`);
            const emailInput = document.getElementById(`modal-email${i}`);
            const ghinInput = document.getElementById(`modal-ghin${i}`);
            
            // If name has value, validate the full set
            if (nameInput && nameInput.value.trim()) {
                const nameValidation = validateName(nameInput.value);
                if (!nameValidation.valid) {
                    alert(`Player ${i}: ${nameValidation.message}`);
                    nameInput.focus();
                    return false;
                }
                
                // Validate email if provided
                if (emailInput && emailInput.value.trim()) {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(emailInput.value.trim())) {
                        alert(`Player ${i}: Please provide a valid email address.`);
                        emailInput.focus();
                        return false;
                    }
                }
                
                // Validate GHIN if provided
                if (ghinInput && ghinInput.value.trim()) {
                    const ghinValidation = validateGHIN(ghinInput.value);
                    if (!ghinValidation.valid) {
                        alert(`Player ${i}: ${ghinValidation.message}`);
                        ghinInput.focus();
                        return false;
                    }
                    ghinInput.value = ghinValidation.cleanValue;
                }
            }
        }

        return true;
    }

    function buildCartItem() {
        const nameInput = document.getElementById('modal-name');
        const emailInput = document.getElementById('modal-email');
        const phoneInput = document.getElementById('modal-phone');
        const ghinInput = document.getElementById('modal-ghin');
        
        // Format name properly
        let formattedName = nameInput.value.trim();
        formattedName = formattedName
            .split(/\s+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');

        // Calculate total price
        let totalPrice = currentProduct.price || currentProduct.basePrice;
        let formData = {
            name: formattedName,
            email: emailInput ? emailInput.value.trim() : '',
            phone: phoneInput ? phoneInput.value.trim() : '',
            ghin: ghinInput ? ghinInput.value.trim() : ''
        };
        
        // Tournament-specific data
        if (currentProduct.type === 'tournament') {
            const sidePotsCheckbox = document.getElementById('side-pots');
            const rouletteCheckbox = document.getElementById('roulette');
            const startingTimeSelect = document.getElementById('starting-time');
            
            formData.sidePots = sidePotsCheckbox ? sidePotsCheckbox.checked : false;
            formData.roulette = rouletteCheckbox ? rouletteCheckbox.checked : false;
            formData.startingTime = startingTimeSelect ? startingTimeSelect.value : '';
            
            // Calculate add-ons
            let addons = [];
            let addonsTotal = 0;
            
            if (formData.sidePots) {
                addons.push({ name: 'Side Pots', price: currentProduct.sidePotsPrice });
                addonsTotal += currentProduct.sidePotsPrice;
            }
            
            if (formData.roulette) {
                addons.push({ name: 'Roulette', price: currentProduct.roulettePrice });
                addonsTotal += currentProduct.roulettePrice;
            }
            
            formData.addons = addons;
            formData.addonsTotal = addonsTotal;
            totalPrice += addonsTotal;
            
            // Additional players
            const additionalPlayers = [];
            for (let i = 2; i <= 4; i++) {
                const playerNameInput = document.getElementById(`modal-name${i}`);
                const playerEmailInput = document.getElementById(`modal-email${i}`);
                const playerPhoneInput = document.getElementById(`modal-phone${i}`);
                const playerGhinInput = document.getElementById(`modal-ghin${i}`);
                
                if (playerNameInput && playerNameInput.value.trim()) {
                    // Format player name properly
                    let playerFormattedName = playerNameInput.value.trim();
                    playerFormattedName = playerFormattedName
                        .split(/\s+/)
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ');
                    
                    additionalPlayers.push({
                        name: playerFormattedName,
                        email: playerEmailInput ? playerEmailInput.value.trim() : '',
                        phone: playerPhoneInput ? playerPhoneInput.value.trim() : '',
                        ghin: playerGhinInput ? playerGhinInput.value.trim() : ''
                    });
                }
            }
            formData.additionalPlayers = additionalPlayers;
        }

        // IMPORTANT FIX: Generate a unique cart item ID here
        const cartItemId = "cart_item_" + Math.random().toString(36).substr(2, 9);

        return {
            id: cartItemId, // Use unique cart item ID, NOT product type ID
            productId: currentProduct.id, // Store product type ID separately
            name: currentProduct.name,
            price: totalPrice,
            basePrice: currentProduct.basePrice || currentProduct.price,
            image: currentProduct.image,
            type: currentProduct.type,
            quantity: 1,
            form: formData
        };
    }

    function showAddToCartFeedback() {
        const openBtn = document.getElementById('open-member-modal');
        if (!openBtn) return;

        const addText = openBtn.querySelector('.add-to-cart-text');
        const addedText = openBtn.querySelector('.cart-added-text');

        if (addText && addedText) {
            addText.style.display = 'none';
            addedText.style.display = 'inline';

            setTimeout(() => {
                addedText.style.display = 'none';
                addText.style.display = 'inline';
            }, 1300);
        }
    }

    function handleNext() {
        if (!validateStep1()) return;
        goToStep2();
    }

    function handleSave() {
        console.log('handleSave called, validating form...');
        
        if (currentProduct.type === 'tournament' && modalState.step === 2) {
            if (!validateStep2()) return;
        } else {
            if (!validateStep1()) return;
        }

        const item = buildCartItem();
        console.log('Adding item to cart:', item);

        if (typeof addToCart === 'function') {
            addToCart(item);
            showAddToCartFeedback();
        }

        closeModal();
    }

    function bindModalEvents() {
        // Prevent double-binding of event listeners
        if (eventListenersBound) {
            console.log('Event listeners already bound, skipping...');
            return;
        }

        console.log('Binding modal events...');
        
        // Get all modal elements
        const openBtn = document.getElementById('open-member-modal');
        const backdrop = document.getElementById('member-modal-backdrop');
        const cancelBtn = document.getElementById('member-modal-cancel');
        const cancelBtn2 = document.getElementById('member-modal-cancel2');
        const saveBtn = document.getElementById('member-modal-save');
        const nextBtn = document.getElementById('member-modal-next');
        const backBtn = document.getElementById('member-modal-back');

        // Use event delegation for the open button to prevent multiple bindings
        if (openBtn) {
            // Clone and replace to remove any existing event listeners
            const newOpenBtn = openBtn.cloneNode(true);
            openBtn.parentNode.replaceChild(newOpenBtn, openBtn);
            
            // Add single event listener to the new button
            newOpenBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Open modal clicked');
                openModal();
            }, { once: false });
        }

        // Cancel buttons - use event delegation
        if (cancelBtn) {
            const newCancelBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
            
            newCancelBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                closeModal();
            });
        }

        if (cancelBtn2) {
            const newCancelBtn2 = cancelBtn2.cloneNode(true);
            cancelBtn2.parentNode.replaceChild(newCancelBtn2, cancelBtn2);
            
            newCancelBtn2.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                closeModal();
            });
        }

        // Navigation buttons (for tournament modal)
        if (nextBtn) {
            const newNextBtn = nextBtn.cloneNode(true);
            nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
            
            newNextBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                handleNext();
            });
        }

        if (backBtn) {
            const newBackBtn = backBtn.cloneNode(true);
            backBtn.parentNode.replaceChild(newBackBtn, backBtn);
            
            newBackBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                goToStep1();
            });
        }

        // Save/Add to Cart button - CRITICAL FIX: Use clone to remove existing listeners
        if (saveBtn) {
            // Clone and replace to remove any existing event listeners
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            
            // Add single event listener with once: true to ensure it only fires once per click
            newSaveBtn.addEventListener('click', function handleSaveClick(e) {
                e.preventDefault();
                e.stopImmediatePropagation(); // Prevent any other handlers
                console.log('Save button clicked - adding to cart');
                handleSave();
                
                // Optional: temporarily disable button to prevent double clicks
                this.disabled = true;
                setTimeout(() => {
                    this.disabled = false;
                }, 1000);
            }, { once: false });
        }

        // Add real-time formatting and validation
        setupFormInputs();
        
        eventListenersBound = true;
        console.log('Event listeners bound successfully');
    }

    function setupFormInputs() {
        // Setup for all potential form inputs
        for (let i = 1; i <= 4; i++) {
            const inputId = i === 1 ? 'modal-name' : `modal-name${i}`;
            const nameInput = document.getElementById(inputId);
            
            if (nameInput) {
                // Clone and replace to remove existing listeners
                const newNameInput = nameInput.cloneNode(true);
                nameInput.parentNode.replaceChild(newNameInput, nameInput);
                
                // Prevent numbers in name
                newNameInput.addEventListener('input', function(e) {
                    if (/\d/.test(e.data)) {
                        this.value = this.value.replace(/\d/g, '');
                    }
                });
                
                // Auto-capitalize on blur
                newNameInput.addEventListener('blur', function() {
                    const trimmedValue = this.value.trim();
                    if (trimmedValue) {
                        this.value = trimmedValue
                            .split(/\s+/)
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(' ');
                    }
                });
            }

            // Phone formatting
            const phoneId = i === 1 ? 'modal-phone' : `modal-phone${i}`;
            const phoneInput = document.getElementById(phoneId);
            if (phoneInput) {
                const newPhoneInput = phoneInput.cloneNode(true);
                phoneInput.parentNode.replaceChild(newPhoneInput, phoneInput);
                
                newPhoneInput.addEventListener('input', function(e) {
                    const cursorPosition = this.selectionStart;
                    const originalLength = this.value.length;
                    
                    this.value = formatPhoneNumber(this.value);
                    
                    const newLength = this.value.length;
                    const lengthDifference = newLength - originalLength;
                    const newCursorPosition = cursorPosition + lengthDifference;
                    
                    this.setSelectionRange(newCursorPosition, newCursorPosition);
                });
                
                newPhoneInput.addEventListener('keydown', function(e) {
                    if ([8, 9, 13, 37, 38, 39, 40, 46].includes(e.keyCode)) return;
                    if (!/\d/.test(e.key)) e.preventDefault();
                });
            }

            // GHIN validation
            const ghinId = i === 1 ? 'modal-ghin' : `modal-ghin${i}`;
            const ghinInput = document.getElementById(ghinId);
            if (ghinInput) {
                const newGhinInput = ghinInput.cloneNode(true);
                ghinInput.parentNode.replaceChild(newGhinInput, ghinInput);
                
                newGhinInput.addEventListener('input', function(e) {
                    this.value = this.value.replace(/\D/g, '');
                    if (this.value.length > 8) {
                        this.value = this.value.slice(0, 8);
                    }
                });
                
                newGhinInput.addEventListener('keydown', function(e) {
                    if ([8, 9, 13, 37, 38, 39, 40, 46].includes(e.keyCode)) return;
                    if (!/\d/.test(e.key)) e.preventDefault();
                });
            }
        }
    }

    function initProductModal() {
        if (isInitialized) {
            console.log('Product modal already initialized, skipping...');
            return;
        }

        currentProduct = getCurrentProduct();
        console.log('Initializing product modal for:', currentProduct.id);

        // Wait for DOM to be ready and modal to be loaded
        setTimeout(() => {
            try {
                bindModalEvents();
                isInitialized = true;
                console.log('Product modal initialized successfully');
            } catch (error) {
                console.error('Error initializing product modal:', error);
            }
        }, 500);
    }

    // Initialize when DOM is ready - only once
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function initializeOnce() {
            // Remove the event listener so it doesn't fire again
            document.removeEventListener('DOMContentLoaded', initializeOnce);
            initProductModal();
        });
    } else {
        // If DOM is already loaded, initialize immediately
        initProductModal();
    }

    // Also re-initialize when modal is loaded dynamically - but only if not already initialized
    window.ProductModal = {
        init: function() {
            console.log('ProductModal.init called externally');
            if (!isInitialized) {
                initProductModal();
            }
        },
        getCurrentProduct: getCurrentProduct,
        isInitialized: function() { return isInitialized; }
    };

})();