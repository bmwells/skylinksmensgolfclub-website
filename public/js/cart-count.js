(function () {
    const CART_KEY = "skylinks_cart_v1";
    const MOBILE_BREAKPOINT = 1024;
    let isInitialized = false;

    function getCartCount() {
        try {
            const raw = localStorage.getItem(CART_KEY);
            console.log('cart-count.js: Raw cart data:', raw);
            if (!raw || raw === 'null' || raw === 'undefined') {
                console.log('cart-count.js: Cart is empty or null');
                return 0;
            }
            const items = JSON.parse(raw);
            const count = Array.isArray(items) ? items.length : 0;
            console.log('cart-count.js: Cart count =', count);
            return count;
        } catch (e) {
            console.log('cart-count.js: Error parsing cart:', e);
            return 0;
        }
    }

    function isMobile() {
        return window.innerWidth <= MOBILE_BREAKPOINT;
    }

    function updateCartCount() {
        console.log('cart-count.js: updateCartCount called');
        const desktop = document.getElementById("cart-count");
        const mobileTop = document.getElementById("mobile-cart-count");
        const mobileMenu = document.getElementById("mobile-cart-count-menu");
        
        const count = getCartCount();
        const text = count > 0 ? `(${count})` : "";

        console.log('cart-count.js: Updating elements with text:', text);
        
        if (isMobile()) {
            if (mobileTop) {
                if (count > 0) {
                    mobileTop.innerHTML = `<a href="/cart" style="text-decoration: none; color: inherit;">${text}</a>`;
                } else {
                    mobileTop.textContent = text;
                }
                console.log('cart-count.js: Updated mobileTop');
            }
            if (mobileMenu) {
                mobileMenu.textContent = text;
                console.log('cart-count.js: Updated mobileMenu');
            }
            if (desktop) {
                desktop.textContent = "";
                console.log('cart-count.js: Cleared desktop');
            }
        } else {
            if (desktop) {
                desktop.textContent = text;
                console.log('cart-count.js: Updated desktop');
            }
            if (mobileTop) {
                mobileTop.textContent = "";
                console.log('cart-count.js: Cleared mobileTop');
            }
            if (mobileMenu) {
                mobileMenu.textContent = "";
                console.log('cart-count.js: Cleared mobileMenu');
            }
        }
    }

    function initCartCount() {
        if (isInitialized) {
            console.log('cart-count.js: Already initialized');
            return;
        }
        
        console.log('cart-count.js: Initializing cart count...');
        
        // Update immediately on init
        updateCartCount();
        
        // Listen to cartUpdated event from cart.js
        document.addEventListener("cartUpdated", function() {
            console.log('cart-count.js: cartUpdated event received');
            updateCartCount();
        });
        
        // Listen to storage events
        window.addEventListener("storage", function(event) {
            console.log('cart-count.js: storage event received for key:', event.key);
            if (event.key === CART_KEY || event.key === null || event.key === undefined) {
                updateCartCount();
            }
        });
        
        // Listen to custom cartUpdated event on window
        window.addEventListener("cartUpdated", function() {
            console.log('cart-count.js: window.cartUpdated event received');
            updateCartCount();
        });
        
        // Handle window resize
        window.addEventListener("resize", function() {
            console.log('cart-count.js: resize event');
            updateCartCount();
        });
        
        isInitialized = true;
        console.log('cart-count.js: Initialization complete');
    }

    // Initialize immediately on load
    console.log('cart-count.js: Script loading...');
    
    // Check if we're on success page
    const isSuccessPage = window.location.pathname === '/success' || 
                         window.location.pathname.endsWith('/success') ||
                         window.location.search.includes('session_id=');
    
    if (isSuccessPage) {
        console.log('cart-count.js: On success page, forcing cart to 0');
        // Force clear cart and update count immediately
        localStorage.removeItem(CART_KEY);
        localStorage.removeItem('skylinks_cart');
        localStorage.removeItem('cart');
    }
    
    // Try to initialize right away
    setTimeout(initCartCount, 0);
    
    // Also initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        console.log('cart-count.js: DOMContentLoaded');
        initCartCount();
    });
    
    // Force update multiple times to catch any late changes
    setTimeout(updateCartCount, 50);
    setTimeout(updateCartCount, 200);
    setTimeout(updateCartCount, 500);
    setTimeout(updateCartCount, 1000);
    
    // If on success page, force update more aggressively
    if (isSuccessPage) {
        setTimeout(updateCartCount, 1500);
        setTimeout(updateCartCount, 2000);
    }
})();