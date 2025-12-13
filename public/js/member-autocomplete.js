class MemberAutocomplete {
    constructor() {
        this.baseUrl = '/api';
        this.debounceTimers = {};
        this.autocompleteContainers = {};
        this.currentActiveInput = null;
    }

    init() {
        // 🔥 CLEANUP PREVIOUS STATE
        Object.values(this.autocompleteContainers).forEach(container => {
            if (container && container.remove) container.remove();
        });

        this.autocompleteContainers = {};
        this.debounceTimers = {};
        this.currentActiveInput = null;

        // Initialize autocomplete for all name inputs (player 1–4)
        for (let i = 1; i <= 4; i++) {
            const nameInput = document.getElementById(`modal-name${i}`);
            if (nameInput) {
                this.setupAutocompleteForInput(`modal-name${i}`, i);
            }
        }

        // Player 1 primary field (modal-name)
        const player1Input = document.getElementById('modal-name');
        if (player1Input) {
            this.setupAutocompleteForInput('modal-name', 1);
        }
    }

    setupAutocompleteForInput(inputId, playerNumber) {
        const nameInput = document.getElementById(inputId);
        if (!nameInput) return;

        const container = document.createElement('div');
        container.className = 'autocomplete-container';
        container.id = `autocomplete-${inputId}`;
        container.style.position = 'fixed';
        container.style.display = 'none';
        container.style.zIndex = '999999';
        document.body.appendChild(container);

        this.autocompleteContainers[inputId] = container;

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
            container.innerHTML = `<div class="no-results">No results found</div>`;
        } else {
            members.forEach(m => {
                const row = document.createElement('div');
                row.className = 'autocomplete-item';

                const nameDiv = document.createElement('div');
                nameDiv.className = 'name';
                nameDiv.textContent = `${m.firstName} ${m.lastName}`;

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
        const container = this.autocompleteContainers[inputId];
        if (!nameInput || !container) return;

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

        if (!numbers) return '';
        if (numbers.length <= 3) return `(${numbers}`;
        if (numbers.length <= 6) return `(${numbers.slice(0, 3)}) ${numbers.slice(3)}`;
        return `(${numbers.slice(0, 3)}) ${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
    }

    hide(inputId) {
        const container = this.autocompleteContainers[inputId];
        if (container) container.style.display = 'none';
    }
}

// Re-init for dynamically injected modals
let memberAutocomplete;
window.initMemberAutocomplete = function () {
    if (!memberAutocomplete) {
        memberAutocomplete = new MemberAutocomplete();
    }
    memberAutocomplete.init();
};
