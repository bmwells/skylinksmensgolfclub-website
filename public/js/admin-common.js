// admin-common.js - Shared utilities for all admin editor pages
// Cache busting wrapper
(function() {
    // Current version - increment this when you make changes
    const VERSION = '1.4';
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
    },
    
    setupInputListeners: function() {
        setTimeout(() => {
            const inputs = document.querySelectorAll('input, textarea');
            inputs.forEach(input => {
                // Remove existing listeners to avoid duplicates
                input.removeEventListener('input', this.markUnsavedBound);
                // Add new listener
                input.addEventListener('input', this.markUnsavedBound || (this.markUnsavedBound = this.markUnsaved.bind(this)));
            });
        }, 100);
    },
    
    // ============================================
    // DATA OPERATIONS
    // ============================================
    load: function() {
        return fetch(`/api/${this.editorType}`)
            .then(res => {
                if (!res.ok) {
                    throw new Error(`Failed to load ${this.editorType}: ${res.statusText}`);
                }
                return res.json();
            })
            .then(data => {
                this.data = data;
                this.originalData = JSON.parse(JSON.stringify(data));
                return data;
            });
    },
    
    validateToken: function() {
        if (!this.token) return false;
        
        // Token is just a string, so check if it exists
        // In a real app, you'd validate with the server
        return this.token.length > 10;
    },

    // Enhanced save with better error handling
    save: function() {
        if (!this.validateToken()) {
            alert('Session expired. Please login again.');
            localStorage.removeItem('adminToken');
            window.location.href = '/admin';
            return Promise.reject('Invalid token');
        }
        
        console.log('Saving to:', `/api/${this.editorType}`);
        console.log('Using token:', this.token.substring(0, 20) + '...');
        
        return fetch(`/api/${this.editorType}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + this.token
            },
            body: JSON.stringify(this.data)
        })
        .then(res => {
            console.log('Save response status:', res.status);
            
            if (res.status === 403) {
                // Token expired or invalid
                return res.json().then(errorData => {
                    if (errorData.code === 'TOKEN_EXPIRED') {
                        localStorage.removeItem('adminToken');
                        window.location.href = '/admin/login.html';
                        throw new Error('Token expired. Please login again.');
                    }
                    throw new Error('Save failed: ' + (errorData.error || 'Unauthorized'));
                });
            }
            
            if (!res.ok) {
                return res.text().then(text => {
                    console.error('Save error response:', text);
                    throw new Error('Save failed: ' + res.statusText);
                });
            }
            
            return res.json().then(result => {
                this.hasUnsavedChanges = false;
                this.originalData = JSON.parse(JSON.stringify(this.data));
                return result;
            });
        });
    },
    
    // ============================================
    // UNSAVED CHANGES MODAL
    // ============================================
    checkUnsavedChanges: function() {
        if (this.hasUnsavedChanges) {
            document.getElementById('unsavedModal').style.display = 'flex';
        } else {
            window.location.href = '/admin';
        }
    },
    
    saveAndExit: function() {
        this.save()
            .then(() => {
                document.getElementById('unsavedModal').style.display = 'none';
                window.location.href = '/admin';
            })
            .catch(err => {
                alert('Error saving: ' + err.message);
            });
    },
    
    exitWithoutSaving: function() {
        this.hasUnsavedChanges = false;
        document.getElementById('unsavedModal').style.display = 'none';
        window.location.href = '/admin';
    },
    
    cancelExit: function() {
        document.getElementById('unsavedModal').style.display = 'none';
    },
    
    // ============================================
    // REORDER FUNCTIONALITY
    // ============================================
    toggleReorder: function() {
        this.isReorderMode = !this.isReorderMode;
        
        if (this.isReorderMode) {
            document.getElementById('reorderNotice').style.display = 'flex';
            document.body.classList.add('reorder-mode');
            // Hide all control buttons
            const controls = document.querySelectorAll('.edit-buttons, .meeting-controls, .controls');
            controls.forEach(control => {
                control.style.display = 'none';
            });
        } else {
            document.getElementById('reorderNotice').style.display = 'none';
            document.body.classList.remove('reorder-mode');
            // Show all control buttons
            const controls = document.querySelectorAll('.edit-buttons, .meeting-controls, .controls');
            controls.forEach(control => {
                control.style.display = 'block';
            });
        }
        
        // Trigger re-render in the page-specific render function
        if (window.render && typeof window.render === 'function') {
            window.render();
        }
    },
    
    saveOrder: function(containerId) {
        const container = document.getElementById(containerId);
        const newOrder = [];
        const elements = container.children;
        
        for (let element of elements) {
            const index = parseInt(element.getAttribute('data-index'));
            if (!isNaN(index) && this.data[index]) {
                newOrder.push(this.data[index]);
            }
        }
        
        // Update the data array
        this.data.length = 0; // Clear array
        newOrder.forEach(item => this.data.push(item));
        
        this.toggleReorder(); // Exit reorder mode (will trigger render)
        this.saveWithAlert(); // Save the new order
    },
    
    // Setup drag and drop for a container
    setupDragAndDrop: function(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return null;
        
        // Add dragover event to container
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggable = document.querySelector('.dragging');
            if (!draggable) return;
            
            const afterElement = this.getDragAfterElement(container, e.clientY);
            
            if (afterElement == null) {
                container.appendChild(draggable);
            } else {
                container.insertBefore(draggable, afterElement);
            }
        });
        
        return container;
    },
    
    // Helper to find where to insert dragged element
    getDragAfterElement: function(container, y) {
        const draggableElements = [...container.querySelectorAll('.row:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    },
    
    // ============================================
    // HELPER FUNCTIONS
    // ============================================
    markUnsaved: function() {
        this.hasUnsavedChanges = true;
    },
    
    saveWithAlert: function() {
        this.save()
            .then(() => {
                alert('Saved successfully!');
            })
            .catch(err => {
                alert('Error saving: ' + err.message);
                if (err.message.includes('Unauthorized') || err.message.includes('403') || err.message.includes('expired')) {
                    localStorage.removeItem('adminToken');
                    window.location.href = '/admin';
                }
            });
    },
    
    deleteItem: function(index, confirmMessage = 'Are you sure you want to delete this item?') {
        if (confirm(confirmMessage)) {
            this.data.splice(index, 1);
            this.markUnsaved();
            return true;
        }
        return false;
    },
    
    addItem: function(item) {
        this.data.unshift(item);
        this.markUnsaved();
    },
    
    updateItem: function(index, field, value) {
        if (this.data[index]) {
            this.data[index][field] = value;
            this.markUnsaved();
        }
    },
    
    // ============================================
    // FORM TEMPLATES
    // ============================================
    templates: {
        textInput: function(label, value, onChange, placeholder = '', extraClasses = '') {
            return `
                <div class="input-group ${extraClasses}">
                    <label>${label}</label>
                    <input value="${AdminCommon.escapeHtml(value || '')}" oninput="${onChange}" placeholder="${placeholder}">
                </div>
            `;
        },
        
        textareaInput: function(label, value, onChange, placeholder = '', extraClasses = '') {
            return `
                <div class="input-group ${extraClasses}">
                    <label>${label}</label>
                    <textarea oninput="${onChange}" placeholder="${placeholder}">${AdminCommon.escapeHtml(value || '')}</textarea>
                </div>
            `;
        },
        
        formRow: function(inputs) {
            return `
                <div class="form-row">
                    ${inputs}
                </div>
            `;
        },
        
        sectionHeader: function(title, deleteButton = '') {
            return `
                <div class="section-header">
                    <h3>${title}</h3>
                    ${deleteButton}
                </div>
            `;
        },
        
        deleteButton: function(onclick, label = 'Delete', small = false) {
            const sizeClass = small ? 'style="padding: 4px 8px; font-size: 0.9rem;"' : '';
            return `<button class="delete" onclick="${onclick}" ${sizeClass}>${label}</button>`;
        },
        
        // Minimal row template for reorder mode
        minimalRow: function(title, subtitle = '') {
            return `
                <div style="display: flex; align-items: center; padding: 1rem;">
                    <div class="drag-handle">☰</div>
                    <div style="flex: 1;">
                        <strong>${AdminCommon.escapeHtml(title || 'Untitled')}</strong>
                        ${subtitle ? `<div style="color: #666; font-size: 0.9rem; margin-top: 4px;">${AdminCommon.escapeHtml(subtitle)}</div>` : ''}
                    </div>
                </div>
            `;
        }
    },
    
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    escapeHtml: function(text) {
        if (!text) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.toString().replace(/[&<>"']/g, function(m) { return map[m]; });
    },
    
    createElement: function(tag, className, innerHTML, attributes = {}) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (innerHTML) element.innerHTML = innerHTML;
        Object.keys(attributes).forEach(key => {
            element.setAttribute(key, attributes[key]);
        });
        return element;
    },
    
    // Add drag events to a row element
    addDragEvents: function(rowElement, index) {
        rowElement.addEventListener('dragstart', (e) => {
            this.draggedRow = rowElement;
            rowElement.classList.add('dragging');
            e.dataTransfer.setData('text/plain', index);
            e.dataTransfer.effectAllowed = 'move';
        });
        
        rowElement.addEventListener('dragend', () => {
            rowElement.classList.remove('dragging');
            this.draggedRow = null;
            this.markUnsaved();
        });
        
        return rowElement;
    }
};

// ============================================
// MODAL TEMPLATE
// ============================================
window.ModalTemplate = {
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

// ============================================
// AUTO-INIT FOR COMMON ELEMENTS
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Insert modal if not already present
    if (!document.getElementById('unsavedModal')) {
        const modalContainer = AdminCommon.createElement('div', '', ModalTemplate.createUnsavedModal());
        document.body.insertBefore(modalContainer, document.body.firstChild);
    }
});