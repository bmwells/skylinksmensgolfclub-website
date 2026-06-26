// server/utils/tournamentImportExport.js
const ExcelJS = require('exceljs');

/**
 * Parse Excel file data
 * @param {Buffer} fileBuffer - Excel file buffer
 * @returns {Array} Array of foursome objects
 */
async function parseExcelFile(fileBuffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    
    const worksheet = workbook.worksheets[0];
    const rowCount = worksheet.rowCount;
    const foursomes = [];
    
    // Skip header row (row 1)
    for (let rowNum = 2; rowNum <= rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);
        
        // Check if row has any data
        let hasData = false;
        for (let i = 1; i <= row.cellCount; i++) {
            if (row.getCell(i).value) {
                hasData = true;
                break;
            }
        }
        
        if (!hasData) continue;
        
        const foursome = {
            createdAt: new Date(),
            stripeSessionId: '',
            paymentAmount: parseFloat(row.getCell('PaymentAmount')?.value || 0) || 0,
            basePrice: parseFloat(row.getCell('BasePrice')?.value || 0) || 0,
            cartOption: row.getCell('CartOption')?.value || '',
            startTime: row.getCell('StartTime')?.value || '',
            customerEmail: row.getCell('CustomerEmail')?.value || '',
            customerName: row.getCell('CustomerName')?.value || '',
            updatedAt: new Date()
        };
        
        // Process players 1-4
        for (let i = 1; i <= 4; i++) {
            const playerName = row.getCell(`Player${i}Name`)?.value;
            if (playerName && playerName.toString().trim() !== '') {
                // Check if memberId exists in the data
                let memberId = null;
                const memberIdValue = row.getCell(`Player${i}MemberId`)?.value;
                if (memberIdValue && memberIdValue.toString().trim() !== '') {
                    memberId = memberIdValue.toString().trim();
                }
                
                foursome[`player${i}`] = {
                    name: playerName.toString().trim(),
                    email: row.getCell(`Player${i}Email`)?.value?.toString() || '',
                    phoneNum: row.getCell(`Player${i}Phone`)?.value?.toString() || '',
                    ghin: row.getCell(`Player${i}GHIN`)?.value?.toString() || null,
                    entryNum: row.getCell(`Player${i}EntryNum`)?.value?.toString() || null,
                    index: row.getCell(`Player${i}Index`)?.value?.toString() || '',
                    sidePot: row.getCell(`Player${i}SidePot`)?.value === true || 
                             row.getCell(`Player${i}SidePot`)?.value === 'true' || false,
                    roulette: row.getCell(`Player${i}Roulette`)?.value === true || 
                              row.getCell(`Player${i}Roulette`)?.value === 'true' || false,
                    memberId: memberId
                };
            } else {
                foursome[`player${i}`] = null;
            }
        }
        
        foursomes.push(foursome);
    }
    
    return foursomes;
}

/**
 * Parse CSV/TSV file data
 * @param {Buffer} fileBuffer - CSV/TSV file buffer
 * @param {string} delimiter - ',' for CSV, '\t' for TSV
 * @returns {Array} Array of foursome objects
 */
function parseCsvTsvFile(fileBuffer, delimiter) {
    const text = fileBuffer.toString('utf8');
    const lines = text.split('\n');
    
    if (lines.length < 2) {
        throw new Error('CSV/TSV file is empty or has no data rows');
    }
    
    // Parse headers
    const headers = lines[0].split(delimiter).map(h => h.trim());
    const foursomes = [];
    
    // Process data rows
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;
        
        const values = lines[i].split(delimiter).map(v => v.trim());
        const row = {};
        
        headers.forEach((header, index) => {
            row[header] = values[index] || '';
        });
        
        const foursome = {
            createdAt: new Date(),
            stripeSessionId: '',
            paymentAmount: parseFloat(row.PaymentAmount || 0) || 0,
            basePrice: parseFloat(row.BasePrice || 0) || 0,
            cartOption: row.CartOption || '',
            startTime: row.StartTime || '',
            customerEmail: row.CustomerEmail || '',
            customerName: row.CustomerName || '',
            updatedAt: new Date()
        };
        
        // Process players 1-4
        for (let playerNum = 1; playerNum <= 4; playerNum++) {
            const playerName = row[`Player${playerNum}Name`];
            if (playerName && playerName.trim() !== '') {
                // Check if memberId exists in the data
                let memberId = null;
                const memberIdValue = row[`Player${playerNum}MemberId`];
                if (memberIdValue && memberIdValue.trim() !== '') {
                    memberId = memberIdValue.trim();
                }
                
                foursome[`player${playerNum}`] = {
                    name: playerName.trim(),
                    email: row[`Player${playerNum}Email`] || '',
                    phoneNum: row[`Player${playerNum}Phone`] || '',
                    ghin: row[`Player${playerNum}GHIN`] || null,
                    entryNum: row[`Player${playerNum}EntryNum`] || null,
                    index: row[`Player${playerNum}Index`] || '',
                    sidePot: row[`Player${playerNum}SidePot`] === 'true' || 
                             row[`Player${playerNum}SidePot`] === 'TRUE' || false,
                    roulette: row[`Player${playerNum}Roulette`] === 'true' ||
                              row[`Player${playerNum}Roulette`] === 'TRUE' || false,
                    memberId: memberId
                };
            } else {
                foursome[`player${playerNum}`] = null;
            }
        }
        
        foursomes.push(foursome);
    }
    
    return foursomes;
}

