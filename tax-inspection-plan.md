# 🔍 ระบบตรวจภาษี (Tax Inspection System)

> แผนพัฒนาระบบตรวจสอบความถูกต้องของข้อมูลภาษี สำหรับ DocSort Pro  
> สร้างเมื่อ: 21 มีนาคม 2569

---

## 📋 ภาพรวม

เพิ่มโมดูลใหม่ **"ระบบตรวจภาษี"** ในหน้า Home ของ DocSort Pro  
ภายในหน้าแบ่งเป็น **3 แถบ (Tabs)**:

| # | ชื่อแถบ | สถานะ | คำอธิบาย |
|---|---------|--------|----------|
| 1 | ตรวจภาษีหัก ณ ที่จ่าย | 🚧 โครงสร้าง | ตรวจสอบข้อมูลภาษีหัก ณ ที่จ่าย |
| 2 | ตรวจภาษีมูลค่าเพิ่ม | 🚧 โครงสร้าง | ตรวจสอบข้อมูล VAT |
| 3 | ระบบฝากอ่านข้อมูล - VAT | ✅ พัฒนาได้เลย | ฝากอ่าน OCR จาก path ที่ระบุ |

---

## ⚠️ สิ่งสำคัญ: ระบบ OCR แยกชุดใหม่

> ระบบตรวจภาษีจะใช้ **OCR ชุดใหม่ที่แยกออกจากระบบเดิม** อย่างสมบูรณ์!

### ระบบเดิม vs ระบบใหม่

| รายการ | ระบบเดิม (OCR ปกติ) | ระบบใหม่ (OCR Audit) |
|--------|---------------------|----------------------|
| **API Keys** | เก็บใน `.env` (AKSORN_OCR_KEY_1-8) | เก็บใน **MySQL** + กรอกผ่าน UI |
| **ชื่อ Model** | `API Key #1` - `API Key #8` | `AksornOcrModelAudit1` - `AksornOcrModelAudit8` |
| **จัดการ Key** | แก้ไฟล์ `.env` → restart server | กรอกผ่านหน้าเว็บได้เลย ไม่ต้อง restart |
| **History Table** | `ocr_history` | `ocr_audit_history` (table ใหม่) |
| **Route** | `/api/ocr/*` | `/api/tax-inspection/*` |
| **Round Robin** | ใช้ร่วมกัน | แยก round-robin เฉพาะ audit |

---

## 🏗 โครงสร้างไฟล์

```
📂 frontend/src/
├── 📂 pages/tax/
│   ├── WithholdingTaxPage.jsx        # (มีอยู่แล้ว) ออกใบ 50 ทวิ
│   ├── WithholdingTaxPage.css        # (มีอยู่แล้ว)
│   ├── TaxInspectionPage.jsx         # ← ใหม่: หน้าหลักระบบตรวจภาษี
│   └── TaxInspectionPage.css         # ← ใหม่: CSS
│
├── App.jsx                           # ← แก้ไข: เพิ่ม route /tax-inspection
├── 📂 components/
│   └── Sidebar.jsx                   # ← แก้ไข: เพิ่ม nav item
└── pages/
    └── HomePage.jsx                  # ← แก้ไข: เพิ่ม module card

📂 backend/
├── routes/
│   └── tax-inspection.js             # ← ใหม่: API routes (OCR Audit แยกชุด)
├── server.js                         # ← แก้ไข: register route
└── migrations/
    └── xxx_create_ocr_audit.js       # ← ใหม่: สร้าง table
```

---

## 📄 รายละเอียดแต่ละไฟล์

---

### 1. `TaxInspectionPage.jsx` (ใหม่)

หน้าหลักของระบบ — จัดการ Tab switching

