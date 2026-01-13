// admin-modals.js - Modal functionality for admin

// ============================================
// UNSAVED CHANGES MODAL
// ============================================
AdminCommon.checkUnsavedChanges = function() {
    if (this.hasUnsavedChanges) {
        document.getElementById('unsavedModal').style.display = 'flex';
    } else {
        window.location.href = '/admin';
    }
};

AdminCommon.saveAndExit = function() {
    this.save()
        .then(() => {
            document.getElementById('unsavedModal').style.display = 'none';
            window.location.href = '/admin';
        })
        .catch(err => {
            alert('Error saving: ' + err.message);
        });
};

AdminCommon.exitWithoutSaving = function() {
    this.hasUnsavedChanges = false;
    document.getElementById('unsavedModal').style.display = 'none';
    window.location.href = '/admin';
};

AdminCommon.cancelExit = function() {
    document.getElementById('unsavedModal').style.display = 'none';
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