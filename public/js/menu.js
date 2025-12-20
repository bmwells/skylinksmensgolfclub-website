// ===============================
// UNIVERSAL MOBILE MENU LOGIC
// ===============================
function initMenu() {
    const mobileBtn = document.getElementById("mobile-menu-btn");
    const navMenu = document.getElementById("nav-menu");
    const nav = document.getElementById("primary-navigation");

    if (!mobileBtn || !navMenu) return;

    function openMenu() {
        navMenu.classList.add("active");
        mobileBtn.setAttribute("aria-expanded", "true");
        mobileBtn.textContent = "✕";
        mobileBtn.innerHTML = "✕"; // Also set innerHTML to ensure it shows
    }

    function closeMenu() {
        navMenu.classList.remove("active");
        mobileBtn.setAttribute("aria-expanded", "false");
        mobileBtn.textContent = "☰";
        mobileBtn.innerHTML = "☰"; // Also set innerHTML to ensure it shows
    }

    function toggleMenu() {
        const isOpen = navMenu.classList.contains("active");
        isOpen ? closeMenu() : openMenu();
    }

    // Toggle button
    mobileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMenu();
    });

    // Outside click closes menu
    document.addEventListener("click", (e) => {
        if (window.innerWidth <= 1024) {
            if (!nav.contains(e.target) && navMenu.classList.contains("active")) {
                closeMenu();
            }
        }
    });

    // ESC key closes menu
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && navMenu.classList.contains("active")) {
            closeMenu();
        }
    });

    // =======================
    // <details> accessibility - UPDATED SECTION
    // =======================
    const detailsList = nav.querySelectorAll("details");

    detailsList.forEach((details) => {
        const summary = details.querySelector("summary");

        // Sync aria-expanded with open state
        function sync() {
            summary.setAttribute(
                "aria-expanded",
                details.hasAttribute("open") ? "true" : "false"
            );
            
            // Close other dropdowns when one opens (mobile only)
            if (window.innerWidth <= 1024 && details.open) {
                detailsList.forEach((other) => {
                    if (other !== details) {
                        other.removeAttribute("open");
                        other.querySelector("summary").setAttribute("aria-expanded", "false");
                    }
                });
            }
        }

        sync();
        details.addEventListener("toggle", () => sync());

        // Click handler for summary
        summary.addEventListener("click", (e) => {
            if (window.innerWidth <= 1024) {
                e.preventDefault();
                const wasOpen = details.open;
                
                // Close all first
                detailsList.forEach((d) => {
                    d.removeAttribute("open");
                    d.querySelector("summary").setAttribute("aria-expanded", "false");
                });
                
                // Open this one if it wasn't open
                if (!wasOpen) {
                    details.setAttribute("open", "");
                    summary.setAttribute("aria-expanded", "true");
                }
            }
        });
    });

    // Reset on desktop resize
    window.addEventListener("resize", () => {
        if (window.innerWidth > 1024) {
            closeMenu();
            detailsList.forEach((d) => d.removeAttribute("open"));
        }
    });
}