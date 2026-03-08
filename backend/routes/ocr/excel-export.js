/**
 * OCR Excel Export Module
 * ส่งออกข้อมูล OCR เป็น Excel 3 ชีต:
 *   1. มีภาษีมูลค่าเพิ่ม
 *   2. ไม่มีภาษีมูลค่าเพิ่ม
 *   3. ที่อยู่แต่ละบริษัท
 */
const ExcelJS = require('exceljs');

// ──────────────────────────────────────────────
// 1) Parse file naming pattern
// ──────────────────────────────────────────────
//  Pattern: ประเภท - โค้ดบัญชี_ยอด - ชื่อเดิม - โค้ดชำระ.pdf
//  Examples:
//    WHT4% - 51330_1000 - TaxInvoice-กรรมการ CH001.pdf
//    VAT - 51330_500_51340_500 - TaxInvoice-ชุดที่2 - 1000.pdf
//    None_Vat - 51330_2000 - ค่าเช่า.pdf
//    WHT54-15%-PP36 - 51330_5000 - Invoice.pdf
//    WHT3%&VAT - 51330_1000 - Invoice - CH002.pdf

const DOC_TYPE_REGEX = /^(WHT54-(\d+)%-PP36|WHT54-(\d+)%|WHT(\d+)%&VAT|WHT(\d+)%|VAT|None_Vat|PP36)$/;

/**
 * จำแนก docType + whtPercent จาก string ที่ match ได้
 */
function classifyDocType(raw) {
    if (raw.startsWith('WHT54-') && raw.endsWith('-PP36')) {
        const m = raw.match(/WHT54-(\d+)%-PP36/);
        return { docType: 'WHT54-PP36', whtPercent: m ? m[1] : '' };
    } else if (raw.startsWith('WHT54-')) {
        const m = raw.match(/WHT54-(\d+)%/);
        return { docType: 'WHT54', whtPercent: m ? m[1] : '' };
    } else if (raw.includes('&VAT')) {
        const m = raw.match(/WHT(\d+)%/);
        return { docType: 'WHT&VAT', whtPercent: m ? m[1] : '' };
    } else if (raw.startsWith('WHT')) {
        const m = raw.match(/WHT(\d+)%/);
        return { docType: 'WHT', whtPercent: m ? m[1] : '' };
    } else if (raw === 'VAT') {
        return { docType: 'VAT', whtPercent: '' };
    } else if (raw === 'None_Vat') {
        return { docType: 'None_Vat', whtPercent: '' };
    } else if (raw === 'PP36') {
        return { docType: 'PP36', whtPercent: '' };
    }
    return { docType: '', whtPercent: '' };
}

/**
 * ลองจับ combined format: DocType_AccountCode(s)
 * เช่น VAT_12345, WHT3%_51330_1000, None_Vat_51330
 * คืนค่า { docTypeStr, codesPart } หรือ null
 */
function tryParseCombinedDocType(part0) {
    // ลำดับสำคัญ: pattern ยาวก่อน เพื่อไม่ให้ match บางส่วน
    const prefixes = [
        /^(WHT54-\d+%-PP36)_(.+)$/,
        /^(WHT54-\d+%)_(.+)$/,
        /^(WHT\d+%&VAT)_(.+)$/,
        /^(WHT\d+%)_(.+)$/,
        /^(VAT)_(.+)$/,
        /^(None_Vat)_(.+)$/,
        /^(PP36)_(.+)$/,
    ];
    for (const regex of prefixes) {
        const m = part0.match(regex);
        if (m) return { docTypeStr: m[1], codesPart: m[2] };
    }
    return null;
}

