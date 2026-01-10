// File: public/js/tournament-manager.js

// Global state
let currentTournament = 'tournament1';
let currentFoursomeId = null;
let currentPlayerNumber = null;
let selectedMember = null;
let tournament1Data = [];
let tournament2Data = [];

// Function to save active tab to localStorage
function saveActiveTab(tournamentId) {
    localStorage.setItem('activeTournamentTab', tournamentId);
}

// Function to restore active tab from localStorage
function restoreActiveTab() {
    const savedTab = localStorage.getItem('activeTournamentTab') || 'tournament1';
    currentTournament = savedTab;
    
    // Update tab buttons visually
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Update content visibility
    document.querySelectorAll('.tournament-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Find and activate the correct tab button
    const tabButtons = document.querySelectorAll('.tab-button');
    if (savedTab === 'tournament1') {
        tabButtons[0].classList.add('active');
        document.getElementById('tournament1-content').classList.add('active');
    } else {
        tabButtons[1].classList.add('active');
        document.getElementById('tournament2-content').classList.add('active');
    }
}

// Save and refresh function
function saveAndRefresh() {
    // Ensure current tab is saved
    if (currentTournament) {
        saveActiveTab(currentTournament);
    }
    location.reload();
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    const savedToken = localStorage.getItem('adminToken');
    if (!savedToken) {
        alert('Please login first');
        window.location.href = '/admin';
        return;
    }
    
    // Restore active tab from localStorage
    restoreActiveTab();
    
    // Load tournament data
    loadTournamentData('tournament1');
    loadTournamentData('tournament2');
    
    // Setup event listeners
    setupEventListeners();
});

function setupEventListeners() {
    // Member search input
    const searchInput = document.getElementById('memberSearch');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', function(e) {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length >= 2) {
                searchTimeout = setTimeout(() => {
                    searchMembers(query);
                }, 300);
            } else {
                document.getElementById('searchResults').style.display = 'none';
            }
        });
        
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                document.getElementById('searchResults').style.display = 'none';
            }
        });
    }
    
    // Click outside to close search results
    document.addEventListener('click', function(e) {
        const searchResults = document.getElementById('searchResults');
        const searchInput = document.getElementById('memberSearch');
        
        if (searchResults && searchResults.style.display !== 'none' && 
            !searchResults.contains(e.target) && e.target !== searchInput) {
            searchResults.style.display = 'none';
        }
    });
}

