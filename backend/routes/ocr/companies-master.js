const express = require('express');
const router = express.Router();
const { getDB } = require('../../database');

// ─── Tax ID Checksum Validator ───
function validateTaxId(taxId) {
    if (!taxId) return { valid: false, reason: 'ไม่มีเลขผู้เสียภาษี' };
    const digits = taxId.replace(/\D/g, '');
    if (digits.length !== 13) return { valid: false, reason: `มี ${digits.length} หลัก (ต้อง 13)` };
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(digits[i]) * (13 - i);
    let chk = 11 - (sum % 11);
    if (chk === 10) chk = 0;
    if (chk === 11) chk = 1;
    return chk === parseInt(digits[12])
        ? { valid: true, reason: 'Checksum ถูกต้อง' }
        : { valid: false, reason: `Check digit ไม่ตรง (ควรลงท้าย ${chk})` };
}

// ─── Auto-save companies from OCR result ───
// Called after OCR processing to upsert seller & buyer data
router.post('/save-from-ocr', (req, res) => {
    try {
        const db = getDB();
        const { companies } = req.body; // array of { taxId, nameTh, nameEn, address }
        if (!companies || !Array.isArray(companies)) {
            return res.status(400).json({ success: false, error: 'companies array required' });
        }

        const upsertStmt = db.prepare(`
            INSERT INTO companies_master (tax_id, name_th, name_en, address, tax_id_valid, source, times_seen)
            VALUES (?, ?, ?, ?, ?, 'ocr', 1)
            ON CONFLICT(tax_id) DO UPDATE SET
                name_th = COALESCE(excluded.name_th, companies_master.name_th),
                name_en = COALESCE(excluded.name_en, companies_master.name_en),
                address = COALESCE(excluded.address, companies_master.address),
                times_seen = companies_master.times_seen + 1,
                last_seen_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
        `);

        const results = [];
        const txn = db.transaction(() => {
            for (const c of companies) {
                if (!c.taxId) continue;
                const cleanTaxId = c.taxId.replace(/\D/g, '');
                if (cleanTaxId.length < 10) continue; // skip obviously bad data

                const validation = validateTaxId(c.taxId);
                upsertStmt.run(cleanTaxId, c.nameTh || null, c.nameEn || null, c.address || null, validation.valid ? 1 : 0);
                results.push({ taxId: cleanTaxId, taxIdValid: validation.valid, action: 'upserted' });
            }
        });
        txn();

        res.json({ success: true, saved: results.length, results });
    } catch (err) {
        console.error('❌ Error saving companies:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Get all companies ───
router.get('/', (req, res) => {
    try {
        const db = getDB();
        const { search, verified, limit = 50, offset = 0 } = req.query;

        let sql = 'SELECT * FROM companies_master WHERE 1=1';
        const params = [];

        if (search) {
            sql += ' AND (tax_id LIKE ? OR name_th LIKE ? OR name_en LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (verified !== undefined) {
            sql += ' AND verified = ?';
            params.push(parseInt(verified));
        }

        sql += ' ORDER BY last_seen_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const companies = db.prepare(sql).all(...params);
        const total = db.prepare('SELECT COUNT(*) as count FROM companies_master').get().count;

        res.json({ success: true, companies, total });
    } catch (err) {
        console.error('❌ Error fetching companies:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Lookup by Tax ID ───
router.get('/lookup/:taxId', (req, res) => {
    try {
        const db = getDB();
        const cleanTaxId = req.params.taxId.replace(/\D/g, '');
        const company = db.prepare('SELECT * FROM companies_master WHERE tax_id = ?').get(cleanTaxId);
        const validation = validateTaxId(cleanTaxId);

        res.json({
            success: true,
            found: !!company,
            company: company || null,
            validation
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Verify / Unverify a company ───
router.patch('/:id/verify', (req, res) => {
    try {
        const db = getDB();
        const { verified } = req.body;
        db.prepare('UPDATE companies_master SET verified = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(verified ? 1 : 0, req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Update company info ───
router.put('/:id', (req, res) => {
    try {
        const db = getDB();
        const { nameTh, nameEn, address, taxId } = req.body;

        // Re-validate if tax_id changed
        let taxIdValid = 0;
        if (taxId) {
            taxIdValid = validateTaxId(taxId).valid ? 1 : 0;
        }

        db.prepare(`
            UPDATE companies_master 
            SET name_th = COALESCE(?, name_th), 
                name_en = COALESCE(?, name_en), 
                address = COALESCE(?, address),
                tax_id = COALESCE(?, tax_id),
                tax_id_valid = CASE WHEN ? IS NOT NULL THEN ? ELSE tax_id_valid END,
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `).run(nameTh || null, nameEn || null, address || null, taxId || null, taxId || null, taxIdValid, req.params.id);

        const updated = db.prepare('SELECT * FROM companies_master WHERE id = ?').get(req.params.id);
        res.json({ success: true, company: updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Delete company ───
router.delete('/:id', (req, res) => {
    try {
        const db = getDB();
        db.prepare('DELETE FROM companies_master WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Stats ───
router.get('/stats/summary', (req, res) => {
    try {
        const db = getDB();
        const total = db.prepare('SELECT COUNT(*) as count FROM companies_master').get().count;
        const verified = db.prepare('SELECT COUNT(*) as count FROM companies_master WHERE verified = 1').get().count;
        const validTaxId = db.prepare('SELECT COUNT(*) as count FROM companies_master WHERE tax_id_valid = 1').get().count;
        const invalidTaxId = db.prepare('SELECT COUNT(*) as count FROM companies_master WHERE tax_id_valid = 0').get().count;
        const topSeen = db.prepare('SELECT tax_id, name_th, times_seen FROM companies_master ORDER BY times_seen DESC LIMIT 10').all();

        res.json({ success: true, stats: { total, verified, validTaxId, invalidTaxId, topSeen } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
