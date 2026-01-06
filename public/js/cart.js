/* ============================================================
   Skylinks Custom Cart
   Fully LocalStorage Cart + Stripe Checkout
   ============================================================ */

const CART_KEY = "skylinks_cart_v1";

// Store images from Image Manager
let imageManagerImages = null;

// Auto-clear cart if on the success page
if (window.location.pathname.includes("success")) {
  localStorage.removeItem(CART_KEY);
}

// Store tooltip state globally (same as product.js)
let activeTooltip = null;
let activeTooltipButton = null;

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
  return "item_" + Math.random().toString(36).substr(2, 9);
}

// Function to fetch images from Image Manager API
async function fetchImagesFromImageManager() {
  try {
    const response = await fetch('/api/images');
    
    // Check if we got HTML instead of JSON
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

// Get image URL from Image Manager data based on product ID
function getImageForProduct(productId) {
  if (!imageManagerImages || !Array.isArray(imageManagerImages)) {
    console.warn('No images available from Image Manager');
    return ''; // Return empty string instead of fallback
  }
  
  // Map product IDs to image keys
  const imageKeyMap = {
    'new-membership': 'new-membership',
    'membership-renewal': 'membership-renewal',
    'monthly-tournament': 'tournament-entry',
    'monthly-tournament2': 'tournament-entry'
  };
  
  const imageKey = imageKeyMap[productId];
  if (!imageKey) {
    console.warn(`No image key mapping for product: ${productId}`);
    return '';
  }
  
  const imageData = imageManagerImages.find(img => img.id === imageKey);
  if (imageData && imageData.imageUrl) {  // CHANGED: from imageData.url to imageData.imageUrl
    return imageData.imageUrl;  // CHANGED: from imageData.url to imageData.imageUrl
  }
  
  console.warn(`No image found for product key: ${imageKey} (product: ${productId})`);
  return ''; // Return empty string if no image found
}

// Phone number formatting function (same as in product.js)
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

// GHIN formatting function - limit to 8 digits only
function setupEditModalGHINFormatting() {
  const ghinInputs = document.querySelectorAll('#edit-modal input[id*="ghin"]');
  ghinInputs.forEach(input => {
    // Format existing value on load - remove non-numeric and limit to 8
    if (input.value) {
      input.value = input.value.replace(/\D/g, '').slice(0, 8);
    }
    
    // Add input event listener for real-time formatting
    input.addEventListener('input', function(e) {
      // Remove non-numeric characters and limit to 8 digits
      this.value = this.value.replace(/\D/g, '').slice(0, 8);
    });
    
    // Only allow numbers and navigation keys
    input.addEventListener('keydown', function(e) {
      // Allow navigation keys, delete, backspace, tab
      if ([8, 9, 13, 37, 38, 39, 40, 46].includes(e.keyCode)) {
        return;
      }
      
      // Allow numbers only
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
    // Format existing value on load
    if (input.value) {
      input.value = formatPhoneNumber(input.value);
    }
    
    // Add input event listener for real-time formatting
    input.addEventListener('input', function(e) {
      const cursorPosition = this.selectionStart;
      const originalLength = this.value.length;
      
      this.value = formatPhoneNumber(this.value);
      
      const newLength = this.value.length;
      const lengthDifference = newLength - originalLength;
      const newCursorPosition = cursorPosition + lengthDifference;
      
      this.setSelectionRange(newCursorPosition, newCursorPosition);
    });
    
    // Only allow numbers and navigation keys
    input.addEventListener('keydown', function(e) {
      // Allow navigation keys, delete, backspace, tab
      if ([8, 9, 13, 37, 38, 39, 40, 46].includes(e.keyCode)) {
        return;
      }
      
      // Allow numbers only
      if (!/\d/.test(e.key)) {
        e.preventDefault();
      }
    });
  });
}

// Function to create and show tooltip (same as product.js)
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

// Setup tooltips for edit modal (same as product.js)
function setupEditModalTooltips() {
  // Add click handlers to info icons in the edit modal
  document.querySelectorAll('.info-icon').forEach(icon => {
    // Remove existing listeners by cloning
    const newIcon = icon.cloneNode(true);
    icon.parentNode.replaceChild(newIcon, icon);
    
    // Add click listener (same as product.js)
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
   Add to Cart (from product page popup form)
   ============================================================ */
function addToCart(item) {
  const cart = loadCart();
  cart.push({ id: generateId(), ...item });
  saveCart(cart);
  document.dispatchEvent(new Event('cartUpdated'));
}

/* ============================================================
   Update an item - UPDATED to handle dynamic add-on prices
   ============================================================ */
function updateCartItem(id, updatedFields) {
  const cart = loadCart();
  const idx = cart.findIndex(i => i.id === id);
  if (idx !== -1) {
    // Check if this is a tournament item with form data
    if (cart[idx].type === 'tournament' && updatedFields.form) {
      // Get the original item to preserve add-on price data
      const originalItem = cart[idx];
      // Update with new values while preserving add-on prices
      cart[idx] = { 
        ...cart[idx], 
        ...updatedFields,
        // Preserve original add-on price data if not being updated
        roulettePrice: updatedFields.roulettePrice || cart[idx].roulettePrice,
        sidePotPrice: updatedFields.sidePotPrice || cart[idx].sidePotPrice
      };
    } else {
      cart[idx] = { ...cart[idx], ...updatedFields };
    }
    saveCart(cart);
  }
}

/* ============================================================
   Remove an item - FIXED VERSION
   ============================================================ */
function removeCartItem(itemId) {
  let cart = loadCart();
  cart = cart.filter(i => i.id !== itemId);
  saveCart(cart);
  document.dispatchEvent(new Event('cartUpdated'));
}

/* ============================================================
   Render Cart Page - UPDATED to use Image Manager images
   ============================================================ */
async function renderCart() {
  if (!document.getElementById("cart-rows")) return; // not on cart page

  // Load images from Image Manager if not already loaded
  if (!imageManagerImages) {
    imageManagerImages = await fetchImagesFromImageManager();
  }

  const cart = loadCart();

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

  cart.forEach(item => {
    const row = document.createElement("div");
    row.className = "cart-row sqs-row";

    /* Image */
    const imgWrap = document.createElement("div");
    imgWrap.className = "cart-row-img sqs-cart-img";
    
    // Get image from Image Manager or use the stored image
    let imageUrl = item.image;
    if (!imageUrl) {
      imageUrl = getImageForProduct(item.productId);
    }
    
    if (imageUrl) {
      imgWrap.style.backgroundImage = `url('${imageUrl}')`;
      imgWrap.style.backgroundSize = 'cover';
      imgWrap.style.backgroundPosition = 'center';
    } else {
      // Show placeholder if no image
      imgWrap.style.backgroundColor = '#f0f0f0';
      imgWrap.style.display = 'flex';
      imgWrap.style.alignItems = 'center';
      imgWrap.style.justifyContent = 'center';
      imgWrap.innerHTML = '<span style="color: #999;">No Image</span>';
    }

    /* Description column */
    const desc = document.createElement("div");
    desc.className = "cart-row-desc sqs-cart-desc";
    
    // Create title
    const titleDiv = document.createElement("div");
    titleDiv.className = "cart-row-title";
    titleDiv.textContent = item.name;
    
    // Display details based on item type
    const detailsDiv = document.createElement("div");
    detailsDiv.className = "cart-row-details";
    
    if (item.type === 'tournament') {
      // Tournament details
      let details = [];
      if (item.form.name) details.push(`Player: ${item.form.name}`);
      if (item.form.startingTime) details.push(`Starting Time: ${item.form.startingTime}`);
      
      // Add cart option if enabled
      if (item.form.cartOption) {
        details.push(`Cart Option: ${item.form.cartOption}`);
        if (item.form.cartOption === 'Cart') {
          details.push(`Cart Fee: $9.00`);
        }
      }
      
      // Add-ons with dynamic prices
      if (item.form.sidePots) {
        const sidePotPrice = item.sidePotPrice || 25;
        details.push(`Side Pots: $${sidePotPrice}`);
      }
      if (item.form.roulette) {
        const roulettePrice = item.roulettePrice || 30;
        details.push(`Roulette: $${roulettePrice}`);
      }
      
      // Additional players
      if (item.form.additionalPlayers && item.form.additionalPlayers.length > 0) {
        details.push(`Additional Players: ${item.form.additionalPlayers.length}`);
      }
      
      detailsDiv.textContent = details.join(' | ');
    } else {
      // Membership details
      let details = [];
      if (item.form.name) details.push(`Name: ${item.form.name}`);
      if (item.form.email) details.push(`Email: ${item.form.email}`);
      if (item.form.ghin) details.push(`GHIN: ${item.form.ghin}`);
      
      detailsDiv.textContent = details.join(' | ');
    }
    
    // Edit details button
    const editDetailsBtn = document.createElement("button");
    editDetailsBtn.className = "cart-edit-details-btn";
    editDetailsBtn.textContent = "Edit Details";
    
    desc.appendChild(titleDiv);
    desc.appendChild(detailsDiv);
    desc.appendChild(editDetailsBtn);

    /* Price */
    const price = document.createElement("div");
    price.className = "cart-row-price sqs-cart-price";
    price.textContent = `$${item.price.toFixed(2)}`;
    subtotal += item.price;

    /* Actions (remove only) */
    const actions = document.createElement("div");
    actions.className = "cart-actions sqs-cart-actions";

    const removeBtn = document.createElement("button");
    removeBtn.className = "cart-action-btn remove-btn";
    removeBtn.textContent = "Remove";

    // Store the item ID as a data attribute
    removeBtn.dataset.itemId = item.id;

    actions.appendChild(removeBtn);

    /* Build row */
    row.appendChild(imgWrap);
    row.appendChild(desc);
    row.appendChild(price);
    row.appendChild(actions);

    rows.appendChild(row);

    /* ======================================================
       Remove Handler - FIXED VERSION
       ====================================================== */
    removeBtn.addEventListener("click", (e) => {
      const itemId = e.currentTarget.dataset.itemId;
      console.log('Removing item with ID:', itemId);
      removeCartItem(itemId);
      renderCart();
    });

    /* ======================================================
       Edit Handler (open modal)
       ====================================================== */
    editDetailsBtn.addEventListener("click", () => {
      openEditModal(item);
    });
  });

  subtotalEl.textContent = "$" + subtotal.toFixed(2);
}

/* ============================================================
   Modal Editing
   ============================================================ */

let editingItemId = null;

function openEditModal(item) {
  editingItemId = item.id;
  
  // Determine which edit modal to use based on item type
  if (item.type === 'tournament') {
    openTournamentEditModal(item);
  } else {
    openMembershipEditModal(item);
  }
}

function openTournamentEditModal(item) {
  // Check if cart option is enabled for this tournament
  const cartOptionEnabled = item.cartOptionEnabled || false;
  
  // Load tournament edit modal
  fetch("/cart/edit-tournament-modal.html")
    .then(res => {
      if (!res.ok) throw new Error('Tournament edit modal not found');
      return res.text();
    })
    .then(html => {
      // Modify HTML to conditionally include cart option based on tournament settings
      let modifiedHtml = html;
      
      // If cart option is not enabled, remove the cart option section
      if (!cartOptionEnabled) {
        // Remove the cart option container div
        modifiedHtml = modifiedHtml.replace(
          /<!-- Cart Option Dropdown \(Conditional\) -->[\s\S]*?<!-- \/Cart Option Dropdown -->/,
          ''
        );
      }
      
      // Remove existing modal if any
      const existingModal = document.getElementById("edit-modal");
      if (existingModal) existingModal.remove();
      
      // Create new modal container
      const modalContainer = document.createElement("div");
      modalContainer.id = "edit-modal";
      modalContainer.innerHTML = modifiedHtml;
      document.body.appendChild(modalContainer);
      
      // Fill form values
      document.getElementById("modal-name").value = item.form.name || "";
      document.getElementById("modal-email").value = item.form.email || "";
      
      // Format phone number
      const phoneValue = item.form.phone || "";
      document.getElementById("modal-phone").value = formatPhoneNumber(phoneValue);
      
      document.getElementById("modal-ghin").value = item.form.ghin || "";
      document.getElementById("side-pots").checked = item.form.sidePots || false;
      document.getElementById("roulette").checked = item.form.roulette || false;
      document.getElementById("starting-time").value = item.form.startingTime || "";
      
      // Fill cart option if enabled and exists
      if (cartOptionEnabled && document.getElementById("cart-option")) {
        document.getElementById("cart-option").value = item.form.cartOption || "";
      }
      
      // Fill additional players
      for (let i = 0; i < 3; i++) {
        const playerIndex = i + 2;
        const player = item.form.additionalPlayers ? item.form.additionalPlayers[i] : null;
        
        if (player) {
          document.getElementById(`modal-name${playerIndex}`).value = player.name || "";
          document.getElementById(`modal-email${playerIndex}`).value = player.email || "";
          
          // Format phone number
          const playerPhoneValue = player.phone || "";
          document.getElementById(`modal-phone${playerIndex}`).value = formatPhoneNumber(playerPhoneValue);
          
          document.getElementById(`modal-ghin${playerIndex}`).value = player.ghin || "";
        }
      }
      
      // Update price displays in modal with item's specific prices
      const roulettePriceEl = document.getElementById('roulette-price');
      const sidePotPriceEl = document.getElementById('side-pot-price');
      const rouletteCheckbox = document.getElementById('roulette');
      const sidePotsCheckbox = document.getElementById('side-pots');
      
      if (roulettePriceEl) {
        const roulettePrice = item.roulettePrice || 30;
        roulettePriceEl.textContent = '$' + roulettePrice;
      }
      if (sidePotPriceEl) {
        const sidePotPrice = item.sidePotPrice || 25;
        sidePotPriceEl.textContent = '$' + sidePotPrice;
      }
      if (rouletteCheckbox) {
        const roulettePrice = item.roulettePrice || 30;
        rouletteCheckbox.value = roulettePrice;
      }
      if (sidePotsCheckbox) {
        const sidePotPrice = item.sidePotPrice || 25;
        sidePotsCheckbox.value = sidePotPrice;
      }
      
      // Setup phone formatting AFTER values are set
      setTimeout(() => {
        setupEditModalPhoneFormatting();
        setupEditModalGHINFormatting();
        setupEditModalTooltips(); // ADDED: Setup tooltips for edit modal
      }, 50);
      
      // Initialize autocomplete
      if (typeof initMemberAutocomplete === 'function') {
        setTimeout(() => initMemberAutocomplete(), 100);
      }
      
      // Show modal
      modalContainer.style.display = "flex";
      
      // Bind events
      bindEditModalEvents();
    })
    .catch(error => {
      console.error('Error loading tournament edit modal:', error);
      openSimpleEditModal(item);
    });
}

function openMembershipEditModal(item) {
  // Load membership edit modal
  fetch("/cart/edit-membership-modal.html")
    .then(res => {
      if (!res.ok) throw new Error('Membership edit modal not found');
      return res.text();
    })
    .then(html => {
      // Remove existing modal if any
      const existingModal = document.getElementById("edit-modal");
      if (existingModal) existingModal.remove();
      
      // Create new modal container
      const modalContainer = document.createElement("div");
      modalContainer.id = "edit-modal";
      modalContainer.innerHTML = html;
      document.body.appendChild(modalContainer);
      
      // Fill form values
      document.getElementById("modal-name").value = item.form.name || "";
      document.getElementById("modal-email").value = item.form.email || "";
      
      // Format phone number
      const phoneValue = item.form.phone || "";
      document.getElementById("modal-phone").value = formatPhoneNumber(phoneValue);
      
      document.getElementById("modal-ghin").value = item.form.ghin || "";
      
      // Setup phone formatting AFTER values are set
      setTimeout(() => {
        setupEditModalPhoneFormatting();
        setupEditModalGHINFormatting();
      }, 50);
      
      // Initialize autocomplete for membership renewal only
      if (item.id === 'membership-renewal' && typeof initMemberAutocomplete === 'function') {
        setTimeout(() => initMemberAutocomplete(), 100);
      }
      
      // Show modal
      modalContainer.style.display = "flex";
      
      // Bind events
      bindEditModalEvents();
    })
    .catch(error => {
      console.error('Error loading membership edit modal:', error);
      openSimpleEditModal(item);
    });
}

function openSimpleEditModal(item) {
  // Simple fallback modal
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
  
  // Fill values
  document.getElementById("modal-name").value = item.form.name || "";
  document.getElementById("modal-email").value = item.form.email || "";
  
  // Format phone number
  const phoneValue = item.form.phone || "";
  document.getElementById("modal-phone").value = formatPhoneNumber(phoneValue);
  
  document.getElementById("modal-ghin").value = item.form.ghin || "";
  
  // Setup phone formatting
  setTimeout(() => {
    setupEditModalPhoneFormatting();
    setupEditModalGHINFormatting();
  }, 50);
  
  modalContainer.style.display = "flex";
  bindEditModalEvents();
}

function bindEditModalEvents() {
  const closeBtn = document.getElementById("modal-close");
  const closeBtn2 = document.getElementById("modal-close-2");
  const saveBtn = document.getElementById("modal-save");
  const saveTopBtn = document.getElementById("modal-save-top");
  const backdrop = document.querySelector('.edit-modal-backdrop');

  [closeBtn, closeBtn2].forEach(btn => {
    if (btn) btn.addEventListener("click", closeEditModal);
  });

  if (saveBtn) saveBtn.addEventListener("click", saveEditModal);
  
  if (saveTopBtn) {
    saveTopBtn.addEventListener("click", function(e) {
      e.preventDefault();
      saveEditModal();
    });
  }
  
  // Add outside click handler
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeEditModal();
      }
    });
  }
}

function closeEditModal() {
  const modal = document.getElementById("edit-modal");
  if (modal) {
    modal.style.display = "none";
    setTimeout(() => modal.remove(), 300);
  }
  editingItemId = null;
}

function saveEditModal() {
  if (!editingItemId) return;
  
  const cart = loadCart();
  const item = cart.find(i => i.id === editingItemId);
  if (!item) return;
  
  if (item.type === 'tournament') {
    saveTournamentEditModal();
  } else {
    saveMembershipEditModal();
  }
}

function saveTournamentEditModal() {
    const cart = loadCart();
    const item = cart.find(i => i.id === editingItemId);
    if (!item) return;
    
    // Check if cart option is enabled for this tournament
    const cartOptionEnabled = item.cartOptionEnabled || false;
    
    // Get form values
    const updatedForm = {
        name: document.getElementById("modal-name").value,
        email: document.getElementById("modal-email").value,
        phone: document.getElementById("modal-phone").value,
        ghin: document.getElementById("modal-ghin").value,
        sidePots: document.getElementById("side-pots").checked,
        roulette: document.getElementById("roulette").checked,
        startingTime: document.getElementById("starting-time").value
    };
    
    // Get cart option if enabled
    let cartOptionAddedPrice = 0;
    if (cartOptionEnabled && document.getElementById("cart-option")) {
        updatedForm.cartOption = document.getElementById("cart-option").value;
        // Add $9 if cart option is "Cart"
        if (document.getElementById("cart-option").value === 'Cart') {
            cartOptionAddedPrice = 9.00;
            updatedForm.cartOptionAddedPrice = cartOptionAddedPrice;
        }
    }
    
    // Get additional players
    const additionalPlayers = [];
    for (let i = 2; i <= 4; i++) {
        const name = document.getElementById(`modal-name${i}`).value;
        if (name) {
            additionalPlayers.push({
                name: name,
                email: document.getElementById(`modal-email${i}`).value,
                phone: document.getElementById(`modal-phone${i}`).value,
                ghin: document.getElementById(`modal-ghin${i}`).value
            });
        }
    }
    updatedForm.additionalPlayers = additionalPlayers;
    
    // Calculate base price (tournament price without add-ons)
    const basePrice = parseFloat(item.basePrice || (item.form.tournamentPrice || 0));
    
    // Get add-on prices from item data
    const roulettePrice = parseFloat(item.roulettePrice || 30);
    const sidePotPrice = parseFloat(item.sidePotPrice || 25);
    
    // Calculate new total price
    let totalPrice = basePrice;
    let addons = [];
    let addonsTotal = 0;
    
    if (updatedForm.sidePots) {
        addons.push({ name: 'Side Pots', price: sidePotPrice });
        addonsTotal += sidePotPrice;
    }
    
    if (updatedForm.roulette) {
        addons.push({ name: 'Roulette', price: roulettePrice });
        addonsTotal += roulettePrice;
    }
    
    updatedForm.addons = addons;
    updatedForm.addonsTotal = addonsTotal;
    totalPrice += addonsTotal + cartOptionAddedPrice;
    
    updateCartItem(editingItemId, { 
        form: updatedForm,
        price: totalPrice
    });
    
    closeEditModal();
    renderCart();
}

function saveMembershipEditModal() {
  const updatedForm = {
    name: document.getElementById("modal-name").value,
    email: document.getElementById("modal-email").value,
    phone: document.getElementById("modal-phone").value,
    ghin: document.getElementById("modal-ghin").value,
  };

  updateCartItem(editingItemId, { form: updatedForm });
  closeEditModal();
  renderCart();
}

// Initialize cart when DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
  // Load images from Image Manager
  if (!imageManagerImages) {
    imageManagerImages = await fetchImagesFromImageManager();
  }
  
  // Render cart
  renderCart();
});

// Also re-render cart when cart is updated
document.addEventListener("cartUpdated", () => {
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

    // Get customer email and name from the first item that has them
    let customerEmail = '';
    let customerName = '';
    
    // Try to find customer info from cart items
    for (const item of cart) {
      if (item.form && item.form.email) {
        customerEmail = item.form.email;
        if (item.form.name) {
          customerName = item.form.name;
        }
        break;
      }
    }
    
    // If no email found, prompt the user
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
        headers: { 
          "Content-Type": "application/json",
        },
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

      // Redirect to Stripe Checkout
      window.location.href = data.url;
      
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Error during checkout: " + error.message);
      checkoutButton.disabled = false;
      checkoutButton.textContent = "Checkout";
    }
  });
});