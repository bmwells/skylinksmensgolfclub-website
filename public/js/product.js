// public/js/product.js
(function () {
    'use strict';

    // Base product definitions
    const PRODUCTS = {
        'new-membership': {
            id: 'new-membership',
            name: 'New Membership',
            price: 109.00,
            type: 'membership',
            useAutocomplete: false,
            imageKey: 'new-membership'
        },
        'membership-renewal': {
            id: 'membership-renewal',
            name: 'Membership Renewal',
            price: 89.00,
            type: 'membership',
            useAutocomplete: true,
            imageKey: 'membership-renewal'
        }
        // Tournament products are now dynamic
    };

    let currentProduct;
    let modalState = {
        isTournament: false,
        step: 1
    };
    
    let isInitialized = false;
    let eventListenersBound = false;
    let tournamentData = null;
    let imageManagerImages = null;

    // Function to fetch images from Image Manager API
    async function fetchImagesFromImageManager() {
        try {
            const response = await fetch('/api/images');
            
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('text/html')) {
                console.warn('Images API returned HTML, no images available');
                return null;
            }
            
            const images = await response.json();
            if (images && Array.isArray(images)) {
                return images;
            }
            return null;
        } catch (error) {
            console.error('Error loading images from Image Manager:', error);
            return null;
        }
    }

    // Get image URL from Image Manager data
    function getImageForProduct(product) {
        // If tournament has its own imageUrl, use that first
        if (product.type === 'tournament' && product.imageUrl) {
            return product.imageUrl;
        }
        
        // Fallback to image manager for other products
        if (!imageManagerImages || !Array.isArray(imageManagerImages)) {
            console.warn('No images available from Image Manager');
            return '';
        }
        
        const imageData = imageManagerImages.find(img => img.id === product.imageKey);
        if (imageData && imageData.imageUrl) {
            return imageData.imageUrl;
        }
        
        console.warn(`No image found for product key: ${product.imageKey}`);
        return '';
    }

    // Update product images on the page
    function updateProductImages() {
        if (!imageManagerImages) return;
        
        // Update images on the current product page
        const productImage = document.querySelector('.product-image');
        if (productImage && currentProduct) {
            const imageUrl = getImageForProduct(currentProduct);
            if (imageUrl) {
                productImage.src = imageUrl;
            }
        }
        
        // Update product image references
        Object.values(PRODUCTS).forEach(product => {
            product.image = getImageForProduct(product);
        });
    }

    // Load images when module initializes
    async function loadImages() {
        imageManagerImages = await fetchImagesFromImageManager();
        updateProductImages();
    }

    function getCurrentProduct() {
        const body = document.body;
        const productType = body.getAttribute('data-product-type');
        
        if (productType === 'tournament') {
            // This is a dynamic tournament page
            return {
                id: window.tournamentData?.id || 'tournament',
                name: window.tournamentData?.title || 'Tournament',
                type: 'tournament',
                useAutocomplete: true,
                // Use tournament's imageUrl directly
                imageUrl: window.tournamentData?.imageUrl || '',
                imageKey: 'tournament-entry' // Keep for fallback
            };
        }
        
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

    // Enhanced validation for tournament Player 1
    function validateTournamentPlayer1() {
        if (!modalState.isTournament) return { valid: true };

        // Check if member autocomplete is initialized and has a valid member
        if (window.MemberAutocompleteInstance && 
            window.MemberAutocompleteInstance.isPlayer1MemberValid) {
            const isValidMember = window.MemberAutocompleteInstance.isPlayer1MemberValid();
            if (!isValidMember) {
                return {
                    valid: false,
                    message: 'You must select a member from the list. Player 1 must be a verified member.'
                };
            }
        }

        const nameInput = document.getElementById('modal-name');
        const emailInput = document.getElementById('modal-email');
        const phoneInput = document.getElementById('modal-phone');
        const ghinInput = document.getElementById('modal-ghin');

        // Check all required fields are filled
        if (!nameInput || !nameInput.value.trim()) {
            return {
                valid: false,
                message: 'Please select a member from the list.'
            };
        }

        if (!emailInput || !emailInput.value.trim()) {
            return {
                valid: false,
                message: 'Email is required for tournament registration.'
            };
        }

        if (!phoneInput || !phoneInput.value.trim()) {
            return {
                valid: false,
                message: 'Phone number is required for tournament registration.'
            };
        }

        if (!ghinInput || !ghinInput.value.trim()) {
            return {
                valid: false,
                message: 'GHIN number is required for tournament registration.'
            };
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailInput.value.trim())) {
            return {
                valid: false,
                message: 'Please provide a valid email address.'
            };
        }

        // Validate phone has at least 10 digits
        const phoneDigits = phoneInput.value.replace(/\D/g, '');
        if (phoneDigits.length < 10) {
            return {
                valid: false,
                message: 'Please provide a valid 10-digit phone number.'
            };
        }

        // Validate GHIN is 1-8 digits
        const ghinDigits = ghinInput.value.replace(/\D/g, '');
        if (ghinDigits.length === 0 || ghinDigits.length > 8) {
            return {
                valid: false,
                message: 'GHIN must be 1-8 digits.'
            };
        }

        return { valid: true };
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
            
            // Disable Next button initially for tournament modal
            const nextButton = document.getElementById('member-modal-next');
            if (nextButton) {
                nextButton.disabled = true;
                nextButton.style.opacity = '0.6';
                nextButton.style.cursor = 'not-allowed';
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
                // Reset border colors
                input.style.borderColor = '#ddd';
            }
        });

        // Clear error messages
        const errors = backdrop.querySelectorAll('.member-error, .field-error, .member-verification');
        errors.forEach(error => {
            error.style.display = 'none';
        });

        // Update price displays in modal if tournament data is available
        if (modalState.isTournament && tournamentData) {
            updateModalPrices();
            // Show/hide options based on tournament data
            updateModalBasedOnTournament();
        }

        // Initialize autocomplete if needed
        if (currentProduct.useAutocomplete) {
            setTimeout(() => {
                if (typeof initMemberAutocomplete === 'function') {
                    initMemberAutocomplete();
                }
            }, 100);
        }

        // Setup tooltips when modal opens
        setTimeout(() => {
            if (typeof setupTooltips === 'function') {
                setupTooltips();
                console.log('Tooltips setup in openModal');
            }
        }, 100);

        // Focus first input
        setTimeout(() => {
            const firstInput = backdrop.querySelector('input');
            if (firstInput) firstInput.focus();
        }, 150);
    }

    // NEW FUNCTION: Update modal display based on tournament options
    function updateModalBasedOnTournament() {
        if (!tournamentData) return;
        
        // Show/hide cart option dropdown based on tournament data
        const cartOptionContainer = document.getElementById('cart-option-container');
        const cartOptionSelect = document.getElementById('cart-option');
        
        if (cartOptionContainer && cartOptionSelect) {
            if (tournamentData.cartOption === true) {
                cartOptionContainer.style.display = 'block';
                cartOptionSelect.required = true;
            } else {
                cartOptionContainer.style.display = 'none';
                cartOptionSelect.required = false;
            }
        }
        
        // Show/hide addon options container based on tournament options
        const addonContainer = document.getElementById('addon-options-container');
        if (addonContainer) {
            const hasSidePotOption = tournamentData.sidePotOption !== false; // Default to true if not set
            const hasRouletteOption = tournamentData.rouletteOption !== false; // Default to true if not set
            
            if (hasSidePotOption || hasRouletteOption) {
                addonContainer.style.display = 'block';
                
                // Show/hide individual options
                const sidePotContainer = document.getElementById('side-pot-option-container');
                const rouletteContainer = document.getElementById('roulette-option-container');
                
                if (sidePotContainer) {
                    sidePotContainer.style.display = hasSidePotOption ? 'flex' : 'none';
                }
                if (rouletteContainer) {
                    rouletteContainer.style.display = hasRouletteOption ? 'flex' : 'none';
                }
            } else {
                addonContainer.style.display = 'none';
            }
        }
    }

    function updateModalPrices() {
        // Update price displays in modal with dynamic data
        const roulettePriceEl = document.getElementById('roulette-price');
        const sidePotPriceEl = document.getElementById('side-pot-price');
        const rouletteCheckbox = document.getElementById('roulette');
        const sidePotsCheckbox = document.getElementById('side-pots');
        
        if (tournamentData) {
            const roulettePrice = parseFloat(tournamentData.roulette) || 30;
            const sidePotPrice = parseFloat(tournamentData.sidePot) || 25;
            
            if (roulettePriceEl) {
                roulettePriceEl.textContent = '$' + roulettePrice.toFixed(2);
            }
            if (sidePotPriceEl) {
                sidePotPriceEl.textContent = '$' + sidePotPrice.toFixed(2);
            }
            if (rouletteCheckbox) {
                rouletteCheckbox.value = roulettePrice;
            }
            if (sidePotsCheckbox) {
                sidePotsCheckbox.value = sidePotPrice;
            }
        }
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
        // For tournament modal, use the enhanced validation
        if (modalState.isTournament) {
            const validation = validateTournamentPlayer1();
            if (!validation.valid) {
                alert(validation.message);
                
                // Focus on the first invalid field
                const nameInput = document.getElementById('modal-name');
                if (nameInput && !nameInput.value.trim()) {
                    nameInput.focus();
                } else {
                    const emailInput = document.getElementById('modal-email');
                    const phoneInput = document.getElementById('modal-phone');
                    const ghinInput = document.getElementById('modal-ghin');
                    
                    if (emailInput && !emailInput.value.trim()) {
                        emailInput.focus();
                    } else if (phoneInput && !phoneInput.value.trim()) {
                        phoneInput.focus();
                    } else if (ghinInput && !ghinInput.value.trim()) {
                        ghinInput.focus();
                    }
                }
                return false;
            }
            return true;
        }

        // Original validation for non-tournament products
        const nameInput = document.getElementById('modal-name');
        const emailInput = document.getElementById('modal-email');
        const ghinInput = document.getElementById('modal-ghin');
        const cartOptionSelect = document.getElementById('cart-option');

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

        // Cart option validation if enabled
        if (tournamentData && tournamentData.cartOption === true) {
            if (!cartOptionSelect || !cartOptionSelect.value) {
                alert('Please select a cart option.');
                cartOptionSelect?.focus();
                return false;
            }
        }

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

    // Calculate total price based on product type
    let totalPrice;
    let basePrice;
    
    if (currentProduct.type === 'tournament') {
        // Tournament pricing
        totalPrice = tournamentData ? parseFloat(tournamentData.price) : 0;
        basePrice = tournamentData ? parseFloat(tournamentData.price) : 0;
    } else {
        // Membership pricing - use the product's price from PRODUCTS object
        totalPrice = currentProduct.price;
        basePrice = currentProduct.price;
    }
        
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
        const cartOptionSelect = document.getElementById('cart-option');
        
        // Only include side pots if option is enabled and checkbox exists
        if (sidePotsCheckbox && tournamentData && tournamentData.sidePotOption !== false) {
            formData.sidePots = sidePotsCheckbox.checked;
        } else {
            formData.sidePots = false;
        }
        
        // Only include roulette if option is enabled and checkbox exists
        if (rouletteCheckbox && tournamentData && tournamentData.rouletteOption !== false) {
            formData.roulette = rouletteCheckbox.checked;
        } else {
            formData.roulette = false;
        }
        
        formData.startingTime = startingTimeSelect ? startingTimeSelect.value : '';
        
        // Add cart option if enabled
        let cartOptionAddedPrice = 0;
        if (tournamentData && tournamentData.cartOption === true && cartOptionSelect) {
            formData.cartOption = cartOptionSelect.value;
            // Add $9 if cart option is "Cart"
            if (cartOptionSelect.value === 'Cart') {
                cartOptionAddedPrice = 9.00;
                formData.cartOptionAddedPrice = cartOptionAddedPrice;
            }
        }
        
        // Calculate add-ons with dynamic prices
        let addons = [];
        let addonsTotal = 0;
        
        // Get add-on prices from tournament data
        const sidePotPrice = tournamentData && tournamentData.sidePot ? 
            parseFloat(tournamentData.sidePot) : 25;
        const roulettePrice = tournamentData && tournamentData.roulette ? 
            parseFloat(tournamentData.roulette) : 30;
        
        // Only add side pots if option is enabled and selected
        if (tournamentData && tournamentData.sidePotOption !== false && formData.sidePots) {
            addons.push({ name: 'Side Pots', price: sidePotPrice });
            addonsTotal += sidePotPrice;
        }
        
        // Only add roulette if option is enabled and selected
        if (tournamentData && tournamentData.rouletteOption !== false && formData.roulette) {
            addons.push({ name: 'Roulette', price: roulettePrice });
            addonsTotal += roulettePrice;
        }
        
        formData.addons = addons;
        formData.addonsTotal = addonsTotal;
        totalPrice += addonsTotal + cartOptionAddedPrice;
        
        // Store tournament info
        formData.tournamentTitle = tournamentData ? tournamentData.title : currentProduct.name;
        formData.tournamentPrice = tournamentData ? tournamentData.price : 0;
        formData.cartOptionEnabled = tournamentData ? tournamentData.cartOption : false;
        formData.sidePotOptionEnabled = tournamentData ? (tournamentData.sidePotOption !== false) : false;
        formData.rouletteOptionEnabled = tournamentData ? (tournamentData.rouletteOption !== false) : false;
        
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

    // Generate a unique cart item ID
    const cartItemId = "cart_item_" + Math.random().toString(36).substr(2, 9);

    // Get image for product - use tournament's imageUrl if available
    const productImage = currentProduct.type === 'tournament' && tournamentData && tournamentData.imageUrl ? 
        tournamentData.imageUrl : getImageForProduct(currentProduct);

    return {
        id: cartItemId,
        productId: currentProduct.id,
        tournamentId: tournamentData ? tournamentData.id : null,
        name: tournamentData ? tournamentData.title : currentProduct.name,
        price: totalPrice, // Now correctly set for both memberships and tournaments
        basePrice: basePrice, // Store base price separately for calculations
        image: productImage,
        type: currentProduct.type,
        quantity: 1,
        form: formData,
        roulettePrice: currentProduct.type === 'tournament' ? 
            (tournamentData && tournamentData.roulette ? parseFloat(tournamentData.roulette) : 30) : null,
        sidePotPrice: currentProduct.type === 'tournament' ? 
            (tournamentData && tournamentData.sidePot ? parseFloat(tournamentData.sidePot) : 25) : null,
        cartOptionEnabled: currentProduct.type === 'tournament' && tournamentData ? 
            tournamentData.cartOption : false,
        sidePotOptionEnabled: currentProduct.type === 'tournament' && tournamentData ? 
            (tournamentData.sidePotOption !== false) : false,
        rouletteOptionEnabled: currentProduct.type === 'tournament' && tournamentData ? 
            (tournamentData.rouletteOption !== false) : false
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
            
            // Dispatch cart update event to update header count immediately
            document.dispatchEvent(new Event('cartUpdated'));
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

        // Save/Add to Cart button
        if (saveBtn) {
            // Clone and replace to remove any existing event listeners
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            
            // Add single event listener
            newSaveBtn.addEventListener('click', function handleSaveClick(e) {
                e.preventDefault();
                e.stopImmediatePropagation();
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
        // Setup tooltips AFTER all inputs have been set up
        if (typeof setupTooltips === 'function') {
            setupTooltips();
            console.log('Tooltips setup in setupFormInputs');
        }
    }

    function initProductModal() {
        if (isInitialized) {
            console.log('Product modal already initialized, skipping...');
            return;
        }

        currentProduct = getCurrentProduct();
        console.log('Initializing product modal for:', currentProduct.id);

        // Load images from Image Manager
        loadImages().then(() => {
            console.log('Images loaded from Image Manager');
            
            // Wait for DOM to be ready and modal to be loaded
            setTimeout(() => {
                try {
                    bindModalEvents();
                    
                    // Set up tooltips when modal is first loaded
                    setupTooltips();
                    
                    isInitialized = true;
                    console.log('Product modal initialized successfully');
                } catch (error) {
                    console.error('Error initializing product modal:', error);
                }
            }, 500);
        });
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

    // Store tooltip state globally
    let activeTooltip = null;
    let activeTooltipButton = null;

    // Add tooltip functionality to info icons
    function setupTooltips() {
        console.log('Setting up tooltips...');
        
        // Function to create and show tooltip
        function showTooltip(event, text) {
            const button = event.currentTarget;
            
            // If clicking the same button again, close the tooltip
            if (activeTooltipButton === button && activeTooltip) {
                activeTooltip.remove();
                activeTooltip = null;
                activeTooltipButton = null;
                return;
            }
            
            // Remove any existing tooltips
            const existingTooltips = document.querySelectorAll('.tooltip-popup');
            existingTooltips.forEach(tooltip => tooltip.remove());
            
            // Create new tooltip
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip-popup';
            tooltip.textContent = text;
            
            // Get the button that was clicked
            const rect = button.getBoundingClientRect(); // Viewport-relative position
            
            // Position tooltip relative to viewport (ignores scroll)
            // Place tooltip below the button
            const topPosition = rect.bottom + 10; // 10px below button (viewport coordinates)
            
            // Adjust horizontal positioning to center tooltip under button
            const tooltipWidth = 300; // max-width
            const buttonCenter = rect.left + (rect.width / 2);
            const adjustedLeft = Math.max(
                10, 
                Math.min(
                    buttonCenter - (tooltipWidth / 2), 
                    window.innerWidth - tooltipWidth - 10
                )
            );
            
            tooltip.style.top = `${topPosition}px`;
            tooltip.style.left = `${adjustedLeft}px`;
            
            document.body.appendChild(tooltip);
            
            // Store references to active tooltip
            activeTooltip = tooltip;
            activeTooltipButton = button;
            
            // Function to close tooltip
            function closeTooltip() {
                if (tooltip.parentNode) {
                    tooltip.remove();
                    activeTooltip = null;
                    activeTooltipButton = null;
                }
                // Remove event listeners
                document.removeEventListener('pointerdown', handleOutsideClick, true);
                document.removeEventListener('keydown', handleEscapeKey);
            }
            
            // Handle click outside
            function handleOutsideClick(e) {
                if (!tooltip.contains(e.target) && e.target !== button) {
                    closeTooltip();
                }
            }
            
            // Handle escape key
            function handleEscapeKey(e) {
                if (e.key === 'Escape') {
                    closeTooltip();
                }
            }
            
            // Add event listeners
            document.addEventListener('pointerdown', handleOutsideClick, true);
            document.addEventListener('keydown', handleEscapeKey);
            
            // Auto-close after 5 seconds
            setTimeout(closeTooltip, 5000);
            
            // Prevent the button click from closing the tooltip immediately
            event.stopPropagation();
        }
        
        // Add click handlers to all info icons in the document
        function attachTooltipListeners() {
            const infoIcons = document.querySelectorAll('.info-icon');
            console.log(`Found ${infoIcons.length} info icons to attach tooltips to`);
            
            infoIcons.forEach(icon => {
                // Remove any existing listeners first
                const newIcon = icon.cloneNode(true);
                icon.parentNode.replaceChild(newIcon, icon);
                
                // Add click listener
                newIcon.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const tooltipText = this.getAttribute('data-tooltip');
                    console.log('Info icon clicked, tooltip text:', tooltipText);
                    if (tooltipText) {
                        showTooltip(e, tooltipText);
                    }
                });
            });
        }
        
        // Initial attachment
        attachTooltipListeners();
        
        console.log('Tooltips setup complete');
    }

    // Make the function available globally
    window.setupTooltips = setupTooltips;

    // Also re-initialize when modal is loaded dynamically - but only if not already initialized
    window.ProductModal = {
        init: function() {
            console.log('ProductModal.init called externally');
            if (!isInitialized) {
                initProductModal();
            }
        },
        getCurrentProduct: getCurrentProduct,
        isInitialized: function() { return isInitialized; },
        // Function to set tournament data dynamically
        setTournamentData: function(data) {
            console.log('Setting tournament data:', data);
            tournamentData = data;
            
            // If modal is open, update the prices and cart option
            if (document.getElementById('member-modal-backdrop') && 
                document.getElementById('member-modal-backdrop').classList.contains('active')) {
                updateModalPrices();
                updateModalBasedOnTournament();
            }
            
            // Update current product with dynamic data if it's a tournament
            if (currentProduct && currentProduct.type === 'tournament') {
                // Update product info if we have tournament data
                if (data.title && document.querySelector('.product-title')) {
                    document.querySelector('.product-title').textContent = data.title;
                }
                if (data.price && document.querySelector('.product-price-value')) {
                    const formattedPrice = '$' + parseFloat(data.price).toFixed(2);
                    document.querySelector('.product-price-value').textContent = formattedPrice;
                }
                // Update the product's imageUrl
                if (data.imageUrl) {
                    currentProduct.imageUrl = data.imageUrl;
                    // Also update the image on the page
                    const productImage = document.querySelector('.product-image');
                    if (productImage) {
                        productImage.src = data.imageUrl;
                    }
                }
            }
        },
        // Expose the updateModalBasedOnTournament function for use elsewhere
        updateModalBasedOnTournament: updateModalBasedOnTournament,
        // Expose the setupTooltips function
        setupTooltips: setupTooltips,
        // Expose tournament validation function
        validateTournamentPlayer1: validateTournamentPlayer1
    };
})();