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
        
        // Clear any existing title
        updateTournamentTitle(null);
        
        // Restore active tab or select first
        const savedTab = restoreActiveTab();
        if (savedTab && tournaments.some(t => t.id === savedTab)) {
            switchTournament(savedTab);
        } else if (tournaments.length > 0) {
            // Auto-select the first tournament
            switchTournament(tournaments[0].id);
        } else {
            // No tournaments available - update button states to show they're disabled
            updateButtonStates();
            // Also show appropriate message in container
            const container = document.getElementById('tournament-container');
            if (container) {
                container.innerHTML = `
                    <div class="no-entries">
                        <h3>No Tournaments Available</h3>
                        <p>Please create a tournament first.</p>
                    </div>
                `;
            }
        }
        
    } catch (error) {
        console.error('Error loading tournaments:', error);
        document.getElementById('tournament-tabs').innerHTML = 
            `<p style="color: #dc3545;">Error loading tournaments: ${error.message}</p>`;
        // Update button states to show they're disabled due to error
        updateButtonStates();
        
        // Clear title display
        updateTournamentTitle(null);
        
        // Show error in container as well
        const container = document.getElementById('tournament-container');
        if (container) {
            container.innerHTML = `
                <div class="no-entries">
                    <h3>Error Loading Tournaments</h3>
                    <p>${error.message}</p>
                    <button onclick="loadTournaments()" style="margin-top: 10px; padding: 8px 16px; background-color: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
        }
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
    
    // Update tournament title display
    updateTournamentTitle(tournamentId);
    
    // Update button states
    updateButtonStates();
    
    // Load tournament data
    loadTournamentData(tournamentId);
}

// Update the tournament title display
function updateTournamentTitle(tournamentId) {
    const titleContainer = document.getElementById('current-tournament-title');
    
    if (!titleContainer) {
        console.error('current-tournament-title element not found');
        return;
    }
    
    if (!tournamentId) {
        titleContainer.innerHTML = '';
        return;
    }
    
    // Find the tournament in the tournaments array
    const tournament = tournaments.find(t => t.id === tournamentId);
    
    if (tournament) {
        titleContainer.innerHTML = `
            <h2>${tournament.title}</h2>
        `;
        titleContainer.style.display = 'block';
    } else {
        titleContainer.innerHTML = '';
        titleContainer.style.display = 'none';
    }
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
function getFoursomeId(foursome) {
    if (!foursome) {
        console.error('getFoursomeId: foursome is null or undefined');
        return null;
    }
    
    // Always use _id (MongoDB ObjectId as string)
    if (foursome._id) {
        const id = foursome._id.toString ? foursome._id.toString() : foursome._id;
        console.log('getFoursomeId: Returning _id:', id);
        return id;
    }
    
    console.error('getFoursomeId: No _id found in foursome:', foursome);
    return null;
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
    
    let html = '';
    
    sortedData.forEach((foursome, sortedIndex) => {
        html += renderFoursome(foursome, tournamentId, sortedIndex);
    });
    
    container.innerHTML = html;
}

// Helper function to check if any player in foursome has side pot or roulette
function getFoursomePotStatus(foursome) {
    let hasSidePot = false;
    let hasRoulette = false;
    
    // Check all players
    const players = [foursome.player1, foursome.player2, foursome.player3, foursome.player4];
    players.forEach(player => {
        if (player && player.sidePot === true) {
            hasSidePot = true;
        }
        if (player && player.roulette === true) {
            hasRoulette = true;
        }
    });
    
    return {
        sidePot: hasSidePot ? '<span class="badge badge-yes">Yes</span>' : '<span class="badge badge-no">No</span>',
        roulette: hasRoulette ? '<span class="badge badge-yes">Yes</span>' : '<span class="badge badge-no">No</span>'
    };
}

// Render a single foursome - USING DATABASE _id
function renderFoursome(foursome, tournamentId, sortedIndex) {
    const player1 = foursome.player1 || {};
    const player2 = foursome.player2 || {};
    const player3 = foursome.player3 || {};
    const player4 = foursome.player4 || {};
    
    // Format start time
    const startTime = foursome.startTime ? foursome.startTime : 'Not specified';
    
    // Format cart option - handle empty string
    const cartOption = foursome.cartOption ? foursome.cartOption : 'None';
    
    // Get foursome pot status
    const potStatus = getFoursomePotStatus(foursome);
    
    // Build player name list for title
    const playerNames = [];
    
    // Add all player names formatted as "R. Aldana"
    playerNames.push(formatPlayerNameForTitle(player1));
    playerNames.push(formatPlayerNameForTitle(player2));
    playerNames.push(formatPlayerNameForTitle(player3));
    playerNames.push(formatPlayerNameForTitle(player4));
    
    const title = `Foursome ${sortedIndex + 1} - ${playerNames.join(', ')} - ${startTime}`;
    
    // Get the foursome ID - always use _id from database
    const foursomeId = getFoursomeId(foursome);
    
    // Build notes display
    let notesHtml = '';
    if (foursome.notes && foursome.notes.trim() !== '') {
        notesHtml = `
            <div class="notes-section">
                <span class="notes-label">📝 Notes:</span>
                <span class="notes-content">${escapeHtml(foursome.notes)}</span>
            </div>
        `;
    } else {
        notesHtml = `
            <div class="notes-section">
                <span class="notes-label">📝 Notes:</span>
                <span class="notes-empty">No notes</span>
            </div>
        `;
    }
    
    return `
        <div class="foursome-container" 
             data-foursome-id="${foursomeId}" 
             data-tournament-id="${tournamentId}"
             data-sorted-index="${sortedIndex}">
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
                    <span class="meta-value">${potStatus.sidePot}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Roulette:</span>
                    <span class="meta-value">${potStatus.roulette}</span>
                </div>
            </div>
            
            <!-- Notes Section -->
            ${notesHtml}
            
            <div class="player-grid">
                ${renderPlayerRow(1, player1, tournamentId, foursomeId)}
                ${renderPlayerRow(2, player2, tournamentId, foursomeId)}
                ${renderPlayerRow(3, player3, tournamentId, foursomeId)}
                ${renderPlayerRow(4, player4, tournamentId, foursomeId)}
            </div>
        </div>
    `;
}

// Helper function to escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
        // Only show add button if we have a valid foursomeId
        if (foursomeId && foursomeId !== 'null') {
            actionButton = `<button class="action-btn add-btn" onclick="addPlayer('${tournamentId}', '${foursomeId}', ${playerNumber})">Add Player</button>`;
        } else {
            actionButton = `<button class="action-btn add-btn" disabled title="Cannot add player - missing foursome ID">Add Player</button>`;
        }
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
                ${!isPlayer1 ? `
                    <div><strong>Side Pot:</strong> ${playerData.sidePot ? '<span class="badge badge-yes">Yes</span>' : '<span class="badge badge-no">No</span>'}</div>
                    <div><strong>Roulette:</strong> ${playerData.roulette ? '<span class="badge badge-yes">Yes</span>' : '<span class="badge badge-no">No</span>'}</div>
                ` : `
                    <div><strong>Side Pot:</strong> ${playerData.sidePot ? '<span class="badge badge-yes">Yes</span>' : '<span class="badge badge-no">No</span>'}</div>
                    <div><strong>Roulette:</strong> ${playerData.roulette ? '<span class="badge badge-yes">Yes</span>' : '<span class="badge badge-no">No</span>'}</div>
                `}
            </div>
        `;
        
        if (!isPlayer1 && foursomeId && foursomeId !== 'null') {
            // Store player data in data attributes for the button
            const playerDataJson = JSON.stringify(playerData).replace(/"/g, '&quot;');
            actionButton = `<button class="action-btn edit-btn" 
                onclick="showPlayerOptions('${tournamentId}', '${foursomeId}', ${playerNumber})"
                data-player-data='${playerDataJson}'>Edit</button>`;
        } else if (foursomeId && foursomeId !== 'null') {
            // Player 1 - no edit button, just show a placeholder for alignment
            actionButton = `<div class="player-actions-spacer"></div>`;
        } else {
            // Show disabled button if no valid ID
            actionButton = `<button class="action-btn edit-btn" disabled title="Cannot edit - missing foursome ID">Edit</button>`;
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

// Show player options modal (Edit Entry, Replace Player, Delete Player)
function showPlayerOptions(tournamentId, foursomeId, playerNumber) {
    console.log('showPlayerOptions called:', { tournamentId, foursomeId, playerNumber });
    
    // Store values in global state
    currentTournament = tournamentId;
    currentFoursomeId = foursomeId;
    currentPlayerNumber = playerNumber;
    
    // Find the player data from the clicked button
    const clickedButton = event.target;
    const playerDataJson = clickedButton.getAttribute('data-player-data');
    
    if (!playerDataJson) {
        console.error('No player data found on button');
        alert('Error: Could not find player data. Please refresh the page.');
        return;
    }
    
    try {
        // Parse the player data and store it in GLOBAL variable for later use
        const playerData = JSON.parse(playerDataJson);
        window.currentPlayerForEdit = playerData; // Store globally
        
        // Update modal title
        document.getElementById('playerOptionsTitle').textContent = `Player ${playerNumber} Options`;
        
        // Show options modal
        document.getElementById('playerOptionsModal').style.display = 'flex';
        
    } catch (error) {
        console.error('Error parsing player data:', error);
        alert('Error: Could not parse player data. Please refresh the page.');
    }
}

// Close player options modal
function closePlayerOptionsModal() {
    document.getElementById('playerOptionsModal').style.display = 'none';
    // Don't clear the global variable here - it's needed for editPlayerEntry()
}

// Edit player entry (show modal with side pot/roulette checkboxes)
function editPlayerEntry() {
    // Get player data from GLOBAL variable
    const player = window.currentPlayerForEdit;
    
    if (!player) {
        console.error('No player data found in global variable');
        alert('Error: Player data not found. Please try again.');
        closePlayerOptionsModal();
        return;
    }
    
    // Close options modal
    closePlayerOptionsModal();
    
    // Show edit player entry modal
    document.getElementById('editPlayerEntryModal').style.display = 'flex';
    
    // Set the checkboxes based on player data
    document.getElementById('editPlayerSidePot').checked = player.sidePot === true;
    document.getElementById('editPlayerRoulette').checked = player.roulette === true;
    
    // Update modal title
    document.getElementById('editPlayerEntryTitle').textContent = `Edit Player ${currentPlayerNumber} Entry`;
}

// Close edit player entry modal
function closeEditPlayerEntryModal() {
    document.getElementById('editPlayerEntryModal').style.display = 'none';
    // Clear the global variable after we're done with it
    window.currentPlayerForEdit = null;
}

// Save player entry changes (side pot/roulette only)
async function savePlayerEntryChanges() {
    const tournamentId = currentTournament;
    const foursomeId = currentFoursomeId;
    const playerNumber = currentPlayerNumber;
    
    console.log('Saving player entry for:', { tournamentId, foursomeId, playerNumber });
    
    if (!tournamentId || !foursomeId || !playerNumber) {
        alert('Error: Missing tournament, foursome, or player number.');
        return;
    }
    
    // Get player data from GLOBAL variable
    const player = window.currentPlayerForEdit;
    
    if (!player) {
        alert('Error: Player data not found. Please try again.');
        closeEditPlayerEntryModal();
        return;
    }
    
    // Get checkbox values
    const sidePot = document.getElementById('editPlayerSidePot').checked;
    const roulette = document.getElementById('editPlayerRoulette').checked;
    
    try {
        const token = localStorage.getItem('adminToken');
        
        // Prepare update data - only update sidePot and roulette
        const updateData = {
            [`player${playerNumber}`]: {
                ...player,
                sidePot: sidePot,
                roulette: roulette
            }
        };
        
        console.log('Saving player entry changes:', updateData);
        
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
            throw new Error(`Failed to update player entry: ${response.statusText} - ${errorText}`);
        }
        
        // Reload tournament data
        await loadTournamentData(tournamentId);
        
        // Close modal
        closeEditPlayerEntryModal();
        
        // Show success message
        alert('Player entry updated successfully!');
        
    } catch (error) {
        console.error('Error saving player entry:', error);
        alert('Error saving player entry: ' + error.message);
    }
}

// Replace player (opens the add player modal)
function replacePlayer() {
    // Clear the global variable since we're not using it anymore
    window.currentPlayerForEdit = null;
    closePlayerOptionsModal();
    addPlayer(currentTournament, currentFoursomeId, currentPlayerNumber);
}

// Delete player
async function deletePlayer() {
    if (!confirm('Are you sure you want to remove this player from the foursome?')) {
        return;
    }
    
    const tournamentId = currentTournament;
    const foursomeId = currentFoursomeId;
    const playerNumber = currentPlayerNumber;
    
    try {
        const token = localStorage.getItem('adminToken');
        
        // Prepare update data to clear the player
        const updateData = {
            [`player${playerNumber}`]: null
        };
        
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
            throw new Error(`Failed to remove player: ${response.statusText} - ${errorText}`);
        }
        
        // Reload tournament data
        await loadTournamentData(tournamentId);
        
        // Clear the global variable
        window.currentPlayerForEdit = null;
        
        // Close modal
        closePlayerOptionsModal();
        
        // Show success message
        alert('Player removed successfully!');
        
    } catch (error) {
        console.error('Error removing player:', error);
        alert('Error removing player: ' + error.message);
    }
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

// Remove foursome - USING DATABASE _id
async function removeFoursome(tournamentId, foursomeId) {
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
    console.log('addPlayer called:', { tournamentId, foursomeId, playerNumber });
    
    if (!foursomeId || foursomeId === 'null') {
        console.error('Invalid foursomeId in addPlayer:', foursomeId);
        alert('Error: Invalid foursome ID. Please refresh the page and try again.');
        return;
    }
    
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
            index: selectedMember.index || '',
            sidePot: false, // Default to false when adding new player
            roulette: false // Default to false when adding new player
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
            index,
            sidePot: false, // Default to false when adding new player
            roulette: false // Default to false when adding new player
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
    const playerOptionsModal = document.getElementById('playerOptionsModal');
    const editPlayerEntryModal = document.getElementById('editPlayerEntryModal');
    const editFoursomeModal = document.getElementById('editFoursomeModal');
    const importModal = document.getElementById('importModal');
    const exportModal = document.getElementById('exportModal');
    
    if (event.target === playerModal) {
        closePlayerModal();
    }
    
    if (event.target === playerOptionsModal) {
        // Clear global variable when closing options modal
        window.currentPlayerForEdit = null;
        closePlayerOptionsModal();
    }
    
    if (event.target === editPlayerEntryModal) {
        closeEditPlayerEntryModal();
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

// Edit Foursome - Open modal - USING DATABASE _id
function editFoursome(tournamentId, foursomeId) {
    console.log('editFoursome called with:', { tournamentId, foursomeId });
    
    // Store values for later use
    currentTournament = tournamentId;
    currentFoursomeId = foursomeId;
    currentPlayerNumber = 1; // For foursome edit, we're editing player1
    
    // Find the foursome data by ID
    let foursome = null;
    
    // Look in currentTournamentData for the foursome with matching _id
    foursome = currentTournamentData.find(f => {
        if (!f) return false;
        
        // Check if _id matches (as string)
        if (f._id && f._id.toString() === foursomeId) {
            return true;
        }
        
        return false;
    });
    
    if (!foursome) {
        console.error('Foursome not found! Looking for ID:', foursomeId);
        alert('Foursome not found! Please refresh the page and try again.');
        return;
    }
    
    // Reset modal fields
    resetEditFoursomeModal();
    
    // Fill in existing data
    fillEditFoursomeModal(foursome);
    
    // Update modal title
    document.querySelector('#editFoursomeModal h3').textContent = 'Edit Foursome (Player 1)';
    
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
                <div><strong>Side Pot:</strong> ${player1.sidePot ? 'Yes' : 'No'}</div>
                <div><strong>Roulette:</strong> ${player1.roulette ? 'Yes' : 'No'}</div>
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
                index: player1.index || '',
                sidePot: player1.sidePot || false,
                roulette: player1.roulette || false
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
            
            // Set side pot and roulette checkboxes for player1
            document.getElementById('editSidePot').checked = player1.sidePot === true;
            document.getElementById('editRoulette').checked = player1.roulette === true;
        }
    } else {
        // If player1 is null/empty, ensure manual entry is shown
        showEditManualEntry();
        // Set default values for checkboxes
        document.getElementById('editSidePot').checked = false;
        document.getElementById('editRoulette').checked = false;
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

    // Set notes
    const notesTextarea = document.getElementById('editNotes');
    if (notesTextarea) {
        notesTextarea.value = foursome.notes || '';
    }
    
    console.log('Form values set:', {
        startTime: startTimeSelect.value,
        cartOption: cartOptionSelect.value,
        sidePot: document.getElementById('editSidePot').checked,
        roulette: document.getElementById('editRoulette').checked,
        notes: notesTextarea ? notesTextarea.value : ''
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
    
    // Clear notes
    document.getElementById('editNotes').value = '';
    
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
    currentPlayerNumber = null;
}

// Save foursome changes
async function saveFoursomeChanges() {
    const tournamentId = currentTournament;
    const foursomeId = currentFoursomeId;
    const playerNumber = currentPlayerNumber; // Should be 1 for foursome edit
    
    console.log('Saving foursome changes for:', { tournamentId, foursomeId, playerNumber });
    
    if (!tournamentId || !foursomeId) {
        alert('Error: Missing tournament or foursome data.');
        return;
    }
    
    // Get form values
    const startTimeSelect = document.getElementById('editStartTime');
    const cartOptionSelect = document.getElementById('editCartOption');
    const sidePotCheckbox = document.getElementById('editSidePot');
    const rouletteCheckbox = document.getElementById('editRoulette');
    const notesTextarea = document.getElementById('editNotes');
    
    if (!startTimeSelect || !cartOptionSelect || !sidePotCheckbox || !rouletteCheckbox || !notesTextarea) {
        console.error('Form elements not found!');
        alert('Error: Could not find form elements.');
        return;
    }
    
    const startTime = startTimeSelect.value;
    const cartOption = cartOptionSelect.value;
    const sidePot = sidePotCheckbox.checked;
    const roulette = rouletteCheckbox.checked;
    const notes = notesTextarea.value.trim();
    
    console.log('Form values:', { startTime, cartOption, sidePot, roulette, notes });
    
    // Validate required fields - ONLY START TIME IS REQUIRED
    if (!startTime) {
        alert('Please select a start time.');
        return;
    }
    
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
                index: selectedMember.index || '',
                sidePot: sidePot,
                roulette: roulette
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
                index: document.getElementById('editManualIndex').value.trim(),
                sidePot: sidePot,
                roulette: roulette
            };
        }
        // If neither member nor manual entry, but player1 existed before, update it
        else if (window.currentPlayer1Data) {
            console.log('Updating existing player1 data');
            player1Data = {
                ...window.currentPlayer1Data,
                sidePot: sidePot,
                roulette: roulette
            };
        }
        
        // Prepare update data for foursome edit
        const updateData = {
            startTime: startTime,
            cartOption: cartOption, // This can be empty string
            player1: player1Data,
            notes: notes // Include notes
        };
        
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
        
        // Reload tournament data
        await loadTournamentData(tournamentId);
        
        // Show success message
        alert('Foursome updated successfully!');
        
        // Close modal
        closeEditFoursomeModal();
        
    } catch (error) {
        console.error('Error saving foursome:', error);
        alert('Error saving foursome: ' + error.message);
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
    
    // Set side pot and roulette to false for new member (they can be set later)
    document.getElementById('editSidePot').checked = false;
    document.getElementById('editRoulette').checked = false;
    
    // Clear notes if any (they will be loaded from the foursome data)
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