function parseFileNamePattern(fileName) {
    const result = {
        docType: '',         // VAT, None_Vat, WHT, WHT&VAT, WHT54, WHT54-PP36, PP36
        whtPercent: '',      // e.g. "4", "15"
        accountCodes: [],    // [{code, amount}]
        originalName: '',    // ชื่อไฟล์เดิม (= ชื่อไฟล์ใหม่ใน Excel)
        paymentCodes: [],    // [{code, amount}]
        fileNameAmount: '',  // ยอดเงินจาก file name (สำหรับ validate)
    };

    if (!fileName) return result;

    // Remove .pdf extension
    let name = fileName.replace(/\.pdf$/i, '').trim();

    // Split by ' - '
    const parts = name.split(' - ').map(p => p.trim());
    if (parts.length < 1) return result;

    // ═══ ลองจับ Doc Type ═══

    // A) Exact match — รูปแบบเดิม: "VAT - 51330_1000 - OrigName - PayCode"
    const docMatch = parts[0].match(DOC_TYPE_REGEX);
    if (docMatch) {
        const cls = classifyDocType(docMatch[0]);
        result.docType = cls.docType;
        result.whtPercent = cls.whtPercent;

        // ── Special: WHT5% - 100&VAT pattern (doc type spans 2 parts) ──
        // เมื่อ parts[0] = 'WHT5%' และ parts[1] มี '&VAT' เช่น '100&VAT'
        // ให้ถือว่า doc type = WHT&VAT และ shift parts ไป 1 ช่อง
        if (result.docType === 'WHT' && parts.length >= 3 && parts[1] && /&VAT$/i.test(parts[1])) {
            result.docType = 'WHT&VAT';
            // Part 2: Account code (ในรูปแบบนี้ part 2 คือ code ตรงๆ เช่น '51101')
            if (parts.length >= 3) {
                const codePart = parts[2].trim();
                if (codePart) {
                    // ถ้า codePart ไม่มี _ (ไม่ใช่ code_amount) ให้ใช้เป็น code ตรงๆ
                    if (!codePart.includes('_')) {
                        result.accountCodes = [{ code: codePart, amount: '' }];
                    } else {
                        const parsed = parseCodeAmountPart(codePart);
                        result.accountCodes = parsed.codes;
                        result.fileNameAmount = parsed.totalAmount || '';
                    }
                }
            }
            // Part 3: Original name
            if (parts.length >= 4) {
                result.originalName = parts[3];
            }
            // Part 4+: Payment codes
            if (parts.length >= 5) {
                const payPart = parts.slice(4).join(' - ');
                const parsed = parseCodeAmountPart(payPart);
                result.paymentCodes = parsed.codes;
            }
            extractTrailingPayCode(result);
            return result;
        }

        // Part 2: Account codes + amount
        if (parts.length >= 2) {
            const parsed = parseCodeAmountPart(parts[1]);
            result.accountCodes = parsed.codes;
            result.fileNameAmount = parsed.totalAmount || '';
            // ถ้าไม่มี codes แต่มี totalAmount → ถือว่าเป็น account code (เช่น '51101' คือโค้ดบัญชี ไม่ใช่ยอดเงิน)
            if (result.accountCodes.length === 0 && result.fileNameAmount) {
                result.accountCodes = [{ code: result.fileNameAmount, amount: '' }];
                result.fileNameAmount = '';
            }
        }
        // Part 3: Original name
        if (parts.length >= 3) {
            result.originalName = parts[2];
        }
        // Part 4+: Payment codes
        if (parts.length >= 4) {
            const payPart = parts.slice(3).join(' - ');
            const parsed = parseCodeAmountPart(payPart);
            result.paymentCodes = parsed.codes;
        }
        // ดึง payment code ท้ายชื่อไฟล์ (ถ้ายังไม่มี)
        extractTrailingPayCode(result);
        return result;
    }

    // B) Combined format — "VAT_12345 - OrigName - PayCode"
    //    DocType + AccountCode อยู่ใน parts[0] คั่นด้วย _
    const combined = tryParseCombinedDocType(parts[0]);
    if (combined) {
        const cls = classifyDocType(combined.docTypeStr);
        result.docType = cls.docType;
        result.whtPercent = cls.whtPercent;

        // Account codes มาจาก parts[0] หลัง DocType_
        const parsed = parseCodeAmountPart(combined.codesPart);
        result.accountCodes = parsed.codes;
        result.fileNameAmount = parsed.totalAmount || '';

        // parts[1] = ชื่อไฟล์เดิม (ไม่ใช่ account codes!)
        if (parts.length >= 2) {
            result.originalName = parts[1];
        }
        // parts[2+] = payment codes
        if (parts.length >= 3) {
            const payPart = parts.slice(2).join(' - ');
            const parsed2 = parseCodeAmountPart(payPart);
            result.paymentCodes = parsed2.codes;
        }

        // ดึง payment code ท้ายชื่อไฟล์ (ถ้ายังไม่มี)
        extractTrailingPayCode(result);
        return result;
    }

    // C) ไม่ match ทั้ง 2 รูปแบบ — ใช้ชื่อไฟล์เดิมทั้งหมด
    //    (เช่น TaxInvoice-กรรมการ...) ไม่ parse account codes
    result.originalName = name;
    extractTrailingPayCode(result);
    return result;
}