```
┌──────────────────────────────────────────────────────┐
│  🔍 ตรวจภาษี                                         │
│  ระบบตรวจสอบความถูกต้องของข้อมูลภาษี                  │
├──────────────────────────────────────────────────────┤
│  [Tab 1]  │  [Tab 2]  │  [Tab 3 ✨]                  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  (เนื้อหาแต่ละ tab — ดูรายละเอียดด้านล่าง)             │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Component structure:**

```
TaxInspectionPage
├── Header (ชื่อระบบ + คำอธิบาย)
├── TabBar
│   ├── Tab "ตรวจภาษีหัก ณ ที่จ่าย"
│   ├── Tab "ตรวจภาษีมูลค่าเพิ่ม"
│   └── Tab "ระบบฝากอ่านข้อมูล - VAT"  (default active)
└── TabContent
    ├── [Tab 1] → Placeholder 🚧
    ├── [Tab 2] → Placeholder 🚧
    └── [Tab 3] → VatOcrQueueSection
```

---

### 2. Tab 3: ระบบฝากอ่านข้อมูล — VAT (UI ละเอียด)

```
┌─────────────────────────────────────────────────────────┐
│  📥 ระบบฝากอ่านข้อมูล OCR                                │
│                                                         │
│  ┌─── 🔑 จัดการ API Keys ──────────────────────────────┐│
│  │                                                     ││
│  │  AksornOcrModelAudit1  [ ak_xxxx...xxxx ] [✅][🗑]  ││
│  │  AksornOcrModelAudit2  [ ak_xxxx...xxxx ] [✅][🗑]  ││
│  │  AksornOcrModelAudit3  [___กรอก API Key___] [💾]    ││
│  │  AksornOcrModelAudit4  [___กรอก API Key___] [💾]    ││
│  │  AksornOcrModelAudit5  [___กรอก API Key___] [💾]    ││
│  │  AksornOcrModelAudit6  [___กรอก API Key___] [💾]    ││
│  │  AksornOcrModelAudit7  [___กรอก API Key___] [💾]    ││
│  │  AksornOcrModelAudit8  [___กรอก API Key___] [💾]    ││
│  │                                                     ││
│  │  สถานะ: ✅ พร้อมใช้ 2/8 keys   [ ตรวจสอบทั้งหมด ]   ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌─── 📁 สั่งอ่าน OCR ────────────────────────────────┐│
│  │  📁 ที่อยู่ไฟล์หรือโฟลเดอร์                          ││
│  │  ┌──────────────────────────────────────────┐       ││
│  │  │ V:/โฟลเดอร์/บริษัท/2025-01              │       ││
│  │  └──────────────────────────────────────────┘       ││
│  │  💡 ระบุ path สำหรับอ่าน OCR (ใช้ API Key ชุด Audit) ││
│  │                                                     ││
│  │  [ 🚀 เริ่มอ่านข้อมูล OCR ]                          ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌─── 📊 สถานะ Queue ─────────────────────────────────┐│
│  │  📭 ยังไม่มีคิวที่กำลังทำงาน                         ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

### 3. MySQL — ตารางใหม่

#### Table: `ocr_audit_api_keys`
เก็บ API Keys สำหรับ OCR Audit (สามารถกรอก/แก้ไขผ่าน UI)

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT AUTO_INCREMENT | PK |
| `slot_number` | TINYINT (1-8) | ช่อง 1-8 |
| `slot_name` | VARCHAR(50) | `AksornOcrModelAudit1`...`8` |
| `api_key` | VARCHAR(255) | API Key (เข้ารหัสเก็บ) |
| `status` | ENUM('active','inactive','error') | สถานะ |
| `last_checked_at` | DATETIME | ตรวจสุดท้ายเมื่อไร |
| `last_check_result` | TEXT | ผลตรวจล่าสุด (JSON) |
| `created_at` | DATETIME | สร้างเมื่อ |
| `updated_at` | DATETIME | อัปเดตเมื่อ |

