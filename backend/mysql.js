const mysql = require('mysql2/promise');

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
            connectionLimit: 50,            // เพิ่ม Limit เพื่อรองรับ Worker หลายตัว (ลดปัญหา connection เต็ม)
            queueLimit: 0,                  // 0 = queue ได้ไม่จำกัด รอ connection ว่างได้
            charset: 'utf8mb4',
            connectTimeout: 20000,          // เพิ่ม timeout ช่วงต่อ DB (แก้ ETIMEDOUT)
            // ── Auto-Reconnect & Keep-Alive ──
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,   
            idleTimeout: 60000,             
            maxIdle: 20,                    // เก็บ connection เปล่าไว้เยอะหน่อย ลด overhead การสร้างใหม่
        });

        // ── Pool Error Handler — ป้องกัน crash จาก ECONNRESET ──
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
        // Connect without specifying database first to create it if needed
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

        // Now create tables using pool
        const p = getPool();

        await p.execute(`
            CREATE TABLE IF NOT EXISTS companies (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                group_code  VARCHAR(50) NOT NULL COMMENT 'รหัสภายใน เช่น Build000',
                company_name VARCHAR(255) NOT NULL COMMENT 'ชื่อบริษัท',
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_group_code (group_code)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Migration: add group_code if table already exists without it
        try {
            await p.execute(`ALTER TABLE companies ADD COLUMN group_code VARCHAR(50) NOT NULL DEFAULT '' COMMENT 'รหัสภายใน' AFTER id`);
            await p.execute(`ALTER TABLE companies ADD INDEX idx_group_code (group_code)`);
        } catch (e) { /* column already exists */ }

        await p.execute(`
            CREATE TABLE IF NOT EXISTS company_codes (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                company_id  INT NOT NULL,
                code_type   ENUM('account', 'payment') NOT NULL COMMENT 'ประเภท: account=บันทึกบัญชี, payment=ตัดชำระ',
                code        VARCHAR(50) NOT NULL COMMENT 'โค้ด',
                description VARCHAR(500) DEFAULT NULL COMMENT 'คำอธิบาย',
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await p.execute(`
            CREATE TABLE IF NOT EXISTS usage_logs (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                user_id       INT DEFAULT NULL COMMENT 'รหัสผู้ใช้ (from JWT)',
                username      VARCHAR(100) DEFAULT NULL COMMENT 'ชื่อผู้ใช้',
                page          VARCHAR(50) NOT NULL COMMENT 'หน้าที่เข้า: manage / tools',
                path_used     VARCHAR(500) DEFAULT NULL COMMENT 'Path ที่ใช้งาน',
                company_code  VARCHAR(100) DEFAULT NULL COMMENT 'รหัสบริษัท เช่น Build000',
                company_name  VARCHAR(255) DEFAULT NULL COMMENT 'ชื่อบริษัท เช่น Build000 ทดสอบระบบ',
                action        VARCHAR(50) DEFAULT 'browse' COMMENT 'การกระทำ: browse, rename, batch_rename',
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_company_code (company_code),
                INDEX idx_page (page),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Company Master Data — auto-populated from OCR results
        await p.execute(`
            CREATE TABLE IF NOT EXISTS companies_master (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                tax_id          VARCHAR(20) NOT NULL UNIQUE,
                name_th         VARCHAR(255) DEFAULT NULL COMMENT 'ชื่อบริษัท (ไทย)',
                name_en         VARCHAR(255) DEFAULT NULL COMMENT 'ชื่อบริษัท (อังกฤษ)',
                address         TEXT DEFAULT NULL COMMENT 'ที่อยู่',
                tax_id_valid    TINYINT(1) DEFAULT 0 COMMENT 'เลขผู้เสียภาษีถูกต้อง',
                verified        TINYINT(1) DEFAULT 0 COMMENT 'ยืนยันข้อมูลแล้ว',
                source          VARCHAR(50) DEFAULT 'ocr' COMMENT 'แหล่งที่มา',
                times_seen      INT DEFAULT 1 COMMENT 'จำนวนครั้งที่พบ',
                first_seen_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_tax_id (tax_id),
                INDEX idx_verified (verified),
                INDEX idx_last_seen (last_seen_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        // OCR History — บันทึกประวัติไฟล์ที่อ่าน OCR แล้ว (ป้องกันอ่านซ้ำ)
        await p.execute(`
            CREATE TABLE IF NOT EXISTS ocr_history (
                id                INT AUTO_INCREMENT PRIMARY KEY,
                file_name         VARCHAR(500) NOT NULL COMMENT 'ชื่อไฟล์',
                file_path         VARCHAR(1000) DEFAULT NULL COMMENT 'Path เต็มของไฟล์',
                document_type     VARCHAR(100) DEFAULT NULL COMMENT 'ประเภทเอกสาร',
                document_number   VARCHAR(100) DEFAULT NULL COMMENT 'เลขที่เอกสาร',
                document_date     VARCHAR(20) DEFAULT NULL COMMENT 'วันที่เอกสาร',
                seller_name       VARCHAR(255) DEFAULT NULL COMMENT 'ชื่อผู้ขาย',
                seller_tax_id     VARCHAR(20) DEFAULT NULL COMMENT 'เลขผู้เสียภาษีผู้ขาย',
                seller_branch     VARCHAR(10) DEFAULT NULL COMMENT 'สาขาผู้ขาย',
                seller_address    TEXT DEFAULT NULL COMMENT 'ที่อยู่ผู้ขาย',
                buyer_name        VARCHAR(255) DEFAULT NULL COMMENT 'ชื่อผู้ซื้อ',
                buyer_tax_id      VARCHAR(20) DEFAULT NULL COMMENT 'เลขผู้เสียภาษีผู้ซื้อ',
                buyer_address     TEXT DEFAULT NULL COMMENT 'ที่อยู่ผู้ซื้อ',
                subtotal          VARCHAR(20) DEFAULT NULL COMMENT 'มูลค่าก่อน VAT',
                vat               VARCHAR(20) DEFAULT NULL COMMENT 'ภาษีมูลค่าเพิ่ม',
                total             VARCHAR(20) DEFAULT NULL COMMENT 'ยอดรวมสุทธิ',
                processing_time_ms INT DEFAULT NULL COMMENT 'เวลาประมวลผล (ms)',
                ocr_by            VARCHAR(100) DEFAULT NULL COMMENT 'ผู้สั่ง OCR',
                batch_job_id      VARCHAR(100) DEFAULT NULL COMMENT 'Batch Job ID (ถ้ามี)',
                status            VARCHAR(20) DEFAULT 'done' COMMENT 'สถานะ: done, error',
                created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_file_name (file_name(255)),
                INDEX idx_seller_tax (seller_tax_id),
                INDEX idx_buyer_tax (buyer_tax_id),
                INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Migration: add seller_branch to ocr_history (if not exists)
        try {
            await p.execute(`ALTER TABLE ocr_history ADD COLUMN seller_branch VARCHAR(10) DEFAULT NULL COMMENT 'สาขาผู้ขาย' AFTER seller_tax_id`);
            console.log('  📦 Migration: added seller_branch column');
        } catch (e) { 
            if (e.code !== 'ER_DUP_FIELDNAME') console.error('  ⚠️ Migration seller_branch failed:', e.message);
        }

        // Migration: add seller_address and buyer_address to ocr_history
        try {
            await p.execute(`ALTER TABLE ocr_history ADD COLUMN seller_address TEXT DEFAULT NULL COMMENT 'ที่อยู่ผู้ขาย' AFTER seller_branch`);
            console.log('  📦 Migration: added seller_address column');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') console.error('  ⚠️ Migration seller_address failed:', e.message);
        }
        
        try {
            await p.execute(`ALTER TABLE ocr_history ADD COLUMN buyer_address TEXT DEFAULT NULL COMMENT 'ที่อยู่ผู้ซื้อ' AFTER buyer_tax_id`);
            console.log('  📦 Migration: added buyer_address column');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') console.error('  ⚠️ Migration buyer_address failed:', e.message);
        }

        // Migration: add updated_at to ocr_history (if not exists)
        try {
            await p.execute(`ALTER TABLE ocr_history ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP`);
            console.log('  📦 Migration: added updated_at column');
        } catch (e) {
            if (e.code !== 'ER_DUP_FIELDNAME') console.error('  ⚠️ Migration updated_at failed:', e.message);
        }

        // Migration: add build_code/build_name to ocr_history (if not exists)
        try {
            await p.execute(`ALTER TABLE ocr_history ADD COLUMN build_code VARCHAR(50) DEFAULT NULL`);
            await p.execute(`ALTER TABLE ocr_history ADD COLUMN build_name VARCHAR(255) DEFAULT NULL`);
            console.log('  📦 Migration: added build_code/build_name columns');
        } catch (e) { /* columns already exist */ }

        // Bot Database tables
        await p.execute(`
            CREATE TABLE IF NOT EXISTS bot_credentials (
                id          VARCHAR(20) PRIMARY KEY,
                name        VARCHAR(255) NOT NULL,
                username    VARCHAR(255) NOT NULL,
                password    TEXT NOT NULL,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await p.execute(`
            CREATE TABLE IF NOT EXISTS bot_profiles (
                id          VARCHAR(20) PRIMARY KEY,
                platform    VARCHAR(100) NOT NULL,
                username    VARCHAR(255) NOT NULL,
                password    TEXT NOT NULL,
                software    VARCHAR(100) NOT NULL,
                peak_code   VARCHAR(50) DEFAULT NULL,
                status      VARCHAR(20) DEFAULT 'idle',
                last_sync   VARCHAR(100) DEFAULT 'ไม่เคยทำงาน',
                vat_status  VARCHAR(20) DEFAULT 'registered',
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await p.execute(`
            CREATE TABLE IF NOT EXISTS bot_pdf_configs (
                id          INT AUTO_INCREMENT PRIMARY KEY,
                profile_id  VARCHAR(20) NOT NULL,
                company_name VARCHAR(255) DEFAULT NULL,
                customer_code VARCHAR(50) DEFAULT NULL,
                account_code VARCHAR(50) DEFAULT NULL,
                payment_code VARCHAR(50) DEFAULT NULL,
                FOREIGN KEY (profile_id) REFERENCES bot_profiles(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        console.log('✅ MySQL connected & tables ready (Bot_server_js)');
    } catch (err) {
        console.error('❌ MySQL init error:', err.message);
    }
}

module.exports = { getPool, initMySQL };
