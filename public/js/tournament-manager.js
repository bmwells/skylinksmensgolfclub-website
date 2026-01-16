// File: public/js/tournament-manager.js

// Helper function to truncate text with ellipsis - MOVED TO TOP
function truncateText(text, maxWidth) {
    if (!text) return '';
    
    // Simple character-based truncation (more sophisticated would need canvas measurement)
    const maxChars = Math.floor(maxWidth / 8); // Rough estimate: 8px per character
    if (text.length <= maxChars) return text;
    
    return text.substring(0, maxChars - 3) + '...';
}

// Helper function for ordinal numbers
function getOrdinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Global state
let currentTournament = null;
let currentFoursomeId = null;
let currentPlayerNumber = null;
let selectedMember = null;
let currentTournamentData = [];
let tournaments = []; // Array to store all tournament info
let originalTournamentData = []; // Store unsorted data for reference

// Function to save active tab to localStorage
function saveActiveTab(tournamentId) {
    localStorage.setItem('activeTournamentTab', tournamentId);
}

// Function to restore active tab from localStorage
function restoreActiveTab() {
    return localStorage.getItem('activeTournamentTab');
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
    
    // Initialize button states (disabled initially)
    updateButtonStates();
    
    // Load tournaments and setup
    loadTournaments();
    
    // Setup event listeners
    setupEventListeners();
});

// Load all tournaments
async function loadTournaments() {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/tournaments?activePage=true', {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load tournaments: ${response.statusText}`);
        }
        
        tournaments = await response.json();
        
        // Sort: pinned first, then by creation date
        tournaments.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });
        
        // Create tabs
        createTournamentTabs();
        
        // Update button states (initially disabled)
        updateButtonStates();
        
        // Restore active tab or select first
        const savedTab = restoreActiveTab();
        if (savedTab && tournaments.some(t => t.id === savedTab)) {
            switchTournament(savedTab);
        } else if (tournaments.length > 0) {
            // Auto-select the first tournament
            switchTournament(tournaments[0].id);
        } else {
            // No tournaments available
            updateButtonStates();
        }
        
    } catch (error) {
        console.error('Error loading tournaments:', error);
        document.getElementById('tournament-tabs').innerHTML = 
            `<p style="color: #dc3545;">Error loading tournaments: ${error.message}</p>`;
        updateButtonStates();
    }
}

// Create tournament tabs dynamically
function createTournamentTabs() {
    const tabsContainer = document.getElementById('tournament-tabs');
    
    if (tournaments.length === 0) {
        tabsContainer.innerHTML = '<p>No tournaments found</p>';
        return;
    }
    
    let tabsHTML = '';
    tournaments.forEach(tournament => {
        const truncatedTitle = truncateText(tournament.title, 150);
        const pinIcon = tournament.pinned ? '📌 ' : '';
        tabsHTML += `
            <button class="tab-button" onclick="switchTournament('${tournament.id}')" 
                    title="${tournament.title}" 
                    style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${pinIcon}${truncatedTitle}
            </button>
        `;
    });
    
    tabsContainer.innerHTML = tabsHTML;
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
    
    // Find and activate the correct tab
    document.querySelectorAll('.tab-button').forEach(btn => {
        if (btn.textContent.includes(tournamentId) || btn.onclick.toString().includes(tournamentId)) {
            btn.classList.add('active');
        }
    });
    
    // Update button states
    updateButtonStates();
    
    // Load tournament data
    loadTournamentData(tournamentId);
}

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

