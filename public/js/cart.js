/* ============================================================
   Skylinks Custom Cart
   Fully LocalStorage Cart + Stripe Checkout
   ============================================================ */

const CART_KEY = "skylinks_cart_v1";

// Auto-clear cart if on the success page
if (window.location.pathname.includes("success")) {
  localStorage.removeItem(CART_KEY);
}

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

/* ============================================================
   Add to Cart (from product page popup form)
   ============================================================ */
function addToCart(item) {
  const cart = loadCart();
  cart.push({ id: generateId(), ...item });
  saveCart(cart);
}

/* ============================================================
   Update an item
   ============================================================ */
function updateCartItem(id, updatedFields) {
  const cart = loadCart();
  const idx = cart.findIndex(i => i.id === id);
  if (idx !== -1) {
    cart[idx] = { ...cart[idx], ...updatedFields };
    saveCart(cart);
  }
}

/* ============================================================
   Remove an item
   ============================================================ */
function removeCartItem(id) {
  let cart = loadCart();
  cart = cart.filter(i => i.id !== id);
  saveCart(cart);
}

/* ============================================================
   Render Cart Page
   ============================================================ */
function renderCart() {
  if (!document.getElementById("cart-rows")) return; // not on cart page

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
    imgWrap.style.backgroundImage = `url('${item.image || "/img/default.png"}')`;

    /* Description column */
    const desc = document.createElement("div");
    desc.className = "cart-row-desc sqs-cart-desc";
    
    // Create title
    const titleDiv = document.createElement("div");
    titleDiv.className = "cart-row-title";
    titleDiv.textContent = item.name;
    
    // Edit details button
    const editDetailsBtn = document.createElement("button");
    editDetailsBtn.className = "cart-edit-details-btn";
    editDetailsBtn.textContent = "Edit Details";
    
    desc.appendChild(titleDiv);
    desc.appendChild(editDetailsBtn);

    /* Price */
    const price = document.createElement("div");
    price.className = "cart-row-price sqs-cart-price";
    price.textContent = `$${item.price.toFixed(2)}`;
    subtotal += item.price;

    /* Actions (remove only - edit button removed from here) */
    const actions = document.createElement("div");
    actions.className = "cart-actions sqs-cart-actions";

    const removeBtn = document.createElement("button");
    removeBtn.className = "cart-action-btn remove-btn";
    removeBtn.textContent = "Remove";

    actions.appendChild(removeBtn);

    /* Build row */
    row.appendChild(imgWrap);
    row.appendChild(desc);
    row.appendChild(price);
    row.appendChild(actions);

    rows.appendChild(row);

    /* ======================================================
       Remove Handler
       ====================================================== */
    removeBtn.addEventListener("click", () => {
      removeCartItem(item.id);
      renderCart();
    });

    /* ======================================================
       Edit Handler (open modal) - attached to the new button in description
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

  // Fill form values
  document.getElementById("modal-name").value = item.form.name || "";
  document.getElementById("modal-email").value = item.form.email || "";
  document.getElementById("modal-phone").value = item.form.phone || "";
  document.getElementById("modal-ghin").value = item.form.ghin || "";

  document.getElementById("edit-modal").style.display = "flex";
}

function closeEditModal() {
  document.getElementById("edit-modal").style.display = "none";
  editingItemId = null;
}

function saveEditModal() {
  if (!editingItemId) return;

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

document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.getElementById("modal-close");
  const closeBtn2 = document.getElementById("modal-close-2");
  const saveBtn = document.getElementById("modal-save");

  [closeBtn, closeBtn2].forEach(btn => {
    if (btn) btn.addEventListener("click", closeEditModal);
  });

  if (saveBtn) saveBtn.addEventListener("click", saveEditModal);

  renderCart();
});

/* ============================================================
   Checkout Handler
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const checkoutButton = document.getElementById("checkout-button");
  if (!checkoutButton) return;

  checkoutButton.addEventListener("click", async () => {
    const cart = loadCart();
    if (cart.length === 0) return;

    checkoutButton.disabled = true;

    const body = {
      items: cart.map(item => ({
        name: item.name,
        amount: Math.round(item.price * 100),
        quantity: 1, // Always quantity of 1 since each row is one item
        metadata: item.form || {}
      }))
    };

    const res = await fetch("/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const { id, url } = await res.json();
    window.location = url;
  });
});