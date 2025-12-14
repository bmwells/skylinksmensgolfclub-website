(function () {
  const CART_KEY = "skylinks_cart_v1";

  function getCartCount() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (!raw) return 0;
      const items = JSON.parse(raw);
      return Array.isArray(items) ? items.length : 0;
    } catch {
      return 0;
    }
  }

  function updateCartCount() {
    const desktop = document.getElementById("cart-count");
    const mobile = document.getElementById("mobile-cart-count");

    if (!desktop || !mobile) return;

    const count = getCartCount();

    if (count > 0) {
      desktop.textContent = `(${count})`;
      mobile.textContent = `(${count})`;
      mobile.style.display = "inline";
    } else {
      desktop.textContent = "";
      mobile.style.display = "none";
    }
  }

 /* WAIT FOR HEADER TO EXIST */
function waitForHeader() {
  if (
    document.getElementById("cart-count") &&
    document.getElementById("mobile-cart-count")
  ) {
    updateCartCount();
    // Add media query listener to handle mobile/desktop visibility
    handleCartCountVisibility();
    window.addEventListener('resize', handleCartCountVisibility);
    document.addEventListener("cartUpdated", updateCartCount);
    window.addEventListener("storage", updateCartCount);
    return;
  }

  requestAnimationFrame(waitForHeader);
}

/* Handle mobile/desktop cart count visibility */
function handleCartCountVisibility() {
  const mobileCart = document.getElementById("mobile-cart-count");
  if (!mobileCart) return;
  
  const isMobile = window.innerWidth <= 1024; // Match your mobile breakpoint
  
  if (isMobile) {
    // Show mobile cart count if there are items
    const count = getCartCount();
    if (count > 0) {
      mobileCart.style.display = "inline";
    }
  } else {
    // Hide mobile cart count on desktop
    mobileCart.style.display = "none";
  }
}

waitForHeader();
})();
