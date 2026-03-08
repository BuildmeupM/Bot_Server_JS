const express = require('express');
const router = express.Router();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Import OCR modules
const { preprocessImage, getFileType } = require('./preprocess');
const { postProcessOcrData } = require('./postprocess');
const { applyCompanyRules, listCompanyRules } = require('./company-rules');
const authMiddleware = require('../../middleware/auth');
const { getPool } = require('../../mysql');
const { buildExcelWorkbook } = require('./excel-export');

// ─── Auto-save company data from OCR results ───
async function autoSaveCompanies(data) {
    try {
        const pool = getPool();
        const validateTaxId = (id) => {
            if (!id) return false;
            const d = id.replace(/\D/g, '');
            if (d.length !== 13) return false;
            let sum = 0;
            for (let i = 0; i < 12; i++) sum += parseInt(d[i]) * (13 - i);
            let chk = 11 - (sum % 11);
            if (chk === 10) chk = 0; if (chk === 11) chk = 1;
            return chk === parseInt(d[12]);
        };
        const entries = [
            { taxId: data.sellerTaxId, nameTh: data.sellerNameTh, nameEn: data.sellerNameEn, address: data.sellerAddress },
            { taxId: data.buyerTaxId, nameTh: data.buyerNameTh, nameEn: data.buyerNameEn, address: data.buyerAddress }
        ];
        for (const e of entries) {
            if (!e.taxId) continue;
            const clean = e.taxId.replace(/\D/g, '');
            if (clean.length < 10) continue;
            await pool.execute(
                `INSERT INTO companies_master (tax_id, name_th, name_en, address, tax_id_valid, source)
                 VALUES (?, ?, ?, ?, ?, 'ocr')
                 ON DUPLICATE KEY UPDATE
                    name_th = COALESCE(VALUES(name_th), name_th),
                    name_en = COALESCE(VALUES(name_en), name_en),
                    address = COALESCE(VALUES(address), address),
                    times_seen = times_seen + 1,
                    last_seen_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP`,
                [clean, e.nameTh || null, e.nameEn || null, e.address || null, validateTaxId(e.taxId) ? 1 : 0]
            );
        }
    } catch (err) {
        console.error('⚠️ Auto-save company failed (non-critical):', err.message);
    }
}

// ─── Check if file was already OCR'd (by filename) ───
async function checkDuplicateFile(fileName) {
    try {
        const pool = getPool();
        const [rows] = await pool.execute(
            `SELECT id, file_name, document_type, seller_name, buyer_name, total, created_at 
             FROM ocr_history WHERE file_name = ? AND status = 'done' LIMIT 1`,
            [fileName]
        );
        return rows.length > 0 ? rows[0] : null;
    } catch (err) {
        console.error('⚠️ Check duplicate failed:', err.message);
        return null;
    }
}

// ─── Extract build code + company name from file path ───
function extractBuildInfo(filePath) {
    if (!filePath) return { code: null, name: null };
    // Match "Build000 ชื่อบริษัท" from path — folder name between backslashes
    const match = filePath.match(/\\(Build\d+)\s+([^\\]+)\\/i);
    if (match) return { code: match[1], name: match[2].trim() };
    // Fallback: just build code without name
    const codeOnly = filePath.match(/Build\d+/i);
    return { code: codeOnly ? codeOnly[0] : null, name: null };
}

// ─── Save OCR result to history ───
async function saveOcrHistory(data) {
    try {
        const pool = getPool();
        const buildInfo = extractBuildInfo(data.filePath);
        await pool.execute(
            `INSERT INTO ocr_history 
             (file_name, file_path, document_type, document_number, document_date,
              seller_name, seller_tax_id, seller_branch, buyer_name, buyer_tax_id,
              subtotal, vat, total, processing_time_ms, ocr_by, batch_job_id, status, build_code, build_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                file_path = VALUES(file_path), document_type = VALUES(document_type),
                document_number = VALUES(document_number), document_date = VALUES(document_date),
                seller_name = VALUES(seller_name), seller_tax_id = VALUES(seller_tax_id),
                seller_branch = VALUES(seller_branch),
                buyer_name = VALUES(buyer_name), buyer_tax_id = VALUES(buyer_tax_id),
                subtotal = VALUES(subtotal), vat = VALUES(vat), total = VALUES(total),
                processing_time_ms = VALUES(processing_time_ms), status = VALUES(status),
                updated_at = CURRENT_TIMESTAMP`,
            [
                data.fileName || null,
                data.filePath || null,
                data.documentType || null,
                data.documentNumber || null,
                data.documentDate || null,
                data.sellerName || null,
                data.sellerTaxId || null,
                data.sellerBranch || null,
                data.buyerName || null,
                data.buyerTaxId || null,
                data.subtotal || null,
                data.vat || null,
                data.total || null,
                data.processingTimeMs || null,
                data.ocrBy || null,
                data.batchJobId || null,
                data.status || 'done',
                buildInfo.code,
                buildInfo.name
            ]
        );
    } catch (err) {
        console.error('⚠️ Save OCR history failed:', err.message);
    }
}