// Switch between tournaments
function switchTournament(tournamentId) {
    currentTournament = tournamentId;
    
    // Save to localStorage
    saveActiveTab(tournamentId);
    
    // Update tabs
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update content
    document.querySelectorAll('.tournament-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tournamentId}-content`).classList.add('active');
}

// Add empty foursome
async function addEmptyFoursome() {
    if (!confirm('Add an empty foursome to this tournament?')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`/api/tournament-manager/${currentTournament}`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to add foursome: ${response.statusText} - ${errorText}`);
        }
        
        // Reload tournament data
        loadTournamentData(currentTournament);
        
    } catch (error) {
        console.error('Error adding empty foursome:', error);
        alert('Error adding empty foursome: ' + error.message);
    }
}

// Load tournament data
async function loadTournamentData(tournamentId) {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`/api/tournament-manager/${tournamentId}`, {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load ${tournamentId}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (tournamentId === 'tournament1') {
            tournament1Data = data;
            document.getElementById('tournament1-loading').style.display = 'none';
            renderTournamentData('tournament1', data);
        } else {
            tournament2Data = data;
            document.getElementById('tournament2-loading').style.display = 'none';
            renderTournamentData('tournament2', data);
        }
    } catch (error) {
        console.error('Error loading tournament data:', error);
        const loadingEl = document.getElementById(`${tournamentId}-loading`);
        if (loadingEl) {
            loadingEl.innerHTML = `<p style="color: #dc3545;">Error loading data: ${error.message}</p>`;
        }
    }
}

// Render tournament data with proper display of all fields
function renderTournamentData(tournamentId, data) {
    const container = document.getElementById(`${tournamentId}-container`);
    if (!container) return;
    
    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="no-entries">
                <h3>No Tournament Entries Yet</h3>
                <p>When players purchase tournament entries through the website, they will appear here.</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    data.forEach((foursome, index) => {
        html += renderFoursome(foursome, tournamentId, index);
    });
    
    container.innerHTML = html;
}

// Helper function to format name as "R. Aldana"
function formatPlayerNameForTitle(player) {
    if (!player || !player.name) return 'Empty';
    
    const nameParts = player.name.trim().split(' ');
    if (nameParts.length >= 2) {
        // First initial + period + space + last name
        return nameParts[0].charAt(0).toUpperCase() + '. ' + nameParts[nameParts.length - 1];
    } else if (nameParts.length === 1) {
        // Just one name, use as is
        return nameParts[0];
    }
    return 'Empty';
}

// Render a single foursome - UPDATED for empty cart option
function renderFoursome(foursome, tournamentId, index) {
    const player1 = foursome.player1 || {};
    const player2 = foursome.player2 || {};
    const player3 = foursome.player3 || {};
    const player4 = foursome.player4 || {};
    
    // Format start time
    const startTime = foursome.startTime ? foursome.startTime : 'Not specified';
    
    // Format cart option - handle empty string
    const cartOption = foursome.cartOption ? foursome.cartOption : 'None';
    
    // Format side pot and roulette
    const sidePot = foursome.sidePot ? '<span class="badge badge-yes">Yes</span>' : '<span class="badge badge-no">No</span>';
    const roulette = foursome.roulette ? '<span class="badge badge-yes">Yes</span>' : '<span class="badge badge-no">No</span>';
    
    // Build player name list for title
    const playerNames = [];
    
    // Add all player names formatted as "R. Aldana"
    playerNames.push(formatPlayerNameForTitle(player1));
    playerNames.push(formatPlayerNameForTitle(player2));
    playerNames.push(formatPlayerNameForTitle(player3));
    playerNames.push(formatPlayerNameForTitle(player4));
    
    // Create title: "Foursome # - R. Aldana, P. Aguiar, J. Almeida, Empty - 8 AM"
    const title = `Foursome ${index + 1} - ${playerNames.join(', ')} - ${startTime}`;
    
    // Use actual _id from database
    const foursomeId = foursome._id ? foursome._id.$oid || foursome._id : index;
    
    return `
        <div class="foursome-container" data-foursome-id="${foursomeId}">
            <div class="foursome-header">
                <h3>${title}</h3>
                <div class="foursome-actions">
                    <button class="edit-foursome-btn" onclick="editFoursome('${tournamentId}', '${foursomeId}')">
                        Edit Foursome
                    </button>
                    <button class="remove-foursome-btn" onclick="removeFoursome('${tournamentId}', '${foursomeId}')">
                        Remove Foursome
                    </button>
                </div>
            </div>
            
            <div class="tournament-meta">
                <div class="meta-item">
                    <span class="meta-label">Start Time:</span>
                    <span class="meta-value">${startTime}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Cart Option:</span>
                    <span class="meta-value">${cartOption}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Side Pot:</span>
                    <span class="meta-value">${sidePot}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Roulette:</span>
                    <span class="meta-value">${roulette}</span>
                </div>
                <!-- Payment removed from display -->
            </div>
            
            <div class="player-grid">
                ${renderPlayerRow(1, player1, tournamentId, foursomeId)}
                ${renderPlayerRow(2, player2, tournamentId, foursomeId)}
                ${renderPlayerRow(3, player3, tournamentId, foursomeId)}
                ${renderPlayerRow(4, player4, tournamentId, foursomeId)}
            </div>
        </div>
    `;
}

// Render a player row 
function renderPlayerRow(playerNumber, playerData, tournamentId, foursomeId) {
    const isPlayer1 = playerNumber === 1;
    const isEmpty = !playerData || !playerData.name;
    
    let playerInfo = '';
    let actionButton = '';
    
    if (isEmpty) {
        playerInfo = `<div class="empty-slot">${getOrdinal(playerNumber)} Player Slot Empty</div>`;
        actionButton = `<button class="action-btn add-btn" onclick="addPlayer('${tournamentId}', '${foursomeId}', ${playerNumber})">Add Player</button>`;
    } else {
        // Get display data - use playerData directly since we have all info
        const displayData = playerData;
        
        playerInfo = `
            <div class="player-name">${displayData.name || 'Unknown'}</div>
            <div class="player-details">
                <div><strong>Email:</strong> ${displayData.email || 'Not provided'}</div>
                <div><strong>Phone:</strong> ${displayData.phoneNum || displayData.phone || 'Not provided'}</div>
                <div><strong>GHIN:</strong> ${displayData.ghin || 'Not provided'}</div>
                <div><strong>Entry #:</strong> ${displayData.entryNum || 'Not provided'}</div>
                <div><strong>Index:</strong> ${displayData.index || 'Not provided'}</div>
                ${isPlayer1 ? `
                    <div><strong>Side Pot:</strong> ${playerData.sidePot ? 'Yes' : 'No'}</div>
                    <div><strong>Roulette:</strong> ${playerData.roulette ? 'Yes' : 'No'}</div>
                ` : ''}
            </div>
        `;
        
        if (!isPlayer1) {
            actionButton = `<button class="action-btn edit-btn" onclick="showPlayerActions('${tournamentId}', '${foursomeId}', ${playerNumber})">Edit</button>`;
        }
    }
    
    return `
        <div class="player-row ${isPlayer1 ? 'player1' : ''}">
            <div class="player-info">
                <div class="player-number">Player ${playerNumber}${isPlayer1 ? ' (Main)' : ''}</div>
                ${playerInfo}
            </div>
            ${actionButton ? `<div class="player-actions">${actionButton}</div>` : ''}
        </div>
    `;
}

// Helper function for ordinal numbers
function getOrdinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Remove foursome
async function removeFoursome(tournamentId, foursomeId) {
    if (!confirm('Are you sure you want to remove this foursome? This action cannot be undone.')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`/api/tournament-manager/${tournamentId}/${foursomeId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to remove foursome');
        }
        
        // Reload tournament data
        loadTournamentData(tournamentId);
        
    } catch (error) {
        console.error('Error removing foursome:', error);
        alert('Error removing foursome: ' + error.message);
    }
}

// Add player
function addPlayer(tournamentId, foursomeId, playerNumber) {
    currentTournament = tournamentId;
    currentFoursomeId = foursomeId;
    currentPlayerNumber = playerNumber;
    selectedMember = null;
    
    // Reset modal
    document.getElementById('memberSearch').value = '';
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('selectedMemberInfo').style.display = 'none';
    document.getElementById('manualEntry').style.display = 'none';
    
    // Reset manual entry fields
    document.getElementById('manualFirstName').value = '';
    document.getElementById('manualLastName').value = '';
    document.getElementById('manualEmail').value = '';
    document.getElementById('manualPhone').value = '';
    document.getElementById('manualGhin').value = '';
    document.getElementById('manualEntryNum').value = '';
    document.getElementById('manualIndex').value = '';
    
    // Update modal title
    document.getElementById('modalTitle').textContent = `Add Player ${playerNumber} to Foursome`;
    
    // Show modal
    document.getElementById('playerModal').style.display = 'flex';
    document.getElementById('memberSearch').focus();
}

// Show player actions (for players 2-4)
function showPlayerActions(tournamentId, foursomeId, playerNumber) {
    // Store values directly in the action modal for persistence
    const actionModal = document.getElementById('actionModal');
    actionModal.dataset.tournamentId = tournamentId;
    actionModal.dataset.foursomeId = foursomeId;
    actionModal.dataset.playerNumber = playerNumber;
    
    // Also update global state for consistency
    currentTournament = tournamentId;
    currentFoursomeId = foursomeId;
    currentPlayerNumber = playerNumber;
    
    // Update modal title
    document.getElementById('actionModalTitle').textContent = `Player ${playerNumber} Actions`;
    
    // Show action modal
    actionModal.style.display = 'flex';
}

// Close action modal
function closeActionModal() {
    document.getElementById('actionModal').style.display = 'none';
    // Don't clear global state here - it might still be needed
}

// Show replace player modal
function showReplacePlayer() {
    // Get values from the action modal data attributes
    const actionModal = document.getElementById('actionModal');
    const tournamentId = actionModal.dataset.tournamentId;
    const foursomeId = actionModal.dataset.foursomeId;
    const playerNumber = actionModal.dataset.playerNumber;
    
    // Ensure we have the values
    if (!tournamentId || !foursomeId || !playerNumber) {
        console.error('Missing data for replace player:', { tournamentId, foursomeId, playerNumber });
        // Fallback to global state
        if (!currentTournament || !currentFoursomeId || !currentPlayerNumber) {
            alert('Error: Missing data. Please try again.');
            closeActionModal();
            return;
        }
    }
    
    // Use data attributes if available, otherwise use global state
    const finalTournamentId = tournamentId || currentTournament;
    const finalFoursomeId = foursomeId || currentFoursomeId;
    const finalPlayerNumber = playerNumber || currentPlayerNumber;
    
    // Update global state
    currentTournament = finalTournamentId;
    currentFoursomeId = finalFoursomeId;
    currentPlayerNumber = finalPlayerNumber;
    
    // Close action modal
    closeActionModal();
    
    // Open player modal for replacement
    addPlayer(finalTournamentId, finalFoursomeId, finalPlayerNumber);
}

// Remove player
async function removePlayer() {
    // Get values from the action modal data attributes
    const actionModal = document.getElementById('actionModal');
    const tournamentId = actionModal.dataset.tournamentId;
    const foursomeId = actionModal.dataset.foursomeId;
    const playerNumber = actionModal.dataset.playerNumber;
    
    // Ensure we have the values
    if (!tournamentId || !foursomeId || !playerNumber) {
        console.error('Missing data for remove player:', { tournamentId, foursomeId, playerNumber });
        // Fallback to global state
        if (!currentTournament || !currentFoursomeId || !currentPlayerNumber) {
            alert('Error: Missing data. Please try again.');
            closeActionModal();
            return;
        }
    }
    
    // Use data attributes if available, otherwise use global state
    const finalTournamentId = tournamentId || currentTournament;
    const finalFoursomeId = foursomeId || currentFoursomeId;
    const finalPlayerNumber = playerNumber || currentPlayerNumber;
    
    if (!confirm('Are you sure you want to remove this player from the foursome?')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`/api/tournament-manager/${finalTournamentId}/${finalFoursomeId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                playerNumber: finalPlayerNumber,
                action: 'remove'
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to remove player: ${response.statusText} - ${errorText}`);
        }
        
        // Reload tournament data
        loadTournamentData(finalTournamentId);
        
    } catch (error) {
        console.error('Error removing player:', error);
        alert('Error removing player: ' + error.message);
    } finally {
        // Clean up data attributes
        delete actionModal.dataset.tournamentId;
        delete actionModal.dataset.foursomeId;
        delete actionModal.dataset.playerNumber;
        closeActionModal();
    }
}

