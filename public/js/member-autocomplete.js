class MemberAutocomplete {
    constructor() {
        this.baseUrl = '/api';
        this.debounceTimers = {};
        this.autocompleteContainers = {};
        this.currentActiveInput = null;
    }

    init() {
        // Initialize autocomplete for all name inputs (player 1-4)
        for (let i = 1; i <= 4; i++) {
            const nameInput = document.getElementById(`modal-name${i}`);
            if (nameInput) {
                this.setupAutocompleteForInput(`modal-name${i}`, i);
            }
        }
        
        // Also set up for modal-name (player 1) if it exists
        const player1Input = document.getElementById('modal-name');
        if (player1Input && !document.getElementById('modal-name1')) {
            this.setupAutocompleteForInput('modal-name', 1);
        }
    }

    setupAutocompleteForInput(inputId, playerNumber) {
        const nameInput = document.getElementById(inputId);
        if (!nameInput) return;

        // Create autocomplete container for this input
        const container = document.createElement('div');
        container.className = 'autocomplete-container';
        container.id = `autocomplete-${inputId}`;
        container.style.position = 'fixed';
        container.style.display = 'none';
        container.style.zIndex = '999999';
        document.body.appendChild(container);

        this.autocompleteContainers[inputId] = container;

        // Get corresponding form fields for this player
        const getPlayerField = (fieldName) => {
            if (playerNumber === 1 && inputId === 'modal-name') {
                return document.getElementById(`modal-${fieldName}`);
            }
            return document.getElementById(`modal-${fieldName}${playerNumber}`);
        };

        nameInput.addEventListener('input', () => {
            const val = nameInput.value.trim();
            clearTimeout(this.debounceTimers[inputId]);

            if (val.length < 3) {
                this.hide(inputId);
                return;
            }

            this.debounceTimers[inputId] = setTimeout(() => {
                this.currentActiveInput = inputId;
                this.search(val, inputId, getPlayerField);
            }, 250);
        });

        nameInput.addEventListener('focus', () => {
            this.currentActiveInput = inputId;
        });

        nameInput.addEventListener('blur', () => {
            setTimeout(() => {
                if (this.currentActiveInput === inputId) {
                    this.hide(inputId);
                }
            }, 200);
        });
    }

    async search(query, inputId, getPlayerField) {
        try {
            const res = await fetch(
                `${this.baseUrl}/members/search?q=${encodeURIComponent(query)}`
            );
            const members = await res.json();
            this.render(members, inputId, getPlayerField);
        } catch {
            this.hide(inputId);
        }
    }

    render(members, inputId, getPlayerField) {
    const container = this.autocompleteContainers[inputId];
    if (!container) return;

    container.innerHTML = '';

    if (!members.length) {
        container.innerHTML =
            `<div class="no-results">No results found</div>`;
    } else {
        members.forEach(m => {
            const row = document.createElement('div');
            row.className = 'autocomplete-item';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'name';
            nameDiv.textContent = `${m.firstName} ${m.lastName}`;

            // Add GHIN in parentheses
            if (m.ghin) {
                const ghinSpan = document.createElement('span');
                ghinSpan.className = 'ghin-badge';
                ghinSpan.textContent = `(${m.ghin})`;
                nameDiv.appendChild(ghinSpan);
            }

            row.appendChild(nameDiv);

            row.onclick = () => this.select(m, inputId, getPlayerField);
            container.appendChild(row);
        });
    }

    this.position(inputId);
    container.style.display = 'block';
}

    position(inputId) {
        const nameInput = document.getElementById(inputId);
        if (!nameInput) return;

        const container = this.autocompleteContainers[inputId];
        if (!container) return;

        const rect = nameInput.getBoundingClientRect();
        container.style.top = `${rect.bottom + 4}px`;
        container.style.left = `${rect.left}px`;
        container.style.width = `${rect.width}px`;
    }

    select(member, inputId, getPlayerField) {
        const nameInput = document.getElementById(inputId);
        if (nameInput) {
            nameInput.value = `${member.firstName} ${member.lastName}`;
        }

        // Fill corresponding form fields
        const emailField = getPlayerField('email');
        const phoneField = getPlayerField('phone');
        const ghinField = getPlayerField('ghin');

        if (emailField) emailField.value = member.email || '';
        
        if (phoneField && member.phoneNum) {
            const cleanPhone = String(member.phoneNum).replace(/\D/g, '');
            phoneField.value = this.formatPhoneNumber(cleanPhone);
        }
        
        if (ghinField) ghinField.value = member.ghin || '';

        this.hide(inputId);
    }

    formatPhoneNumber(value) {
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

    hide(inputId) {
        const container = this.autocompleteContainers[inputId];
        if (container) {
            container.style.display = 'none';
        }
    }
}

// GLOBAL INIT
let memberAutocomplete;
window.initMemberAutocomplete = function () {
    if (!memberAutocomplete) {
        memberAutocomplete = new MemberAutocomplete();
        memberAutocomplete.init();
    }
};