// Load tournament data
async function loadTournamentData(tournamentId) {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`/api/tournaments/${tournamentId}/registrations`, {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load ${tournamentId}: ${response.statusText}`);
        }
        
        const data = await response.json();
        currentTournamentData = data;
        originalTournamentData = [...data]; // Store unsorted copy
        
        // Safely hide loading element if it exists
        const loadingEl = document.getElementById('tournament-loading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
        
        // Sort the data by startTime before rendering
        const sortedData = sortRegistrationsByTime(data);
        renderTournamentData(tournamentId, sortedData);
        
    } catch (error) {
        console.error('Error loading tournament data:', error);
        const loadingEl = document.getElementById('tournament-loading');
        if (loadingEl) {
            loadingEl.innerHTML = `<p style="color: #dc3545;">Error loading data: ${error.message}</p>`;
        }
    }
}

// Helper function to get foursome ID
function getFoursomeId(foursome, tournamentId, originalIndex) {
    if (foursome._id && /^[0-9a-fA-F]{24}$/.test(foursome._id.toString())) {
        return foursome._id.toString();
    } else if (foursome.id) {
        return foursome.id;
    } else {
        return `temp_${tournamentId}_${originalIndex}_${Date.now()}`;
    }
}

// Add this helper function to sort registrations by startTime
function sortRegistrationsByTime(registrations) {
    if (!registrations || !Array.isArray(registrations)) return [];
    
    return [...registrations].sort((a, b) => {
        // Helper function to convert time string to sortable value
        const getTimeValue = (timeStr) => {
            if (!timeStr) return 999; // No time specified goes last
            if (timeStr === "Doesn't Matter") return 998;
            if (timeStr === "Not specified") return 997;
            
            try {
                // Parse time like "6am", "10am", "2pm", "12pm", "12am"
                const timeMatch = timeStr.toLowerCase().match(/^(\d+)(am|pm)$/);
                if (timeMatch) {
                    let hour = parseInt(timeMatch[1]);
                    const period = timeMatch[2];
                    
                    // Convert to 24-hour format for sorting
                    if (period === 'pm' && hour < 12) {
                        hour += 12;
                    }
                    if (period === 'am' && hour === 12) {
                        hour = 0; // 12am = 0
                    }
                    
                    return hour;
                }
            } catch (error) {
                console.error('Error parsing time:', timeStr, error);
            }
            
            // If can't parse, sort alphabetically
            return 996;
        };
        
        const timeA = getTimeValue(a.startTime);
        const timeB = getTimeValue(b.startTime);
        
        // First sort by time
        if (timeA !== timeB) {
            return timeA - timeB;
        }
        
        // If same time, sort by creation date
        const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return dateA - dateB;
    });
}

// Render tournament data with proper display of all fields
function renderTournamentData(tournamentId, sortedData) {
    const container = document.getElementById('tournament-container');
    if (!container) return;
    
    if (!sortedData || sortedData.length === 0) {
        container.innerHTML = `
            <div class="no-entries">
                <h3>No Tournament Entries Yet</h3>
                <p>When players purchase tournament entries through the website, they will appear here.</p>
            </div>
        `;
        return;
    }
    
    // Create a mapping of foursome identifiers to their original indices
    const identifierToOriginalIndex = new Map();
    
    originalTournamentData.forEach((foursome, originalIndex) => {
        if (foursome) {
            // Create a unique identifier for the foursome
            const identifier = createFoursomeIdentifier(foursome);
            identifierToOriginalIndex.set(identifier, originalIndex);
        }
    });
    
    let html = '';
    
    sortedData.forEach((foursome, sortedIndex) => {
        // Find the original index using the identifier
        let originalIndex = -1;
        const identifier = createFoursomeIdentifier(foursome);
        if (identifierToOriginalIndex.has(identifier)) {
            originalIndex = identifierToOriginalIndex.get(identifier);
        }
        
        // If not found by identifier, try to find by matching properties
        if (originalIndex === -1) {
            originalIndex = originalTournamentData.findIndex(item => 
                JSON.stringify(item) === JSON.stringify(foursome)
            );
        }
        
        // Fallback to sorted index if still not found
        if (originalIndex === -1) {
            originalIndex = sortedIndex;
        }
        
        html += renderFoursome(foursome, tournamentId, originalIndex, sortedIndex);
    });
    
    container.innerHTML = html;
}

// Helper function to create a unique identifier for a foursome
function createFoursomeIdentifier(foursome) {
    if (!foursome) return '';
    
    // Use _id if available
    if (foursome._id) {
        return foursome._id.toString();
    }
    
    // Otherwise, create a hash from the data
    const dataString = JSON.stringify({
        player1: foursome.player1?.name,
        player2: foursome.player2?.name,
        player3: foursome.player3?.name,
        player4: foursome.player4?.name,
        startTime: foursome.startTime,
        createdAt: foursome.createdAt
    });
    
    return dataString;
}

// Render a single foursome
function renderFoursome(foursome, tournamentId, originalIndex, sortedIndex) {
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
    
    // Use sorted index for display (since that's what users see)
    const displayIndex = sortedIndex !== undefined ? sortedIndex : originalIndex;
    const title = `Foursome ${displayIndex + 1} - ${playerNames.join(', ')} - ${startTime}`;
    
    // Get the foursome ID
    const foursomeId = getFoursomeId(foursome, tournamentId, originalIndex);
    
    return `
        <div class="foursome-container" 
             data-foursome-id="${foursomeId}" 
             data-original-index="${originalIndex}"
             data-sorted-index="${sortedIndex}">
            <div class="foursome-header">
                <h3>${title}</h3>
                <div class="foursome-actions">
                    <button class="edit-foursome-btn" onclick="editFoursome('${tournamentId}', '${foursomeId}', ${originalIndex})">
                        Edit Foursome
                    </button>
                    <button class="remove-foursome-btn" onclick="removeFoursome('${tournamentId}', '${foursomeId}', ${originalIndex})">
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

// Add empty foursome
async function addEmptyFoursome() {
    if (!currentTournament) {
        alert('Please select a tournament first.');
        return;
    }
    
    if (!confirm('Add an empty foursome to this tournament?')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`/api/tournaments/${currentTournament}/registrations`, {
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

function openExportModal() {
    if (!currentTournament) {
        alert('Please select a tournament first.');
        return;
    }
    
    document.getElementById('exportModal').style.display = 'flex';
}

// Remove foursome
async function removeFoursome(tournamentId, foursomeId, originalIndex) {
    if (!confirm('Are you sure you want to remove this foursome? This action cannot be undone.')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`/api/tournaments/${tournamentId}/registrations/${foursomeId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'Failed to remove foursome';
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.error) {
                    errorMessage += `: ${errorJson.error}`;
                }
            } catch (e) {
                // Not JSON, use raw text
                errorMessage += `: ${errorText}`;
            }
            throw new Error(errorMessage);
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
        
        // Prepare update data to clear the player
        const updateData = {
            [`player${finalPlayerNumber}`]: null
        };
        
        const response = await fetch(`/api/tournaments/${finalTournamentId}/registrations/${finalFoursomeId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(updateData)
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
    
    if (selectedMember) {
        console.log('Selected member:', selectedMember);
        console.log('Selected member _id:', selectedMember._id, 'Type:', typeof selectedMember._id);
        
        // Use selected member from search
        // Ensure memberId is a string (not ObjectId)
        memberId = selectedMember._id ? selectedMember._id.toString() : null;
        
        // Also send memberData to help the server
        memberData = {
            name: `${selectedMember.firstName} ${selectedMember.lastName}`,
            email: selectedMember.email || '',
            phoneNum: selectedMember.phone || selectedMember.phoneNum || '',
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
            name: `${firstName} ${lastName}`,
            email,
            phoneNum: phone,
            ghin: ghin,
            entryNum: entryNum,
            index
        };
    }
    
    try {
        const token = localStorage.getItem('adminToken');
        
        // Prepare update data
        const updateData = {};
        
        if (memberId) {
            updateData[`player${currentPlayerNumber}`] = {
                memberId: memberId,  // This should now be a string
                ...memberData
            };
        } else if (memberData) {
            updateData[`player${currentPlayerNumber}`] = memberData;
        }
        
        // If we're updating player1, we should NOT include sidePot/roulette in player1 object
        // since they're stored at the document level
        if (currentPlayerNumber === 1 && updateData.player1) {
            // Remove sidePot and roulette from player1 if they exist
            delete updateData.player1.sidePot;
            delete updateData.player1.roulette;
        }
        
        console.log('Sending player update request:', updateData);
        console.log('Using tournament:', currentTournament, 'foursome:', currentFoursomeId, 'player:', currentPlayerNumber);
        
        const response = await fetch(`/api/tournaments/${currentTournament}/registrations/${currentFoursomeId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(updateData)
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
    const importModal = document.getElementById('importModal');
    const exportModal = document.getElementById('exportModal');
    
    if (event.target === playerModal) {
        closePlayerModal();
    }
    
    if (event.target === actionModal) {
        closeActionModal();
    }
    
    if (event.target === editFoursomeModal) {
        closeEditFoursomeModal();
    }
    
    if (event.target === importModal) {
        closeImportModal();
    }
    
    if (event.target === exportModal) {
        closeExportModal();
    }
};

// Edit Foursome - Open modal 
function editFoursome(tournamentId, foursomeId, originalIndex) {
    console.log('editFoursome called with:', { tournamentId, foursomeId, originalIndex });
    
    // Store values for later use
    currentTournament = tournamentId;
    currentFoursomeId = foursomeId;
    
    // Find the foursome data using the original index
    let foursome = null;
    
    if (foursomeId && foursomeId.startsWith('temp_')) {
        console.log('Using temporary ID, finding by original index:', originalIndex);
        foursome = originalTournamentData[originalIndex];
    } else {
        // Try to find by _id in the original data
        foursome = originalTournamentData.find(f => {
            if (!f) return false;
            
            // Check if _id matches (as string)
            if (f._id && f._id.toString() === foursomeId) {
                return true;
            }
            
            // Check if there's an id property that matches
            if (f.id && f.id === foursomeId) {
                return true;
            }
            
            return false;
        });
    }
    
    if (!foursome) {
        console.error('Foursome not found! Looking for:', { tournamentId, foursomeId, originalIndex });
        alert('Foursome not found! Please refresh the page and try again.');
        return;
    }
    
    // Reset modal fields
    resetEditFoursomeModal();
    
    // Fill in existing data
    fillEditFoursomeModal(foursome);
    
    // Show modal
    document.getElementById('editFoursomeModal').style.display = 'flex';
}

// Fill edit modal with existing data - UPDATED for proper dropdown setting
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
            // Pre-fill the search input
            document.getElementById('editMemberSearch').value = player1.name || '';
            
            // Show selected member info
            document.getElementById('editMemberDetails').innerHTML = `
                <div><strong>Name:</strong> ${player1.name || 'Unknown'}</div>
                <div><strong>Email:</strong> ${player1.email || 'Not provided'}</div>
                <div><strong>Phone:</strong> ${player1.phoneNum || player1.phone || 'Not provided'}</div>
                <div><strong>GHIN:</strong> ${player1.ghin || 'Not provided'}</div>
                <div><strong>Entry #:</strong> ${player1.entryNum || 'Not provided'}</div>
                <div><strong>Index:</strong> ${player1.index || 'Not provided'}</div>
            `;
            document.getElementById('editSelectedMemberInfo').style.display = 'block';
            
            // Store selected member data
            selectedMember = {
                _id: player1.memberId,
                firstName: player1.name?.split(' ')[0] || '',
                lastName: player1.name?.split(' ').slice(1).join(' ') || '',
                email: player1.email || '',
                phoneNum: player1.phoneNum || '',
                ghin: player1.ghin,
                entryNum: player1.entryNum,
                index: player1.index || ''
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
            document.getElementById('editManualPhone').value = player1.phoneNum || '';
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
        // Set the value directly - this automatically selects the matching option
        startTimeSelect.value = foursome.startTime;
        
        // Debug log to verify
        console.log('Set startTime to:', foursome.startTime, 'Current value:', startTimeSelect.value);
    } else {
        // Reset to default
        startTimeSelect.value = '';
    }

    // Set cart option - match the value exactly (can be empty string)
    if (foursome.cartOption) {
        // Set the value directly - this automatically selects the matching option
        cartOptionSelect.value = foursome.cartOption;
        
        // Debug log to verify
        console.log('Set cartOption to:', foursome.cartOption, 'Current value:', cartOptionSelect.value);
    } else {
        // Reset to default
        cartOptionSelect.value = '';
    }
    
    // Set checkboxes - check both player1 and foursome level
    const sidePotChecked = foursome.sidePot || false;
    const rouletteChecked = foursome.roulette || false;
    
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

// Save foursome changes - UPDATED to properly get form values
async function saveFoursomeChanges() {
    const tournamentId = currentTournament;
    const foursomeId = currentFoursomeId;
    
    console.log('Saving foursome changes for:', { tournamentId, foursomeId });
    
    if (!tournamentId || !foursomeId) {
        alert('Error: Missing tournament or foursome data.');
        return;
    }
    
    // Get form values - FIXED: using correct element IDs
    const startTimeSelect = document.getElementById('editStartTime');
    const cartOptionSelect = document.getElementById('editCartOption');
    const sidePotCheckbox = document.getElementById('editSidePot');
    const rouletteCheckbox = document.getElementById('editRoulette');
    
    if (!startTimeSelect || !cartOptionSelect || !sidePotCheckbox || !rouletteCheckbox) {
        console.error('Form elements not found!');
        alert('Error: Could not find form elements.');
        return;
    }
    
    const startTime = startTimeSelect.value;
    const cartOption = cartOptionSelect.value;
    const sidePot = sidePotCheckbox.checked;
    const roulette = rouletteCheckbox.checked;
    
    console.log('Form values:', { startTime, cartOption, sidePot, roulette });
    
    // Validate required fields - ONLY START TIME IS REQUIRED
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
                name: `${selectedMember.firstName} ${selectedMember.lastName}`,
                email: selectedMember.email || '',
                phoneNum: selectedMember.phoneNum || '',
                ghin: selectedMember.ghin || '',
                entryNum: selectedMember.entryNum || '',
                index: selectedMember.index || ''
                // NOTE: sidePot and roulette are NOT in player1 object anymore
                // They're at the document level
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
                name: `${firstName} ${lastName}`,
                email: document.getElementById('editManualEmail').value.trim(),
                phoneNum: document.getElementById('editManualPhone').value.trim(),
                ghin: document.getElementById('editManualGhin').value.trim(),
                entryNum: document.getElementById('editManualEntryNum').value.trim(),
                index: document.getElementById('editManualIndex').value.trim()
                // NOTE: sidePot and roulette are NOT in player1 object anymore
            };
        }
        // If neither member nor manual entry, but player1 existed before, keep it
        else if (window.currentPlayer1Data) {
            console.log('Keeping existing player1 data');
            player1Data = window.currentPlayer1Data;
            // Remove sidePot and roulette from player1 if they exist
            delete player1Data.sidePot;
            delete player1Data.roulette;
        }
        
        // Prepare update data - ALWAYS include these fields
        const updateData = {
            startTime: startTime,
            cartOption: cartOption, // This can be empty string
            sidePot: sidePot,
            roulette: roulette
        };
        
        // Add player1 data if available
        if (player1Data) {
            updateData.player1 = player1Data;
        } else {
            console.warn('No player1 data to send');
        }
        
        console.log('Sending foursome update:', updateData);
        
        const response = await fetch(`/api/tournaments/${tournamentId}/registrations/${foursomeId}`, {
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

// Import/Export Functions
function openImportModal() {
    if (!currentTournament) {
        alert('Please select a tournament first.');
        return;
    }
    
    document.getElementById('importModal').style.display = 'flex';
    document.getElementById('importFile').value = '';
}

function closeImportModal() {
    document.getElementById('importModal').style.display = 'none';
    document.getElementById('importFile').value = '';
}

function openExportModal() {
    document.getElementById('exportModal').style.display = 'flex';
}

function closeExportModal() {
    document.getElementById('exportModal').style.display = 'none';
}

// Import/Export Functions
async function importPlayersFile() {
    if (!currentTournament) {
        alert('Please select a tournament first.');
        return;
    }
    
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a file to import.');
        return;
    }
    
    // Check file extension
    const fileName = file.name.toLowerCase();
    const allowedExtensions = ['.xlsx', '.csv', '.tsv'];
    const isValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
    
    if (!isValidExtension) {
        alert('Please select a valid file type (.xlsx, .csv, or .tsv).');
        return;
    }
    
    // Get tournament title for confirmation message
    const tournament = tournaments.find(t => t.id === currentTournament);
    const tournamentTitle = tournament ? tournament.title : currentTournament;
    
    if (!confirm(`WARNING: This will REPLACE ALL current data in the "${tournamentTitle}" tournament with the data from the uploaded file. This action cannot be undone. Continue?`)) {
        return;
    }
    
    try {
        const token = localStorage.getItem('adminToken');
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`/api/tournament-manager/import/${currentTournament}`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token
                // Note: Don't set Content-Type for FormData, browser sets it automatically with boundary
            },
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to import file: ${response.statusText} - ${errorText}`);
        };
        
        const result = await response.json();
        alert(`Successfully imported ${result.importedCount} foursomes from file.`);
        
        // Reload tournament data
        loadTournamentData(currentTournament);
        
        closeImportModal();
        
    } catch (error) {
        console.error('Error importing file:', error);
        alert('Error importing file: ' + error.message);
    }
}

async function exportPlayersFile() {
    if (!currentTournament) {
        alert('Please select a tournament first.');
        return;
    }
    
    const format = document.getElementById('exportFormat').value;
    
    if (!format) {
        alert('Please select an export format.');
        return;
    }
    
    try {
        const token = localStorage.getItem('adminToken');
        
        const response = await fetch(`/api/tournament-manager/export/${currentTournament}?format=${format}`, {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to export file: ${response.statusText} - ${errorText}`);
        }
        
        // Get filename from response headers or generate one
        const tournament = tournaments.find(t => t.id === currentTournament);
        const tournamentName = tournament ? tournament.title.replace(/\s+/g, '-').toLowerCase() : currentTournament;
        const filename = `${tournamentName}-foursomes.${format}`;
        
        // Download the file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        closeExportModal();
        
    } catch (error) {
        console.error('Error exporting file:', error);
        alert('Error exporting file: ' + error.message);
    }
}

// Handle file selection for import
document.getElementById('importFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const fileName = file.name.toLowerCase();
        const allowedExtensions = ['.xlsx', '.csv', '.tsv'];
        const isValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
        
        if (!isValidExtension) {
            alert('Invalid file type. Please select a .xlsx, .csv, or .tsv file.');
            e.target.value = '';
        }
    }
});

// Helper function to enable/disable buttons based on tournament selection
function updateButtonStates() {
    const importButton = document.getElementById('importButton');
    const exportButton = document.getElementById('exportButton');
    const addFoursomeButton = document.getElementById('addFoursomeButton');
    const tournamentTabs = document.getElementById('tournament-tabs');
    
    if (importButton && exportButton && addFoursomeButton && tournamentTabs) {
        // Check if we have tournaments loaded and one is selected
        const hasTournaments = tournaments && tournaments.length > 0;
        const hasSelectedTournament = currentTournament !== null;
        
        if (!hasTournaments || !hasSelectedTournament) {
            // Disable buttons
            importButton.disabled = true;
            exportButton.disabled = true;
            addFoursomeButton.disabled = true;
            
            // Add tooltips
            importButton.title = 'Please select a tournament first';
            exportButton.title = 'Please select a tournament first';
            addFoursomeButton.title = 'Please select a tournament first';
            
            // Style disabled buttons
            importButton.style.opacity = '0.5';
            importButton.style.cursor = 'not-allowed';
            
            exportButton.style.opacity = '0.5';
            exportButton.style.cursor = 'not-allowed';
            
            addFoursomeButton.style.opacity = '0.5';
            addFoursomeButton.style.cursor = 'not-allowed';
        } else {
            // Enable buttons
            importButton.disabled = false;
            exportButton.disabled = false;
            addFoursomeButton.disabled = false;
            
            // Remove tooltips
            importButton.title = '';
            exportButton.title = '';
            addFoursomeButton.title = '';
            
            // Style enabled buttons
            importButton.style.opacity = '1';
            importButton.style.cursor = 'pointer';
            
            exportButton.style.opacity = '1';
            exportButton.style.cursor = 'pointer';
            
            addFoursomeButton.style.opacity = '1';
            addFoursomeButton.style.cursor = 'pointer';
        }
    }
}