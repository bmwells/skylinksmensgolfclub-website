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
            paymentAmount: parseFloat(row.getCell('PaymentAmount')?.value || row.getCell('Payment Amount')?.value || 0) || 0,
            cartOption: row.getCell('CartOption')?.value || row.getCell('Cart Option')?.value || '',
            startTime: row.getCell('StartTime')?.value || row.getCell('Start Time')?.value || '',
            sidePot: row.getCell('SidePot')?.value === true || 
                     row.getCell('SidePot')?.value === 'true' || 
                     row.getCell('Side Pot')?.value === true || 
                     row.getCell('Side Pot')?.value === 'true',
            roulette: row.getCell('Roulette')?.value === true || 
                      row.getCell('Roulette')?.value === 'true'
        };
        
        // Process players 1-4
        for (let i = 1; i <= 4; i++) {
            const playerName = row.getCell(`Player${i}Name`)?.value || 
                              row.getCell(`Player ${i} Name`)?.value;
            if (playerName && playerName.toString().trim() !== '') {
                foursome[`player${i}`] = {
                    name: playerName.toString(),
                    email: row.getCell(`Player${i}Email`)?.value?.toString() || 
                           row.getCell(`Player ${i} Email`)?.value?.toString() || '',
                    phone: row.getCell(`Player${i}Phone`)?.value?.toString() || 
                           row.getCell(`Player ${i} Phone`)?.value?.toString() || '',
                    ghin: parseInt(row.getCell(`Player${i}GHIN`)?.value || 
                                  row.getCell(`Player ${i} GHIN`)?.value) || null,
                    entryNum: parseInt(row.getCell(`Player${i}EntryNum`)?.value || 
                                     row.getCell(`Player ${i} Entry Num`)?.value) || null,
                    index: row.getCell(`Player${i}Index`)?.value?.toString() || 
                           row.getCell(`Player ${i} Index`)?.value?.toString() || ''
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
            cartOption: row.CartOption || '',
            startTime: row.StartTime || '',
            sidePot: row.SidePot === 'true' || row.SidePot === 'TRUE',
            roulette: row.Roulette === 'true' || row.Roulette === 'TRUE'
        };
        
        // Process players 1-4
        for (let playerNum = 1; playerNum <= 4; playerNum++) {
            const playerName = row[`Player${playerNum}Name`] || row[`Player ${playerNum} Name`];
            if (playerName && playerName.trim() !== '') {
                foursome[`player${playerNum}`] = {
                    name: playerName,
                    email: row[`Player${playerNum}Email`] || row[`Player ${playerNum} Email`] || '',
                    phone: row[`Player${playerNum}Phone`] || row[`Player ${playerNum} Phone`] || '',
                    ghin: parseInt(row[`Player${playerNum}GHIN`] || row[`Player ${playerNum} GHIN`]) || null,
                    entryNum: parseInt(row[`Player${playerNum}EntryNum`] || row[`Player ${playerNum} Entry Num`]) || null,
                    index: row[`Player${playerNum}Index`] || row[`Player ${playerNum} Index`] || ''
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
    
    // Prepare export data
    const exportData = entries.map((entry, index) => {
        const row = {
            FoursomeNumber: index + 1,
            StartTime: entry.startTime || '',
            CartOption: entry.cartOption || '',
            SidePot: entry.sidePot || false,
            Roulette: entry.roulette || false,
            PaymentAmount: entry.paymentAmount || 0,
            CreatedAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : ''
        };
        
        // Add player data
        for (let i = 1; i <= 4; i++) {
            const playerKey = `player${i}`;
            const player = entry[playerKey];
            
            if (player) {
                row[`Player${i}Name`] = player.name || '';
                row[`Player${i}Email`] = player.email || '';
                row[`Player${i}Phone`] = player.phone || player.phoneNum || '';
                row[`Player${i}GHIN`] = player.ghin || '';
                row[`Player${i}EntryNum`] = player.entryNum || '';
                row[`Player${i}Index`] = player.index || '';
            } else {
                row[`Player${i}Name`] = '';
                row[`Player${i}Email`] = '';
                row[`Player${i}Phone`] = '';
                row[`Player${i}GHIN`] = '';
                row[`Player${i}EntryNum`] = '';
                row[`Player${i}Index`] = '';
            }
        }
        
        return row;
    });
    
    if (exportData.length === 0) {
        throw new Error('No data to export');
    }
    
    // Add headers
    const headers = Object.keys(exportData[0]);
    worksheet.addRow(headers);
    
    // Add data rows
    exportData.forEach(row => {
        const values = headers.map(header => row[header]);
        worksheet.addRow(values);
    });
    
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
    // Prepare export data
    const exportData = entries.map((entry, index) => {
        const row = {
            FoursomeNumber: index + 1,
            StartTime: entry.startTime || '',
            CartOption: entry.cartOption || '',
            SidePot: entry.sidePot || false,
            Roulette: entry.roulette || false,
            PaymentAmount: entry.paymentAmount || 0,
            CreatedAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : ''
        };
        
        // Add player data
        for (let i = 1; i <= 4; i++) {
            const playerKey = `player${i}`;
            const player = entry[playerKey];
            
            if (player) {
                row[`Player${i}Name`] = player.name || '';
                row[`Player${i}Email`] = player.email || '';
                row[`Player${i}Phone`] = player.phone || player.phoneNum || '';
                row[`Player${i}GHIN`] = player.ghin || '';
                row[`Player${i}EntryNum`] = player.entryNum || '';
                row[`Player${i}Index`] = player.index || '';
            } else {
                row[`Player${i}Name`] = '';
                row[`Player${i}Email`] = '';
                row[`Player${i}Phone`] = '';
                row[`Player${i}GHIN`] = '';
                row[`Player${i}EntryNum`] = '';
                row[`Player${i}Index`] = '';
            }
        }
        
        return row;
    });
    
    if (exportData.length === 0) {
        throw new Error('No data to export');
    }
    
    // Get headers
    const headers = Object.keys(exportData[0]);
    let csvData = headers.join(delimiter) + '\n';
    
    // Add rows
    exportData.forEach(row => {
        const values = headers.map(header => {
            let value = row[header];
            if (typeof value === 'string' && value.includes(delimiter)) {
                value = `"${value}"`;
            }
            return value;
        });
        csvData += values.join(delimiter) + '\n';
    });
    
    return csvData;
}

module.exports = {
    parseExcelFile,
    parseCsvTsvFile,
    createExcelWorkbook,
    createCsvTsvText
};