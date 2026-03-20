const express = require('express');
const router = express.Router();
const { getPool } = require('../mysql');
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.JWT_SECRET || 'fallback_secret_key_123456789012';
const IV_LENGTH = 16; 

function encrypt(text) {
    if (!text) return text;
    const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest('base64').substring(0, 32);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (!text) return text;
    try {
        const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest('base64').substring(0, 32);
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        console.error("Decryption failed", e);
        return text;
    }
}

// ==========================================
// CREDENTIALS
// ==========================================

router.get('/credentials', async (req, res) => {
    try {
        const pool = getPool();
        const [credentials] = await pool.execute('SELECT * FROM bot_credentials ORDER BY created_at DESC');
        
        const decryptedCredentials = credentials.map(cred => ({
            ...cred,
            password: decrypt(cred.password)
        }));
        
        res.json(decryptedCredentials);
    } catch (error) {
        console.error("Error fetching credentials:", error);
        res.status(500).json({ error: 'Failed to fetch credentials' });
    }
});

router.post('/credentials', async (req, res) => {
    try {
        const { name, username, password } = req.body;
        if (!name || !username || !password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const pool = getPool();
        const [maxRows] = await pool.execute("SELECT MAX(CAST(SUBSTRING(id, 6) AS UNSIGNED)) as maxNum FROM bot_credentials");
        const nextIdNum = (maxRows[0].maxNum || 0) + 1;
        const newId = `CRED-${String(nextIdNum).padStart(3, '0')}`;
        
        const encryptedPassword = encrypt(password);

        await pool.execute(
            'INSERT INTO bot_credentials (id, name, username, password) VALUES (?, ?, ?, ?)',
            [newId, name, username, encryptedPassword]
        );

        res.status(201).json({ 
            id: newId, 
            name, 
            username, 
            password
        });
    } catch (error) {
        console.error("Error creating credential:", error);
        res.status(500).json({ error: 'Failed to create credential' });
    }
});

router.delete('/credentials/:id', async (req, res) => {
    try {
        const pool = getPool();
        await pool.execute('DELETE FROM bot_credentials WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting credential:", error);
        res.status(500).json({ error: 'Failed to delete credential' });
    }
});


// ==========================================
// PROFILES
// ==========================================

router.get('/profiles', async (req, res) => {
    try {
        const pool = getPool();
        const [profiles] = await pool.execute('SELECT * FROM bot_profiles ORDER BY created_at DESC');
        
        const result = [];
        for (const profile of profiles) {
            const [configs] = await pool.execute('SELECT * FROM bot_pdf_configs WHERE profile_id = ?', [profile.id]);
            result.push({
                ...profile,
                password: decrypt(profile.password),
                peakCode: profile.peak_code || '',
                vatStatus: profile.vat_status || 'registered',
                lastSync: profile.last_sync || '',
                pdfConfigs: configs.map(c => ({
                    companyName: c.company_name || '',
                    customerCode: c.customer_code || '',
                    accountCode: c.account_code || '',
                    paymentCode: c.payment_code || ''
                }))
            });
        }
        
        res.json(result);
    } catch (error) {
        console.error("Error fetching profiles:", error);
        res.status(500).json({ error: 'Failed to fetch profiles' });
    }
});

router.post('/profiles', async (req, res) => {
    try {
        const { platform, username, password, software, peakCode, vatStatus, pdfConfigs } = req.body;
        
        if (!platform || !username || !password || !software) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const pool = getPool();
        const conn = await pool.getConnection();

        try {
            await conn.beginTransaction();

            const [maxRows] = await conn.execute("SELECT MAX(CAST(SUBSTRING(id, 5) AS UNSIGNED)) as maxNum FROM bot_profiles");
            const nextIdNum = (maxRows[0].maxNum || 0) + 1;
            const newId = `BOT-${String(nextIdNum).padStart(3, '0')}`;
            
            const encryptedPassword = encrypt(password);

            await conn.execute(
                `INSERT INTO bot_profiles 
                (id, platform, username, password, software, peak_code, status, last_sync, vat_status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [newId, platform, username, encryptedPassword, software, peakCode || '', 
                 'idle', 'ไม่เคยทำงาน', vatStatus || 'registered']
            );

            if (pdfConfigs && Array.isArray(pdfConfigs)) {
                for (const config of pdfConfigs) {
                    if (config.companyName || config.customerCode || config.accountCode || config.paymentCode) {
                        await conn.execute(
                            'INSERT INTO bot_pdf_configs (profile_id, company_name, customer_code, account_code, payment_code) VALUES (?, ?, ?, ?, ?)',
                            [newId, config.companyName || '', config.customerCode || '', config.accountCode || '', config.paymentCode || '']
                        );
                    }
                }
            }

            await conn.commit();

            const [newProfileRows] = await pool.execute('SELECT * FROM bot_profiles WHERE id = ?', [newId]);
            const [savedConfigs] = await pool.execute('SELECT * FROM bot_pdf_configs WHERE profile_id = ?', [newId]);
            const newProfile = newProfileRows[0];

            res.status(201).json({
                ...newProfile,
                password: password,
                peakCode: newProfile.peak_code,
                vatStatus: newProfile.vat_status,
                lastSync: newProfile.last_sync,
                pdfConfigs: savedConfigs.map(c => ({
                    companyName: c.company_name,
                    customerCode: c.customer_code,
                    accountCode: c.account_code,
                    paymentCode: c.payment_code
                }))
            });
        } catch (txError) {
            await conn.rollback();
            throw txError;
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error("Error creating profile:", error);
        res.status(500).json({ error: 'Failed to create profile' });
    }
});

// UPDATE PROFILE
router.put('/profiles/:id', async (req, res) => {
    try {
        const { platform, username, password, software, peakCode, vatStatus, pdfConfigs } = req.body;
        const pool = getPool();
        const conn = await pool.getConnection();

        try {
            await conn.beginTransaction();

            const encryptedPassword = encrypt(password);
            await conn.execute(
                `UPDATE bot_profiles SET platform=?, username=?, password=?, software=?, peak_code=?, vat_status=? WHERE id=?`,
                [platform, username, encryptedPassword, software, peakCode || '', vatStatus || 'registered', req.params.id]
            );

            // Replace PDF configs
            await conn.execute('DELETE FROM bot_pdf_configs WHERE profile_id = ?', [req.params.id]);
            if (pdfConfigs && Array.isArray(pdfConfigs)) {
                for (const config of pdfConfigs) {
                    if (config.companyName || config.customerCode || config.accountCode || config.paymentCode) {
                        await conn.execute(
                            'INSERT INTO bot_pdf_configs (profile_id, company_name, customer_code, account_code, payment_code) VALUES (?, ?, ?, ?, ?)',
                            [req.params.id, config.companyName || '', config.customerCode || '', config.accountCode || '', config.paymentCode || '']
                        );
                    }
                }
            }

            await conn.commit();
            res.json({ success: true });
        } catch (txError) {
            await conn.rollback();
            throw txError;
        } finally {
            conn.release();
        }
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

router.delete('/profiles/:id', async (req, res) => {
    try {
        const pool = getPool();
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            await conn.execute('DELETE FROM bot_pdf_configs WHERE profile_id = ?', [req.params.id]);
            await conn.execute('DELETE FROM bot_profiles WHERE id = ?', [req.params.id]);
            await conn.commit();
        } catch (txError) {
            await conn.rollback();
            throw txError;
        } finally {
            conn.release();
        }
        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting profile:", error);
        res.status(500).json({ error: 'Failed to delete profile' });
    }
});

module.exports = router;