#### Table: `ocr_audit_history`
เก็บ history สำหรับ OCR ชุด Audit (แยกจาก `ocr_history` เดิม)

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT AUTO_INCREMENT | PK |
| `file_name` | VARCHAR(500) | ชื่อไฟล์ |
| `file_path` | TEXT | path เต็ม |
| `document_type` | VARCHAR(100) | ประเภทเอกสาร |
| `document_number` | VARCHAR(100) | เลขที่เอกสาร |
| `document_date` | VARCHAR(50) | วันที่เอกสาร |
| `seller_name` | VARCHAR(255) | ชื่อผู้ขาย |
| `seller_tax_id` | VARCHAR(20) | เลขผู้เสียภาษีผู้ขาย |
| `buyer_name` | VARCHAR(255) | ชื่อผู้ซื้อ |
| `buyer_tax_id` | VARCHAR(20) | เลขผู้เสียภาษีผู้ซื้อ |
| `subtotal` | VARCHAR(50) | มูลค่าก่อน VAT |
| `vat` | VARCHAR(50) | VAT |
| `total` | VARCHAR(50) | ยอดรวม |
| `processing_time_ms` | INT | เวลาประมวลผล |
| `ocr_by` | VARCHAR(50) | ชื่อ key ที่ใช้ |
| `status` | ENUM('done','error','processing') | สถานะ |
| `batch_job_id` | VARCHAR(100) | Job ID |
| `created_at` | DATETIME | สร้างเมื่อ |

#### Table: `ocr_audit_queue`
คิวสำหรับสั่งอ่าน OCR

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT AUTO_INCREMENT | PK |
| `folder_path` | TEXT | path ที่สั่งอ่าน |
| `total_files` | INT | จำนวนไฟล์ทั้งหมด |
| `processed_files` | INT DEFAULT 0 | ประมวลผลแล้ว |
| `success_count` | INT DEFAULT 0 | สำเร็จ |
| `error_count` | INT DEFAULT 0 | ผิดพลาด |
| `status` | ENUM('pending','running','done','error') | สถานะ queue |
| `started_at` | DATETIME | เริ่มเมื่อ |
| `completed_at` | DATETIME | เสร็จเมื่อ |
| `created_at` | DATETIME | สร้างเมื่อ |

---

### 4. Backend API — `tax-inspection.js`

ใช้ route `/api/tax-inspection/` — **แยกออกจาก `/api/ocr/` เดิมทั้งหมด**

#### API Key Management

```
GET    /api/tax-inspection/api-keys          → ดู keys ทั้ง 8 slots
PUT    /api/tax-inspection/api-keys/:slot     → บันทึก/แก้ไข key ของ slot
DELETE /api/tax-inspection/api-keys/:slot     → ลบ key ออกจาก slot
POST   /api/tax-inspection/api-keys/check     → ตรวจสอบสถานะ keys ทั้งหมด
POST   /api/tax-inspection/api-keys/check/:slot → ตรวจเฉพาะ slot
```

#### OCR Queue

```
POST   /api/tax-inspection/ocr-queue          → สั่งอ่าน OCR จาก path
GET    /api/tax-inspection/ocr-queue           → ดูสถานะ queue ปัจจุบัน
GET    /api/tax-inspection/ocr-queue/:id       → ดูรายละเอียด job
```

#### OCR Processing (ภายใน)

- ใช้ keys จาก `ocr_audit_api_keys` table (ไม่ใช่ `.env`)
- Round-robin เฉพาะ keys ที่ status = `active`
- เรียก AksornOCR API เดียวกัน (`key-extract`) แต่ใช้ keys ชุด Audit
- เก็บผลลัพธ์ใน `ocr_audit_history` (ไม่ปนกับ `ocr_history` เดิม)

---

### 5. `App.jsx` (แก้ไข)

```diff
+ import TaxInspectionPage from './pages/tax/TaxInspectionPage'

  <Route path="/tax-certificate" element={...} />
+ <Route path="/tax-inspection" element={
+     <ProtectedRoute><TaxInspectionPage /></ProtectedRoute>
+ } />
```

