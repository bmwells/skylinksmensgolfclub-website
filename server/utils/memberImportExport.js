// server/utils/memberImportExport.js
const ExcelJS = require('exceljs');

/**
 * Parse Excel file data for members
 * @param {Buffer} fileBuffer - Excel file buffer
 * @returns {Array} Array of member objects
 */
async function parseMembersExcelFile(fileBuffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);
    
    const worksheet = workbook.worksheets[0];
    const rowCount = worksheet.rowCount;
    const members = [];
    
    // Get headers from first row
    const headers = [];
    const headerRow = worksheet.getRow(1);
    for (let col = 1; col <= headerRow.cellCount; col++) {
        headers.push((headerRow.getCell(col).value || '').toString().trim());
    }
    
    // Map headers to field names
    const fieldMap = {
        'FirstName': 'firstName',
        'First Name': 'firstName',
        'Last Name': 'lastName',
        'LastName': 'lastName',
        'Email': 'email',
        'Phone': 'phoneNum',
        'Phone Number': 'phoneNum',
        'PhoneNum': 'phoneNum',
        'GHIN': 'ghin',
        'GHIN Number': 'ghin',
        'Index': 'index',
        'Handicap Index': 'index',
        'Handicap': 'index',
        'Entry Number': 'entryNum',
        'EntryNum': 'entryNum',
        'Entry #': 'entryNum'
    };
    
    // Create header mapping
    const headerMapping = {};
    headers.forEach((header, index) => {
        const normalizedHeader = header.trim();
        for (const [key, value] of Object.entries(fieldMap)) {
            if (normalizedHeader.toLowerCase() === key.toLowerCase()) {
                headerMapping[index] = value;
                break;
            }
        }
    });
    
    // Process data rows
    for (let rowNum = 2; rowNum <= rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);
        
        // Check if row has any data
        let hasData = false;
        for (let col = 1; col <= headers.length; col++) {
            if (row.getCell(col).value) {
                hasData = true;
                break;
            }
        }
        
        if (!hasData) continue;
        
        const member = {};
        
        // Map row data to member object
        for (let col = 0; col < headers.length; col++) {
            const fieldName = headerMapping[col];
            if (fieldName) {
                let value = row.getCell(col + 1).value;
                
                // Convert to appropriate type
                if (value !== null && value !== undefined) {
                    if (fieldName === 'ghin' || fieldName === 'entryNum') {
                        value = parseInt(value) || null;
                    } else if (fieldName === 'index') {
                        value = parseFloat(value) || null;
                        if (value !== null) {
                            value = value.toString();
                        }
                    } else {
                        value = value.toString().trim();
                    }
                }
                
                member[fieldName] = value || '';
            }
        }
        
        // Ensure required fields
        if (member.firstName || member.lastName) {
            members.push(member);
        }
    }
    
    return members;
}

/**
 * Parse CSV/TSV file data for members
 * @param {Buffer} fileBuffer - CSV/TSV file buffer
 * @param {string} delimiter - ',' for CSV, '\t' for TSV
 * @returns {Array} Array of member objects
 */
