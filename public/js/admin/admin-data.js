// admin-data.js - Data operations for admin utilities

AdminCommon.load = function() {
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
};

AdminCommon.validateToken = function() {
    if (!this.token) return false;
    
    // Token is just a string, so check if it exists
    // In a real app, you'd validate with the server
    return this.token.length > 10;
};

AdminCommon.save = function() {
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
};

AdminCommon.markUnsaved = function() {
    this.hasUnsavedChanges = true;
};

AdminCommon.saveWithAlert = function() {
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
};

AdminCommon.deleteItem = function(index, confirmMessage = 'Are you sure you want to delete this item?') {
    if (confirm(confirmMessage)) {
        this.data.splice(index, 1);
        this.markUnsaved();
        return true;
    }
    return false;
};

AdminCommon.addItem = function(item) {
    this.data.unshift(item);
    this.markUnsaved();
};

AdminCommon.updateItem = function(index, field, value) {
    if (this.data[index]) {
        this.data[index][field] = value;
        this.markUnsaved();
    }
};

AdminCommon.setupInputListeners = function() {
    setTimeout(() => {
        const inputs = document.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            // Remove existing listeners to avoid duplicates
            input.removeEventListener('input', this.markUnsavedBound);
            // Add new listener
            input.addEventListener('input', this.markUnsavedBound || (this.markUnsavedBound = this.markUnsaved.bind(this)));
        });
    }, 100);
};