### 6. `Sidebar.jsx` (แก้ไข)

```diff
- const isTaxPage = ['/tax-certificate'].includes(location.pathname)
+ const isTaxPage = ['/tax-certificate', '/tax-inspection'].includes(location.pathname)

  // เพิ่มใน tax section + home sidebar:
+ <button> 🔍 ตรวจภาษี → /tax-inspection </button>
```

### 7. `HomePage.jsx` (แก้ไข)

```diff
+ <div className="module-card" onClick={() => navigate('/tax-inspection')}>
+     <div className="mod-icon" style={{ background: '#fef3c7', color: '#d97706' }}>🔍</div>
+     <h3>ระบบตรวจภาษี</h3>
+     <p>ตรวจสอบภาษีหัก ณ ที่จ่าย ภาษีมูลค่าเพิ่ม และฝากอ่านข้อมูล OCR</p>
+ </div>
```

---

---

## 📋 แผนแก้ไขฟอร์ม 50 ทวิ ให้ถูกต้องตามกรมสรรพากร

> อ้างอิง: มาตรา 50 ทวิ แห่งประมวลรัษฎากร + แบบฟอร์มกรมสรรพากร
> ไฟล์ที่เกี่ยวข้อง: `frontend/src/pages/tax/WithholdingTaxPage.jsx` และ `frontend/src/components/tax/TaxCertificatePDF.jsx`

---

### ปัญหาที่ 1 — ประเภทเงินได้ไม่ลงตาม Row ที่ถูกต้อง

**สถานะปัจจุบัน:** ทุกประเภทเงินได้ถูก inject เข้า Row 6 (อื่น ๆ) เสมอ ทั้งที่แบบฟอร์มจริงมี 6 rows แยกตามมาตรา

**มาตรฐานกรมสรรพากร:**

| Row | ประเภทเงินได้พึงประเมิน | มาตรา | ภ.ง.ด. ที่ยื่น |
| --- | --- | --- | --- |
| 1 | เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส | 40(1) | ภ.ง.ด.1ก |
| 2 | ค่าธรรมเนียม ค่านายหน้า | 40(2) | ภ.ง.ด.2 |
| 3 | ค่าแห่งลิขสิทธิ์ | 40(3) | ภ.ง.ด.3 |
| 4 | ดอกเบี้ย / เงินปันผล | 40(4) | ภ.ง.ด.2 / ภ.ง.ด.3 |
| 5 | ค่าบริการ, ค่าจ้างทำของ, ค่าเช่า, ค่าโฆษณา, ค่าขนส่ง | 3 เตรส | **ภ.ง.ด.53** |
| 6 | อื่น ๆ (ระบุ) | — | ตามที่ระบุ |

**สิ่งที่ต้องแก้ใน `WithholdingTaxPage.jsx`:**

- ปรับ `<select>` income type ให้มี `value` แยกตาม row number เช่น `row5_service`, `row1_salary`
- ส่งข้อมูลว่า "ลง Row ไหน" ไปพร้อม props ให้ TaxCertificatePDF

**สิ่งที่ต้องแก้ใน `TaxCertificatePDF.jsx`:**

- แก้ Row 5 และ Row 6 ให้รับ props และแสดงค่าตาม row ที่เลือก แทนการ hardcode ให้ลง Row 6
- เช่น: `income_row === 5` → ข้อมูลไปโผล่ที่ Row 5, `income_row === 6` → ไปที่ Row 6

---

### ปัญหาที่ 2 — Checkbox ภ.ง.ด. ไม่ตรงกับประเภทเงินได้

**สถานะปัจจุบัน:** `ภ.ง.ด.53` ถูก checked ตายตัวเสมอ (`checked={true}`)

**มาตรฐานกรมสรรพากร:** checkbox ต้องตรงกับ ภ.ง.ด. ที่ใช้ยื่น