/**
 * ดึง payment code ที่ติดอยู่ท้ายชื่อไฟล์ออกมา
 * เช่น "TaxInvoice-กรรมการฯ Ch001" → originalName="TaxInvoice-กรรมการฯ", payCode="Ch001"
 * Pattern: คำท้ายสุดที่เป็น ASCII alphanumeric (เช่น Ch001, CH002, 456)
 */
function extractTrailingPayCode(result) {
    if (!result.originalName || result.paymentCodes.length > 0) return;
    // จับ: ตัวอักษร A-Z (0-4 ตัว) + ตัวเลข (1+ ตัว) ที่อยู่หลังช่องว่าง ท้าย string
    const m = result.originalName.match(/^(.+?)\s+([A-Za-z]{0,4}\d{1,6})$/);
    if (m) {
        result.originalName = m[1].trim();
        result.paymentCodes = [{ code: m[2], amount: '' }];
    }
}

/**
 * Parse code_amount part: "51330_1000" or "51330_500_51340_500" etc.
 * Returns { codes: [{code, amount}], totalAmount }
 */
function parseCodeAmountPart(str) {
    if (!str) return { codes: [], totalAmount: '' };

    const tokens = str.split('_').map(t => t.trim()).filter(Boolean);
    if (tokens.length === 0) return { codes: [], totalAmount: '' };

    // Check if single pure number → just amount
    if (tokens.length === 1) {
        if (/^\d+(\.\d+)?$/.test(tokens[0])) {
            return { codes: [], totalAmount: tokens[0] };
        }
        return { codes: [{ code: tokens[0], amount: '' }], totalAmount: '' };
    }

    // Try to detect pattern:
    // Even tokens: code_amt_code_amt (pairs)
    // Odd tokens: code_code_amt (last is total)

    const isNumber = (s) => /^\d+(\.\d+)?$/.test(s);

    // Check if it's code_amount pairs (even length, alternating)
    if (tokens.length % 2 === 0) {
        let isPairs = true;
        for (let i = 0; i < tokens.length; i += 2) {
            if (isNumber(tokens[i]) && !isNumber(tokens[i + 1])) isPairs = false;
            // code should not be a pure number >= 5 digits typically,
            // but amounts can be. Heuristic: if first char is letter or code-like, it's a code
        }
        // Better heuristic: codes are typically 5-digit numbers, amounts have decimals or are larger
        // Check alternating: non-pure-numeric, numeric, non-pure-numeric, numeric
        // Actually both codes and amounts can be numbers. Use position-based: odd positions = code, even = amount
        // For 51330_500_51340_500: all are numbers, but 51330/51340 look like codes (5 digits), 500 like amounts
        // Simplification: if length == 2 → code_amount; if length == 4+ and even → try pairs
        if (tokens.length === 2) {
            return {
                codes: [{ code: tokens[0], amount: tokens[1] }],
                totalAmount: tokens[1]
            };
        }
        // For 4+ tokens (even): assume code_amt pairs
        if (isPairs) {
            const codes = [];
            for (let i = 0; i < tokens.length; i += 2) {
                codes.push({ code: tokens[i], amount: tokens[i + 1] || '' });
            }
            return { codes, totalAmount: '' };
        }
    }

    // Odd tokens: last token is total amount, rest are codes
    if (tokens.length >= 3 && isNumber(tokens[tokens.length - 1])) {
        const totalAmount = tokens[tokens.length - 1];
        const codes = tokens.slice(0, -1).map(t => ({ code: t, amount: '' }));
        return { codes, totalAmount };
    }

    // Fallback: all are codes
    return {
        codes: tokens.map(t => ({ code: t, amount: '' })),
        totalAmount: ''
    };
}

