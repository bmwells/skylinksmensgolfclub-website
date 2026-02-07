class MemberAutocomplete {
    constructor() {
        this.baseUrl = '/api';
        this.autocompleteContainers = {};
        this.debounceTimers = {};
        this.currentActiveInput = null;
        this.selectedMembers = {}; // Track selected members by input ID
        this.isTournamentModal = false;
    }

    init() {
        // Clean up old containers
        Object.values(this.autocompleteContainers).forEach(c => c.remove());
        this.autocompleteContainers = {};
        this.debounceTimers = {};
        this.currentActiveInput = null;
        this.selectedMembers = {};

        // Check if this is a tournament modal
        const modalBackdrop = document.getElementById('member-modal-backdrop');
        this.isTournamentModal = modalBackdrop && modalBackdrop.querySelector('#step1-content');

        // Player 1 primary field
        const primary = document.getElementById('modal-name');
        if (primary) this.setupAutocomplete(primary, 1);

        // Player 1–4 (tournament)
        for (let i = 1; i <= 4; i++) {
            const input = document.getElementById(`modal-name${i}`);
            if (input) this.setupAutocomplete(input, i);
        }

        // Setup real-time validation for tournament modal
        if (this.isTournamentModal) {
            this.setupTournamentValidation();
        }
    }

    setupTournamentValidation() {
        const nameInput = document.getElementById('modal-name');
        const emailInput = document.getElementById('modal-email');
        const phoneInput = document.getElementById('modal-phone');
        const ghinInput = document.getElementById('modal-ghin');
        const nextButton = document.getElementById('member-modal-next');

        if (!nameInput || !emailInput || !phoneInput || !ghinInput || !nextButton) return;

        // Real-time validation for all required fields
        const validateFields = () => {
            const isValid = this.validatePlayer1Fields();
            if (isValid) {
                nextButton.disabled = false;
                nextButton.style.opacity = '1';
                nextButton.style.cursor = 'pointer';
            } else {
                nextButton.disabled = true;
                nextButton.style.opacity = '0.6';
                nextButton.style.cursor = 'not-allowed';
            }
        };

        // Validate on input changes
        [emailInput, phoneInput, ghinInput].forEach(input => {
            input.addEventListener('input', validateFields);
            input.addEventListener('blur', validateFields);
        });

        // Also validate when member is selected
        nameInput.addEventListener('blur', () => {
            setTimeout(() => {
                // Check if this is a valid member selection
                if (this.selectedMembers['modal-name']) {
                    validateFields();
                } else {
                    // Show member not found error
                    const errorElement = document.getElementById('member-not-found');
                    if (errorElement) {
                        errorElement.style.display = 'block';
                    }
                    // Clear the verified indicator
                    const verifiedElement = document.getElementById('member-verified');
                    if (verifiedElement) {
                        verifiedElement.style.display = 'none';
                    }
                    validateFields();
                }
            }, 200);
        });
    }

    validatePlayer1Fields() {
        // Check if a member is selected
        const nameInput = document.getElementById('modal-name');
        if (!nameInput || !this.selectedMembers['modal-name']) {
            return false;
        }

        // Get the selected member
        const selectedMember = this.selectedMembers['modal-name'];
        
        // Check required fields
        const emailInput = document.getElementById('modal-email');
        const phoneInput = document.getElementById('modal-phone');
        const ghinInput = document.getElementById('modal-ghin');

        if (!emailInput || !phoneInput || !ghinInput) return false;

        // Validate email
        const email = emailInput.value.trim();
        if (!email) {
            this.showFieldError('email-error', 'Email is required for tournament registration');
            emailInput.style.borderColor = '#dc3545';
            return false;
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            this.showFieldError('email-error', 'Please enter a valid email address');
            emailInput.style.borderColor = '#dc3545';
            return false;
        }

        // Clear email error if valid
        this.hideFieldError('email-error');
        emailInput.style.borderColor = '#28a745';

        // Validate phone
        const phone = phoneInput.value.trim();
        if (!phone) {
            this.showFieldError('phone-error', 'Phone is required for tournament registration');
            phoneInput.style.borderColor = '#dc3545';
            return false;
        }

        // Check if phone has at least 10 digits
        const phoneDigits = phone.replace(/\D/g, '');
        if (phoneDigits.length < 10) {
            this.showFieldError('phone-error', 'Please enter a valid 10-digit phone number');
            phoneInput.style.borderColor = '#dc3545';
            return false;
        }

        // Clear phone error if valid
        this.hideFieldError('phone-error');
        phoneInput.style.borderColor = '#28a745';

        // Validate GHIN
        const ghin = ghinInput.value.trim();
        if (!ghin) {
            this.showFieldError('ghin-error', 'GHIN is required for tournament registration');
            ghinInput.style.borderColor = '#dc3545';
            return false;
        }

        // GHIN should be 1-8 digits
        const ghinDigits = ghin.replace(/\D/g, '');
        if (ghinDigits.length === 0 || ghinDigits.length > 8) {
            this.showFieldError('ghin-error', 'GHIN must be 1-8 digits');
            ghinInput.style.borderColor = '#dc3545';
            return false;
        }

        // Clear GHIN error if valid
        this.hideFieldError('ghin-error');
        ghinInput.style.borderColor = '#28a745';

        return true;
    }

    showFieldError(elementId, message) {
        const errorElement = document.getElementById(elementId);
        if (errorElement) {
            const span = errorElement.querySelector('span');
            if (span) span.textContent = message;
            errorElement.style.display = 'block';
        }
    }

    hideFieldError(elementId) {
        const errorElement = document.getElementById(elementId);
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    }

    setupAutocomplete(input, playerNumber) {
        const inputId = input.id;

        const container = document.createElement('div');
        container.className = 'autocomplete-container';
        container.style.position = 'fixed';
        container.style.display = 'none';
        container.style.zIndex = '999999';
        document.body.appendChild(container);

        this.autocompleteContainers[inputId] = container;

        const getField = field =>
            playerNumber === 1 && inputId === 'modal-name'
                ? document.getElementById(`modal-${field}`)
                : document.getElementById(`modal-${field}${playerNumber}`);

        input.addEventListener('input', () => {
            clearTimeout(this.debounceTimers[inputId]);
            const value = input.value.trim();

            // For Player 1 in tournament modal, require at least 2 characters
            if (this.isTournamentModal && playerNumber === 1) {
                if (value.length < 2) {
                    this.hide(inputId);
                    
                    // Show member not found error if they typed something but not enough
                    if (value.length > 0) {
                        const errorElement = document.getElementById('member-not-found');
                        if (errorElement) {
                            errorElement.style.display = 'block';
                        }
                    }
                    return;
                }
            } else {
                if (value.length < 3) {
                    this.hide(inputId);
                    return;
                }
            }

            this.debounceTimers[inputId] = setTimeout(() => {
                this.currentActiveInput = inputId;
                this.search(value, inputId, getField);
            }, 250);
        });

        input.addEventListener('focus', () => {
            this.currentActiveInput = inputId;
            // Clear any member not found error when user focuses
            if (this.isTournamentModal && playerNumber === 1) {
                const errorElement = document.getElementById('member-not-found');
                if (errorElement) {
                    errorElement.style.display = 'none';
                }
            }
        });

        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (this.currentActiveInput === inputId) {
                    this.hide(inputId);
                    
                    // For Player 1 in tournament modal, validate member selection on blur
                    if (this.isTournamentModal && playerNumber === 1) {
                        const value = input.value.trim();
                        if (value && !this.selectedMembers[inputId]) {
                            // User typed something but didn't select from autocomplete
                            const errorElement = document.getElementById('member-not-found');
                            if (errorElement) {
                                errorElement.style.display = 'block';
                            }
                            // Clear the verified indicator
                            const verifiedElement = document.getElementById('member-verified');
                            if (verifiedElement) {
                                verifiedElement.style.display = 'none';
                            }
                        }
                    }
                }
            }, 200);
        });
    }

    async search(query, inputId, getField) {
        try {
            const res = await fetch(
                `${this.baseUrl}/members/search?q=${encodeURIComponent(query)}`
            );
            const members = await res.json();
            this.render(members, inputId, getField);
        } catch {
            this.hide(inputId);
        }
    }

    render(members, inputId, getField) {
        const container = this.autocompleteContainers[inputId];
        if (!container) return;

        container.innerHTML = '';

        if (!members.length) {
            container.innerHTML = `<div class="no-results">No members found. You must select an existing member.</div>`;
        } else {
            members.forEach(member => {
                const row = document.createElement('div');
                row.className = 'autocomplete-item';

                const nameDiv = document.createElement('div');
                nameDiv.className = 'name';
                nameDiv.textContent = `${member.firstName} ${member.lastName}`;

                if (member.ghin) {
                    const ghinSpan = document.createElement('span');
                    ghinSpan.className = 'ghin-badge';
                    ghinSpan.textContent = `(${member.ghin})`;
                    nameDiv.appendChild(ghinSpan);
                }

                row.appendChild(nameDiv);
                row.onclick = () => this.select(member, inputId, getField);

                container.appendChild(row);
            });
        }

        this.position(inputId);
        container.style.display = 'block';
    }

    position(inputId) {
        const input = document.getElementById(inputId);
        const container = this.autocompleteContainers[inputId];
        if (!input || !container) return;

        const rect = input.getBoundingClientRect();
        container.style.top = `${rect.bottom + 4}px`;
        container.style.left = `${rect.left}px`;
        container.style.width = `${rect.width}px`;
    }

    select(member, inputId, getField) {
        const input = document.getElementById(inputId);
        if (input) {
            input.value = `${member.firstName} ${member.lastName}`;
        }

        // Store the selected member
        this.selectedMembers[inputId] = member;

        const emailField = getField('email');
        const phoneField = getField('phone');
        const ghinField = getField('ghin');

        // Auto-populate fields
        if (emailField) {
            emailField.value = member.email || '';
            // Highlight if email is missing
            if (!member.email && this.isTournamentModal && inputId === 'modal-name') {
                emailField.style.borderColor = '#dc3545';
                this.showFieldError('email-error', 'Email is required for tournament registration');
            } else if (member.email) {
                emailField.style.borderColor = '#28a745';
                this.hideFieldError('email-error');
            }
        }

        if (ghinField) {
            ghinField.value = member.ghin || '';
            // Highlight if GHIN is missing
            if (!member.ghin && this.isTournamentModal && inputId === 'modal-name') {
                ghinField.style.borderColor = '#dc3545';
                this.showFieldError('ghin-error', 'GHIN is required for tournament registration');
            } else if (member.ghin) {
                ghinField.style.borderColor = '#28a745';
                this.hideFieldError('ghin-error');
            }
        }

        if (phoneField && member.phoneNum) {
            const clean = String(member.phoneNum).replace(/\D/g, '');
            phoneField.value = this.formatPhone(clean);
            phoneField.style.borderColor = '#28a745';
            this.hideFieldError('phone-error');
        } else if (this.isTournamentModal && inputId === 'modal-name') {
            phoneField.style.borderColor = '#dc3545';
            this.showFieldError('phone-error', 'Phone is required for tournament registration');
        }

        // Show member verified indicator for tournament modal
        if (this.isTournamentModal && inputId === 'modal-name') {
            const verifiedElement = document.getElementById('member-verified');
            const errorElement = document.getElementById('member-not-found');
            
            if (verifiedElement) {
                verifiedElement.style.display = 'block';
            }
            if (errorElement) {
                errorElement.style.display = 'none';
            }
        }

        this.hide(inputId);

        // Trigger validation check after selection
        if (this.isTournamentModal && inputId === 'modal-name') {
            setTimeout(() => {
                this.validatePlayer1Fields();
            }, 100);
        }
    }

    formatPhone(value) {
        if (!value) return '';
        if (value.length <= 3) return `(${value}`;
        if (value.length <= 6) return `(${value.slice(0, 3)}) ${value.slice(3)}`;
        return `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6, 10)}`;
    }

    hide(inputId) {
        const container = this.autocompleteContainers[inputId];
        if (container) container.style.display = 'none';
    }

    // Public method to check if Player 1 has a valid member selected
    isPlayer1MemberValid() {
        return !!this.selectedMembers['modal-name'];
    }

    // Public method to get selected member data
    getSelectedMember() {
        return this.selectedMembers['modal-name'];
    }
}

let memberAutocomplete;
window.initMemberAutocomplete = function () {
    if (!memberAutocomplete) {
        memberAutocomplete = new MemberAutocomplete();
    }
    memberAutocomplete.init();
};

// Export for use in product.js
window.MemberAutocompleteInstance = memberAutocomplete;