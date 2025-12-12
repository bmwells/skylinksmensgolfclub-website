class MemberAutocomplete {
    constructor() {
        this.baseUrl = '/api';
        this.debounceTimer = null;
        this.autocompleteContainer = null;
    }

    init() {
        this.nameInput = document.getElementById('modal-name');
        this.emailInput = document.getElementById('modal-email');
        this.phoneInput = document.getElementById('modal-phone');
        this.ghinInput = document.getElementById('modal-ghin');

        if (!this.nameInput) return;

        this.autocompleteContainer = document.createElement('div');
        this.autocompleteContainer.className = 'autocomplete-container';
        this.autocompleteContainer.style.position = 'fixed';
        this.autocompleteContainer.style.display = 'none';
        this.autocompleteContainer.style.zIndex = '999999';
        document.body.appendChild(this.autocompleteContainer);

        this.bindEvents();
    }

    bindEvents() {
        this.nameInput.addEventListener('input', () => {
            const val = this.nameInput.value.trim();
            clearTimeout(this.debounceTimer);

            if (val.length < 3) {
                this.hide();
                return;
            }

            this.debounceTimer = setTimeout(() => {
                this.search(val);
            }, 250);
        });

        document.addEventListener('click', e => {
            if (
                !this.autocompleteContainer.contains(e.target) &&
                e.target !== this.nameInput
            ) {
                this.hide();
            }
        });
    }

    async search(query) {
        try {
            const res = await fetch(
                `${this.baseUrl}/members/search?q=${encodeURIComponent(query)}`
            );
            const members = await res.json();
            this.render(members);
        } catch {
            this.hide();
        }
    }

    render(members) {
        this.autocompleteContainer.innerHTML = '';

        if (!members.length) {
            this.autocompleteContainer.innerHTML =
                `<div class="autocomplete-item">No results</div>`;
        } else {
            members.forEach(m => {
                const row = document.createElement('div');
                row.className = 'autocomplete-item';

                const fullName = `${m.firstName} ${m.lastName}`;
                const ghin = m.ghin ? ` - ${m.ghin}` : '';

                row.textContent = `${fullName}${ghin}`;

                row.onclick = () => this.select(m);
                this.autocompleteContainer.appendChild(row);
            });
        }

        this.position();
        this.autocompleteContainer.style.display = 'block';
    }

    position() {
        const rect = this.nameInput.getBoundingClientRect();
        this.autocompleteContainer.style.top = `${rect.bottom + 4}px`;
        this.autocompleteContainer.style.left = `${rect.left}px`;
        this.autocompleteContainer.style.width = `${rect.width}px`;
    }

    select(m) {
        this.nameInput.value = `${m.firstName} ${m.lastName}`;
        this.emailInput.value = m.email || '';

        // Use proper regex to clean phone number
        const cleanPhone = m.phoneNum
            ? String(m.phoneNum).replace(/\D/g, '')  // Remove all non-digit characters
            : '';

        this.phoneInput.value = cleanPhone;
        this.ghinInput.value = m.ghin || '';

        this.hide();
    }

    hide() {
        this.autocompleteContainer.style.display = 'none';
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
