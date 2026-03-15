const express = require('express');
const router = express.Router();
const { getPool } = require('../../mysql');

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
router.post('/save-from-ocr', async (req, res) => {
    try {
        const pool = getPool();
        const { companies } = req.body;
        if (!companies || !Array.isArray(companies)) {
            return res.status(400).json({ success: false, error: 'companies array required' });
        }

        const results = [];
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            for (const c of companies) {
                if (!c.taxId) continue;
                const cleanTaxId = c.taxId.replace(/\D/g, '');
                if (cleanTaxId.length < 10) continue;

                const validation = validateTaxId(c.taxId);
                await conn.execute(
                    `INSERT INTO companies_master (tax_id, name_th, name_en, address, tax_id_valid, source, times_seen)
                     VALUES (?, ?, ?, ?, ?, 'ocr', 1)
                     ON DUPLICATE KEY UPDATE
                        name_th = COALESCE(VALUES(name_th), name_th),
                        name_en = COALESCE(VALUES(name_en), name_en),
                        address = COALESCE(VALUES(address), address),
                        times_seen = times_seen + 1,
                        last_seen_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP`,
                    [cleanTaxId, c.nameTh || null, c.nameEn || null, c.address || null, validation.valid ? 1 : 0]
                );
                results.push({ taxId: cleanTaxId, taxIdValid: validation.valid, action: 'upserted' });
            }
            await conn.commit();
        } catch (txErr) {
            await conn.rollback();
            throw txErr;
        } finally {
            conn.release();
        }

        res.json({ success: true, saved: results.length, results });
    } catch (err) {
        console.error('❌ Error saving companies:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Get all companies ───
router.get('/', async (req, res) => {
    try {
        const pool = getPool();
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

        const [companies] = await pool.execute(sql, params);
        const [countResult] = await pool.execute('SELECT COUNT(*) as count FROM companies_master');
        const total = countResult[0].count;

        res.json({ success: true, companies, total });
    } catch (err) {
        console.error('❌ Error fetching companies:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Lookup by Tax ID ───
router.get('/lookup/:taxId', async (req, res) => {
    try {
        const pool = getPool();
        const cleanTaxId = req.params.taxId.replace(/\D/g, '');
        const [rows] = await pool.execute('SELECT * FROM companies_master WHERE tax_id = ?', [cleanTaxId]);
        const company = rows[0] || null;
        const validation = validateTaxId(cleanTaxId);

        res.json({ success: true, found: !!company, company, validation });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Verify / Unverify a company ───
router.patch('/:id/verify', async (req, res) => {
    try {
        const pool = getPool();
        const { verified } = req.body;
        await pool.execute(
            'UPDATE companies_master SET verified = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [verified ? 1 : 0, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Update company info ───
router.put('/:id', async (req, res) => {
    try {
        const pool = getPool();
        const { nameTh, nameEn, address, taxId } = req.body;

        let taxIdValid = 0;
        if (taxId) {
            taxIdValid = validateTaxId(taxId).valid ? 1 : 0;
        }

        await pool.execute(
            `UPDATE companies_master 
             SET name_th = COALESCE(?, name_th), 
                 name_en = COALESCE(?, name_en), 
                 address = COALESCE(?, address),
                 tax_id = COALESCE(?, tax_id),
                 tax_id_valid = CASE WHEN ? IS NOT NULL THEN ? ELSE tax_id_valid END,
                 updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [nameTh || null, nameEn || null, address || null, taxId || null, taxId || null, taxIdValid, req.params.id]
        );

        const [rows] = await pool.execute('SELECT * FROM companies_master WHERE id = ?', [req.params.id]);
        res.json({ success: true, company: rows[0] || null });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Delete company ───
router.delete('/:id', async (req, res) => {
    try {
        const pool = getPool();
        await pool.execute('DELETE FROM companies_master WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── Stats ───
router.get('/stats/summary', async (req, res) => {
    try {
        const pool = getPool();
        const [totalR] = await pool.execute('SELECT COUNT(*) as count FROM companies_master');
        const [verifiedR] = await pool.execute('SELECT COUNT(*) as count FROM companies_master WHERE verified = 1');
        const [validR] = await pool.execute('SELECT COUNT(*) as count FROM companies_master WHERE tax_id_valid = 1');
        const [invalidR] = await pool.execute('SELECT COUNT(*) as count FROM companies_master WHERE tax_id_valid = 0');
        const [topSeen] = await pool.execute('SELECT tax_id, name_th, times_seen FROM companies_master ORDER BY times_seen DESC LIMIT 10');

        res.json({
            success: true,
            stats: {
                total: totalR[0].count,
                verified: verifiedR[0].count,
                validTaxId: validR[0].count,
                invalidTaxId: invalidR[0].count,
                topSeen
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
