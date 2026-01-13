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