| ประเภทเงินได้ | Checkbox ที่ต้อง check |
| --- | --- |
| Row 1 (เงินเดือน) | (1) ภ.ง.ด.1ก |
| Row 2 (ค่านายหน้า) | (3) ภ.ง.ด.2 |
| Row 3 (ค่าลิขสิทธิ์) | (4) ภ.ง.ด.3 |
| Row 4 (ดอกเบี้ย) | (3) ภ.ง.ด.2 |
| Row 4 (เงินปันผล บุคคลธรรมดา) | (4) ภ.ง.ด.3 |
| Row 5 (ค่าบริการ, ค่าเช่า ฯลฯ) | (7) ภ.ง.ด.53 |

**สิ่งที่ต้องแก้ใน `TaxCertificatePDF.jsx`:**

- เปลี่ยน `<CB label="(7) ภ.ง.ด.53" checked={true} />` → `checked={income_row === 5}`
- เพิ่ม logic: `checked={income_row === 1}` สำหรับ ภ.ง.ด.1ก, `checked={income_row === 2}` สำหรับ ภ.ง.ด.2 เป็นต้น
- ส่ง `income_row` เป็น prop จาก `WithholdingTaxPage.jsx`

---

### ปัญหาที่ 3 — ข้อมูล "ผู้มีหน้าที่หักภาษี ณ ที่จ่าย" เป็น Hardcode

**สถานะปัจจุบัน:** ชื่อบริษัท, เลขผู้เสียภาษี, ที่อยู่ของ Payer ถูก hardcode ใน PDF:

```js
// TaxCertificatePDF.jsx บรรทัด 194-205
<Text>บริษัท ทดสอบระบบ จำกัด</Text>   // ← hardcode
<TaxIdBoxes taxId="0105555555555" />   // ← hardcode
<Text>123 ถ.สุขุมวิท กรุงเทพฯ</Text>   // ← hardcode
```

**มาตรฐานกรมสรรพากร:** ต้องระบุชื่อและที่อยู่ของผู้มีหน้าที่หักภาษีจริง ไม่เช่นนั้นเอกสารไม่มีผลทางกฎหมาย

**สิ่งที่ต้องแก้:**

1. เพิ่ม `payer` object ใน props ของ `TaxCertificatePDF`:

   ```js
   payer: { name, tax_id, address }
   ```

2. ใน `WithholdingTaxPage.jsx` เพิ่ม state `payerInfo` และ form กรอกข้อมูล Payer หรือดึงจาก company settings (Phase 2)

3. ระยะสั้น (ก่อนมี backend): ให้กรอกข้อมูล Payer ใน UI ได้ด้วยตนเอง

---

### ปัญหาที่ 4 — ไม่มีวันที่ออกเอกสารในส่วน Footer

**สถานะปัจจุบัน:** Footer แสดง `(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)` แบบ static ไม่มีค่าจริง

**มาตรฐานกรมสรรพากร:** ต้องระบุวันที่ที่ออกหนังสือรับรอง

**สิ่งที่ต้องแก้:**

- เพิ่ม `issue_date` ใน `formData` ของ `WithholdingTaxPage.jsx` (default = วันนี้)
- เพิ่ม field วันที่ออกเอกสารใน form (แยกจากวันที่จ่ายเงิน)
- ส่ง `issue_date` ผ่าน `previewRecord` → TaxCertificatePDF → แสดงใน footer

---

### ปัญหาที่ 5 — เล่มที่ / เลขที่ ไม่มีการจัดการ

**สถานะปัจจุบัน:** มีช่องว่างไว้แต่ไม่รับค่าจากฟอร์มเลย

**มาตรฐานกรมสรรพากร:** ควรมีเลขที่เพื่ออ้างอิงและสอบทานกับ ภ.ง.ด. ที่ยื่น

**สิ่งที่ต้องแก้:**

