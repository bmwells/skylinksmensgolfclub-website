// admin-ui.js - UI utilities for admin

AdminCommon.escapeHtml = function(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, function(m) { return map[m]; });
};

AdminCommon.createElement = function(tag, className, innerHTML, attributes = {}) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (innerHTML) element.innerHTML = innerHTML;
    Object.keys(attributes).forEach(key => {
        element.setAttribute(key, attributes[key]);
    });
    return element;
};

// ============================================
// FORM TEMPLATES
// ============================================
AdminCommon.templates = {
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
};

// ============================================
// REORDER FUNCTIONALITY
// ============================================
AdminCommon.toggleReorder = function() {
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
};

AdminCommon.saveOrder = function(containerId) {
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
};

// Setup drag and drop for a container
AdminCommon.setupDragAndDrop = function(containerId) {
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
};

// Helper to find where to insert dragged element
AdminCommon.getDragAfterElement = function(container, y) {
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
};

// Add drag events to a row element
AdminCommon.addDragEvents = function(rowElement, index) {
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
};