// ──────────────────────────────────────────────
// 2) Parse Thai address into parts
// ──────────────────────────────────────────────
function parseAddress(fullAddress) {
    const result = { 
        full: fullAddress || '', 
        number: '', moo: '', soi: '', road: '', 
        tambon: '', amphoe: '', province: '', zipcode: '' 
    };
    if (!fullAddress) return result;

    const addr = fullAddress.trim();

    // Zipcode (5 digits at end)
    const zipMatch = addr.match(/(\d{5})\s*$/);
    if (zipMatch) result.zipcode = zipMatch[1];

    // Province (จังหวัด / จ.)
    const provMatch = addr.match(/(?:จังหวัด|จ\.)\s*([^\s,]+)/);
    if (provMatch) result.province = provMatch[1];
    else {
        // Try province before zipcode
        const provMatch2 = addr.match(/([^\s,]+)\s*\d{5}\s*$/);
        if (provMatch2 && !provMatch2[1].match(/^(ต\.|อ\.|ม\.|ซ\.|ถ\.)/)) {
            result.province = provMatch2[1];
        }
    }

    // Amphoe (อำเภอ / อ. / เขต)
    const amphMatch = addr.match(/(?:อำเภอ|อ\.|เขต)\s*([^\s,]+)/);
    if (amphMatch) result.amphoe = amphMatch[1];

    // Tambon (ตำบล / ต. / แขวง)
    const tamMatch = addr.match(/(?:ตำบล|ต\.|แขวง)\s*([^\s,]+)/);
    if (tamMatch) result.tambon = tamMatch[1];

    // Moo (หมู่ / หมู่ที่ / ม.)
    const mooMatch = addr.match(/(?:หมู่ที่|หมู่|ม\.)\s*(\d+)/);
    if (mooMatch) result.moo = mooMatch[1];

    // Soi (ซอย / ซ.)
    const soiMatch = addr.match(/(?:ซอย|ซ\.)\s*([^\s,]+)/);
    if (soiMatch) result.soi = soiMatch[1];

    // Road (ถนน / ถ.)
    const roadMatch = addr.match(/(?:ถนน|ถ\.)\s*([^\s,]+)/);
    if (roadMatch) result.road = roadMatch[1];

    // Number (เลขที่ at start)
    const numMatch = addr.match(/^(\d+[\/\-]?\d*)/);
    if (numMatch) result.number = numMatch[1];

    return result;
}

// ──────────────────────────────────────────────
// 3) Get branch code — ใช้ seller_branch จาก OCR ก่อน, fallback parse จาก seller_name
// ──────────────────────────────────────────────
function getBranchCode(sellerBranch, sellerName) {
    // ถ้ามี seller_branch จาก OCR (แปลงเป็นตัวเลข 5 หลักแล้ว) → ใช้เลย
    if (sellerBranch && sellerBranch !== '00000') {
        return sellerBranch;
    }
    if (sellerBranch === '00000') {
        return 'สำนักงานใหญ่';
    }
    // Fallback: parse จาก seller_name
    if (!sellerName) return 'สำนักงานใหญ่';
    const m = sellerName.match(/(สาขา\s*\d*|สำนักงานใหญ่)/i);
    return m ? m[1].trim() : 'สำนักงานใหญ่';
}

// ──────────────────────────────────────────────
// 4) Build Excel workbook
// ──────────────────────────────────────────────
const SHEET_COLUMNS = [
    'ลำดับ', 'ชื่อบริษัท - ผู้ขาย', 'เลขประจำตัวผู้เสียภาษี', 'สาขา',
    'วันที่', 'วันครบกำหนดชำระ', 'เลขที่เอกสาร',
    'โค้ดบันทึกบัญชี', 'เปอร์เซ็นต์หัก ณ ที่จ่าย',
    'ยอดก่อนภาษีมูลค่าเพิ่ม', 'ยอดภาษีมูลค่าเพิ่ม', 'ยอดหลังบวกภาษีมูลค่าเพิ่ม',
    'โค้ดตัดชำระเงิน', 'อ้างอิง', 'หมายเหตุ',
    'ชื่อไฟล์ใหม่', 'ชื่อไฟล์เก่า'
];

