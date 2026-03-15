const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

let pool;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 50,
            queueLimit: 0,
            charset: 'utf8mb4',
            connectTimeout: 20000,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
            idleTimeout: 60000,
            maxIdle: 20,
        });

        pool.pool.on('connection', (conn) => {
            conn.on('error', (err) => {
                if (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.fatal) {
                    console.warn('⚠️ MySQL connection lost, pool will auto-reconnect:', err.code);
                }
            });
        });
    }
    return pool;
}

async function initMySQL() {
    try {
        // 1. Create database if not exists
        const tempConn = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectTimeout: 10000,
        });

        await tempConn.execute(
            `CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
        await tempConn.end();

        // 2. Run Knex migrations
        const knex = require('knex')(require('./knexfile'));
        try {
            const [batch, log] = await knex.migrate.latest();
            if (log.length > 0) {
                console.log(`  📦 Ran ${log.length} migration(s) (batch ${batch}):`);
                log.forEach((f) => console.log(`     ✅ ${f}`));
            }
        } finally {
            await knex.destroy(); // close Knex pool (we use our own mysql2 pool)
        }

        // 3. Seed admin user
        const p = getPool();
        const [adminRows] = await p.execute('SELECT id FROM users WHERE username = ?', ['admin']);
        if (adminRows.length === 0) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            await p.execute(
                'INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)',
                ['admin', hashedPassword, 'Admin User', 'admin']
            );
            console.log('  ✅ Default admin user created (admin / admin123)');
        }

        console.log('✅ MySQL connected & tables ready (Bot_server_js)');
    } catch (err) {
        console.error('❌ MySQL init error:', err.message);
    }
}

async function logActivity(userId, action, details, filePath) {
    try {
        const p = getPool();
        await p.execute(
            'INSERT INTO activity_log (user_id, action, details, file_path) VALUES (?, ?, ?, ?)',
            [userId || null, action, details || null, filePath || null]
        );
    } catch (err) {
        console.error('⚠️ logActivity error:', err.message);
    }
}

module.exports = { getPool, initMySQL, logActivity };