- เพิ่ม `book_number` และ `doc_number` ใน `formData`
- เพิ่มช่องกรอกใน form (ระยะสั้น: กรอกเอง / ระยะยาว: auto-increment จาก DB)
- ส่งค่าเข้า PDF เพื่อแสดงในส่วน header

---

### ปัญหาที่ 6 — ประเภท "ผู้จ่ายเงิน" ไม่ให้เลือก

**สถานะปัจจุบัน:** `(1) หัก ณ ที่จ่าย` checked ตายตัว

**มาตรฐานกรมสรรพากร:** ต้องระบุว่าเป็นการหักแบบใด:

- (1) หัก ณ ที่จ่าย — กรณีปกติ
- (2) ออกให้ตลอดไป — บริษัทออกภาษีแทนตลอด
- (3) ออกให้ครั้งเดียว — บริษัทออกแทนครั้งเดียว

**สิ่งที่ต้องแก้:**

- เพิ่ม `payer_type` ใน `formData` (default = 1)
- เพิ่ม Radio buttons หรือ Select ใน form
- ส่ง `payer_type` → TaxCertificatePDF → แสดง checked ให้ถูกต้อง

---

### สรุป Checklist แก้ไข 50 ทวิ

```
Phase A — แก้ PDF ให้ถูกต้องตามกฎหมาย (ทำได้เลย, ไม่ต้อง Backend)
├── [ ] A1: Map income type → Row ที่ถูกต้อง (Row 1-6)
├── [ ] A2: Auto-select ภ.ง.ด. checkbox ตาม income type
├── [ ] A3: เพิ่ม form กรอก Payer info (ชื่อ, เลขผู้เสียภาษี, ที่อยู่)
├── [ ] A4: เพิ่ม issue_date (วันที่ออกเอกสาร) ใน form + PDF footer
├── [ ] A5: เพิ่ม book_number / doc_number ใน form + PDF header
└── [ ] A6: เพิ่ม payer_type radio button (หัก ณ ที่จ่าย / ออกให้ตลอดไป / ออกให้ครั้งเดียว)

Phase B — เชื่อมข้อมูลจริง (ต้องมี Backend)
├── [ ] B1: API ดึง contacts จาก companies_master (แทน mock data)
├── [ ] B2: API ดึง payer company info จาก company settings
└── [ ] B3: บันทึก + ดูประวัติการออก 50 ทวิ (table: withholding_certificates)
```

---

### Income Type Mapping (Reference)

```js
// mapping สำหรับใช้ใน WithholdingTaxPage.jsx และ TaxCertificatePDF.jsx
const INCOME_TYPES = [
  // Row 1
  { value: 'salary',       label: 'เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส (มาตรา 40(1))', row: 1, rate: null, pnd: '1ก' },
  // Row 2
  { value: 'commission',   label: 'ค่าธรรมเนียม ค่านายหน้า (มาตรา 40(2))',               row: 2, rate: 3,    pnd: '2'  },
  // Row 3
  { value: 'copyright',    label: 'ค่าแห่งลิขสิทธิ์ (มาตรา 40(3))',                      row: 3, rate: 3,    pnd: '3'  },
  // Row 4
  { value: 'interest',     label: 'ดอกเบี้ย (มาตรา 40(4)(ก))',                           row: 4, rate: 15,   pnd: '2'  },
  { value: 'dividend',     label: 'เงินปันผล (มาตรา 40(4)(ข))',                          row: 4, rate: 10,   pnd: '3'  },
  // Row 5 — มาตรา 3 เตรส (ส่วนใหญ่ใช้กัน)
  { value: 'service',      label: 'ค่าบริการ (3%)',                                      row: 5, rate: 3,    pnd: '53' },
  { value: 'contract',     label: 'ค่าจ้างทำของ (3%)',                                    row: 5, rate: 3,    pnd: '53' },
  { value: 'rent',         label: 'ค่าเช่า (5%)',                                        row: 5, rate: 5,    pnd: '53' },
  { value: 'advertising',  label: 'ค่าโฆษณา (2%)',                                       row: 5, rate: 2,    pnd: '53' },
  { value: 'transport',    label: 'ค่าขนส่ง (1%)',                                       row: 5, rate: 1,    pnd: '53' },
  // Row 6
  { value: 'other',        label: 'อื่น ๆ (ระบุ)',                                       row: 6, rate: null, pnd: null },
];
```

