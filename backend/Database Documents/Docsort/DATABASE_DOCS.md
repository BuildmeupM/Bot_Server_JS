# 📦 Database Documentation — Bot_server_js

> อัพเดทล่าสุด: 2026-02-19  
> เซิร์ฟเวอร์: buildmeupconsultant.direct.quickconnect.to:3306  
> ฐานข้อมูล: `Bot_server_js`  
> Charset: utf8mb4 / Collation: utf8mb4_unicode_ci

---

## 📊 ภาพรวมตาราง

| # | ตาราง | คำอธิบาย | ความสัมพันธ์ |
|---|-------|---------|-------------|
| 1 | `companies` | ข้อมูลบริษัท (จัดกลุ่มตาม group_code) | ← company_codes |
| 2 | `company_codes` | โค้ดบันทึกบัญชี / โค้ดตัดชำระ | → companies (FK) |
| 3 | `usage_logs` | ล็อกการใช้งานระบบ (จัดการไฟล์/เอกสาร) | — |

---

## 🏢 ตาราง `companies`

> เก็บข้อมูลบริษัท โดยจัดกลุ่มภายใต้รหัสภายใน (group_code)

| คอลัมน์ | ชนิดข้อมูล | Null | Default | คำอธิบาย |
|---------|-----------|------|---------|----------|
| `id` | INT | NO | AUTO_INCREMENT | Primary Key |
| `group_code` | VARCHAR(50) | NO | — | รหัสภายใน เช่น Build000 |
| `company_name` | VARCHAR(255) | NO | — | ชื่อบริษัท |
| `created_at` | TIMESTAMP | YES | CURRENT_TIMESTAMP | วันที่สร้าง |
| `updated_at` | TIMESTAMP | YES | CURRENT_TIMESTAMP (ON UPDATE) | วันที่อัพเดทล่าสุด |

**Indexes:**
- `PRIMARY` — `id`
- `idx_group_code` — `group_code`

---

## 💳 ตาราง `company_codes`

> เก็บโค้ดบันทึกบัญชีและโค้ดตัดชำระ (หลายโค้ดต่อ 1 บริษัท)

| คอลัมน์ | ชนิดข้อมูล | Null | Default | คำอธิบาย |
|---------|-----------|------|---------|----------|
| `id` | INT | NO | AUTO_INCREMENT | Primary Key |
| `company_id` | INT | NO | — | FK → companies.id |
| `code_type` | ENUM('account','payment') | NO | — | ประเภท: account=บันทึกบัญชี, payment=ตัดชำระ |
| `code` | VARCHAR(50) | NO | — | รหัสโค้ด |
| `description` | VARCHAR(500) | YES | NULL | คำอธิบายโค้ด |
| `created_at` | TIMESTAMP | YES | CURRENT_TIMESTAMP | วันที่สร้าง |

**Indexes:**
- `PRIMARY` — `id`

**Foreign Keys:**
- `company_id` → `companies.id` (ON DELETE CASCADE)

---

## 📋 ตาราง `usage_logs`

> เก็บล็อกการเข้าใช้งานระบบจัดการไฟล์และจัดการเอกสาร  
> ดึงข้อมูลบริษัทจาก path เช่น `V:\...\Build000 ทดสอบระบบ\...` → company_name = `Build000 ทดสอบระบบ`

| คอลัมน์ | ชนิดข้อมูล | Null | Default | คำอธิบาย |
|---------|-----------|------|---------|----------|
| `id` | INT | NO | AUTO_INCREMENT | Primary Key |
| `user_id` | INT | YES | NULL | รหัสผู้ใช้ (จาก JWT) |
| `username` | VARCHAR(100) | YES | NULL | ชื่อผู้ใช้ |
| `page` | VARCHAR(50) | NO | — | หน้าที่เข้า: `manage` / `tools` |
| `path_used` | VARCHAR(500) | YES | NULL | Path ที่ใช้งาน |
| `company_code` | VARCHAR(100) | YES | NULL | รหัสบริษัท เช่น Build000 |
| `company_name` | VARCHAR(255) | YES | NULL | ชื่อบริษัท เช่น Build000 ทดสอบระบบ |
| `action` | VARCHAR(50) | YES | 'browse' | การกระทำ: browse, rename, batch_rename |
| `created_at` | TIMESTAMP | YES | CURRENT_TIMESTAMP | เวลาที่เข้าใช้ |

**Indexes:**
- `PRIMARY` — `id`
- `idx_company_code` — `company_code`
- `idx_page` — `page`
- `idx_created_at` — `created_at`

---

## 🔗 ER Diagram

```
┌──────────────────────────┐       ┌──────────────────────────────┐
│       companies          │       │       company_codes           │
├──────────────────────────┤       ├──────────────────────────────┤
│ PK  id            INT    │──┐    │ PK  id            INT        │
│     group_code    VAR50  │  │    │ FK  company_id    INT        │
│     company_name  VAR255 │  └───>│     code_type     ENUM       │
│     created_at    TS     │       │     code          VAR50      │
│     updated_at    TS     │       │     description   VAR500     │
└──────────────────────────┘       │     created_at    TS         │
                            1 : N  └──────────────────────────────┘

┌──────────────────────────────────────┐
│            usage_logs                │
├──────────────────────────────────────┤
│ PK  id              INT             │
│     user_id         INT             │
│     username        VAR100          │
│     page            VAR50           │
│     path_used       VAR500          │
│     company_code    VAR100          │
│     company_name    VAR255          │
│     action          VAR50           │
│     created_at      TS              │
└──────────────────────────────────────┘
```

---

## 📝 หมายเหตุ

- บริษัท 1 แห่ง สามารถมีได้หลาย **โค้ดบันทึกบัญชี** (account) และหลาย **โค้ดตัดชำระ** (payment)
- เมื่อลบบริษัท → โค้ดทั้งหมดของบริษัทนั้นจะถูกลบอัตโนมัติ (CASCADE)
- `group_code` ใช้จัดกลุ่มบริษัทตามรหัสภายใน เช่น Build000, Build001
- `usage_logs` บันทึกอัตโนมัติทุกครั้งที่ผู้ใช้เปิดโฟลเดอร์, เปลี่ยนชื่อไฟล์ หรือเปลี่ยนชื่อชุด
- ตารางถูกสร้างอัตโนมัติเมื่อ backend server เริ่มทำงาน (`mysql.js → initMySQL()`)

