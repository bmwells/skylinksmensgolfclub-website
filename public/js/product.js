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
        const name = document.getElementById('modal-name');
        const email = document.getElementById('modal-email');

        if (!name || !name.value.trim()) {
            alert('Please provide your full name.');
            name?.focus();
            return false;
        }

        if (!email || !email.value.trim()) {
            alert('Please provide your email address.');
            email?.focus();
            return false;
        }

        return true;
    }

    function buildCartItem() {
        const nameInput = document.getElementById('modal-name');
        const emailInput = document.getElementById('modal-email');
        const phoneInput = document.getElementById('modal-phone');
        const ghinInput = document.getElementById('modal-ghin');

        return {
            name: currentProduct.name,
            price: currentProduct.price,
            image: currentProduct.image,
            quantity: getQuantity(),
            form: {
                name: nameInput ? nameInput.value.trim() : '',
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
