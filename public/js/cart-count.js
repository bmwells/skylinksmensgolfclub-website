(function () {
    const CART_KEY = "skylinks_cart_v1";
    const MOBILE_BREAKPOINT = 1024;
    let isInitialized = false;

    function getCartCount() {
        try {
            const raw = localStorage.getItem(CART_KEY);
            if (!raw || raw === 'null' || raw === 'undefined') {
                return 0;
            }
            const items = JSON.parse(raw);
            const count = Array.isArray(items) ? items.length : 0;
            console.log('cart-count.js: Cart count =', count);
            return count;
        } catch (e) {
            return 0;
        }
    }

    function isMobile() {
        return window.innerWidth <= MOBILE_BREAKPOINT;
    }

    function updateCartCount() {
        const desktop = document.getElementById("cart-count");
        const mobileTop = document.getElementById("mobile-cart-count");
        const mobileMenu = document.getElementById("mobile-cart-count-menu");
        
        const count = getCartCount();
        const text = count > 0 ? `(${count})` : "";

        
        if (isMobile()) {
            if (mobileTop) {
                if (count > 0) {
                    mobileTop.innerHTML = `<a href="/cart" style="text-decoration: none; color: inherit;">${text}</a>`;
                } else {
                    mobileTop.textContent = text;
                }
            }
            if (mobileMenu) {
                mobileMenu.textContent = text;
            }
            if (desktop) {
                desktop.textContent = "";
            }
        } else {
            if (desktop) {
                desktop.textContent = text;
            }
            if (mobileTop) {
                mobileTop.textContent = "";
            }
            if (mobileMenu) {
                mobileMenu.textContent = "";
            }
        }
    }

    function initCartCount() {
        if (isInitialized) {
            return;
        }
        
        
        // Update immediately on init
        updateCartCount();
        
        // Listen to cartUpdated event from cart.js
        document.addEventListener("cartUpdated", function() {
            console.log('cart-count.js: cartUpdated event received');
            updateCartCount();
        });
        
        // Listen to storage events
        window.addEventListener("storage", function(event) {
            if (event.key === CART_KEY || event.key === null || event.key === undefined) {
                updateCartCount();
            }
        });
        
        // Listen to custom cartUpdated event on window
        window.addEventListener("cartUpdated", function() {
            updateCartCount();
        });
        
        // Handle window resize
        window.addEventListener("resize", function() {
            updateCartCount();
        });
        
        isInitialized = true;
    }

    // Initialize immediately on load
    
    // Check if we're on success page
    const isSuccessPage = window.location.pathname === '/success' || 
                         window.location.pathname.endsWith('/success') ||
                         window.location.search.includes('session_id=');
    
    if (isSuccessPage) {
        // Force clear cart and update count immediately
        localStorage.removeItem(CART_KEY);
        localStorage.removeItem('skylinks_cart');
        localStorage.removeItem('cart');
    }
    
    // Try to initialize right away
    setTimeout(initCartCount, 0);
    
    // Also initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
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