// ══════════════════════════════════════════════
// Configuration
// ══════════════════════════════════════════════

const API_KEYS = [
    { id: 1, key: process.env.AKSORN_OCR_KEY_1, name: 'API Key #1' },
    { id: 2, key: process.env.AKSORN_OCR_KEY_2, name: 'API Key #2' },
    { id: 3, key: process.env.AKSORN_OCR_KEY_3, name: 'API Key #3' },
    { id: 4, key: process.env.AKSORN_OCR_KEY_4, name: 'API Key #4' },
    { id: 5, key: process.env.AKSORN_OCR_KEY_5, name: 'API Key #5' },
    { id: 6, key: process.env.AKSORN_OCR_KEY_6, name: 'API Key #6' },
    { id: 7, key: process.env.AKSORN_OCR_KEY_7, name: 'API Key #7' },
    { id: 8, key: process.env.AKSORN_OCR_KEY_8, name: 'API Key #8' },
].filter(k => k.key);

const API_URL = process.env.AKSORN_OCR_API_URL || 'https://backend.aksonocr.com/api/v1/key-extract';

// Round-robin key index
let currentKeyIndex = 0;

// Multer setup — เก็บไฟล์ชั่วคราว
const upload = multer({
    dest: path.join(__dirname, '..', '..', 'temp_uploads'),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`ไม่รองรับไฟล์ประเภท ${ext}`));
        }
    }
});

// ══════════════════════════════════════════════
// customFields สำหรับเอกสารทางการเงินไทย
// ══════════════════════════════════════════════
const FINANCIAL_DOCUMENT_FIELDS = [
    {
        key: "ประเภทเอกสาร",
        description: "ประเภทของเอกสาร เช่น ใบกำกับภาษี, ใบเสร็จรับเงิน, ใบลดหนี้, ใบเพิ่มหนี้, ใบแจ้งหนี้, ใบวางบิล",
        example: "ใบกำกับภาษี"
    },
    {
        key: "เลขที่เอกสาร",
        description: "เลขที่ใบกำกับภาษี ใบเสร็จรับเงิน หรือเลขที่เอกสาร",
        example: "IV2024-001"
    },
    {
        key: "วันที่ออกเอกสาร",
        description: "วันที่ออกเอกสาร ในรูปแบบ วัน/เดือน/ปี",
        example: "15/01/2567"
    },
    {
        key: "ชื่อผู้ขาย (ไทย)",
        description: "ชื่อบริษัทหรือร้านค้าผู้ขาย ภาษาไทย ให้อ่านชื่อภาษาไทยก่อนเสมอ",
        example: "บริษัท เอบีซี จำกัด"
    },
    {
        key: "ชื่อผู้ขาย (อังกฤษ)",
        description: "ชื่อบริษัทหรือร้านค้าผู้ขาย ภาษาอังกฤษ",
        example: "ABC Co., Ltd."
    },
    {
        key: "เลขผู้เสียภาษีผู้ขาย",
        description: "เลขประจำตัวผู้เสียภาษี 13 หลักของผู้ขาย",
        example: "0105550123456"
    },
    {
        key: "ที่อยู่ผู้ขาย",
        description: "ที่อยู่เต็มของผู้ขาย รวมเลขที่ ถนน แขวง เขต จังหวัด รหัสไปรษณีย์",
        example: "123 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110"
    },
    {
        key: "สาขาผู้ขาย",
        description: "สาขาของผู้ขาย เช่น สำนักงานใหญ่, สาขา 1, สาขาที่ 2 ถ้าไม่ระบุให้ตอบ สำนักงานใหญ่",
        example: "สำนักงานใหญ่"
    },
    {
        key: "ชื่อผู้ซื้อ (ไทย)",
        description: "ชื่อบริษัทหรือร้านค้าผู้ซื้อ ภาษาไทย ให้อ่านชื่อภาษาไทยก่อนเสมอ",
        example: "บริษัท ดีอีเอฟ จำกัด"
    },
    {
        key: "ชื่อผู้ซื้อ (อังกฤษ)",
        description: "ชื่อบริษัทหรือร้านค้าผู้ซื้อ ภาษาอังกฤษ",
        example: "DEF Co., Ltd."
    },
    {
        key: "เลขผู้เสียภาษีผู้ซื้อ",
        description: "เลขประจำตัวผู้เสียภาษี 13 หลักของผู้ซื้อ",
        example: "0105560789012"
    },
    {
        key: "ที่อยู่ผู้ซื้อ",
        description: "ที่อยู่เต็มของผู้ซื้อ รวมเลขที่ ถนน แขวง เขต จังหวัด รหัสไปรษณีย์",
        example: "456 ถ.พหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพฯ 10400"
    },
    {
        key: "มูลค่าก่อน VAT",
        description: "ยอดรวมก่อนหักภาษีมูลค่าเพิ่ม",
        example: "10,000.00"
    },
    {
        key: "ภาษีมูลค่าเพิ่ม",
        description: "จำนวนภาษีมูลค่าเพิ่ม VAT 7%",
        example: "700.00"
    },
    {
        key: "ยอดรวมสุทธิ",
        description: "ยอดรวมทั้งสิ้นที่ต้องชำระ (รวม VAT แล้ว)",
        example: "10,700.00"
    }
];

