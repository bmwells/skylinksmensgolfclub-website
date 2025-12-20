(function () {
  const CART_KEY = "skylinks_cart_v1";
  const MOBILE_BREAKPOINT = 1024;

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

  function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function updateCartCount() {
    const desktop = document.getElementById("cart-count");
    const mobileTop = document.getElementById("mobile-cart-count"); // Next to hamburger
    const mobileMenu = document.getElementById("mobile-cart-count-menu"); // Inside menu
    
    const count = getCartCount();
    const text = count > 0 ? `(${count})` : "";

    if (isMobile()) {
      // Mobile: update BOTH mobile cart elements
      if (mobileTop) {
        // Wrap mobileTop in a link to cart
        if (count > 0) {
          mobileTop.innerHTML = `<a href="/cart" style="text-decoration: none; color: inherit;">${text}</a>`;
        } else {
          mobileTop.textContent = text;
        }
      }
      if (mobileMenu) mobileMenu.textContent = text;
      if (desktop) desktop.textContent = "";
    } else {
      // Desktop: update ONLY desktop cart (already linked in nav)
      if (desktop) desktop.textContent = text;
      if (mobileTop) mobileTop.textContent = "";
      if (mobileMenu) mobileMenu.textContent = "";
    }
  }

  function waitForHeader() {
    if (
      document.getElementById("cart-count") &&
      document.getElementById("mobile-cart-count")
    ) {
      updateCartCount();
      document.addEventListener("cartUpdated", updateCartCount);
      window.addEventListener("storage", updateCartCount);
      window.addEventListener("resize", updateCartCount);
      return;
    }
    requestAnimationFrame(waitForHeader);
  }

  waitForHeader();
})();