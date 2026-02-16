// public/js/new-member-modal.js
// Completely isolated modal for new membership page
(function () {
    'use strict';

    let modalState = {
        step: 1,
        hasGhin: null // 'yes' or 'no'
    };
    
    let isInitialized = false;
    let eventListenersBound = false;

    // Product data for new membership
    const NEW_MEMBERSHIP_PRODUCT = {
        id: 'new-membership',
        name: 'New Membership',
        price: 109.00,
        type: 'membership',
        imageKey: 'new-membership'
    };

    // Open modal function
    function openModal() {
        const backdrop = document.getElementById('new-member-modal-backdrop');
        if (!backdrop) {
            console.error('New member modal backdrop not found');
            return;
        }
        
        backdrop.classList.add('active');
        backdrop.setAttribute('aria-hidden', 'false');
        
        // Reset modal state
        modalState.step = 1;
        modalState.hasGhin = null;
        
        // Show step 1, hide step 2
        const step1 = document.getElementById('new-member-step1');
        const step2 = document.getElementById('new-member-step2');
        if (step1 && step2) {
            step1.style.display = 'block';
            step2.style.display = 'none';
        }
        
        // Disable Next button initially
        const nextButton = document.getElementById('new-member-modal-next');
        if (nextButton) {
            nextButton.disabled = true;
            nextButton.style.opacity = '0.6';
            nextButton.style.cursor = 'not-allowed';
        }
        
        // Disable Save button initially
        const saveButton = document.getElementById('new-member-modal-save');
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.style.opacity = '0.6';
            saveButton.style.cursor = 'not-allowed';
        }
        
        // Clear all inputs
        clearAllInputs(backdrop);
        
        // Hide GHIN row initially
        const ghinRow = document.getElementById('new-ghin-row');
        if (ghinRow) {
            ghinRow.style.display = 'none';
        }
        
        // Focus first input in step 1
        setTimeout(() => {
            const radioButtons = document.querySelectorAll('input[name="has-ghin"]');
            if (radioButtons && radioButtons.length > 0) {
                radioButtons[0].focus();
            }
        }, 150);
    }

    function clearAllInputs(backdrop) {
        const inputs = backdrop.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            if (input.type === 'checkbox' || input.type === 'radio') {
                input.checked = false;
            } else if (input.type === 'select-one') {
                input.selectedIndex = 0;
            } else {
                input.value = '';
                input.style.borderColor = '#ddd';
            }
        });

        // Clear error messages
        const errors = backdrop.querySelectorAll('.field-error');
        errors.forEach(error => {
            error.style.display = 'none';
        });
    }

    function closeModal() {
        const backdrop = document.getElementById('new-member-modal-backdrop');
        if (!backdrop) return;
        
        backdrop.classList.remove('active');
        backdrop.setAttribute('aria-hidden', 'true');
        modalState.step = 1;
        modalState.hasGhin = null;
    }

    // Phone number formatting
    function formatPhoneNumber(value) {
        const numbers = value.replace(/\D/g, '');
        
        if (numbers.length === 0) return '';
        if (numbers.length <= 3) return `(${numbers}`;
        if (numbers.length <= 6) return `(${numbers.slice(0, 3)}) ${numbers.slice(3)}`;
        return `(${numbers.slice(0, 3)}) ${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
    }

    // Validate step 1 (GHIN question)
    function validateStep1() {
        const radios = document.querySelectorAll('input[name="has-ghin"]');
        let selectedValue = null;
        
        for (const radio of radios) {
            if (radio.checked) {
                selectedValue = radio.value;
                break;
            }
        }
        
        if (!selectedValue) {
            const errorDiv = document.getElementById('ghin-question-error');
            if (errorDiv) {
                errorDiv.style.display = 'block';
            }
            return false;
        }
        
        // Hide error if showing
        const errorDiv = document.getElementById('ghin-question-error');
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
        
        modalState.hasGhin = selectedValue;
        return true;
    }

    // Validate step 2 (member details)
    function validateStep2() {
        // Validate first name
        const firstNameInput = document.getElementById('new-modal-first-name');
        if (!firstNameInput || !firstNameInput.value.trim()) {
            showFieldError('first-name-error', 'First name is required');
            firstNameInput?.focus();
            return false;
        }
        
        // Validate first name format
        const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ'\-]+$/;
        if (!nameRegex.test(firstNameInput.value.trim())) {
            showFieldError('first-name-error', 'First name can only contain letters, hyphens, or apostrophes');
            firstNameInput.focus();
            return false;
        }
        hideFieldError('first-name-error');
        
        // Validate last name
        const lastNameInput = document.getElementById('new-modal-last-name');
        if (!lastNameInput || !lastNameInput.value.trim()) {
            showFieldError('last-name-error', 'Last name is required');
            lastNameInput?.focus();
            return false;
        }
        
        // Validate last name format
        if (!nameRegex.test(lastNameInput.value.trim())) {
            showFieldError('last-name-error', 'Last name can only contain letters, hyphens, or apostrophes');
            lastNameInput.focus();
            return false;
        }
        hideFieldError('last-name-error');
        
        // Validate email
        const emailInput = document.getElementById('new-modal-email');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailInput || !emailInput.value.trim()) {
            showFieldError('new-email-error', 'Email is required');
            emailInput?.focus();
            return false;
        }
        if (!emailRegex.test(emailInput.value.trim())) {
            showFieldError('new-email-error', 'Please provide a valid email address');
            emailInput.focus();
            return false;
        }
        hideFieldError('new-email-error');
        
        // Validate phone
        const phoneInput = document.getElementById('new-modal-phone');
        if (!phoneInput || !phoneInput.value.trim()) {
            showFieldError('new-phone-error', 'Phone number is required');
            phoneInput?.focus();
            return false;
        }
        const phoneDigits = phoneInput.value.replace(/\D/g, '');
        if (phoneDigits.length < 10) {
            showFieldError('new-phone-error', 'Please provide a valid 10-digit phone number');
            phoneInput.focus();
            return false;
        }
        hideFieldError('new-phone-error');
        
        // Validate GHIN if they have one
        if (modalState.hasGhin === 'yes') {
            const ghinInput = document.getElementById('new-modal-ghin');
            if (!ghinInput || !ghinInput.value.trim()) {
                showFieldError('new-ghin-error', 'GHIN number is required');
                ghinInput?.focus();
                return false;
            }
            const ghinDigits = ghinInput.value.replace(/\D/g, '');
            if (ghinDigits.length === 0 || ghinDigits.length > 8) {
                showFieldError('new-ghin-error', 'GHIN must be 1-8 digits');
                ghinInput.focus();
                return false;
            }
            hideFieldError('new-ghin-error');
        }
        
        return true;
    }

    function showFieldError(errorId, message) {
        const errorDiv = document.getElementById(errorId);
        if (errorDiv) {
            const span = errorDiv.querySelector('span') || errorDiv;
            span.textContent = message;
            errorDiv.style.display = 'block';
        }
    }

    function hideFieldError(errorId) {
        const errorDiv = document.getElementById(errorId);
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
    }

    function goToStep2() {
        if (!validateStep1()) return;
        
        modalState.step = 2;
        
        const step1 = document.getElementById('new-member-step1');
        const step2 = document.getElementById('new-member-step2');
        
        if (step1 && step2) {
            step1.style.display = 'none';
            step2.style.display = 'block';
            
            // Show/hide GHIN field based on selection
            const ghinRow = document.getElementById('new-ghin-row');
            if (ghinRow) {
                ghinRow.style.display = modalState.hasGhin === 'yes' ? 'block' : 'none';
            }
            
            // Focus first name input
            setTimeout(() => {
                const firstNameInput = document.getElementById('new-modal-first-name');
                if (firstNameInput) firstNameInput.focus();
            }, 100);
        }
    }

    function goToStep1() {
        modalState.step = 1;
        
        const step1 = document.getElementById('new-member-step1');
        const step2 = document.getElementById('new-member-step2');
        
        if (step1 && step2) {
            step2.style.display = 'none';
            step1.style.display = 'block';
            
            // Focus radio buttons
            setTimeout(() => {
                const radioButtons = document.querySelectorAll('input[name="has-ghin"]');
                if (radioButtons && radioButtons.length > 0) {
                    radioButtons[0].focus();
                }
            }, 100);
        }
    }

    function buildCartItem() {
        const firstNameInput = document.getElementById('new-modal-first-name');
        const lastNameInput = document.getElementById('new-modal-last-name');
        const emailInput = document.getElementById('new-modal-email');
        const phoneInput = document.getElementById('new-modal-phone');
        const ghinInput = document.getElementById('new-modal-ghin');
        
        // Format name properly
        const firstName = firstNameInput.value.trim();
        const lastName = lastNameInput.value.trim();
        const formattedName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase() + ' ' +
                             lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();
        
        // Get image URL (will be set when modal loads)
        const productImage = document.getElementById('new-membership-product-image')?.src || '';
        
        // Build form data
        let formData = {
            firstName: firstName,
            lastName: lastName,
            name: formattedName,
            email: emailInput ? emailInput.value.trim() : '',
            phone: phoneInput ? phoneInput.value.trim() : '',
            hasGhin: modalState.hasGhin
        };
        
        // Add GHIN if they have one
        if (modalState.hasGhin === 'yes' && ghinInput) {
            formData.ghin = ghinInput.value.trim();
        }
        
        // Generate a unique cart item ID
        const cartItemId = "cart_item_" + Math.random().toString(36).substr(2, 9);
        
        return {
            id: cartItemId,
            productId: NEW_MEMBERSHIP_PRODUCT.id,
            name: NEW_MEMBERSHIP_PRODUCT.name,
            price: NEW_MEMBERSHIP_PRODUCT.price,
            basePrice: NEW_MEMBERSHIP_PRODUCT.price,
            image: productImage,
            type: NEW_MEMBERSHIP_PRODUCT.type,
            quantity: 1,
            form: formData
        };
    }

    function showAddToCartFeedback() {
        const openBtn = document.getElementById('new-member-open-modal');
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

    function handleSave() {
        if (!validateStep2()) return;
        
        const item = buildCartItem();
        console.log('Adding new membership to cart:', item);
        
        // Check if cart functions exist
        if (typeof addToCart === 'function') {
            addToCart(item);
            showAddToCartFeedback();
            
            // Dispatch cart update event
            document.dispatchEvent(new Event('cartUpdated'));
        } else {
            console.error('addToCart function not found');
            alert('Error adding to cart. Please refresh the page and try again.');
        }
        
        closeModal();
    }

    function bindModalEvents() {
        if (eventListenersBound) {
            console.log('New member modal event listeners already bound');
            return;
        }

        console.log('Binding new member modal events...');
        
        // Get all modal elements
        const openBtn = document.getElementById('new-member-open-modal');
        const cancelBtn = document.getElementById('new-member-modal-cancel');
        const cancelBtn2 = document.getElementById('new-member-modal-cancel2');
        const nextBtn = document.getElementById('new-member-modal-next');
        const backBtn = document.getElementById('new-member-modal-back');
        const saveBtn = document.getElementById('new-member-modal-save');
        const radioButtons = document.querySelectorAll('input[name="has-ghin"]');
        
        // Open button
        if (openBtn) {
            const newOpenBtn = openBtn.cloneNode(true);
            openBtn.parentNode.replaceChild(newOpenBtn, openBtn);
            
            newOpenBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('New member modal opened');
                openModal();
            });
        }
        
        // Cancel buttons
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
        
        // Next button
        if (nextBtn) {
            const newNextBtn = nextBtn.cloneNode(true);
            nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
            
            newNextBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                goToStep2();
            });
        }
        
        // Back button
        if (backBtn) {
            const newBackBtn = backBtn.cloneNode(true);
            backBtn.parentNode.replaceChild(newBackBtn, backBtn);
            
            newBackBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                goToStep1();
            });
        }
        
        // Save button
        if (saveBtn) {
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            
            newSaveBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Save button clicked');
                handleSave();
                
                // Temporarily disable
                this.disabled = true;
                setTimeout(() => {
                    this.disabled = false;
                }, 1000);
            });
        }
        
        // Radio buttons - enable Next button when selected
        radioButtons.forEach(radio => {
            const newRadio = radio.cloneNode(true);
            radio.parentNode.replaceChild(newRadio, radio);
            
            newRadio.addEventListener('change', function() {
                const nextButton = document.getElementById('new-member-modal-next');
                if (nextButton) {
                    nextButton.disabled = false;
                    nextButton.style.opacity = '1';
                    nextButton.style.cursor = 'pointer';
                }
                
                // Hide error if showing
                const errorDiv = document.getElementById('ghin-question-error');
                if (errorDiv) {
                    errorDiv.style.display = 'none';
                }
            });
        });
        
        // Set up form input validation
        setupFormInputs();
        
        eventListenersBound = true;
        console.log('New member modal event listeners bound successfully');
    }

    function setupFormInputs() {
        // First name validation
        const firstNameInput = document.getElementById('new-modal-first-name');
        if (firstNameInput) {
            const newFirstName = firstNameInput.cloneNode(true);
            firstNameInput.parentNode.replaceChild(newFirstName, firstNameInput);
            
            newFirstName.addEventListener('input', function(e) {
                this.value = this.value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'\-]/g, '');
                validateStep2Inputs();
            });
            
            newFirstName.addEventListener('blur', function() {
                if (this.value.trim()) {
                    this.value = this.value.charAt(0).toUpperCase() + this.value.slice(1).toLowerCase();
                }
                validateStep2Inputs();
            });
        }
        
        // Last name validation
        const lastNameInput = document.getElementById('new-modal-last-name');
        if (lastNameInput) {
            const newLastName = lastNameInput.cloneNode(true);
            lastNameInput.parentNode.replaceChild(newLastName, lastNameInput);
            
            newLastName.addEventListener('input', function(e) {
                this.value = this.value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ'\-]/g, '');
                validateStep2Inputs();
            });
            
            newLastName.addEventListener('blur', function() {
                if (this.value.trim()) {
                    this.value = this.value.charAt(0).toUpperCase() + this.value.slice(1).toLowerCase();
                }
                validateStep2Inputs();
            });
        }
        
        // Email validation
        const emailInput = document.getElementById('new-modal-email');
        if (emailInput) {
            const newEmail = emailInput.cloneNode(true);
            emailInput.parentNode.replaceChild(newEmail, emailInput);
            
            newEmail.addEventListener('input', validateStep2Inputs);
            newEmail.addEventListener('blur', validateStep2Inputs);
        }
        
        // Phone formatting
        const phoneInput = document.getElementById('new-modal-phone');
        if (phoneInput) {
            const newPhone = phoneInput.cloneNode(true);
            phoneInput.parentNode.replaceChild(newPhone, phoneInput);
            
            newPhone.addEventListener('input', function(e) {
                const cursorPosition = this.selectionStart;
                const originalLength = this.value.length;
                
                this.value = formatPhoneNumber(this.value);
                
                const newLength = this.value.length;
                const lengthDifference = newLength - originalLength;
                const newCursorPosition = cursorPosition + lengthDifference;
                
                this.setSelectionRange(newCursorPosition, newCursorPosition);
                validateStep2Inputs();
            });
            
            newPhone.addEventListener('keydown', function(e) {
                if ([8, 9, 13, 37, 38, 39, 40, 46].includes(e.keyCode)) return;
                if (!/\d/.test(e.key) && e.key !== '(' && e.key !== ')' && e.key !== '-' && e.key !== ' ') {
                    e.preventDefault();
                }
            });
            
            newPhone.addEventListener('blur', validateStep2Inputs);
        }
        
        // GHIN validation
        const ghinInput = document.getElementById('new-modal-ghin');
        if (ghinInput) {
            const newGhin = ghinInput.cloneNode(true);
            ghinInput.parentNode.replaceChild(newGhin, ghinInput);
            
            newGhin.addEventListener('input', function(e) {
                this.value = this.value.replace(/\D/g, '');
                if (this.value.length > 8) {
                    this.value = this.value.slice(0, 8);
                }
                validateStep2Inputs();
            });
            
            newGhin.addEventListener('keydown', function(e) {
                if ([8, 9, 13, 37, 38, 39, 40, 46].includes(e.keyCode)) return;
                if (!/\d/.test(e.key)) e.preventDefault();
            });
            
            newGhin.addEventListener('blur', validateStep2Inputs);
        }
    }

    function validateStep2Inputs() {
        const saveButton = document.getElementById('new-member-modal-save');
        if (!saveButton) return;
        
        // Check first name
        const firstName = document.getElementById('new-modal-first-name')?.value.trim();
        if (!firstName) {
            saveButton.disabled = true;
            saveButton.style.opacity = '0.6';
            saveButton.style.cursor = 'not-allowed';
            return;
        }
        
        // Check last name
        const lastName = document.getElementById('new-modal-last-name')?.value.trim();
        if (!lastName) {
            saveButton.disabled = true;
            saveButton.style.opacity = '0.6';
            saveButton.style.cursor = 'not-allowed';
            return;
        }
        
        // Check email
        const email = document.getElementById('new-modal-email')?.value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            saveButton.disabled = true;
            saveButton.style.opacity = '0.6';
            saveButton.style.cursor = 'not-allowed';
            return;
        }
        
        // Check phone
        const phone = document.getElementById('new-modal-phone')?.value.trim();
        const phoneDigits = phone ? phone.replace(/\D/g, '') : '';
        if (!phone || phoneDigits.length < 10) {
            saveButton.disabled = true;
            saveButton.style.opacity = '0.6';
            saveButton.style.cursor = 'not-allowed';
            return;
        }
        
        // Check GHIN if they have one
        if (modalState.hasGhin === 'yes') {
            const ghin = document.getElementById('new-modal-ghin')?.value.trim();
            const ghinDigits = ghin ? ghin.replace(/\D/g, '') : '';
            if (!ghin || ghinDigits.length === 0 || ghinDigits.length > 8) {
                saveButton.disabled = true;
                saveButton.style.opacity = '0.6';
                saveButton.style.cursor = 'not-allowed';
                return;
            }
        }
        
        // All validations passed
        saveButton.disabled = false;
        saveButton.style.opacity = '1';
        saveButton.style.cursor = 'pointer';
    }

    function initNewMemberModal() {
        if (isInitialized) {
            console.log('New member modal already initialized');
            return;
        }

        console.log('Initializing new member modal...');
        
        // Wait for DOM to be ready
        setTimeout(() => {
            try {
                bindModalEvents();
                isInitialized = true;
                console.log('New member modal initialized successfully');
            } catch (error) {
                console.error('Error initializing new member modal:', error);
            }
        }, 500);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function initializeOnce() {
            document.removeEventListener('DOMContentLoaded', initializeOnce);
            initNewMemberModal();
        });
    } else {
        initNewMemberModal();
    }

    // Expose public API
    window.NewMemberModal = {
        init: initNewMemberModal,
        open: openModal,
        close: closeModal,
        isInitialized: function() { return isInitialized; }
    };
})();