// ══════════════════════════════════════════════
// Helper: เลือก API Key แบบ Round Robin (เฉพาะ key ที่ใช้ได้)
// ══════════════════════════════════════════════
function getNextApiKey() {
    if (API_KEYS.length === 0) return null;
    const key = API_KEYS[currentKeyIndex % API_KEYS.length];
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    return key;
}

// ══════════════════════════════════════════════
// GET /api/ocr/health — ตรวจสอบสถานะ API Keys ทั้งหมด
// ══════════════════════════════════════════════
router.get('/health', async (req, res) => {
    try {
        const results = [];

        for (const apiKey of API_KEYS) {
            try {
                const form = new FormData();
                form.append('fields', JSON.stringify([]));

                const response = await axios.post(API_URL, form, {
                    headers: {
                        ...form.getHeaders(),
                        'X-API-Key': apiKey.key
                    },
                    timeout: 10000,
                    validateStatus: () => true
                });

                const status = response.status;
                let statusText = 'unknown';
                let icon = '❓';

                if (status === 200 || status === 400 || status === 422) {
                    statusText = 'พร้อมใช้งาน';
                    icon = '✅';
                } else if (status === 401) {
                    statusText = 'API Key ไม่ถูกต้อง';
                    icon = '❌';
                } else if (status === 402) {
                    statusText = 'เครดิตหมด';
                    icon = '⚠️';
                } else if (status === 405) {
                    statusText = 'พร้อมใช้งาน (API ตอบสนอง)';
                    icon = '✅';
                } else if (status === 429) {
                    statusText = 'Rate limit — ใช้งานมากเกินไป';
                    icon = '⚠️';
                } else if (status >= 500) {
                    statusText = 'เซิร์ฟเวอร์ AksornOCR มีปัญหา';
                    icon = '🔴';
                } else {
                    statusText = `HTTP ${status}`;
                    icon = '❓';
                }

                results.push({
                    id: apiKey.id,
                    name: apiKey.name,
                    keyPreview: apiKey.key.substring(0, 6) + '...' + apiKey.key.substring(apiKey.key.length - 4),
                    status: statusText,
                    icon,
                    httpCode: status,
                    ok: status === 200 || status === 405 || status === 400 || status === 422
                });

            } catch (err) {
                results.push({
                    id: apiKey.id,
                    name: apiKey.name,
                    keyPreview: apiKey.key.substring(0, 6) + '...' + apiKey.key.substring(apiKey.key.length - 4),
                    status: err.code === 'ECONNABORTED' ? 'Timeout — ไม่ตอบสนอง' : 'ไม่สามารถเชื่อมต่อได้',
                    icon: '🔴',
                    httpCode: 0,
                    ok: false,
                    error: err.message
                });
            }
        }

        const allOk = results.some(r => r.ok);
        const activeKeys = results.filter(r => r.ok).length;

        res.json({
            overall: allOk ? 'ready' : 'error',
            overallText: allOk
                ? `✅ พร้อมใช้งาน (${activeKeys}/${results.length} keys ใช้ได้)`
                : '❌ ไม่สามารถเชื่อมต่อ AksornOCR ได้',
            apiUrl: API_URL,
            totalKeys: results.length,
            activeKeys,
            keys: results,
            checkedAt: new Date().toISOString()
        });

    } catch (err) {
        console.error('OCR Health check error:', err);
        res.status(500).json({
            overall: 'error',
            overallText: '❌ เกิดข้อผิดพลาดในการตรวจสอบ',
            error: err.message
        });
    }
});

