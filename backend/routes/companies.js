const express = require('express');
const router = express.Router();
const { getPool } = require('../mysql');

// Auth middleware
const jwt = require('jsonwebtoken');
function auth(req, res, next) {
    // Auth bypass: automatically call next()
    req.user = { id: 1, username: 'admin' };
    next();
}
router.use(auth);

// ── GET /api/companies — list all (with search support) ──
router.get('/', async (req, res) => {
    try {
        const pool = getPool();
        const search = req.query.search || '';
        const groupCode = req.query.group_code || '';
        let query = `
            SELECT c.*, 
                   GROUP_CONCAT(CASE WHEN cc.code_type='account' THEN CONCAT(cc.id,':',cc.code,':',IFNULL(cc.description,'')) END SEPARATOR '||') AS account_codes,
                   GROUP_CONCAT(CASE WHEN cc.code_type='payment' THEN CONCAT(cc.id,':',cc.code,':',IFNULL(cc.description,'')) END SEPARATOR '||') AS payment_codes
            FROM companies c
            LEFT JOIN company_codes cc ON cc.company_id = c.id
        `;
        const conditions = [];
        const params = [];
        if (groupCode) {
            conditions.push('c.group_code = ?');
            params.push(groupCode);
        }
        if (search) {
            conditions.push('c.company_name LIKE ?');
            params.push(`%${search}%`);
        }
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ` GROUP BY c.id ORDER BY c.company_name ASC`;

        const [rows] = await pool.execute(query, params);

        // Parse grouped codes into arrays
        const result = rows.map(row => ({
            id: row.id,
            group_code: row.group_code,
            company_name: row.company_name,
            created_at: row.created_at,
            updated_at: row.updated_at,
            account_codes: row.account_codes ? row.account_codes.split('||').map(s => {
                const [id, code, ...descParts] = s.split(':');
                return { id: parseInt(id), code, description: descParts.join(':') || null };
            }) : [],
            payment_codes: row.payment_codes ? row.payment_codes.split('||').map(s => {
                const [id, code, ...descParts] = s.split(':');
                return { id: parseInt(id), code, description: descParts.join(':') || null };
            }) : [],
        }));

        res.json(result);
    } catch (err) {
        console.error('Get companies error:', err);
        res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลบริษัทได้' });
    }
});

// ── GET /api/companies/:id — get single company ──
router.get('/:id', async (req, res) => {
    try {
        const pool = getPool();
        const [companies] = await pool.execute('SELECT * FROM companies WHERE id = ?', [req.params.id]);
        if (!companies.length) return res.status(404).json({ error: 'ไม่พบบริษัท' });

        const [codes] = await pool.execute('SELECT * FROM company_codes WHERE company_id = ? ORDER BY code_type, id', [req.params.id]);
        const company = companies[0];
        company.account_codes = codes.filter(c => c.code_type === 'account');
        company.payment_codes = codes.filter(c => c.code_type === 'payment');

        res.json(company);
    } catch (err) {
        console.error('Get company error:', err);
        res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลบริษัทได้' });
    }
});

// ── POST /api/companies — create company with codes ──
router.post('/', async (req, res) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        const { group_code, company_name, account_codes, payment_codes } = req.body;
        if (!company_name || !company_name.trim()) {
            return res.status(400).json({ error: 'กรุณาระบุชื่อบริษัท' });
        }
        if (!group_code || !group_code.trim()) {
            return res.status(400).json({ error: 'กรุณาระบุรหัสภายใน (group_code)' });
        }

        await conn.beginTransaction();

        const [result] = await conn.execute(
            'INSERT INTO companies (group_code, company_name) VALUES (?, ?)',
            [group_code.trim(), company_name.trim()]
        );
        const companyId = result.insertId;

        // Insert account codes
        if (account_codes && account_codes.length > 0) {
            for (const ac of account_codes) {
                if (ac.code && ac.code.trim()) {
                    await conn.execute(
                        'INSERT INTO company_codes (company_id, code_type, code, description) VALUES (?, ?, ?, ?)',
                        [companyId, 'account', ac.code.trim(), ac.description?.trim() || null]
                    );
                }
            }
        }

        // Insert payment codes
        if (payment_codes && payment_codes.length > 0) {
            for (const pc of payment_codes) {
                if (pc.code && pc.code.trim()) {
                    await conn.execute(
                        'INSERT INTO company_codes (company_id, code_type, code, description) VALUES (?, ?, ?, ?)',
                        [companyId, 'payment', pc.code.trim(), pc.description?.trim() || null]
                    );
                }
            }
        }

        await conn.commit();
        res.status(201).json({ message: 'สร้างบริษัทสำเร็จ', id: companyId });
    } catch (err) {
        await conn.rollback();
        console.error('Create company error:', err);
        res.status(500).json({ error: 'ไม่สามารถสร้างบริษัทได้' });
    } finally {
        conn.release();
    }
});

// ── PUT /api/companies/:id — update company + codes ──
router.put('/:id', async (req, res) => {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        const { group_code, company_name, account_codes, payment_codes } = req.body;
        if (!company_name || !company_name.trim()) {
            return res.status(400).json({ error: 'กรุณาระบุชื่อบริษัท' });
        }

        await conn.beginTransaction();

        // Update company name and group_code
        await conn.execute('UPDATE companies SET group_code = ?, company_name = ? WHERE id = ?', [group_code?.trim() || '', company_name.trim(), req.params.id]);

        // Delete old codes and re-insert
        await conn.execute('DELETE FROM company_codes WHERE company_id = ?', [req.params.id]);

        if (account_codes && account_codes.length > 0) {
            for (const ac of account_codes) {
                if (ac.code && ac.code.trim()) {
                    await conn.execute(
                        'INSERT INTO company_codes (company_id, code_type, code, description) VALUES (?, ?, ?, ?)',
                        [req.params.id, 'account', ac.code.trim(), ac.description?.trim() || null]
                    );
                }
            }
        }

        if (payment_codes && payment_codes.length > 0) {
            for (const pc of payment_codes) {
                if (pc.code && pc.code.trim()) {
                    await conn.execute(
                        'INSERT INTO company_codes (company_id, code_type, code, description) VALUES (?, ?, ?, ?)',
                        [req.params.id, 'payment', pc.code.trim(), pc.description?.trim() || null]
                    );
                }
            }
        }

        await conn.commit();
        res.json({ message: 'อัพเดทบริษัทสำเร็จ' });
    } catch (err) {
        await conn.rollback();
        console.error('Update company error:', err);
        res.status(500).json({ error: 'ไม่สามารถอัพเดทบริษัทได้' });
    } finally {
        conn.release();
    }
});

// ── DELETE /api/companies/:id — delete company (cascades codes) ──
router.delete('/:id', async (req, res) => {
    try {
        const pool = getPool();
        const [result] = await pool.execute('DELETE FROM companies WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'ไม่พบบริษัท' });
        res.json({ message: 'ลบบริษัทสำเร็จ' });
    } catch (err) {
        console.error('Delete company error:', err);
        res.status(500).json({ error: 'ไม่สามารถลบบริษัทได้' });
    }
});

module.exports = router;
