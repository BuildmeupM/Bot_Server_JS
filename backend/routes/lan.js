const express = require('express');
const router = express.Router();
const os = require('os');
const { getDB } = require('../database');

// Ensure settings table exists
function ensureSettingsTable() {
    const db = getDB();
    db.exec(`
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

// Get local IP addresses
function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip internal (loopback) and non-IPv4
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push({ name, address: iface.address });
            }
        }
    }
    return ips;
}

// GET /api/lan — get current LAN access status
router.get('/', (req, res) => {
    try {
        ensureSettingsTable();
        const db = getDB();
        const row = db.prepare("SELECT value FROM app_settings WHERE key = 'lan_access_enabled'").get();
        const enabled = row ? row.value === 'true' : false;
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
router.post('/', (req, res) => {
    try {
        ensureSettingsTable();
        const db = getDB();
        const { enabled } = req.body;

        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled must be boolean' });
        }

        db.prepare(`
            INSERT INTO app_settings (key, value, updated_at) 
            VALUES ('lan_access_enabled', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run(String(enabled));

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
