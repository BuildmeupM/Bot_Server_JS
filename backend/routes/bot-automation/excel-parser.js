const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

/**
 * Parse Excel file and validate transaction data.
 * @param {string} excelPath - Absolute or relative path to Excel file
 * @param {Function} addLog - Logging callback (jobId, level, message)
 * @param {string} jobId - Job ID for logging
 * @returns {Promise<{transactions: Array, vendors: Array, skippedCount: number, missingFiles: Array}>}
 */
async function parseExcelData(excelPath, addLog, jobId) {
    if (!excelPath) throw new Error('ไม่ได้ระบุชื่อไฟล์ Excel');

    let filePath = excelPath;

    // If relative filename, fallback to default directory
    if (!excelPath.includes('/') && !excelPath.includes('\\')) {
        const uploadsDir = process.env.EXCEL_UPLOADS_DIR ||
            path.join('V:', 'A.โฟร์เดอร์หลัก', 'Build000 ทดสอบระบบ', 'test', 'ทดสอบระบบแยกเอกสาร');
        filePath = path.join(uploadsDir, excelPath);
    }

    if (!fs.existsSync(filePath)) {
        throw new Error(`ไม่พบไฟล์: ${filePath}`);
    }

    const buffer = await fs.promises.readFile(filePath);
    const workbook = xlsx.read(buffer, { type: 'buffer' });

    const getSheetData = (sheetName) => {
        if (workbook.Sheets[sheetName]) {
            return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
        }
        return [];
    };

    const vatTransactions = getSheetData('มีภาษีมูลค่าเพิ่ม').map(tx => ({ ...tx, _sheetType: 'VAT' }));
    const nonVatTransactions = getSheetData('ไม่มีภาษีมูลค่าเพิ่ม').map(tx => ({ ...tx, _sheetType: 'NoneVat' }));
    const vendors = getSheetData('ที่อยู่แต่ละบริษัท');
    const allTransactions = [...vatTransactions, ...nonVatTransactions];

    if (allTransactions.length === 0) {
        addLog(jobId, 'warn', '⚠️ ไม่พบรายการค่าใช้จ่ายในชีต "มีภาษีมูลค่าเพิ่ม" และ "ไม่มีภาษีมูลค่าเพิ่ม"');
    }
    if (vendors.length === 0) {
        addLog(jobId, 'warn', '⚠️ ไม่พบข้อมูลผู้ขายในชีต "ที่อยู่แต่ละบริษัท"');
    }

    // Required columns
    const requiredColumns = [
        'ลำดับ', 'ชื่อบริษัท - ผู้ขาย', 'เลขประจำตัวผู้เสียภาษี',
        'วันที่', 'โค้ดบันทึกบัญชี', 'ยอดก่อนภาษีมูลค่าเพิ่ม',
        'ยอดหลังบวกภาษีมูลค่าเพิ่ม', 'ชื่อไฟล์ใหม่', 'ชื่อไฟล์เก่า'
    ];

    let skippedCount = 0;
    const validTransactions = allTransactions.filter((tx, idx) => {
        const missingCols = [];
        for (const col of requiredColumns) {
            const val = flexFind(tx, col);
            if (val === undefined || val === null || String(val).trim() === '') {
                missingCols.push(col);
            }
        }
        if (missingCols.length > 0) {
            const rowNum = flexFind(tx, 'ลำดับ') || (idx + 1);
            addLog(jobId, 'warn', `⚠️ ข้ามรายการที่ ${rowNum} — ข้อมูลไม่ครบ: ${missingCols.join(', ')}`);
            skippedCount++;
            return false;
        }
        return true;
    });

    if (skippedCount > 0) {
        addLog(jobId, 'warn', `⚠️ ข้ามรายการทั้งหมด ${skippedCount} รายการ (ข้อมูลไม่ครบ) เหลือ ${validTransactions.length} รายการที่พร้อมทำงาน`);
    }

    // Validate source files exist
    const excelDir = path.dirname(filePath);
    const missingFiles = [];
    for (const tx of validTransactions) {
        const oldFile = flexFind(tx, 'ชื่อไฟล์เก่า');
        if (oldFile && String(oldFile).trim()) {
            const srcPath = path.join(excelDir, String(oldFile).trim());
            if (!fs.existsSync(srcPath)) {
                const rowNum = flexFind(tx, 'ลำดับ') || '?';
                missingFiles.push({ row: rowNum, file: String(oldFile).trim() });
            }
        }
    }

    if (missingFiles.length > 0) {
        addLog(jobId, 'error', `❌ พบ ${missingFiles.length} ไฟล์ต้นทางที่ไม่มีอยู่ในโฟลเดอร์:`);
        for (const mf of missingFiles) {
            addLog(jobId, 'error', `   ❌ แถว ${mf.row}: ${mf.file}`);
        }
        addLog(jobId, 'error', `📁 โฟลเดอร์: ${excelDir}`);
    }

    return { transactions: validTransactions, vendors, skippedCount, missingFiles };
}

/**
 * Flexible column name lookup (handles whitespace/newline variations in Excel headers)
 */
function flexFind(row, keyword) {
    const cleanKw = keyword.replace(/[\n\r\s]/g, '');
    const key = Object.keys(row).find(k => k.replace(/[\n\r\s]/g, '').includes(cleanKw));
    return key ? row[key] : undefined;
}

/**
 * Get value from a transaction row using flexible key matching
 */
function getExcelVal(tx, keyword) {
    return flexFind(tx, keyword);
}

module.exports = { parseExcelData, flexFind, getExcelVal };
