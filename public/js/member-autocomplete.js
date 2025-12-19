class MemberAutocomplete {
    constructor() {
        this.baseUrl = '/api';
        this.autocompleteContainers = {};
        this.debounceTimers = {};
        this.currentActiveInput = null;
    }

    init() {
        // Clean up old containers
        Object.values(this.autocompleteContainers).forEach(c => c.remove());
        this.autocompleteContainers = {};
        this.debounceTimers = {};
        this.currentActiveInput = null;

        // Player 1 primary field
        const primary = document.getElementById('modal-name');
        if (primary) this.setupAutocomplete(primary, 1);

        // Player 1–4 (tournament)
        for (let i = 1; i <= 4; i++) {
            const input = document.getElementById(`modal-name${i}`);
            if (input) this.setupAutocomplete(input, i);
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

            if (value.length < 3) {
                this.hide(inputId);
                return;
            }

            this.debounceTimers[inputId] = setTimeout(() => {
                this.currentActiveInput = inputId;
                this.search(value, inputId, getField);
            }, 250);
        });

        input.addEventListener('focus', () => {
            this.currentActiveInput = inputId;
        });

        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (this.currentActiveInput === inputId) {
                    this.hide(inputId);
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
            container.innerHTML = `<div class="no-results">No results found</div>`;
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

        const emailField = getField('email');
        const phoneField = getField('phone');
        const ghinField = getField('ghin');

        if (emailField) emailField.value = member.email || '';
        if (ghinField) ghinField.value = member.ghin || '';

        if (phoneField && member.phoneNum) {
            const clean = String(member.phoneNum).replace(/\D/g, '');
            phoneField.value = this.formatPhone(clean);
        }

        this.hide(inputId);
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
}

let memberAutocomplete;
window.initMemberAutocomplete = function () {
    if (!memberAutocomplete) {
        memberAutocomplete = new MemberAutocomplete();
    }
    memberAutocomplete.init();
};