const ADDRESS_COLUMNS = [
    'ลำดับ', 'ชื่อบริษัท - ผู้ขาย', 'เลขประจำตัวผู้เสียภาษี', 'สาขา', 'ที่อยู่ตามระบบ (ถ้ามี)',
    'ที่อยู่รวม', 'เลขที่', 'หมู่', 'ซอย', 'ถนน',
    'ตำบล/แขวง', 'อำเภอ/เขต', 'จังหวัด', 'รหัสไปรษณีย์'
];

// Header style
const HEADER_STYLE = {
    font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF97316' } },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    }
};

const DATA_BORDER = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
};

function styleHeaderRow(sheet) {
    const headerRow = sheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell(cell => {
        cell.font = HEADER_STYLE.font;
        cell.fill = HEADER_STYLE.fill;
        cell.alignment = HEADER_STYLE.alignment;
        cell.border = HEADER_STYLE.border;
    });
}

function addDataRows(sheet, rows) {
    rows.forEach((rowData, idx) => {
        const row = sheet.addRow(rowData);
        row.eachCell(cell => {
            cell.border = DATA_BORDER;
            cell.alignment = { vertical: 'middle', wrapText: true };
        });
        // Alternate row color
        if (idx % 2 === 0) {
            row.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
            });
        }
    });
}

