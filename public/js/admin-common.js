// admin-common.js - Updated loader with better initialization
// Dynamically loads all admin modules

// Cache busting wrapper
(function() {
    // Current version - increment this when you make changes
    const VERSION = '1.5';
    const CACHE_KEY = 'admin_js_version';
    
    // Check if we need to reload due to version change
    const currentVersion = localStorage.getItem(CACHE_KEY);
    if (currentVersion !== VERSION) {
        console.log(`AdminCommon updating from v${currentVersion} to v${VERSION}`);
        localStorage.setItem(CACHE_KEY, VERSION);
        
        // Clear old data that might cause issues
        localStorage.removeItem('adminToken');
        localStorage.removeItem('tokenTimestamp');
        
        // Force reload if this is a version upgrade
        if (currentVersion && currentVersion !== VERSION) {
            window.location.reload();
        }
    }
})();

// List of admin module files to load in order
const ADMIN_MODULES = [
    '/js/admin/admin-base.js',
    '/js/admin/admin-data.js', 
    '/js/admin/admin-ui.js',
    '/js/admin/admin-modals.js'
];

// Track loading state
window.adminModulesLoaded = false;
let loadedModules = 0;
const totalModules = ADMIN_MODULES.length;

// Function to load a script dynamically
function loadScript(src, onLoad) {
    const script = document.createElement('script');
    script.src = src;
    script.onload = onLoad;
    script.onerror = function() {
        console.error('Failed to load script:', src);
        onLoad(); // Continue even if one fails
    };
    document.head.appendChild(script);
}

// Function to load all modules sequentially
function loadModulesSequentially(index) {
    if (index >= ADMIN_MODULES.length) {
        // All modules loaded
        window.adminModulesLoaded = true;
        console.log('All admin modules loaded successfully');
        
        // Initialize common functionality
        initializeCommon();
        
        // Notify that modules are ready
        if (window.adminModulesReady) {
            window.adminModulesReady();
        }
        
        return;
    }
    
    loadScript(ADMIN_MODULES[index], function() {
        loadedModules++;
        console.log(`Loaded admin module: ${ADMIN_MODULES[index]} (${loadedModules}/${totalModules})`);
        loadModulesSequentially(index + 1);
    });
}

// Initialize common functionality after all modules are loaded
function initializeCommon() {
    console.log('Initializing AdminCommon...');
    
    // Make sure AdminCommon object exists
    if (!window.AdminCommon) {
        console.error('AdminCommon object not found after loading modules');
        return;
    }
    
    // Set up ModalTemplate if not already defined
    window.ModalTemplate = window.ModalTemplate || {
        createUnsavedModal: function() {
            return `
                <div class="modal-overlay" id="unsavedModal" style="display: none;">
                    <div class="modal">
                        <h3>⚠️ Unsaved Changes</h3>
                        <p>Changes have not been saved! What would you like to do?</p>
                        <div class="modal-buttons">
                            <button onclick="AdminCommon.saveAndExit()" style="background: #28a745;">💾 Save & Exit</button>
                            <button onclick="AdminCommon.exitWithoutSaving()" style="background: #6c757d;">Exit without Saving</button>
                            <button onclick="AdminCommon.cancelExit()">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
        }
    };
    
    // Set up auto-init when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        // Insert modal if not already present
        if (!document.getElementById('unsavedModal')) {
            const modalContainer = AdminCommon.createElement('div', '', ModalTemplate.createUnsavedModal());
            document.body.insertBefore(modalContainer, document.body.firstChild);
        }
        
        // Fix back button event listeners
        fixBackButtonListeners();
    });
    
    console.log('AdminCommon initialization complete');
}

// Fix back button onclick handlers
function fixBackButtonListeners() {
    // Wait a bit to ensure DOM is fully loaded
    setTimeout(() => {
        // Find all back buttons
        const backButtons = document.querySelectorAll('button[onclick*="AdminCommon.checkUnsavedChanges"]');
        
        backButtons.forEach(button => {
            // Replace the onclick with a proper event listener
            button.removeAttribute('onclick');
            button.addEventListener('click', function(e) {
                e.preventDefault();
                if (AdminCommon && AdminCommon.checkUnsavedChanges) {
                    AdminCommon.checkUnsavedChanges();
                } else {
                    console.error('AdminCommon.checkUnsavedChanges not available');
                    alert('Admin modules not loaded. Please refresh the page.');
                }
            });
        });
        
        console.log(`Fixed ${backButtons.length} back button(s)`);
    }, 100);
}

// Start loading modules
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        loadModulesSequentially(0);
    });
} else {
    loadModulesSequentially(0);
}