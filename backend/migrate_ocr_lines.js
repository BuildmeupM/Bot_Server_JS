require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });
    try {
        const [cols] = await pool.query(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'ocr_history' AND COLUMN_NAME IN ('line_number', 'line_description')",
            [process.env.DB_NAME]
        );
        const existing = cols.map(c => c.COLUMN_NAME);
        console.log('Existing columns:', existing);

        if (existing.length >= 2) {
            console.log('Both columns already exist.');
        } else {
            const parts = [];
            if (!existing.includes('line_number')) parts.push('ADD COLUMN line_number INT DEFAULT 1');
            if (!existing.includes('line_description')) parts.push('ADD COLUMN line_description VARCHAR(100) DEFAULT NULL');
            const sql = 'ALTER TABLE ocr_history ' + parts.join(', ');
            console.log('Running:', sql);
            await pool.query(sql);
            console.log('Done!');
        }
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
})();
