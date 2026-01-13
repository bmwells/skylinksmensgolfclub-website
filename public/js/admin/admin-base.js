// admin-base.js - Base functionality for admin utilities

// ============================================
// COMMON STATE AND UTILITIES
// ============================================
window.AdminCommon = {
    // Shared state
    token: '',
    hasUnsavedChanges: false,
    isReorderMode: false,
    draggedRow: null,
    editorType: '',
    data: [],
    originalData: [],
    
    // ============================================
    // INITIALIZATION
    // ============================================
    init: function(editorType, data) {
        this.editorType = editorType;
        this.data = data || [];
        
        // Check authentication
        const savedToken = localStorage.getItem('adminToken');
        if (savedToken) {
            this.token = savedToken;
            this.originalData = JSON.parse(JSON.stringify(this.data));
            this.setupEventListeners();
            return true;
        } else {
            alert('Please login first');
            window.location.href = '/admin';
            return false;
        }
    },
    
    // ============================================
    // EVENT LISTENERS
    // ============================================
    setupEventListeners: function() {
        // Intercept back to admin button
        const backButton = document.querySelector('button[onclick*="AdminCommon.checkUnsavedChanges"]');
        if (backButton) {
            backButton.onclick = (e) => {
                e.preventDefault();
                this.checkUnsavedChanges();
            };
        }
        
        // Browser back/close protection
        window.addEventListener('beforeunload', (e) => {
            if (this.hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        });
    }
};