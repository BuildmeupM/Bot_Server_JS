const express = require('express');
const router = express.Router();
const os = require('os');
const { getPool } = require('../mysql');

// Get local IP addresses
function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push({ name, address: iface.address });
            }
        }
    }
    return ips;
}

// GET /api/lan — get current LAN access status
router.get('/', async (req, res) => {
    try {
        const pool = getPool();
        const [rows] = await pool.execute("SELECT value FROM app_settings WHERE `key` = ?", ['lan_access_enabled']);
        const enabled = rows.length > 0 ? rows[0].value === 'true' : false;
        const ips = getLocalIPs();

        res.json({
            enabled,
            ips,
            port: 5173,
            urls: enabled ? ips.map(ip => `http://${ip.address}:5173`) : []
        });
    } catch (err) {
        console.error('❌ LAN status error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/lan — toggle LAN access
router.post('/', async (req, res) => {
    try {
        const pool = getPool();
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled must be boolean' });
        }

        await pool.execute(
            `INSERT INTO app_settings (\`key\`, value) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP`,
            ['lan_access_enabled', String(enabled)]
        );

        const ips = getLocalIPs();

        console.log(`🌐 LAN access ${enabled ? 'ENABLED' : 'DISABLED'}`);
        if (enabled && ips.length > 0) {
            console.log(`   Access URLs: ${ips.map(ip => `http://${ip.address}:5173`).join(', ')}`);
        }

        res.json({
            enabled,
            ips,
            port: 5173,
            urls: enabled ? ips.map(ip => `http://${ip.address}:5173`) : []
        });
    } catch (err) {
        console.error('❌ LAN toggle error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