// ══════════════════════════════════════════════
// GET /api/ocr/dashboard-stats — สถิติ Dashboard สำหรับ OCR
// ══════════════════════════════════════════════
router.get('/dashboard-stats', async (req, res) => {
    try {
        const pool = getPool();

        // 1) Summary stats
        const [[summary]] = await pool.query(`
            SELECT 
                COUNT(*) as totalFiles,
                SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as successCount,
                SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errorCount,
                ROUND(AVG(processing_time_ms)) as avgTimeMs,
                ROUND(SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as successRate,
                COUNT(DISTINCT seller_tax_id) as uniqueSellers,
                COUNT(DISTINCT buyer_tax_id) as uniqueBuyers,
                COUNT(DISTINCT DATE(created_at)) as activeDays
            FROM ocr_history
        `);

        // 2) Financials
        const [[financials]] = await pool.query(`
            SELECT 
                COALESCE(SUM(CAST(REPLACE(REPLACE(subtotal,',',''),' ','') AS DECIMAL(15,2))),0) as totalSubtotal,
                COALESCE(SUM(CAST(REPLACE(REPLACE(vat,',',''),' ','') AS DECIMAL(15,2))),0) as totalVat,
                COALESCE(SUM(CAST(REPLACE(REPLACE(total,',',''),' ','') AS DECIMAL(15,2))),0) as totalAmount
            FROM ocr_history WHERE status='done' AND total IS NOT NULL AND total != ''
        `);

        // 3) By document type
        const [byDocType] = await pool.query(`
            SELECT document_type as type, COUNT(*) as count 
            FROM ocr_history WHERE document_type IS NOT NULL
            GROUP BY document_type ORDER BY count DESC LIMIT 10
        `);

        // 4) By date (last 7 days)
        const [byDate] = await pool.query(`
            SELECT DATE(created_at) as date, COUNT(*) as count,
                   SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as success,
                   SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors
            FROM ocr_history 
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY DATE(created_at) ORDER BY date DESC
        `);

        // 5) Top sellers
        const [topSellers] = await pool.query(`
            SELECT seller_name as name, seller_tax_id as taxId, COUNT(*) as count,
                   COALESCE(SUM(CAST(REPLACE(REPLACE(total,',',''),' ','') AS DECIMAL(15,2))),0) as totalAmount
            FROM ocr_history WHERE seller_name IS NOT NULL AND seller_name != '' AND status='done'
            GROUP BY seller_name, seller_tax_id ORDER BY count DESC LIMIT 10
        `);
        // 6) Recent files (last 20) — deduplicate by file_name, show latest date
        const [recentFiles] = await pool.query(`
            SELECT h.id, h.file_name, h.document_type, h.document_number, h.seller_name,
                   h.subtotal, h.vat, h.total, h.processing_time_ms, h.status,
                   COALESCE(h.updated_at, h.created_at) as created_at
            FROM ocr_history h
            INNER JOIN (
                SELECT MAX(id) as max_id FROM ocr_history GROUP BY file_name
            ) latest ON h.id = latest.max_id
            ORDER BY COALESCE(h.updated_at, h.created_at) DESC LIMIT 20
        `);

        // 7) Today stats
        const [[todayStats]] = await pool.query(`
            SELECT COUNT(*) as todayCount,
                   SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as todaySuccess,
                   SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as todayErrors
            FROM ocr_history WHERE DATE(created_at) = CURDATE()
        `);

        // 8) By build code — บริษัทภายในที่ใช้ระบบ OCR
        const [byBuildCode] = await pool.query(`
            SELECT build_code as code, MAX(build_name) as name, COUNT(*) as totalFiles,
                   SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as successCount,
                   SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errorCount,
                   MIN(created_at) as firstUsed,
                   MAX(created_at) as lastUsed
            FROM ocr_history WHERE build_code IS NOT NULL AND build_code != ''
            GROUP BY build_code ORDER BY totalFiles DESC
        `);

        // 8b) Doc types per build code
        const [buildDocTypes] = await pool.query(`
            SELECT build_code as code, document_type as type, COUNT(*) as count
            FROM ocr_history WHERE build_code IS NOT NULL AND build_code != '' AND document_type IS NOT NULL
            GROUP BY build_code, document_type ORDER BY count DESC
        `);
        // Merge doc types into byBuildCode
        for (const bc of byBuildCode) {
            bc.docTypes = buildDocTypes.filter(d => d.code === bc.code).map(d => ({ type: d.type, count: d.count }));
        }

        res.json({
            summary: {
                ...summary,
                ...todayStats,
                avgTimeSec: summary.avgTimeMs ? (summary.avgTimeMs / 1000).toFixed(1) : '0'
            },
            financials,
            byDocType,
            byDate,
            topSellers,
            recentFiles,
            byBuildCode
        });

    } catch (err) {
        console.error('Dashboard stats error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════
// GET /api/ocr/build-report/:code — รายงานสรุปสำหรับ Build Code
// ══════════════════════════════════════════════
router.get('/build-report/:code', async (req, res) => {
    try {
        const pool = getPool();
        const buildCode = req.params.code;

        // Summary
        const [[summary]] = await pool.query(`
            SELECT COUNT(*) as totalFiles,
                   MAX(build_name) as buildName,
                   SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as successCount,
                   SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errorCount,
                   ROUND(AVG(processing_time_ms)) as avgTimeMs,
                   MIN(created_at) as firstUsed,
                   MAX(created_at) as lastUsed,
                   COUNT(DISTINCT DATE(created_at)) as activeDays,
                   COUNT(DISTINCT seller_tax_id) as uniqueSellers
            FROM ocr_history WHERE build_code = ?
        `, [buildCode]);

        // Document types
        const [docTypes] = await pool.query(`
            SELECT document_type as type, COUNT(*) as count
            FROM ocr_history WHERE build_code = ? AND document_type IS NOT NULL
            GROUP BY document_type ORDER BY count DESC
        `, [buildCode]);

        // Top sellers
        const [topSellers] = await pool.query(`
            SELECT seller_name as name, seller_tax_id as taxId, COUNT(*) as count,
                   COALESCE(SUM(CAST(REPLACE(REPLACE(total,',',''),' ','') AS DECIMAL(15,2))),0) as totalAmount
            FROM ocr_history WHERE build_code = ? AND seller_name IS NOT NULL AND seller_name != '' AND status='done'
            GROUP BY seller_name, seller_tax_id ORDER BY count DESC LIMIT 10
        `, [buildCode]);

        // OCR Types — classify by file_name prefix (WHT&VAT, WHT, VAT, None_vat)
        const [ocrTypesRaw] = await pool.query(`
            SELECT file_name, file_path FROM ocr_history WHERE build_code = ?
        `, [buildCode]);

        const ocrTypeCounts = { 'WHT&VAT': 0, 'WHT': 0, 'VAT': 0, 'None_vat': 0, 'อื่นๆ': 0 };
        for (const row of ocrTypesRaw) {
            const fn = (row.file_name || '').toLowerCase();
            const fp = (row.file_path || '').toLowerCase().replace(/\\\\/g, '/');
            if (fn.startsWith('wht&vat') || fn.startsWith('wht_vat') || fp.includes('/wht&vat/') || fp.includes('/wht_vat/')) {
                ocrTypeCounts['WHT&VAT']++;
            } else if (fn.startsWith('wht') || fp.includes('/wht/')) {
                ocrTypeCounts['WHT']++;
            } else if (fn.startsWith('vat') || fp.includes('/vat/')) {
                ocrTypeCounts['VAT']++;
            } else if (fn.startsWith('none_vat') || fn.startsWith('nonevat') || fp.includes('/none_vat/') || fp.includes('/nonevat/')) {
                ocrTypeCounts['None_vat']++;
            } else {
                ocrTypeCounts['อื่นๆ']++;
            }
        }
        const ocrTypes = Object.entries(ocrTypeCounts)
            .filter(([, count]) => count > 0)
            .map(([type, count]) => ({ type, count }));

        // By date
        const [byDate] = await pool.query(`
            SELECT DATE(created_at) as date, COUNT(*) as count,
                   SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as success,
                   SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors
            FROM ocr_history WHERE build_code = ?
            GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30
        `, [buildCode]);

        // All files — deduplicate by file_name, show latest date
        const [files] = await pool.query(`
            SELECT h.id, h.file_name, h.file_path, h.document_type, h.document_number, h.document_date,
                   h.seller_name, h.seller_tax_id, h.seller_address, h.buyer_name, h.buyer_tax_id, h.buyer_address,
                   h.subtotal, h.vat, h.total, h.processing_time_ms, h.status,
                   COALESCE(h.updated_at, h.created_at) as created_at
            FROM ocr_history h
            INNER JOIN (
                SELECT MAX(id) as max_id FROM ocr_history 
                WHERE build_code = ?
                GROUP BY file_name
            ) latest ON h.id = latest.max_id
            ORDER BY COALESCE(h.updated_at, h.created_at) DESC
        `, [buildCode]);

        res.json({ buildCode, summary, docTypes, topSellers, ocrTypes, byDate, files });
    } catch (err) {
        console.error('Build report error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════
// DELETE /api/ocr/history/:id — ลบรายการ OCR เดี่ยว
// ══════════════════════════════════════════════
router.delete('/history/:id', async (req, res) => {
    try {
        const pool = getPool();
        const id = req.params.id;
        const [result] = await pool.query('DELETE FROM ocr_history WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'ไม่พบรายการที่ต้องการลบ' });
        }
        res.json({ success: true, message: 'ลบรายการเรียบร้อยแล้ว' });
    } catch (err) {
        console.error('Delete OCR history error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════
// GET /api/ocr/export-excel/:buildCode — ส่งออก Excel
// ══════════════════════════════════════════════
router.get('/export-excel/:buildCode', async (req, res) => {
    try {
        const pool = getPool();
        const buildCode = req.params.buildCode;

        // Query OCR records for this build code (deduplicate by file_name — เอาเฉพาะรายการล่าสุด)
        const [records] = await pool.query(
            `SELECT h.id, h.file_name, h.file_path, h.document_type, h.document_number, h.document_date,
                    h.seller_name, h.seller_tax_id, h.seller_branch, h.seller_address, h.buyer_name, h.buyer_tax_id, h.buyer_address,
                    h.subtotal, h.vat, h.total, h.status, h.created_at
             FROM ocr_history h
             INNER JOIN (
                 SELECT MAX(id) as max_id FROM ocr_history 
                 WHERE build_code = ? AND status = 'done'
                 GROUP BY file_name
             ) latest ON h.id = latest.max_id
             ORDER BY h.created_at ASC`,
            [buildCode]
        );

        if (records.length === 0) {
            return res.status(404).json({ error: 'ไม่พบข้อมูล OCR สำหรับ build code นี้' });
        }

        // Get company addresses from companies_master
        const taxIds = [...new Set(records.map(r => r.seller_tax_id).filter(Boolean))];
        const companiesMap = {};
        if (taxIds.length > 0) {
            const placeholders = taxIds.map(() => '?').join(',');
            const [companies] = await pool.query(
                `SELECT tax_id, name_th, name_en, address FROM companies_master WHERE tax_id IN (${placeholders})`,
                taxIds
            );
            companies.forEach(c => { companiesMap[c.tax_id] = c; });
        }

        // Build Excel workbook
        const workbook = await buildExcelWorkbook(records, companiesMap);

        // Stream as download
        const fileName = `OCR_Export_${buildCode}_${new Date().toISOString().slice(0,10)}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Export Excel error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════════
// POST /api/ocr/process — ประมวลผล OCR เอกสารทางการเงิน
// ══════════════════════════════════════════════
router.post('/process', upload.single('file'), async (req, res) => {
    const startTime = Date.now();
    let tempFilePath = null;

    try {
        // 1. ตรวจสอบไฟล์
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'กรุณาอัปโหลดไฟล์ (PDF, JPG, PNG)'
            });
        }

        tempFilePath = req.file.path;
        const originalName = req.file.originalname;
        const fileType = getFileType(originalName);

        // 0. ตรวจสอบว่าไฟล์เคย OCR แล้วหรือยัง
        const duplicate = await checkDuplicateFile(originalName);
        if (duplicate) {
            // ลบไฟล์ชั่วคราว
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                try { fs.unlinkSync(tempFilePath); } catch (e) { }
            }
            return res.json({
                success: true,
                skipped: true,
                message: `ไฟล์นี้เคย OCR แล้วเมื่อ ${duplicate.created_at} (ไม่เสียเครดิต)`,
                previousResult: {
                    documentType: duplicate.document_type,
                    sellerName: duplicate.seller_name,
                    buyerName: duplicate.buyer_name,
                    total: duplicate.total,
                    ocrDate: duplicate.created_at
                }
            });
        }

        console.log(`\n📄 ═══════════════════════════════════════════`);
        console.log(`📄 เริ่ม OCR: ${originalName} (${fileType})`);
        console.log(`📄 ═══════════════════════════════════════════`);

        // 2. เลือก API Key
        const apiKey = getNextApiKey();
        if (!apiKey) {
            return res.status(503).json({
                success: false,
                error: 'ไม่มี API Key ที่พร้อมใช้งาน'
            });
        }
        console.log(`🔑 ใช้ ${apiKey.name}`);

        // 3. Pre-processing (เฉพาะไฟล์ภาพ)
        let fileBuffer = fs.readFileSync(tempFilePath);
        let processedBuffer = fileBuffer;
        let preprocessed = false;

        if (fileType === 'image') {
            console.log('🖼️ เริ่ม Image Pre-processing...');
            processedBuffer = await preprocessImage(fileBuffer, {
                grayscale: true,
                normalize: true,
                sharpenSigma: 1.5
            });
            preprocessed = true;
            console.log('✅ Pre-processing เสร็จสิ้น');
        } else {
            console.log('📑 ไฟล์ PDF — ส่งตรงไปยัง AksornOCR');
        }

        // 4. ส่งไปยัง AksornOCR API
        console.log('🚀 กำลังส่งไฟล์ไปยัง AksornOCR...');
        const form = new FormData();

        // ใช้ buffer ที่ผ่าน pre-processing แล้ว
        const ext = path.extname(originalName).toLowerCase();
        const mimeType = ext === '.pdf' ? 'application/pdf'
            : ext === '.png' ? 'image/png'
                : 'image/jpeg';

        form.append('file', processedBuffer, {
            filename: originalName,
            contentType: mimeType
        });
        form.append('model', 'aksonocr-1.0');
        form.append('customFields', JSON.stringify(FINANCIAL_DOCUMENT_FIELDS));

        const ocrResponse = await axios.post(API_URL, form, {
            headers: {
                ...form.getHeaders(),
                'X-API-Key': apiKey.key
            },
            timeout: 60000, // 60 วินาที สำหรับไฟล์ใหญ่
            validateStatus: () => true
        });

        // ตรวจสอบ response — AksornOCR returns 200 or 201
        const isSuccess = ocrResponse.status === 200 || ocrResponse.status === 201;
        if (!isSuccess) {
            console.error(`❌ AksornOCR error: HTTP ${ocrResponse.status}`);
            return res.status(ocrResponse.status).json({
                success: false,
                error: `AksornOCR API error: HTTP ${ocrResponse.status}`,
                apiResponse: ocrResponse.data,
                keyUsed: apiKey.name
            });
        }

        const rawOcrResult = ocrResponse.data;
        console.log('✅ AksornOCR ส่งผลลัพธ์กลับมาแล้ว');

        // 5. Extract raw data จาก AksornOCR response
        // AksornOCR response shape: { success: true, data: { field1: val1, ... } }
        let rawFields = {};
        if (rawOcrResult && rawOcrResult.data && typeof rawOcrResult.data === 'object') {
            // Primary: { success, data: { ... } }
            rawFields = { ...rawOcrResult.data };
        } else if (rawOcrResult && rawOcrResult.extracted_data) {
            // Fallback: { extracted_data: { fields: [...] } }
            const fields = rawOcrResult.extracted_data.fields || rawOcrResult.extracted_data;
            if (Array.isArray(fields)) {
                fields.forEach(field => {
                    if (field.key && field.value !== undefined) {
                        rawFields[field.key] = field.value;
                    }
                });
            } else if (typeof fields === 'object') {
                rawFields = { ...fields };
            }
        } else if (rawOcrResult && typeof rawOcrResult === 'object') {
            // Last resort: flat object
            rawFields = { ...rawOcrResult };
        }

        // 6. Post-Processing
        console.log('🔧 เริ่ม Post-Processing...');
        const processedData = postProcessOcrData(rawFields);
        console.log('✅ Post-Processing เสร็จสิ้น');

        // 7. Company Custom Rules
        const { data: finalData, ruleApplied } = applyCompanyRules(processedData);
        if (ruleApplied) {
            console.log(`🏢 ใช้ Company Rule: ${ruleApplied.companyName}`);
        }

        // 8. สรุปผล + Auto-save companies
        const processingTime = Date.now() - startTime;
        autoSaveCompanies(finalData).catch(e => console.error('⚠️ Auto-save error:', e.message));

        // Save OCR history (ป้องกันอ่านซ้ำ)
        saveOcrHistory({
            fileName: originalName,
            filePath: tempFilePath,
            documentType: finalData.documentType,
            documentNumber: finalData.documentNumber,
            documentDate: finalData.documentDate,
            sellerName: finalData.sellerName,
            sellerTaxId: finalData.sellerTaxId,
            sellerBranch: finalData.sellerBranch,
            buyerName: finalData.buyerName,
            buyerTaxId: finalData.buyerTaxId,
            subtotal: finalData.subtotal,
            vat: finalData.vat,
            total: finalData.total,
            processingTimeMs: processingTime,
            ocrBy: null,
            batchJobId: null,
            status: 'done'
        }).catch(e => console.error('⚠️ Save history error:', e.message));

        console.log(`⏱️ เวลาทั้งหมด: ${processingTime}ms`);
        console.log(`📄 ═══════════════════════════════════════════\n`);

        res.json({
            success: true,
            data: finalData,
            metadata: {
                originalFile: originalName,
                fileType,
                preprocessed,
                processingTimeMs: processingTime,
                keyUsed: apiKey.name,
                ruleApplied: ruleApplied || null,
                warnings: finalData.warnings || [],
                rawOcrResponse: rawOcrResult
            }
        });

    } catch (err) {
        console.error('❌ OCR Process error:', err);
        res.status(500).json({
            success: false,
            error: err.message,
            processingTimeMs: Date.now() - startTime
        });

    } finally {
        // ลบไฟล์ชั่วคราว
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (e) {
                console.warn('⚠️ ไม่สามารถลบไฟล์ชั่วคราว:', e.message);
            }
        }
    }
});

// ══════════════════════════════════════════════
// GET /api/ocr/company-rules — แสดง Company Rules ที่มี
// ══════════════════════════════════════════════
router.get('/company-rules', (req, res) => {
    res.json({
        rules: listCompanyRules(),
        total: listCompanyRules().length
    });
});

// ══════════════════════════════════════════════
// POST /api/ocr/check-duplicates — ตรวจไฟล์ที่เคย OCR แล้ว
// ══════════════════════════════════════════════
router.post('/check-duplicates', authMiddleware, async (req, res) => {
    try {
        const { filePaths } = req.body;
        if (!filePaths || !Array.isArray(filePaths)) {
            return res.status(400).json({ success: false, error: 'กรุณาระบุ filePaths' });
        }
        const pool = getPool();
        const duplicates = [];
        const newFiles = [];
        for (const fp of filePaths) {
            const fileName = require('path').basename(fp);
            const [rows] = await pool.execute(
                `SELECT id, file_name, document_type, document_number, document_date,
                        seller_name, seller_tax_id, buyer_name, buyer_tax_id,
                        subtotal, vat, total, created_at
                 FROM ocr_history WHERE file_name = ? AND status = 'done' LIMIT 1`,
                [fileName]
            );
            if (rows.length > 0) {
                const r = rows[0];
                duplicates.push({
                    filePath: fp,
                    fileName,
                    documentType: r.document_type,
                    documentNumber: r.document_number,
                    documentDate: r.document_date,
                    sellerName: r.seller_name,
                    sellerTaxId: r.seller_tax_id,
                    buyerName: r.buyer_name,
                    buyerTaxId: r.buyer_tax_id,
                    subtotal: r.subtotal,
                    vat: r.vat,
                    total: r.total,
                    ocrDate: r.created_at
                });
            } else {
                newFiles.push(fp);
            }
        }
        res.json({
            success: true,
            totalFiles: filePaths.length,
            duplicateCount: duplicates.length,
            newCount: newFiles.length,
            duplicates,
            newFiles
        });
    } catch (err) {
        console.error('Check duplicates error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════════════
// POST /api/ocr/batch-process — เริ่ม Batch OCR (Parallel Workers)
// ══════════════════════════════════════════════
const { createBatchJob, startBatchProcessing, getJobStatus, listJobs } = require('./batch-processor');

router.post('/batch-process', authMiddleware, async (req, res) => {
    try {
        const { filePaths, maxWorkers, forceReprocess } = req.body;

        // ── Validate ──
        if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'กรุณาระบุ filePaths เป็น array ของ path ไฟล์'
            });
        }

        if (filePaths.length > 50) {
            return res.status(400).json({
                success: false,
                error: 'รองรับสูงสุด 50 ไฟล์ต่อ batch'
            });
        }

        // ── ตรวจสอบว่าไฟล์มีอยู่จริง ──
        const validFiles = [];
        const invalidFiles = [];

        for (const fp of filePaths) {
            if (fs.existsSync(fp)) {
                const ext = path.extname(fp).toLowerCase();
                const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp'];
                if (allowed.includes(ext)) {
                    validFiles.push(fp);
                } else {
                    invalidFiles.push({ file: fp, reason: `ไม่รองรับประเภท ${ext}` });
                }
            } else {
                invalidFiles.push({ file: fp, reason: 'ไม่พบไฟล์' });
            }
        }

        if (validFiles.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'ไม่มีไฟล์ที่ถูกต้อง',
                invalidFiles
            });
        }

        // ── หา Active API Keys ──
        const activeKeys = API_KEYS.filter(k => k.key);
        if (activeKeys.length === 0) {
            return res.status(503).json({
                success: false,
                error: 'ไม่มี API Key ที่พร้อมใช้งาน'
            });
        }

        // ── สร้าง Job ──
        const job = createBatchJob(validFiles, activeKeys, maxWorkers, req.user);
        job.forceReprocess = !!forceReprocess;

        // ── เริ่ม Processing (async — ไม่ block response) ──
        startBatchProcessing(job, API_URL);

        // ── ตอบกลับทันที ──
        res.json({
            success: true,
            jobId: job.jobId,
            totalFiles: validFiles.length,
            activeWorkers: job.workerCount,
            filesPerWorker: Math.ceil(validFiles.length / job.workerCount),
            distribution: job.workers.map(w => ({
                workerId: w.workerId,
                keyName: w.keyName,
                fileCount: w.total,
                files: w.files.map(f => path.basename(f))
            })),
            invalidFiles: invalidFiles.length > 0 ? invalidFiles : undefined,
            message: `🚀 เริ่มประมวลผล ${validFiles.length} ไฟล์ ด้วย ${job.workerCount} Workers`
        });

    } catch (err) {
        console.error('Batch process error:', err);
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// ══════════════════════════════════════════════
// GET /api/ocr/batch-status/:jobId — ดูสถานะ Batch Job
// ══════════════════════════════════════════════
router.get('/batch-status/:jobId', (req, res) => {
    const status = getJobStatus(req.params.jobId);
    if (!status) {
        return res.status(404).json({
            success: false,
            error: 'ไม่พบ Job ID นี้ (อาจหมดอายุแล้ว)'
        });
    }
    res.json({ success: true, ...status });
});

// ══════════════════════════════════════════════
// GET /api/ocr/batch-jobs — รายการ Jobs ทั้งหมด
// ══════════════════════════════════════════════
router.get('/batch-jobs', (req, res) => {
    res.json({
        success: true,
        jobs: listJobs()
    });
});

module.exports = router;