// Search members
async function searchMembers(query) {
    try {
        const response = await fetch(`/api/members/search?q=${encodeURIComponent(query)}`);
        const results = await response.json();
        
        const searchResults = document.getElementById('searchResults');
        if (results.length === 0) {
            searchResults.innerHTML = '<div class="search-result-item">No members found</div>';
            searchResults.style.display = 'block';
            return;
        }
        
        let html = '';
        results.forEach(member => {
            html += `
                <div class="search-result-item" data-member-id="${member._id}" 
                     onclick="selectMember(${JSON.stringify(member).replace(/"/g, '&quot;')})">
                    <strong>${member.firstName} ${member.lastName}</strong>
                    <div style="font-size: 0.8rem; color: #666;">
                        GHIN: ${member.ghin} | Entry: ${member.entryNum} | Index: ${member.index || 'N/A'}
                    </div>
                </div>
            `;
        });
        
        searchResults.innerHTML = html;
        searchResults.style.display = 'block';
        
    } catch (error) {
        console.error('Error searching members:', error);
    }
}

// Select member from search results
function selectMember(member) {
    selectedMember = member;
    
    // Update UI
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('memberSearch').value = `${member.firstName} ${member.lastName}`;
    
    // Show selected member info
    document.getElementById('memberDetails').innerHTML = `
        <div><strong>Name:</strong> ${member.firstName} ${member.lastName}</div>
        <div><strong>Email:</strong> ${member.email || 'Not provided'}</div>
        <div><strong>Phone:</strong> ${member.phoneNum || member.phone || 'Not provided'}</div>
        <div><strong>GHIN:</strong> ${member.ghin || 'Not provided'}</div>
        <div><strong>Entry #:</strong> ${member.entryNum || 'Not provided'}</div>
        <div><strong>Index:</strong> ${member.index || 'Not provided'}</div>
    `;
    document.getElementById('selectedMemberInfo').style.display = 'block';
    
    // Hide manual entry if showing
    document.getElementById('manualEntry').style.display = 'none';
    
    // Clear manual entry fields to avoid confusion
    document.getElementById('manualFirstName').value = '';
    document.getElementById('manualLastName').value = '';
    document.getElementById('manualEmail').value = '';
    document.getElementById('manualPhone').value = '';
    document.getElementById('manualGhin').value = '';
    document.getElementById('manualEntryNum').value = '';
    document.getElementById('manualIndex').value = '';
}