---

## 🔄 ขั้นตอนการพัฒนา

### Phase 1: Database + โครงสร้างหน้า
- [ ] สร้าง migration: `ocr_audit_api_keys`, `ocr_audit_history`, `ocr_audit_queue`
- [ ] สร้าง `TaxInspectionPage.jsx` + `.css` พร้อม 3 tabs
- [ ] Tab 1 & 2 → Placeholder "กำลังพัฒนา"
- [ ] แก้ `App.jsx`, `Sidebar.jsx`, `HomePage.jsx`

### Phase 2: API Key Management (UI สำหรับจัดการ Keys)
- [ ] Backend: CRUD API สำหรับ `ocr_audit_api_keys`
- [ ] Backend: Health check endpoint ตรวจสถานะ keys
- [ ] Frontend: UI กรอก/แก้ไข/ลบ API Key (8 slots)
- [ ] Frontend: ปุ่มตรวจสอบสถานะ keys

### Phase 3: OCR Queue (Tab 3 — ฝากอ่านข้อมูล)
- [ ] Backend: รับ path → scan ไฟล์ → สร้าง queue job
- [ ] Backend: OCR processor ใช้ keys จาก DB (ไม่ใช่ .env)
- [ ] Backend: Round-robin เฉพาะ audit keys
- [ ] Frontend: form input path + ปุ่มเริ่ม
- [ ] Frontend: แสดง progress/status real-time

### Phase 4: Tab 1 & 2 (ต้อง spec เพิ่ม)
- [ ] Tab 1: ตรวจภาษีหัก ณ ที่จ่าย
- [ ] Tab 2: ตรวจภาษีมูลค่าเพิ่ม

---

## 🔑 API Key Management Flow

```
┌─────────────┐     PUT /api-keys/:slot      ┌─────────────────────┐
│  Frontend   │ ──── { api_key: "ak_..." } ──→│  ocr_audit_api_keys │
│  (UI Form)  │                               │  (MySQL Table)      │
│             │ ←── { slot, status, preview } ─│                     │
└─────────────┘     GET /api-keys             └─────────────────────┘
                                                        │
                    POST /api-keys/check                │
                    ─────────────────────→    Call AksornOCR API
                                             with each key
                    ←── { results: [...] }   Update status column
```

**ข้อดีของระบบนี้:**
- ไม่ต้อง restart server เมื่อเปลี่ยน key
- จัดการ key ผ่าน UI ได้สะดวก
- แยกการใช้งาน key ระหว่างระบบ OCR ปกติ กับ OCR Audit
- เห็นสถานะ key แต่ละตัวแบบ real-time

---

## ✅ การทดสอบ

| รายการ | วิธีทดสอบ |
|--------|----------|
| หน้า Home | เห็น card "ระบบตรวจภาษี" |
| คลิก Card | navigate → `/tax-inspection` |
| Tab Switching | คลิกสลับ 3 tabs ได้ |
| Tab 1 & 2 | แสดง placeholder "กำลังพัฒนา" |
| Tab 3 — Keys | กรอก API Key ใน slot 1-8 ได้ |
| Tab 3 — Keys | ลบ / แก้ไข key ได้ |
| Tab 3 — Health | กดตรวจสอบ → เห็น ✅/❌ แต่ละ slot |
| Tab 3 — OCR | กรอก path + กดเริ่ม → สร้าง queue |
| แยกระบบ | OCR ปกติยังใช้ keys จาก `.env` ตามเดิม |
| แยก History | ผลลัพธ์ Audit เก็บใน `ocr_audit_history` |
