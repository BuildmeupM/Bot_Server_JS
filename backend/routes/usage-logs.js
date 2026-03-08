const express = require('express');
const authMiddleware = require('../middleware/auth');
const { getPool } = require('../mysql');

const router = express.Router();

// ── Helper: Extract company info from path ──
function extractCompanyFromPath(pathStr) {
    if (!pathStr) return { company_code: null, company_name: null };
    const parts = pathStr.replace(/\\/g, '/').split('/');
    for (const part of parts) {
        const match = part.match(/^(Build\d+)/i);
        if (match) {
            return {
                company_code: match[1],
                company_name: part.trim()
            };
        }
    }
    return { company_code: null, company_name: null };
}

// ── POST /api/usage-logs — Record a usage log ──
router.post('/', authMiddleware, async (req, res) => {
    try {
        const pool = getPool();
        const { page, path_used, action = 'browse' } = req.body;

        if (!page) return res.status(400).json({ error: 'กรุณาระบุหน้าที่ใช้งาน' });

        const { company_code, company_name } = extractCompanyFromPath(path_used);

        await pool.execute(
            `INSERT INTO usage_logs (user_id, username, page, path_used, company_code, company_name, action)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user?.id || null,
                req.user?.username || req.user?.display_name || null,
                page,
                path_used || null,
                company_code,
                company_name,
                action
            ]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Usage log error:', err);
        res.status(500).json({ error: 'ไม่สามารถบันทึก log ได้' });
    }
});

// ── GET /api/usage-logs/summary — Dashboard summary ──
router.get('/summary', authMiddleware, async (req, res) => {
    try {
        const pool = getPool();
        const { date_from, date_to } = req.query;

        let dateFilter = '';
        const params = [];
        if (date_from) {
            dateFilter += ' AND created_at >= ?';
            params.push(date_from);
        }
        if (date_to) {
            dateFilter += ' AND created_at <= ?';
            params.push(date_to + ' 23:59:59');
        }

        // 1) Stats overview
        const [totalRows] = await pool.execute(
            `SELECT COUNT(*) as total FROM usage_logs WHERE 1=1 ${dateFilter}`, params
        );
        const [todayRows] = await pool.execute(
            `SELECT COUNT(*) as today FROM usage_logs WHERE DATE(created_at) = CURDATE() ${dateFilter}`, params
        );
        const [uniqueCompanies] = await pool.execute(
            `SELECT COUNT(DISTINCT company_name) as count FROM usage_logs WHERE company_name IS NOT NULL ${dateFilter}`, params
        );
        const [uniqueUsers] = await pool.execute(
            `SELECT COUNT(DISTINCT username) as count FROM usage_logs WHERE username IS NOT NULL ${dateFilter}`, params
        );

        // 2) By company
        const [byCompany] = await pool.execute(
            `SELECT company_code, company_name, 
                    COUNT(*) as total_visits,
                    COUNT(DISTINCT username) as unique_users,
                    MAX(created_at) as last_visit,
                    SUM(CASE WHEN page='manage' THEN 1 ELSE 0 END) as manage_count,
                    SUM(CASE WHEN page='tools' THEN 1 ELSE 0 END) as tools_count
             FROM usage_logs 
             WHERE company_name IS NOT NULL ${dateFilter}
             GROUP BY company_code, company_name 
             ORDER BY total_visits DESC`, params
        );

        // 3) By page
        const [byPage] = await pool.execute(
            `SELECT page, COUNT(*) as count FROM usage_logs WHERE 1=1 ${dateFilter} GROUP BY page`, params
        );

        // 4) Recent logs (last 30)
        const [recentLogs] = await pool.execute(
            `SELECT id, username, page, path_used, company_code, company_name, action, created_at 
             FROM usage_logs 
             ORDER BY created_at DESC LIMIT 30`
        );

        // 5) Daily trend (last 14 days)
        const [dailyTrend] = await pool.execute(
            `SELECT DATE(created_at) as date, COUNT(*) as count
             FROM usage_logs
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
             GROUP BY DATE(created_at)
             ORDER BY date ASC`
        );

        res.json({
            stats: {
                total: totalRows[0].total,
                today: todayRows[0].today,
                unique_companies: uniqueCompanies[0].count,
                unique_users: uniqueUsers[0].count
            },
            by_company: byCompany,
            by_page: byPage,
            recent_logs: recentLogs,
            daily_trend: dailyTrend
        });
    } catch (err) {
        console.error('Usage summary error:', err);
        res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลสรุปได้' });
    }
});

// ── DELETE /api/usage-logs/:id — Delete a single log entry ──
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const pool = getPool();
        const [result] = await pool.execute('DELETE FROM usage_logs WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'ไม่พบ log ที่ต้องการลบ' });
        }
        res.json({ success: true, message: 'ลบ log สำเร็จ' });
    } catch (err) {
        console.error('Delete log error:', err);
        res.status(500).json({ error: 'ไม่สามารถลบ log ได้' });
    }
});

module.exports = router;