// Show manual entry form
function showManualEntry() {
    document.getElementById('manualEntry').style.display = 'block';
    document.getElementById('selectedMemberInfo').style.display = 'none';
    selectedMember = null;
}

// Close player modal
function closePlayerModal() {
    document.getElementById('playerModal').style.display = 'none';
    // Only clear global state if we're not in the middle of a replace flow
    // The showReplacePlayer function will set these again
}

// Confirm player action
async function confirmPlayerAction() {
    let memberId = null;
    let memberData = null;
    let action;
    
    if (selectedMember) {
        // Use selected member from search
        memberId = selectedMember._id;
        action = 'replace';
        
        // Also send memberData to help the server
        memberData = {
            firstName: selectedMember.firstName,
            lastName: selectedMember.lastName,
            email: selectedMember.email || '',
            phone: selectedMember.phone || selectedMember.phoneNum || '',
            ghin: selectedMember.ghin ? selectedMember.ghin.toString() : '',
            entryNum: selectedMember.entryNum ? selectedMember.entryNum.toString() : '',
            index: selectedMember.index || ''
        };
    } else {
        // Check manual entry
        const firstName = document.getElementById('manualFirstName').value.trim();
        const lastName = document.getElementById('manualLastName').value.trim();
        const email = document.getElementById('manualEmail').value.trim();
        const phone = document.getElementById('manualPhone').value.trim();
        const ghin = document.getElementById('manualGhin').value.trim();
        const entryNum = document.getElementById('manualEntryNum').value.trim();
        const index = document.getElementById('manualIndex').value.trim();
        
        if (!firstName || !lastName) {
            alert('Please provide at least first name and last name.');
            return;
        }
        
        memberData = {
            firstName,
            lastName,
            email,
            phone,
            ghin: ghin,
            entryNum: entryNum,
            index
        };
        action = 'add';
    }
    
    try {
        const token = localStorage.getItem('adminToken');
        const requestBody = {
            playerNumber: currentPlayerNumber,
            action: action
        };
        
        // Send both memberId and memberData when available
        if (memberId) {
            requestBody.memberId = memberId;
        }
        if (memberData) {
            requestBody.memberData = memberData;
        }
        
        console.log('Sending player update request:', requestBody);
        console.log('Using tournament:', currentTournament, 'foursome:', currentFoursomeId);
        
        const response = await fetch(`/api/tournament-manager/${currentTournament}/${currentFoursomeId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `Failed to update player: ${response.statusText}`;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.error) {
                    errorMessage += ` - ${errorJson.error}`;
                }
            } catch (e) {
                // Not JSON, use raw text
                errorMessage += ` - ${errorText}`;
            }
            throw new Error(errorMessage);
        }
        
        // Reload tournament data
        loadTournamentData(currentTournament);
        
        // Close modal
        closePlayerModal();
        
        // Clear global state after successful operation
        currentTournament = null;
        currentFoursomeId = null;
        currentPlayerNumber = null;
        selectedMember = null;
        
    } catch (error) {
        console.error('Error updating player:', error);
        alert('Error updating player: ' + error.message);
    }
}

// Close modals when clicking outside content
window.onclick = function(event) {
    const playerModal = document.getElementById('playerModal');
    const actionModal = document.getElementById('actionModal');
    const editFoursomeModal = document.getElementById('editFoursomeModal');
    
    if (event.target === playerModal) {
        closePlayerModal();
    }
    
    if (event.target === actionModal) {
        closeActionModal();
    }
    
    if (event.target === editFoursomeModal) {
        closeEditFoursomeModal();
    }
};

// Edit Foursome - Open modal
function editFoursome(tournamentId, foursomeId) {
    // Store values for later use
    currentTournament = tournamentId;
    currentFoursomeId = foursomeId;
    
    // Find the foursome data
    const tournamentData = tournamentId === 'tournament1' ? tournament1Data : tournament2Data;
    const foursome = tournamentData.find(f => 
        f._id?.$oid === foursomeId || f._id === foursomeId
    );
    
    if (!foursome) {
        alert('Foursome not found!');
        return;
    }
    
    // Reset modal fields
    resetEditFoursomeModal();
    
    // Fill in existing data
    fillEditFoursomeModal(foursome);
    
    // Show modal
    document.getElementById('editFoursomeModal').style.display = 'flex';
}

// Fill edit modal with existing data 
function fillEditFoursomeModal(foursome) {
    console.log('Filling modal with foursome:', foursome);
    
    // Fill Player 1 data
    if (foursome.player1) {
        const player1 = foursome.player1;
        console.log('Player1 data:', player1);
        
        // Store the original player1 data in a global variable for reference
        window.currentPlayer1Data = player1;
        
        // Check if player1 has a memberId (is a member)
        if (player1.memberId) {
            const memberInfo = player1.fullMember || player1;
            
            // Pre-fill the search input
            document.getElementById('editMemberSearch').value = memberInfo.name || '';
            
            // Show selected member info
            document.getElementById('editMemberDetails').innerHTML = `
                <div><strong>Name:</strong> ${memberInfo.name || 'Unknown'}</div>
                <div><strong>Email:</strong> ${memberInfo.email || 'Not provided'}</div>
                <div><strong>Phone:</strong> ${memberInfo.phone || memberInfo.phoneNum || 'Not provided'}</div>
                <div><strong>GHIN:</strong> ${memberInfo.ghin || 'Not provided'}</div>
                <div><strong>Entry #:</strong> ${memberInfo.entryNum || 'Not provided'}</div>
                <div><strong>Index:</strong> ${memberInfo.index || 'Not provided'}</div>
            `;
            document.getElementById('editSelectedMemberInfo').style.display = 'block';
            
            // Store selected member data
            selectedMember = {
                _id: player1.memberId,
                firstName: memberInfo.name?.split(' ')[0] || '',
                lastName: memberInfo.name?.split(' ').slice(1).join(' ') || '',
                email: memberInfo.email || '',
                phone: memberInfo.phone || memberInfo.phoneNum || '',
                ghin: memberInfo.ghin,
                entryNum: memberInfo.entryNum,
                index: memberInfo.index || ''
            };
        } else {
            // Player is not a member, show manual entry
            showEditManualEntry();
            
            // Parse name into first and last
            const nameParts = (player1.name || '').split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            
            // Fill manual entry fields
            document.getElementById('editManualFirstName').value = firstName;
            document.getElementById('editManualLastName').value = lastName;
            document.getElementById('editManualEmail').value = player1.email || '';
            document.getElementById('editManualPhone').value = player1.phone || '';
            document.getElementById('editManualGhin').value = player1.ghin || '';
            document.getElementById('editManualEntryNum').value = player1.entryNum || '';
            document.getElementById('editManualIndex').value = player1.index || '';
        }
    } else {
        // If player1 is null/empty, ensure manual entry is shown
        showEditManualEntry();
    }
    
    // Fill other foursome details with dropdowns
    const startTimeSelect = document.getElementById('editStartTime');
    const cartOptionSelect = document.getElementById('editCartOption');
    
    // Set start time - match the value exactly
    if (foursome.startTime) {
        startTimeSelect.value = foursome.startTime;
    } else {
        startTimeSelect.value = '';
    }
    
    // Set cart option - match the value exactly (can be empty string)
    if (foursome.cartOption) {
        cartOptionSelect.value = foursome.cartOption;
    } else {
        cartOptionSelect.value = '';
    }
    
    // Set checkboxes - check both player1 and foursome level
    const sidePotChecked = foursome.player1?.sidePot || foursome.sidePot || false;
    const rouletteChecked = foursome.player1?.roulette || foursome.roulette || false;
    
    document.getElementById('editSidePot').checked = sidePotChecked;
    document.getElementById('editRoulette').checked = rouletteChecked;
    
    console.log('Form values set:', {
        startTime: startTimeSelect.value,
        cartOption: cartOptionSelect.value,
        sidePot: sidePotChecked,
        roulette: rouletteChecked
    });
}

// Reset edit foursome modal
function resetEditFoursomeModal() {
    // Clear search
    document.getElementById('editMemberSearch').value = '';
    document.getElementById('editSearchResults').innerHTML = '';
    document.getElementById('editSearchResults').style.display = 'none';
    document.getElementById('editSelectedMemberInfo').style.display = 'none';
    document.getElementById('editManualEntry').style.display = 'none';
    
    // Clear manual entry fields
    document.getElementById('editManualFirstName').value = '';
    document.getElementById('editManualLastName').value = '';
    document.getElementById('editManualEmail').value = '';
    document.getElementById('editManualPhone').value = '';
    document.getElementById('editManualGhin').value = '';
    document.getElementById('editManualEntryNum').value = '';
    document.getElementById('editManualIndex').value = '';
    
    // Clear checkboxes
    document.getElementById('editSidePot').checked = false;
    document.getElementById('editRoulette').checked = false;
    
    // Clear dropdowns
    document.getElementById('editCartOption').value = '';
    document.getElementById('editStartTime').value = '';
    
    // Clear selected member
    selectedMember = null;

    // Clear the global player1 data reference
    window.currentPlayer1Data = null;
}

// Show manual entry for edit modal
function showEditManualEntry() {
    document.getElementById('editManualEntry').style.display = 'block';
    document.getElementById('editSelectedMemberInfo').style.display = 'none';
    document.getElementById('editSearchResults').style.display = 'none';
    selectedMember = null;
}

// Close edit foursome modal
function closeEditFoursomeModal() {
    document.getElementById('editFoursomeModal').style.display = 'none';
    resetEditFoursomeModal();
    currentTournament = null;
    currentFoursomeId = null;
}

// Save foursome changes 
async function saveFoursomeChanges() {
    const tournamentId = currentTournament;
    const foursomeId = currentFoursomeId;
    
    console.log('Saving foursome changes for:', { tournamentId, foursomeId });
    
    if (!tournamentId || !foursomeId) {
        alert('Error: Missing tournament or foursome data.');
        return;
    }
    
    // Validate required fields - ONLY START TIME IS REQUIRED
    const startTime = document.getElementById('editStartTime').value;
    const cartOption = document.getElementById('editCartOption').value;
    
    if (!startTime) {
        alert('Please select a start time.');
        return;
    }
    
    // Cart option is optional - no validation needed
    
    try {
        const token = localStorage.getItem('adminToken');
        
        // Prepare player1 data
        let player1Data = null;
        
        // Check if we're using member selection
        if (selectedMember) {
            console.log('Using selected member:', selectedMember);
            player1Data = {
                memberId: selectedMember._id,
                firstName: selectedMember.firstName,
                lastName: selectedMember.lastName,
                email: selectedMember.email || '',
                phoneNum: selectedMember.phoneNum || selectedMember.phone || '', // STANDARDIZED
                ghin: selectedMember.ghin || '',
                entryNum: selectedMember.entryNum || '',
                index: selectedMember.index || '',
                sidePot: document.getElementById('editSidePot').checked,
                roulette: document.getElementById('editRoulette').checked
            };
        } 
        // Check if manual entry is visible and has data
        else if (document.getElementById('editManualEntry').style.display !== 'none') {
            const firstName = document.getElementById('editManualFirstName').value.trim();
            const lastName = document.getElementById('editManualLastName').value.trim();
            
            console.log('Manual entry data:', { firstName, lastName });
            
            if (!firstName || !lastName) {
                alert('Please provide at least first name and last name for Player 1.');
                return;
            }
            
            player1Data = {
                firstName: firstName,
                lastName: lastName,
                email: document.getElementById('editManualEmail').value.trim(),
                phoneNum: document.getElementById('editManualPhone').value.trim(), // STANDARDIZED
                ghin: document.getElementById('editManualGhin').value.trim(),
                entryNum: document.getElementById('editManualEntryNum').value.trim(),
                index: document.getElementById('editManualIndex').value.trim(),
                sidePot: document.getElementById('editSidePot').checked,
                roulette: document.getElementById('editRoulette').checked
            };
        }
        // If neither member nor manual entry, but player1 existed before, keep it
        else if (window.currentPlayer1Data) {
            console.log('Keeping existing player1 data');
            player1Data = window.currentPlayer1Data;
            // Update side pot and roulette values from checkboxes
            player1Data.sidePot = document.getElementById('editSidePot').checked;
            player1Data.roulette = document.getElementById('editRoulette').checked;
        }
        
        // Prepare update data - ALWAYS include these fields
        const updateData = {
            startTime: startTime,
            cartOption: cartOption, // This can be empty string
            sidePot: document.getElementById('editSidePot').checked,
            roulette: document.getElementById('editRoulette').checked
        };
        
        // Add player1 data if available
        if (player1Data) {
            updateData.player1 = player1Data;
        } else {
            console.warn('No player1 data to send');
        }
        
        console.log('Sending foursome update:', updateData);
        
        const response = await fetch(`/api/tournament-manager-foursome/${tournamentId}/${foursomeId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(updateData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server error response:', errorText);
            throw new Error(`Failed to update foursome: ${response.statusText} - ${errorText}`);
        }
        
        const result = await response.json();
        console.log('Server response:', result);
        
        // Reload tournament data
        await loadTournamentData(tournamentId);
        
        // Show success message
        alert('Foursome updated successfully!');
        
        // Close modal
        closeEditFoursomeModal();
        
    } catch (error) {
        console.error('Error updating foursome:', error);
        alert('Error updating foursome: ' + error.message);
    }
}

// Add event listener for edit member search
document.addEventListener('DOMContentLoaded', function() {
    // Existing setup code...
    
    // Add edit member search functionality
    const editSearchInput = document.getElementById('editMemberSearch');
    if (editSearchInput) {
        let editSearchTimeout;
        editSearchInput.addEventListener('input', function(e) {
            clearTimeout(editSearchTimeout);
            const query = e.target.value.trim();
            
            if (query.length >= 2) {
                editSearchTimeout = setTimeout(() => {
                    searchEditMembers(query);
                }, 300);
            } else {
                document.getElementById('editSearchResults').style.display = 'none';
            }
        });
    }
});

// Search members for edit modal
async function searchEditMembers(query) {
    try {
        const response = await fetch(`/api/members/search?q=${encodeURIComponent(query)}`);
        const results = await response.json();
        
        const searchResults = document.getElementById('editSearchResults');
        if (results.length === 0) {
            searchResults.innerHTML = '<div class="search-result-item">No members found</div>';
            searchResults.style.display = 'block';
            return;
        }
        
        let html = '';
        results.forEach(member => {
            html += `
                <div class="search-result-item" data-member-id="${member._id}" 
                     onclick="selectEditMember(${JSON.stringify(member).replace(/"/g, '&quot;')})">
                    <strong>${member.firstName} ${member.lastName}</strong>
                    <div style="font-size: 0.8rem; color: #666;">
                        GHIN: ${member.ghin} | Entry: ${member.entryNum} | Index: ${member.index || 'N/A'}
                    </div>
                </div>
            `;
        });
        
        searchResults.innerHTML = html;
        searchResults.style.display = 'block';
        
    } catch (error) {
        console.error('Error searching members for edit:', error);
    }
}

// Select member for edit modal
function selectEditMember(member) {
    selectedMember = member;
    
    // Update UI
    document.getElementById('editSearchResults').style.display = 'none';
    document.getElementById('editMemberSearch').value = `${member.firstName} ${member.lastName}`;
    
    // Show selected member info
    document.getElementById('editMemberDetails').innerHTML = `
        <div><strong>Name:</strong> ${member.firstName} ${member.lastName}</div>
        <div><strong>Email:</strong> ${member.email || 'Not provided'}</div>
        <div><strong>Phone:</strong> ${member.phoneNum || member.phone || 'Not provided'}</div>
        <div><strong>GHIN:</strong> ${member.ghin || 'Not provided'}</div>
        <div><strong>Entry #:</strong> ${member.entryNum || 'Not provided'}</div>
        <div><strong>Index:</strong> ${member.index || 'Not provided'}</div>
    `;
    document.getElementById('editSelectedMemberInfo').style.display = 'block';
    
    // Hide manual entry
    document.getElementById('editManualEntry').style.display = 'none';
    
    // Clear manual entry fields
    document.getElementById('editManualFirstName').value = '';
    document.getElementById('editManualLastName').value = '';
    document.getElementById('editManualEmail').value = '';
    document.getElementById('editManualPhone').value = '';
    document.getElementById('editManualGhin').value = '';
    document.getElementById('editManualEntryNum').value = '';
    document.getElementById('editManualIndex').value = '';
}