/**
 * Create Excel workbook from tournament data
 * @param {Array} entries - Tournament entries from database
 * @returns {Promise<Buffer>} Excel file buffer
 */
async function createExcelWorkbook(entries) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Skylinks Men\'s Golf Club';
    workbook.created = new Date();
    
    const worksheet = workbook.addWorksheet('Foursomes');
    
    // Define the headers 
    const headers = [
        'FoursomeNumber',
        'StartTime',
        'CartOption',
        'PaymentAmount',
        'BasePrice',
        'CreatedAt',
        'CustomerEmail',
        'CustomerName',
        // Player 1
        'Player1Name',
        'Player1Email',
        'Player1Phone',
        'Player1GHIN',
        'Player1EntryNum',
        'Player1Index',
        'Player1SidePot',
        'Player1Roulette',
        'Player1MemberId',
        // Player 2
        'Player2Name',
        'Player2Email',
        'Player2Phone',
        'Player2GHIN',
        'Player2EntryNum',
        'Player2Index',
        'Player2SidePot',
        'Player2Roulette',
        'Player2MemberId',
        // Player 3
        'Player3Name',
        'Player3Email',
        'Player3Phone',
        'Player3GHIN',
        'Player3EntryNum',
        'Player3Index',
        'Player3SidePot',
        'Player3Roulette',
        'Player3MemberId',
        // Player 4
        'Player4Name',
        'Player4Email',
        'Player4Phone',
        'Player4GHIN',
        'Player4EntryNum',
        'Player4Index',
        'Player4SidePot',
        'Player4Roulette',
        'Player4MemberId'
    ];
    
    // Add headers to worksheet
    worksheet.addRow(headers);
    
    // Add data rows
    entries.forEach((entry, index) => {
        const row = [];
        
        // Basic foursome info
        row.push(index + 1); // FoursomeNumber
        row.push(entry.startTime || ''); // StartTime
        row.push(entry.cartOption || ''); // CartOption
        row.push(entry.paymentAmount || 0); // PaymentAmount
        row.push(entry.basePrice || 0); // BasePrice
        row.push(entry.createdAt ? new Date(entry.createdAt).toISOString() : ''); // CreatedAt
        row.push(entry.customerEmail || ''); // CustomerEmail
        row.push(entry.customerName || ''); // CustomerName
        
        // Process each player
        for (let i = 1; i <= 4; i++) {
            const playerKey = `player${i}`;
            const player = entry[playerKey];
            
            if (player) {
                row.push(player.name || ''); // PlayerXName
                row.push(player.email || ''); // PlayerXEmail
                row.push(player.phoneNum || ''); // PlayerXPhone
                row.push(player.ghin || ''); // PlayerXGHIN
                row.push(player.entryNum || ''); // PlayerXEntryNum
                row.push(player.index || ''); // PlayerXIndex
                row.push(player.sidePot || false); // PlayerXSidePot
                row.push(player.roulette || false); // PlayerXRoulette
                row.push(player.memberId || ''); // PlayerXMemberId
            } else {
                // Empty values for empty player slots
                row.push(''); // Name
                row.push(''); // Email
                row.push(''); // Phone
                row.push(''); // GHIN
                row.push(''); // EntryNum
                row.push(''); // Index
                row.push(false); // SidePot
                row.push(false); // Roulette
                row.push(''); // MemberId
            }
        }
        
        worksheet.addRow(row);
    });
    
    if (entries.length === 0) {
        throw new Error('No data to export');
    }
    
    // Auto-fit columns
    worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, cell => {
            const columnLength = cell.value ? cell.value.toString().length : 10;
            if (columnLength > maxLength) {
                maxLength = columnLength;
            }
        });
        column.width = Math.min(maxLength + 2, 50);
    });
    
    // Generate buffer
    return await workbook.xlsx.writeBuffer();
}

