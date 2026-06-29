/* ============================================================
   Skylinks Cart JS
   ============================================================ */

const CART_KEY = "skylinks_cart_v1";

// Store images from Image Manager
let imageManagerImages = null;

// Store tooltip state globally
let activeTooltip = null;
let activeTooltipButton = null;

// Prevent concurrent save operations
let isSaving = false;

/* ============================================================
   Helpers
   ============================================================ */
function loadCart() {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
}

function saveCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
}

function generateId() {
    return 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Function to fetch images from Image Manager API
async function fetchImagesFromImageManager() {
    try {
        const response = await fetch('/api/images');
        
        // Check if we got HTML instead of JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
            return null;
        }
        
        const images = await response.json();
        if (images && Array.isArray(images)) {
            return images;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// Get image URL from Image Manager data based on product ID
function getImageForProduct(productId, tournamentData = null) {
    if (!imageManagerImages || !Array.isArray(imageManagerImages)) {
        return '';
    }
    
    const imageKeyMap = {
        'new-membership': 'new-membership',
        'membership-renewal': 'membership-renewal',
        'tournament': 'tournament-entry'
    };
    
    const imageKey = imageKeyMap[productId] || 'tournament-entry';
    const imageData = imageManagerImages.find(img => img.id === imageKey);
    
    if (imageData && imageData.imageUrl) {
        return imageData.imageUrl;
    }
    
    if (tournamentData && tournamentData.imageUrl) {
        return tournamentData.imageUrl;
    }
    
    return '';
}

// Phone number formatting function
function formatPhoneNumber(value) {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length === 0) return '';
    if (numbers.length <= 3) return `(${numbers}`;
    if (numbers.length <= 6) return `(${numbers.slice(0, 3)}) ${numbers.slice(3)}`;
    return `(${numbers.slice(0, 3)}) ${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
}

// GHIN formatting function - limit to 8 digits only
function setupEditModalGHINFormatting() {
    const ghinInputs = document.querySelectorAll('#edit-modal input[id*="ghin"]');
    ghinInputs.forEach(input => {
        if (input.value) {
            input.value = input.value.replace(/\D/g, '').slice(0, 8);
        }
        input.addEventListener('input', function(e) {
            this.value = this.value.replace(/\D/g, '').slice(0, 8);
        });
        input.addEventListener('keydown', function(e) {
            if ([8, 9, 13, 37, 38, 39, 40, 46].includes(e.keyCode)) {
                return;
            }
            if (!/\d/.test(e.key)) {
                e.preventDefault();
            }
        });
    });
}

// Setup phone formatting for edit modals
function setupEditModalPhoneFormatting() {
    const phoneInputs = document.querySelectorAll('#edit-modal input[id*="phone"]');
    phoneInputs.forEach(input => {
        if (input.value) {
            input.value = formatPhoneNumber(input.value);
        }
        input.addEventListener('input', function(e) {
            const cursorPosition = this.selectionStart;
            const originalLength = this.value.length;
            this.value = formatPhoneNumber(this.value);
            const newLength = this.value.length;
            const lengthDifference = newLength - originalLength;
            const newCursorPosition = cursorPosition + lengthDifference;
            this.setSelectionRange(newCursorPosition, newCursorPosition);
        });
        input.addEventListener('keydown', function(e) {
            if ([8, 9, 13, 37, 38, 39, 40, 46].includes(e.keyCode)) {
                return;
            }
            if (!/\d/.test(e.key) && e.key !== '(' && e.key !== ')' && e.key !== '-' && e.key !== ' ') {
                e.preventDefault();
            }
        });
    });
}

// Function to create and show tooltip
function showTooltip(event, text) {
    const button = event.currentTarget;
    
    if (activeTooltipButton === button && activeTooltip) {
        activeTooltip.remove();
        activeTooltip = null;
        activeTooltipButton = null;
        return;
    }
    
    const existingTooltips = document.querySelectorAll('.tooltip-popup');
    existingTooltips.forEach(tooltip => tooltip.remove());
    
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip-popup';
    tooltip.textContent = text;
    
    const rect = button.getBoundingClientRect();
    const topPosition = rect.bottom + 10;
    const tooltipWidth = 300;
    const buttonCenter = rect.left + (rect.width / 2);
    const adjustedLeft = Math.max(10, Math.min(buttonCenter - (tooltipWidth / 2), window.innerWidth - tooltipWidth - 10));
    
    tooltip.style.top = `${topPosition}px`;
    tooltip.style.left = `${adjustedLeft}px`;
    
    document.body.appendChild(tooltip);
    
    activeTooltip = tooltip;
    activeTooltipButton = button;
    
    function closeTooltip() {
        if (tooltip.parentNode) {
            tooltip.remove();
            activeTooltip = null;
            activeTooltipButton = null;
        }
        document.removeEventListener('pointerdown', handleOutsideClick, true);
        document.removeEventListener('keydown', handleEscapeKey);
    }
    
    function handleOutsideClick(e) {
        if (!tooltip.contains(e.target) && e.target !== button) {
            closeTooltip();
        }
    }
    
    function handleEscapeKey(e) {
        if (e.key === 'Escape') {
            closeTooltip();
        }
    }
    
    document.addEventListener('pointerdown', handleOutsideClick, true);
    document.addEventListener('keydown', handleEscapeKey);
    setTimeout(closeTooltip, 5000);
    event.stopPropagation();
}

function setupEditModalTooltips() {
    document.querySelectorAll('.info-icon').forEach(icon => {
        const newIcon = icon.cloneNode(true);
        icon.parentNode.replaceChild(newIcon, icon);
        newIcon.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const tooltipText = this.getAttribute('data-tooltip');
            if (tooltipText) {
                showTooltip(e, tooltipText);
            }
        });
    });
}

/* ============================================================
   Cart clearing function for success page
   ============================================================ */
function clearCartOnSuccessPage() {
    const isSuccessPage = window.location.pathname === '/success' || 
                         window.location.pathname.endsWith('/success') ||
                         window.location.search.includes('session_id=');
    
    if (isSuccessPage) {
        console.log('cart.js: Success page detected, clearing cart...');
        localStorage.removeItem(CART_KEY);
        localStorage.removeItem('skylinks_cart');
        localStorage.removeItem('cart');
        
        setTimeout(() => {
            document.dispatchEvent(new Event('cartUpdated'));
            window.dispatchEvent(new Event('cartUpdated'));
            window.dispatchEvent(new StorageEvent('storage', {
                key: CART_KEY,
                oldValue: 'existing',
                newValue: null,
                storageArea: localStorage
            }));
        }, 10);
        
        setTimeout(() => {
            document.dispatchEvent(new Event('cartUpdated'));
            window.dispatchEvent(new Event('storage'));
        }, 100);
        
        setTimeout(() => {
            document.dispatchEvent(new Event('cartUpdated'));
        }, 500);
        
        return true;
    }
    return false;
}

/* ============================================================
   Add to Cart (from product page popup form)
   ============================================================ */
function addToCart(item) {
    const cart = loadCart();
    cart.push({ id: generateId(), ...item });
    saveCart(cart);
    document.dispatchEvent(new Event('cartUpdated'));
    window.dispatchEvent(new Event('cartUpdated'));
}

/* ============================================================
   Update an item - FIXED: only dispatch events, no direct render
   ============================================================ */
function updateCartItem(id, updatedFields) {
    const cart = loadCart();
    const idx = cart.findIndex(i => i.id === id);
    if (idx !== -1) {
        const existingItem = cart[idx];
        cart[idx] = { 
            ...existingItem,
            ...updatedFields,
            id: existingItem.id,
            roulettePrice: updatedFields.roulettePrice || existingItem.roulettePrice,
            sidePotPrice: updatedFields.sidePotPrice || existingItem.sidePotPrice,
            tournamentId: existingItem.tournamentId,
            productId: existingItem.productId,
            type: existingItem.type,
            name: existingItem.name,
            image: existingItem.image
        };
        
        saveCart(cart);
        console.log('Updated cart item:', cart[idx]);
        console.log('Cart after update:', cart);
        
        // Dispatch events to trigger re-render (listener will call renderCart)
        document.dispatchEvent(new Event('cartUpdated'));
        window.dispatchEvent(new Event('cartUpdated'));
    } else {
        console.error('Item not found in cart:', id);
    }
}

/* ============================================================
   Remove an item
   ============================================================ */
function removeCartItem(itemId) {
    if (!itemId) return;
    let cart = loadCart();
    cart = cart.filter(i => i.id !== itemId);
    saveCart(cart);
    document.dispatchEvent(new Event('cartUpdated'));
    window.dispatchEvent(new Event('cartUpdated'));
}

/* ============================================================
   Render Cart Page
   ============================================================ */
async function renderCart() {
    if (!document.getElementById("cart-rows")) return; 

    if (!imageManagerImages) {
        imageManagerImages = await fetchImagesFromImageManager();
    }

    const cart = loadCart();
    console.log('renderCart: Current cart items:', cart);
    
    const rows = document.getElementById("cart-rows");
    const empty = document.getElementById("cart-empty");
    const summary = document.getElementById("cart-summary");
    const subtotalEl = document.getElementById("cart-subtotal");

    rows.innerHTML = "";

    if (cart.length === 0) {
        empty.style.display = "block";
        summary.style.display = "none";
        return;
    }

    empty.style.display = "none";
    summary.style.display = "block";

    let subtotal = 0;

    for (const item of cart) {
        const row = document.createElement("div");
        row.className = "cart-row sqs-row";

        const imgWrap = document.createElement("div");
        imgWrap.className = "cart-row-img sqs-cart-img";
        
        let tournamentData = null;
        if (item.type === 'tournament' && item.tournamentId) {
            try {
                const response = await fetch(`/api/tournaments/${item.tournamentId}`);
                if (response.ok) {
                    tournamentData = await response.json();
                }
            } catch (error) {}
        }
        
        let imageUrl = item.image;
        if (!imageUrl) {
            imageUrl = getImageForProduct(item.productId, tournamentData);
        }
        
        if (imageUrl) {
            imgWrap.style.backgroundImage = `url('${imageUrl}')`;
            imgWrap.style.backgroundSize = 'cover';
            imgWrap.style.backgroundPosition = 'center';
        } else {
            imgWrap.style.backgroundColor = '#f0f0f0';
            imgWrap.style.display = 'flex';
            imgWrap.style.alignItems = 'center';
            imgWrap.style.justifyContent = 'center';
            imgWrap.innerHTML = '<span style="color: #999;">No Image</span>';
        }

        const desc = document.createElement("div");
        desc.className = "cart-row-desc sqs-cart-desc";
        
        const titleDiv = document.createElement("div");
        titleDiv.className = "cart-row-title";
        titleDiv.textContent = item.name;
        
        const detailsDiv = document.createElement("div");
        detailsDiv.className = "cart-row-details";
        
        if (item.type === 'tournament') {
            let details = [];
            if (item.form.name) details.push(`Player: ${item.form.name}`);
            if (item.form.startingTime) details.push(`Starting Time: ${item.form.startingTime}`);
            if (item.form.cartOption) {
                details.push(`Cart Option: ${item.form.cartOption}`);
                if (item.form.cartOption === 'Cart') {
                    details.push(`Cart Fee: $9.00`);
                }
            }
            if (item.form.sidePots) {
                const sidePotPrice = item.sidePotPrice || 25;
                details.push(`Side Pots (Player 1): $${sidePotPrice}`);
            }
            if (item.form.roulette) {
                const roulettePrice = item.roulettePrice || 30;
                details.push(`Roulette (Player 1): $${roulettePrice}`);
            }
            if (item.form.additionalPlayers && item.form.additionalPlayers.length > 0) {
                const playerDetails = item.form.additionalPlayers.map((p, index) => {
                    const playerNum = index + 2;
                    let details = p.name;
                    if (p.payForPlayer) {
                        details += ' (paid)';
                    }
                    if (playerNum === 2 && p.sidePots) {
                        const sidePotPrice = item.sidePotPrice || 25;
                        details += ` + Side Pots $${sidePotPrice}`;
                    }
                    return details;
                }).join(', ');
                details.push(`Additional Players: ${playerDetails}`);
            }
            // Add notes if present
            if (item.form.notes) {
                details.push(`Notes: ${item.form.notes}`);
            }
            if (item.tournamentId) {
                details.push(`Tournament: ${item.tournamentId}`);
            }
            detailsDiv.textContent = details.join(' | ');
        } else {
            let details = [];
            if (item.form.name) details.push(`Name: ${item.form.name}`);
            if (item.form.email) details.push(`Email: ${item.form.email}`);
            if (item.productId !== 'new-membership' && item.form.ghin) {
                details.push(`GHIN: ${item.form.ghin}`);
            }
            detailsDiv.textContent = details.join(' | ');
        }
        
        const editDetailsBtn = document.createElement("button");
        editDetailsBtn.className = "cart-edit-details-btn";
        editDetailsBtn.textContent = "Edit Details";
        
        desc.appendChild(titleDiv);
        desc.appendChild(detailsDiv);
        desc.appendChild(editDetailsBtn);

        const price = document.createElement("div");
        price.className = "cart-row-price sqs-cart-price";
        price.textContent = `$${item.price.toFixed(2)}`;
        subtotal += item.price;

        const actions = document.createElement("div");
        actions.className = "cart-actions sqs-cart-actions";

        const removeBtn = document.createElement("button");
        removeBtn.className = "cart-action-btn remove-btn";
        removeBtn.textContent = "Remove";
        removeBtn.dataset.itemId = item.id;

        actions.appendChild(removeBtn);

        row.appendChild(imgWrap);
        row.appendChild(desc);
        row.appendChild(price);
        row.appendChild(actions);
        rows.appendChild(row);

        removeBtn.addEventListener("click", (e) => {
            const itemId = e.currentTarget.dataset.itemId;
            removeCartItem(itemId);
        });

        editDetailsBtn.addEventListener("click", () => {
            openEditModal(item, tournamentData);
        });
    }

    subtotalEl.textContent = "$" + subtotal.toFixed(2);
}

/* ============================================================
   Modal Editing
   ============================================================ */

let editingItemId = null;

function openEditModal(item, tournamentData = null) {
    editingItemId = item.id;
    if (item.type === 'tournament') {
        openTournamentEditModal(item, tournamentData);
    } else {
        openMembershipEditModal(item);
    }
}

function openTournamentEditModal(item, tournamentData = null) {
    console.log('openTournamentEditModal called with item:', item);
    console.log('tournamentData:', tournamentData);
    
    const cartOptionEnabled = tournamentData ? tournamentData.cartOption : item.cartOptionEnabled || false;

    let dataToPass = tournamentData;
    if (!dataToPass) {
        console.log('No tournament data passed, building from item properties');
        dataToPass = {
            sidePotOption: item.sidePotOptionEnabled !== false,
            rouletteOption: item.rouletteOptionEnabled !== false,
            cartOption: item.cartOptionEnabled || false,
            sidePot: item.sidePotPrice || 25,
            roulette: item.roulettePrice || 30,
            price: item.basePrice || 0,
            title: item.name || 'Tournament'
        };
        console.log('Built dataToPass from item:', dataToPass);
    } else {
        console.log('Using passed tournamentData:', dataToPass);
    }

    window.tournamentDataForEditModal = dataToPass;
    console.log('Set window.tournamentDataForEditModal:', window.tournamentDataForEditModal);

    fetch("/cart/edit-tournament-modal.html")
        .then(res => {
            if (!res.ok) throw new Error('Tournament edit modal not found');
            return res.text();
        })
        .then(html => {
            console.log('Edit modal HTML loaded successfully');
            let modifiedHtml = html;

            if (!cartOptionEnabled) {
                modifiedHtml = modifiedHtml.replace(
                    /<!-- Cart Option Dropdown \(Conditional\) -->[\s\S]*?<!-- \/Cart Option Dropdown -->/,
                    ''
                );
            }

            const existingModal = document.getElementById("edit-modal");
            if (existingModal) existingModal.remove();

            const modalContainer = document.createElement("div");
            modalContainer.id = "edit-modal";
            
            // Extract script content from HTML
            const scriptMatch = modifiedHtml.match(/<script>([\s\S]*?)<\/script>/);
            const scriptContent = scriptMatch ? scriptMatch[1] : '';
            
            // Remove script tags from HTML (we'll execute manually)
            const htmlWithoutScript = modifiedHtml.replace(/<script>[\s\S]*?<\/script>/, '');
            
            modalContainer.innerHTML = htmlWithoutScript;
            document.body.appendChild(modalContainer);
            console.log('Edit modal added to DOM');

            // Execute the script manually
            if (scriptContent) {
                console.log('Executing modal script...');
                try {
                    const scriptElement = document.createElement('script');
                    scriptElement.textContent = scriptContent;
                    document.body.appendChild(scriptElement);
                    console.log('Modal script executed');
                } catch (error) {
                    console.error('Error executing modal script:', error);
                }
            }

            // Now the functions should be available, call them
            setTimeout(() => {
                if (typeof window.setTournamentDataForEditModal === 'function') {
                    console.log('Calling window.setTournamentDataForEditModal with dataToPass');
                    window.setTournamentDataForEditModal(dataToPass);
                } else {
                    console.error('window.setTournamentDataForEditModal still not available');
                }
            }, 50);

            // Fill form values - use a simpler, more direct approach
            console.log('Filling form values from item:', item);
            
            // Basic fields
            document.getElementById("modal-name").value = item.form.name || "";
            document.getElementById("modal-email").value = item.form.email || "";
            document.getElementById("modal-phone").value = formatPhoneNumber(item.form.phone || "");
            document.getElementById("modal-ghin").value = item.form.ghin || "";
            document.getElementById("side-pots").checked = item.form.sidePots || false;
            document.getElementById("roulette").checked = item.form.roulette || false;
            
            // Set starting time - using a simpler approach
            const startingTimeSelect = document.getElementById("starting-time");
            if (startingTimeSelect && item.form.startingTime) {
                console.log('Setting starting time to:', item.form.startingTime);
                startingTimeSelect.value = item.form.startingTime;
                console.log('Starting time value after setting:', startingTimeSelect.value);
                if (startingTimeSelect.value !== item.form.startingTime) {
                    for (let i = 0; i < startingTimeSelect.options.length; i++) {
                        if (startingTimeSelect.options[i].text === item.form.startingTime || 
                            startingTimeSelect.options[i].value === item.form.startingTime) {
                            startingTimeSelect.selectedIndex = i;
                            console.log('Found by text match, selected index:', i);
                            break;
                        }
                    }
                }
            } else if (startingTimeSelect) {
                console.log('No starting time value to set, resetting to placeholder');
                startingTimeSelect.selectedIndex = 0;
            }

            // Set cart option if enabled
            if (cartOptionEnabled) {
                const cartOptionSelect = document.getElementById("cart-option");
                if (cartOptionSelect && item.form.cartOption) {
                    console.log('Setting cart option to:', item.form.cartOption);
                    cartOptionSelect.value = item.form.cartOption;
                    if (cartOptionSelect.value !== item.form.cartOption) {
                        for (let i = 0; i < cartOptionSelect.options.length; i++) {
                            if (cartOptionSelect.options[i].text === item.form.cartOption || 
                                cartOptionSelect.options[i].value === item.form.cartOption) {
                                cartOptionSelect.selectedIndex = i;
                                break;
                            }
                        }
                    }
                }
            }

            // Fill additional players
            for (let i = 0; i < 3; i++) {
                const playerIndex = i + 2;
                const player = item.form.additionalPlayers ? item.form.additionalPlayers[i] : null;
                if (player) {
                    document.getElementById(`modal-name${playerIndex}`).value = player.name || "";
                    document.getElementById(`modal-email${playerIndex}`).value = player.email || "";
                    document.getElementById(`modal-phone${playerIndex}`).value = formatPhoneNumber(player.phone || "");
                    document.getElementById(`modal-ghin${playerIndex}`).value = player.ghin || "";

                    const payCheckbox = document.getElementById(`pay-player${playerIndex}`);
                    if (payCheckbox) payCheckbox.checked = player.payForPlayer || false;

                    if (playerIndex === 2) {
                        const sidePotsCheckbox = document.getElementById(`player2-sidepots`);
                        if (sidePotsCheckbox) {
                            console.log('Setting Player 2 side pots checked to:', player.sidePots || false);
                            sidePotsCheckbox.checked = player.sidePots || false;
                        }
                    }
                }
            }

            // Fill notes
            const notesInput = document.getElementById('modal-notes');
            if (notesInput) {
                notesInput.value = item.form.notes || '';
            }

            const roulettePriceEl = document.getElementById('roulette-price');
            const sidePotPriceEl = document.getElementById('side-pot-price');
            const player2SidePotPriceEl = document.getElementById('player2-sidepot-price');

            if (roulettePriceEl) roulettePriceEl.textContent = '$' + (item.roulettePrice || 30);
            if (sidePotPriceEl) sidePotPriceEl.textContent = '$' + (item.sidePotPrice || 25);
            if (player2SidePotPriceEl) player2SidePotPriceEl.textContent = '$' + (item.sidePotPrice || 25);

            // Double-check starting time after a delay (in case the dropdown was re-rendered)
            setTimeout(() => {
                const startingTimeSelect = document.getElementById("starting-time");
                if (startingTimeSelect && item.form.startingTime) {
                    console.log('Double-check starting time, current value:', startingTimeSelect.value);
                    if (startingTimeSelect.value !== item.form.startingTime) {
                        console.log('Re-setting starting time to:', item.form.startingTime);
                        startingTimeSelect.value = item.form.startingTime;
                        if (startingTimeSelect.value !== item.form.startingTime) {
                            for (let i = 0; i < startingTimeSelect.options.length; i++) {
                                if (startingTimeSelect.options[i].text === item.form.startingTime || 
                                    startingTimeSelect.options[i].value === item.form.startingTime) {
                                    startingTimeSelect.selectedIndex = i;
                                    console.log('Found by text match on double-check, selected index:', i);
                                    break;
                                }
                            }
                        }
                    }
                }
            }, 100);

            setTimeout(() => {
                console.log('Calling window.updatePlayer2SidePotVisibility after delay');
                if (typeof window.updatePlayer2SidePotVisibility === 'function') {
                    window.updatePlayer2SidePotVisibility();
                } else {
                    console.warn('window.updatePlayer2SidePotVisibility not available, forcing manual visibility');
                    const container = document.getElementById('player2-sidepot-container');
                    if (container) {
                        const sidePotEnabled = dataToPass && dataToPass.sidePotOption !== false;
                        console.log('Manually setting container display to:', sidePotEnabled ? 'flex' : 'none');
                        container.style.display = sidePotEnabled ? 'flex' : 'none';
                    }
                }
                setupEditModalPhoneFormatting();
                setupEditModalGHINFormatting();
                setupEditModalTooltips();
            }, 200);

            if (typeof initMemberAutocomplete === 'function') {
                setTimeout(() => initMemberAutocomplete(), 150);
            }

            modalContainer.style.display = "flex";
            bindEditModalEvents();
        })
        .catch(error => {
            console.error('Error loading edit modal:', error);
            openSimpleEditModal(item);
        });
}

function openMembershipEditModal(item) {
    fetch("/cart/edit-membership-modal.html")
        .then(res => {
            if (!res.ok) throw new Error('Membership edit modal not found');
            return res.text();
        })
        .then(html => {
            const existingModal = document.getElementById("edit-modal");
            if (existingModal) existingModal.remove();
            
            const modalContainer = document.createElement("div");
            modalContainer.id = "edit-modal";
            modalContainer.innerHTML = html;
            document.body.appendChild(modalContainer);
            
            const membershipType = item.productId || 'membership-renewal';
            configureGHINField(membershipType, item);
            
            document.getElementById("modal-name").value = item.form.name || "";
            document.getElementById("modal-email").value = item.form.email || "";
            const phoneValue = item.form.phone || "";
            document.getElementById("modal-phone").value = formatPhoneNumber(phoneValue);
            
            const ghinInput = document.getElementById("modal-ghin");
            if (ghinInput && item.form.ghin) {
                ghinInput.value = item.form.ghin;
            }
            
            setTimeout(() => {
                setupEditModalPhoneFormatting();
                setupEditModalGHINFormatting();
            }, 50);
            
            if (membershipType === 'membership-renewal' && typeof initMemberAutocomplete === 'function') {
                setTimeout(() => initMemberAutocomplete(), 100);
            }
            
            modalContainer.style.display = "flex";
            bindEditModalEvents();
        })
        .catch(error => {
            console.error('Error loading edit modal:', error);
            openSimpleEditModal(item);
        });
}

function configureGHINField(membershipType, item) {
    const ghinRow = document.getElementById('ghin-row');
    const ghinInput = document.getElementById('modal-ghin');
    const ghinHint = document.getElementById('ghin-hint');
    const membershipBadge = document.getElementById('membership-type-badge');
    
    if (!ghinRow || !ghinInput) return;
    
    if (membershipType === 'new-membership') {
        ghinRow.style.display = 'none';
        ghinInput.required = false;
        if (membershipBadge) {
            membershipBadge.textContent = 'New Membership';
            membershipBadge.style.backgroundColor = '#e3f2fd';
            membershipBadge.style.color = '#1976d2';
        }
        if (ghinHint) {
            ghinHint.style.display = 'block';
            ghinHint.textContent = 'GHIN is not required for new memberships';
        }
    } else {
        ghinRow.style.display = 'flex';
        ghinInput.required = true;
        if (membershipBadge) {
            membershipBadge.textContent = 'Renewal';
            membershipBadge.style.backgroundColor = '#fff3e0';
            membershipBadge.style.color = '#ed6c02';
        }
        if (ghinHint) {
            ghinHint.style.display = 'none';
        }
    }
}

function openSimpleEditModal(item) {
    const existingModal = document.getElementById("edit-modal");
    if (existingModal) existingModal.remove();
    
    const modalContainer = document.createElement("div");
    modalContainer.id = "edit-modal";
    modalContainer.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.45); 
        display: flex; align-items: center; justify-content: center; 
        z-index: 2000; display: none;
    `;
    
    modalContainer.innerHTML = `
        <div style="width:720px; max-width:95%; background:#fff; border-radius:8px; padding:20px; box-shadow:0 10px 30px rgba(0,0,0,.2);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0;">Edit Item Details</h3>
                <button id="modal-close" style="background:transparent; border:none; font-size:18px; cursor:pointer;">✕</button>
            </div>
            <div style="margin-top:12px;">
                <label for="modal-name">Name</label>
                <input id="modal-name" type="text" style="width:100%; padding:8px; margin-bottom:8px;" />
                <label for="modal-email">Email</label>
                <input id="modal-email" type="email" style="width:100%; padding:8px; margin-bottom:8px;" />
                <label for="modal-phone">Phone</label>
                <input id="modal-phone" type="text" style="width:100%; padding:8px; margin-bottom:8px;" />
                <label for="modal-ghin">GHIN Number</label>
                <input id="modal-ghin" type="text" style="width:100%; padding:8px; margin-bottom:8px;" />
                <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px;">
                    <button id="modal-close-2" class="btn" style="border-radius:24px; padding:8px 14px; background:transparent; border:1px solid #ddd;">Cancel</button>
                    <button id="modal-save" class="btn" style="border-radius:24px; padding:8px 14px; background:#000; color:#fff;">Save</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modalContainer);
    document.getElementById("modal-name").value = item.form.name || "";
    document.getElementById("modal-email").value = item.form.email || "";
    const phoneValue = item.form.phone || "";
    document.getElementById("modal-phone").value = formatPhoneNumber(phoneValue);
    document.getElementById("modal-ghin").value = item.form.ghin || "";
    
    setTimeout(() => {
        setupEditModalPhoneFormatting();
        setupEditModalGHINFormatting();
    }, 50);
    
    modalContainer.style.display = "flex";
    bindEditModalEvents();
}

/* ============================================================
   FIXED: bindEditModalEvents - uses event delegation, disables buttons during save
   ============================================================ */
function bindEditModalEvents() {
    const modal = document.getElementById("edit-modal");
    if (!modal) return;

    // Prevent attaching multiple delegation listeners
    if (modal.dataset.bound === 'true') return;
    modal.dataset.bound = 'true';

    // Close modal on backdrop click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeEditModal();
        }
    });

    // Delegate button clicks
    modal.addEventListener('click', function(e) {
        const button = e.target.closest('button');
        if (!button) return;

        const id = button.id;

        // Cancel buttons
        if (id === 'modal-close-2' || id === 'modal-close') {
            e.preventDefault();
            closeEditModal();
            return;
        }

        // Save buttons
        if (id === 'modal-save' || id === 'modal-save-top') {
            e.preventDefault();
            e.stopPropagation();

            // Prevent double-clicks / concurrent saves
            if (isSaving) {
                console.log('Save already in progress, ignoring click');
                return;
            }

            console.log('Save button clicked:', id);
            saveEditModal();
        }
    });
}

function closeEditModal() {
    const modal = document.getElementById("edit-modal");
    if (modal) {
        modal.style.display = "none";
        setTimeout(() => modal.remove(), 300);
    }
    editingItemId = null;
}

/* ============================================================
   FIXED: saveEditModal - adds saving flag and disables buttons
   ============================================================ */
function saveEditModal() {
    if (!editingItemId) {
        console.error('No item ID set for editing');
        return;
    }

    // Prevent concurrent saves
    if (isSaving) {
        console.log('Save already in progress');
        return;
    }

    console.log('saveEditModal called for item ID:', editingItemId);

    // Disable save buttons to prevent double clicks
    const saveButtons = document.querySelectorAll('#modal-save, #modal-save-top');
    saveButtons.forEach(btn => btn.disabled = true);

    isSaving = true;

    try {
        const cart = loadCart();
        const item = cart.find(i => i.id === editingItemId);
        if (!item) {
            console.error('Item not found in cart:', editingItemId);
            isSaving = false;
            saveButtons.forEach(btn => btn.disabled = false);
            return;
        }

        console.log('Saving edit for item:', item);

        if (item.type === 'tournament') {
            saveTournamentEditModal();
        } else {
            saveMembershipEditModal();
        }
    } catch (error) {
        console.error('Error saving edit:', error);
        isSaving = false;
        saveButtons.forEach(btn => btn.disabled = false);
    }
}

function saveTournamentEditModal() {
    const cart = loadCart();
    const item = cart.find(i => i.id === editingItemId);
    if (!item) {
        console.error('Item not found in cart during save:', editingItemId);
        // Reset saving state and re-enable buttons
        isSaving = false;
        document.querySelectorAll('#modal-save, #modal-save-top').forEach(btn => btn.disabled = false);
        return;
    }
    
    console.log('saveTournamentEditModal - item before update:', item);
    
    const cartOptionEnabled = item.cartOptionEnabled || false;
    
    const updatedForm = {
        name: document.getElementById("modal-name").value,
        email: document.getElementById("modal-email").value,
        phone: document.getElementById("modal-phone").value,
        ghin: document.getElementById("modal-ghin").value,
        sidePots: document.getElementById("side-pots").checked,
        roulette: document.getElementById("roulette").checked,
        startingTime: document.getElementById("starting-time").value
    };
    
    let cartOptionAddedPrice = 0;
    if (cartOptionEnabled && document.getElementById("cart-option")) {
        updatedForm.cartOption = document.getElementById("cart-option").value;
        if (document.getElementById("cart-option").value === 'Cart') {
            cartOptionAddedPrice = 9.00;
            updatedForm.cartOptionAddedPrice = cartOptionAddedPrice;
        }
    }
    
    const additionalPlayers = [];
    let additionalPlayersTotalFee = 0;
    const basePrice = parseFloat(item.basePrice || (item.form.tournamentPrice || 0));
    let player2SidePotsAdded = false;
    
    const roulettePrice = parseFloat(item.roulettePrice || 30);
    const sidePotPrice = parseFloat(item.sidePotPrice || 25);
    
    let addons = [];
    let addonsTotal = 0;
    
    if (updatedForm.sidePots) {
        addons.push({ name: 'Side Pots (Player 1)', price: sidePotPrice });
        addonsTotal += sidePotPrice;
    }
    
    if (updatedForm.roulette) {
        addons.push({ name: 'Roulette (Player 1)', price: roulettePrice });
        addonsTotal += roulettePrice;
    }
    
    for (let i = 2; i <= 4; i++) {
        const nameInput = document.getElementById(`modal-name${i}`);
        if (nameInput && nameInput.value) {
            const payCheckbox = document.getElementById(`pay-player${i}`);
            
            let playerSidePots = false;
            if (i === 2) {
                const sidePotsCheckbox = document.getElementById(`player2-sidepots`);
                if (sidePotsCheckbox) {
                    playerSidePots = sidePotsCheckbox.checked;
                    if (playerSidePots) {
                        player2SidePotsAdded = true;
                        addons.push({ name: 'Side Pots (Player 2)', price: sidePotPrice });
                        addonsTotal += sidePotPrice;
                    }
                }
            }
            
            const playerData = {
                name: nameInput.value,
                email: document.getElementById(`modal-email${i}`).value,
                phone: document.getElementById(`modal-phone${i}`).value,
                ghin: document.getElementById(`modal-ghin${i}`).value,
                payForPlayer: payCheckbox ? payCheckbox.checked : false,
                sidePots: playerSidePots
            };
            additionalPlayers.push(playerData);
            if (playerData.payForPlayer) {
                additionalPlayersTotalFee += basePrice;
            }
        }
    }
    updatedForm.additionalPlayers = additionalPlayers;
    updatedForm.player2SidePots = player2SidePotsAdded;
    updatedForm.addons = addons;
    updatedForm.addonsTotal = addonsTotal;

    // Capture notes
    const notesInput = document.getElementById('modal-notes');
    if (notesInput) {
        updatedForm.notes = notesInput.value.trim();
    } else {
        updatedForm.notes = '';
    }
    
    const totalPrice = basePrice + addonsTotal + cartOptionAddedPrice + additionalPlayersTotalFee;
    
    console.log('saveTournamentEditModal - calculated totalPrice:', totalPrice);
    console.log('saveTournamentEditModal - updatedForm:', updatedForm);
    
    updateCartItem(editingItemId, { 
        form: updatedForm,
        price: totalPrice
    });
    
    // Close modal and reset saving state after a short delay
    setTimeout(() => {
        closeEditModal();
        isSaving = false;
        document.querySelectorAll('#modal-save, #modal-save-top').forEach(btn => btn.disabled = false);
    }, 150);
}

function saveMembershipEditModal() {
    const ghinInput = document.getElementById("modal-ghin");
    const membershipBadge = document.getElementById('membership-type-badge');
    const membershipType = membershipBadge ? 
        (membershipBadge.textContent === 'New Membership' ? 'new-membership' : 'membership-renewal') : 
        'membership-renewal';
    
    const updatedForm = {
        name: document.getElementById("modal-name").value,
        email: document.getElementById("modal-email").value,
        phone: document.getElementById("modal-phone").value,
    };
    
    if (membershipType === 'membership-renewal' && ghinInput) {
        if (!ghinInput.value.trim()) {
            alert('GHIN number is required for membership renewal');
            // Reset saving state and re-enable buttons
            isSaving = false;
            document.querySelectorAll('#modal-save, #modal-save-top').forEach(btn => btn.disabled = false);
            return;
        }
        updatedForm.ghin = ghinInput.value;
    }

    updateCartItem(editingItemId, { form: updatedForm });
    
    setTimeout(() => {
        closeEditModal();
        isSaving = false;
        document.querySelectorAll('#modal-save, #modal-save-top').forEach(btn => btn.disabled = false);
    }, 150);
}

// Initialize cart when DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
    console.log('cart.js: DOMContentLoaded - Starting initialization');
    clearCartOnSuccessPage();
    if (!imageManagerImages) {
        imageManagerImages = await fetchImagesFromImageManager();
    }
    renderCart();
    setTimeout(clearCartOnSuccessPage, 100);
    setTimeout(clearCartOnSuccessPage, 500);
});

document.addEventListener("cartUpdated", () => {
    console.log('cart.js: cartUpdated event received, re-rendering');
    renderCart();
});

/* ============================================================
   Enhanced Stripe Checkout Handler
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
    const checkoutButton = document.getElementById("checkout-button");
    if (!checkoutButton) return;

    checkoutButton.addEventListener("click", async () => {
        const cart = loadCart();
        if (cart.length === 0) return;

        let customerEmail = '';
        let customerName = '';
        
        for (const item of cart) {
            if (item.form && item.form.email) {
                customerEmail = item.form.email;
                if (item.form.name) {
                    customerName = item.form.name;
                }
                break;
            }
        }
        
        if (!customerEmail) {
            customerEmail = prompt("Please enter your email address for the receipt:");
            if (!customerEmail) {
                alert("Email is required for checkout.");
                return;
            }
        }

        checkoutButton.disabled = true;
        checkoutButton.textContent = "Processing...";

        try {
            const response = await fetch("/api/create-checkout-session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cartItems: cart,
                    customerEmail: customerEmail,
                    customerName: customerName
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to create checkout session');
            }

            window.location.href = data.url;
            
        } catch (error) {
            alert("Error during checkout: " + error.message);
            checkoutButton.disabled = false;
            checkoutButton.textContent = "Checkout";
        }
    });
});

function checkForSuccessfulReturn() {
    return clearCartOnSuccessPage();
}

document.addEventListener("DOMContentLoaded", () => {
    checkForSuccessfulReturn();
});

console.log('cart.js: Script loading, checking for success page...');
clearCartOnSuccessPage();