function parseMembersCsvTsvFile(fileBuffer, delimiter) {
    const text = fileBuffer.toString('utf8');
    const lines = text.split('\n');
    
    if (lines.length < 2) {
        throw new Error('CSV/TSV file is empty or has no data rows');
    }
    
    // Parse headers
    const headers = lines[0].split(delimiter).map(h => h.trim());
    const members = [];
    
    // Map headers to field names
    const fieldMap = {
        'FirstName': 'firstName',
        'First Name': 'firstName',
        'Last Name': 'lastName',
        'LastName': 'lastName',
        'Email': 'email',
        'Phone': 'phoneNum',
        'Phone Number': 'phoneNum',
        'PhoneNum': 'phoneNum',
        'GHIN': 'ghin',
        'GHIN Number': 'ghin',
        'Index': 'index',
        'Handicap Index': 'index',
        'Handicap': 'index',
        'Entry Number': 'entryNum',
        'EntryNum': 'entryNum',
        'Entry #': 'entryNum'
    };
    
    // Create header mapping
    const headerMapping = {};
    headers.forEach((header, index) => {
        const normalizedHeader = header.trim();
        for (const [key, value] of Object.entries(fieldMap)) {
            if (normalizedHeader.toLowerCase() === key.toLowerCase()) {
                headerMapping[index] = value;
                break;
            }
        }
    });
    
    // Process data rows
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;
        
        const values = lines[i].split(delimiter).map(v => v.trim());
        const member = {};
        
        // Map row data to member object
        headers.forEach((header, index) => {
            const fieldName = headerMapping[index];
            if (fieldName && values[index] !== undefined) {
                let value = values[index];
                
                // Handle quoted values
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.substring(1, value.length - 1);
                }
                
                // Convert to appropriate type
                if (value && value !== '') {
                    if (fieldName === 'ghin' || fieldName === 'entryNum') {
                        value = parseInt(value) || null;
                    } else if (fieldName === 'index') {
                        value = parseFloat(value) || null;
                        if (value !== null) {
                            value = value.toString();
                        }
                    } else {
                        value = value.trim();
                    }
                } else {
                    value = '';
                }
                
                member[fieldName] = value;
            }
        });
        
        // Ensure required fields
        if (member.firstName || member.lastName) {
            members.push(member);
        }
    }
    
    return members;
}

/**
 * Create Excel workbook from member data
 * @param {Array} members - Members from database
 * @returns {Promise<Buffer>} Excel file buffer
 */
async function createMembersExcelWorkbook(members) {
    // Sort members by entry number in ascending order (low to high)
    const sortedMembers = [...members].sort((a, b) => {
        const entryA = parseInt(a.entryNum) || 999999;
        const entryB = parseInt(b.entryNum) || 999999;
        return entryA - entryB; // Ascending order (low to high)
    });
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Skylinks Men\'s Golf Club';
    workbook.created = new Date();
    
    const worksheet = workbook.addWorksheet('Members');
    
    // Add headers
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'GHIN', 'Index', 'Entry Number'];
    worksheet.addRow(headers);
    
    // Add data rows
    sortedMembers.forEach(member => {
        const row = [
            member.firstName || '',
            member.lastName || '',
            member.email || '',
            member.phoneNum || '',
            member.ghin || '',
            member.index || '',
            member.entryNum || ''
        ];
        worksheet.addRow(row);
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
        column.width = Math.min(maxLength + 2, 30);
    });
    
    // Generate buffer
    return await workbook.xlsx.writeBuffer();
}

/**
 * Create CSV/TSV text from member data
 * @param {Array} members - Members from database
 * @param {string} delimiter - ',' for CSV, '\t' for TSV
 * @returns {string} CSV/TSV formatted text
 */
function createMembersCsvTsvText(members, delimiter) {
    // Sort members by entry number in ascending order (low to high)
    const sortedMembers = [...members].sort((a, b) => {
        const entryA = parseInt(a.entryNum) || 999999;
        const entryB = parseInt(b.entryNum) || 999999;
        return entryA - entryB; // Ascending order (low to high)
    });
    
    // Add headers
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'GHIN', 'Index', 'Entry Number'];
    let csvData = headers.join(delimiter) + '\n';
    
    // Add data rows
    sortedMembers.forEach(member => {
        const row = [
            member.firstName || '',
            member.lastName || '',
            member.email || '',
            member.phoneNum || '',
            member.ghin || '',
            member.index || '',
            member.entryNum || ''
        ].map(value => {
            // Escape values that contain delimiter or quotes
            if (typeof value === 'string' && (value.includes(delimiter) || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        });
        
        csvData += row.join(delimiter) + '\n';
    });
    
    return csvData;
}

module.exports = {
    parseMembersExcelFile,
    parseMembersCsvTsvFile,
    createMembersExcelWorkbook,
    createMembersCsvTsvText
};