/**
 * Create CSV/TSV text from tournament data
 * @param {Array} entries - Tournament entries from database
 * @param {string} delimiter - ',' for CSV, '\t' for TSV
 * @returns {string} CSV/TSV formatted text
 */
function createCsvTsvText(entries, delimiter) {
    // Define headers
    const headers = [
        'FoursomeNumber',
        'StartTime',
        'CartOption',
        'PaymentAmount',
        'BasePrice',
        'CreatedAt',
        'CustomerEmail',
        'CustomerName',
        // Player 1
        'Player1Name',
        'Player1Email',
        'Player1Phone',
        'Player1GHIN',
        'Player1EntryNum',
        'Player1Index',
        'Player1SidePot',
        'Player1Roulette',
        'Player1MemberId',
        // Player 2
        'Player2Name',
        'Player2Email',
        'Player2Phone',
        'Player2GHIN',
        'Player2EntryNum',
        'Player2Index',
        'Player2SidePot',
        'Player2Roulette',
        'Player2MemberId',
        // Player 3
        'Player3Name',
        'Player3Email',
        'Player3Phone',
        'Player3GHIN',
        'Player3EntryNum',
        'Player3Index',
        'Player3SidePot',
        'Player3Roulette',
        'Player3MemberId',
        // Player 4
        'Player4Name',
        'Player4Email',
        'Player4Phone',
        'Player4GHIN',
        'Player4EntryNum',
        'Player4Index',
        'Player4SidePot',
        'Player4Roulette',
        'Player4MemberId'
    ];
    
    let csvData = headers.join(delimiter) + '\n';
    
    // Add data rows
    entries.forEach((entry, index) => {
        const row = [];
        
        // Basic foursome info
        row.push(index + 1); // FoursomeNumber
        row.push(entry.startTime || ''); // StartTime
        row.push(entry.cartOption || ''); // CartOption
        row.push(entry.paymentAmount || 0); // PaymentAmount
        row.push(entry.basePrice || 0); // BasePrice
        row.push(entry.createdAt ? new Date(entry.createdAt).toISOString() : ''); // CreatedAt
        row.push(entry.customerEmail || ''); // CustomerEmail
        row.push(entry.customerName || ''); // CustomerName
        
        // Process each player
        for (let i = 1; i <= 4; i++) {
            const playerKey = `player${i}`;
            const player = entry[playerKey];
            
            if (player) {
                row.push(player.name || ''); // PlayerXName
                row.push(player.email || ''); // PlayerXEmail
                row.push(player.phoneNum || ''); // PlayerXPhone
                row.push(player.ghin || ''); // PlayerXGHIN
                row.push(player.entryNum || ''); // PlayerXEntryNum
                row.push(player.index || ''); // PlayerXIndex
                row.push(player.sidePot || false); // PlayerXSidePot
                row.push(player.roulette || false); // PlayerXRoulette
                row.push(player.memberId || ''); // PlayerXMemberId
            } else {
                // Empty values for empty player slots
                row.push(''); // Name
                row.push(''); // Email
                row.push(''); // Phone
                row.push(''); // GHIN
                row.push(''); // EntryNum
                row.push(''); // Index
                row.push(false); // SidePot
                row.push(false); // Roulette
                row.push(''); // MemberId
            }
        }
        
        // Join row values with delimiter, escaping values that contain the delimiter
        const escapedRow = row.map(value => {
            if (typeof value === 'string' && value.includes(delimiter)) {
                return `"${value}"`;
            }
            return value;
        });
        
        csvData += escapedRow.join(delimiter) + '\n';
    });
    
    if (entries.length === 0) {
        throw new Error('No data to export');
    }
    
    return csvData;
}

module.exports = {
    parseExcelFile,
    parseCsvTsvFile,
    createExcelWorkbook,
    createCsvTsvText
};