async function buildExcelWorkbook(records, companiesMap) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'DocSort Pro OCR';
    workbook.created = new Date();

    const vatRows = [];     // มีภาษีมูลค่าเพิ่ม
    const nonVatRows = [];  // ไม่มีภาษีมูลค่าเพิ่ม
    let vatSeq = 0;
    let nonVatSeq = 0;

    for (const rec of records) {
        const parsed = parseFileNamePattern(rec.file_name);
        const branch = getBranchCode(rec.seller_branch, rec.seller_name);

        // Classify: has VAT or not
        const vatAmount = parseFloat(rec.vat) || 0;
        const hasVat = vatAmount > 0;

        // Check amount mismatch — เก็บเป็น log (ไม่ใส่ในหมายเหตุ เพราะช่องนี้ไว้ให้ผู้ใช้กรอกเอง)
        let remark = '';

        // Account codes → multi-row if multiple
        const acctCodes = parsed.accountCodes.length > 0 ? parsed.accountCodes : [{ code: '', amount: '' }];
        const payCodes = parsed.paymentCodes.length > 0 ? parsed.paymentCodes : [{ code: '', amount: '' }];

        // Payment codes as string (for single cell)
        const payCodeStr = payCodes.map(p => p.code).filter(Boolean).join(', ');

        // Target array
        const targetRows = hasVat ? vatRows : nonVatRows;
        const seq = hasVat ? ++vatSeq : ++nonVatSeq;

        if (acctCodes.length <= 1) {
            // Single row
            targetRows.push([
                seq,                                   // ลำดับ
                rec.seller_name || '',                  // ชื่อบริษัท
                rec.seller_tax_id || '',                // เลขผู้เสียภาษี
                branch,                                 // สาขา
                rec.document_date || '',                // วันที่
                '',                                     // วันครบกำหนด
                rec.document_number || '',              // เลขเอกสาร
                acctCodes[0].code || '',                // โค้ดบัญชี
                parsed.whtPercent ? parsed.whtPercent + '%' : '', // % หัก
                rec.subtotal || '',                     // ยอดก่อน VAT
                rec.vat || '',                          // ยอด VAT
                rec.total || '',                        // ยอดหลัง VAT
                payCodeStr,                             // โค้ดชำระ
                '',                                     // อ้างอิง
                remark,                                 // หมายเหตุ
                parsed.originalName || rec.file_name || '', // ชื่อไฟล์ใหม่ (ชื่อเดิม)
                rec.file_name || '',                    // ชื่อไฟล์เก่า (ชื่อเต็ม)
            ]);
        } else {
            // Multiple account codes → multiple rows, same sequence number
            acctCodes.forEach((ac, i) => {
                targetRows.push([
                    i === 0 ? seq : '',                 // ลำดับ (เฉพาะแถวแรก)
                    i === 0 ? (rec.seller_name || '') : '',
                    i === 0 ? (rec.seller_tax_id || '') : '',
                    i === 0 ? branch : '',
                    i === 0 ? (rec.document_date || '') : '',
                    '',
                    i === 0 ? (rec.document_number || '') : '',
                    ac.code || '',                      // โค้ดบัญชี (แต่ละแถว)
                    i === 0 ? (parsed.whtPercent ? parsed.whtPercent + '%' : '') : '',
                    i === 0 ? (rec.subtotal || '') : '',  // ยอดก่อน VAT
                    i === 0 ? (rec.vat || '') : '',
                    ac.amount || (i === 0 ? (rec.total || '') : ''),  // ยอดแยกหรือยอดรวม
                    i === 0 ? payCodeStr : '',
                    '',
                    i === 0 ? remark : '',
                    i === 0 ? (parsed.originalName || rec.file_name || '') : '', // ชื่อไฟล์ใหม่ (ชื่อเดิม)
                    i === 0 ? (rec.file_name || '') : '',  // ชื่อไฟล์เก่า (ชื่อเต็ม)
                ]);
            });
        }
    }

    // ── Sheet 1: มีภาษีมูลค่าเพิ่ม ──
    const ws1 = workbook.addWorksheet('มีภาษีมูลค่าเพิ่ม');
    ws1.columns = SHEET_COLUMNS.map((h, i) => ({
        header: h, key: `col${i}`,
        width: [6, 30, 18, 14, 12, 14, 18, 16, 10, 14, 14, 16, 16, 12, 20, 35, 35][i] || 14
    }));
    styleHeaderRow(ws1);
    addDataRows(ws1, vatRows);

    // ── Sheet 2: ไม่มีภาษีมูลค่าเพิ่ม ──
    const ws2 = workbook.addWorksheet('ไม่มีภาษีมูลค่าเพิ่ม');
    ws2.columns = SHEET_COLUMNS.map((h, i) => ({
        header: h, key: `col${i}`,
        width: [6, 30, 18, 14, 12, 14, 18, 16, 10, 14, 14, 16, 16, 12, 20, 35, 35][i] || 14
    }));
    styleHeaderRow(ws2);
    addDataRows(ws2, nonVatRows);

    // ── Sheet 3: ที่อยู่แต่ละบริษัท ──
    const ws3 = workbook.addWorksheet('ที่อยู่แต่ละบริษัท');
    ws3.columns = ADDRESS_COLUMNS.map((h, i) => ({
        header: h, key: `addr${i}`,
        width: [6, 30, 18, 14, 40, 12, 8, 12, 14, 14, 14, 14, 10][i] || 14
    }));
    styleHeaderRow(ws3);

    // Build unique companies from records + companiesMap
    const seenTaxIds = new Set();
    const addrRows = [];
    let addrSeq = 0;
    for (const rec of records) {
        // If there's no taxId, check if name exists, otherwise skip
        const taxId = rec.seller_tax_id || `temp_${rec.seller_name}`;
        if (!taxId || seenTaxIds.has(taxId)) continue;
        seenTaxIds.add(taxId);

        const company = companiesMap[rec.seller_tax_id] || {};
        const rawAddress = rec.seller_address || company.address || '';
        const addr = parseAddress(rawAddress);
        const branch = getBranchCode(rec.seller_branch, rec.seller_name);

        addrRows.push([
            ++addrSeq,
            rec.seller_name || company.name_th || '',
            rec.seller_tax_id || '',
            branch,
            rawAddress, // Add the raw address before the parsed pieces
            addr.full,
            addr.number, addr.moo, addr.soi, addr.road,
            addr.tambon, addr.amphoe, addr.province, addr.zipcode
        ]);
    }
    addDataRows(ws3, addrRows);

    return workbook;
}

module.exports = {
    parseFileNamePattern,
    parseCodeAmountPart,
    parseAddress,
    getBranchCode,
    buildExcelWorkbook
};
