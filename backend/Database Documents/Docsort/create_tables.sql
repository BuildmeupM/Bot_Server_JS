-- ========================================
-- สร้างฐานข้อมูล Bot_server_js
-- ========================================
CREATE DATABASE IF NOT EXISTS `Bot_server_js` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `Bot_server_js`;

-- ========================================
-- ตาราง companies (ข้อมูลบริษัท)
-- ========================================
CREATE TABLE IF NOT EXISTS `companies` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `group_code` VARCHAR(50) NOT NULL COMMENT 'รหัสภายใน เช่น Build000',
    `company_name` VARCHAR(255) NOT NULL COMMENT 'ชื่อบริษัท',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_group_code` (`group_code`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ========================================
-- ตาราง company_codes (โค้ดบันทึกบัญชี/ตัดชำระ)
-- ========================================
CREATE TABLE IF NOT EXISTS `company_codes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `company_id` INT NOT NULL COMMENT 'FK -> companies.id',
    `code_type` ENUM('account', 'payment') NOT NULL COMMENT 'ประเภท: account=โค้ดบันทึกบัญชี, payment=โค้ดตัดชำระ',
    `code` VARCHAR(50) NOT NULL COMMENT 'รหัสโค้ด',
    `description` VARCHAR(500) DEFAULT NULL COMMENT 'คำอธิบาย',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ========================================
-- ตาราง usage_logs (ล็อกการใช้งานระบบ)
-- ========================================
CREATE TABLE IF NOT EXISTS `usage_logs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT DEFAULT NULL COMMENT 'รหัสผู้ใช้ (from JWT)',
    `username` VARCHAR(100) DEFAULT NULL COMMENT 'ชื่อผู้ใช้',
    `page` VARCHAR(50) NOT NULL COMMENT 'หน้าที่เข้า: manage / tools',
    `path_used` VARCHAR(500) DEFAULT NULL COMMENT 'Path ที่ใช้งาน',
    `company_code` VARCHAR(100) DEFAULT NULL COMMENT 'รหัสบริษัท เช่น Build000',
    `company_name` VARCHAR(255) DEFAULT NULL COMMENT 'ชื่อบริษัท เช่น Build000 ทดสอบระบบ',
    `action` VARCHAR(50) DEFAULT 'browse' COMMENT 'การกระทำ: browse, rename, batch_rename',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_company_code` (`company_code`),
    INDEX `idx_page` (`page`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- ========================================
-- ตาราง companies_master (ข้อมูลบริษัทจาก OCR)
-- เก็บข้อมูลบริษัทที่พบจากการอ่านเอกสาร OCR
-- ระบบจะ auto-save ทุกครั้งที่ OCR อ่านเอกสารสำเร็จ
-- ใช้ Tax ID เป็น unique key สำหรับ upsert
-- ========================================
CREATE TABLE IF NOT EXISTS `companies_master` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `tax_id` VARCHAR(20) NOT NULL UNIQUE COMMENT 'เลขผู้เสียภาษี 13 หลัก',
    `name_th` VARCHAR(255) DEFAULT NULL COMMENT 'ชื่อบริษัท (ภาษาไทย)',
    `name_en` VARCHAR(255) DEFAULT NULL COMMENT 'ชื่อบริษัท (ภาษาอังกฤษ)',
    `address` TEXT DEFAULT NULL COMMENT 'ที่อยู่บริษัท',
    `tax_id_valid` TINYINT(1) DEFAULT 0 COMMENT 'ผลตรวจ checksum: 0=ไม่ผ่าน, 1=ผ่าน',
    `verified` TINYINT(1) DEFAULT 0 COMMENT 'ผู้ใช้ตรวจสอบแล้ว: 0=ยังไม่ตรวจ, 1=ตรวจแล้ว',
    `source` VARCHAR(50) DEFAULT 'ocr' COMMENT 'แหล่งที่มา: ocr, manual',
    `times_seen` INT DEFAULT 1 COMMENT 'จำนวนครั้งที่พบจาก OCR',
    `first_seen_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'วันที่พบครั้งแรก',
    `last_seen_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'วันที่พบล่าสุด',
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'วันที่อัพเดทล่าสุด',
    INDEX `idx_companies_tax_id` (`tax_id`),
    INDEX `idx_companies_verified` (`verified`),
    INDEX `idx_companies_last_seen` (`last_seen_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;