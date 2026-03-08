# 📋 PEAK Login Page Survey — Automation Guide

> **วันที่สำรวจ:** 2 มีนาคม 2026  
> **URL:** https://secure.peakaccount.com/  
> **เป้าหมาย:** ศึกษาโครงสร้างหน้า Login เพื่อเขียนบอทอัตโนมัติ

---

## 📸 Screenshot

![PEAK Login Page](./peak_login_screenshot.png)

---

## 📌 ข้อมูลหน้าเว็บ

| รายการ        | รายละเอียด                              |
| ------------- | --------------------------------------- |
| **URL**       | `https://secure.peakaccount.com/`       |
| **Title**     | PEAK                                    |
| **Framework** | React (SPA - Single Page Application)   |
| **Redirect**  | ไม่มี redirect ตอน load                 |
| **ภาษา**      | ภาษาไทย (สามารถเปลี่ยนเป็น English ได้) |

---

## ⚠️ ข้อสำคัญ: Dynamic IDs

> **CRITICAL:** ค่า `id` ของ input fields เปลี่ยนทุกครั้งที่รีเฟรชหน้า (เช่น `#roawl` → `#psl3ws`)  
> **ห้าม** ใช้ `#id` selector — ต้องใช้ `placeholder` หรือ `text` selector แทน

---

## 🔍 รายการ Interactive Elements

### Input Fields

| Element      | Label    | Placeholder               | Type     | Max Length | Selector (แนะนำ)                               |
| ------------ | -------- | ------------------------- | -------- | ---------- | ---------------------------------------------- |
| **อีเมล**    | อีเมล    | `กรุณากรอกข้อมูลอีเมล`    | text     | 256        | `input[placeholder='กรุณากรอกข้อมูลอีเมล']`    |
| **รหัสผ่าน** | รหัสผ่าน | `กรุณากรอกข้อมูลรหัสผ่าน` | password | 40         | `input[placeholder='กรุณากรอกข้อมูลรหัสผ่าน']` |

### Buttons & Links

| Element             | Text                   | Selector (แนะนำ)                                              |
| ------------------- | ---------------------- | ------------------------------------------------------------- |
| **ปุ่มเข้าสู่ระบบ** | เข้าสู่ระบบ PEAK       | `button:has-text("เข้าสู่ระบบ PEAK")`                         |
| **แสดงรหัสผ่าน**    | แสดงรหัสผ่าน           | `text="แสดงรหัสผ่าน"`                                         |
| **จดจำฉัน**         | ให้ฉันอยู่ในระบบต่อไป  | `text="ให้ฉันอยู่ในระบบต่อไป"` (checkbox, checked by default) |
| **ลืมรหัสผ่าน**     | ลืมรหัสผ่าน?           | `text="ลืมรหัสผ่าน?"`                                         |
| **สมัครสมาชิก**     | สมัครใช้งาน PEAK       | `text="สมัครใช้งาน PEAK"`                                     |
| **Google Login**    | Sign in with Google    | `text="Sign in with Google"`                                  |
| **Microsoft Login** | Sign in with Microsoft | `text="Sign in with Microsoft"`                               |
| **เปลี่ยนภาษา**     | English                | `text="English"`                                              |

---

## 🛡️ ระบบความปลอดภัย

| ระบบ               | สถานะ                  | หมายเหตุ                         |
| ------------------ | ---------------------- | -------------------------------- |
| **CAPTCHA**        | ❌ ไม่พบตอนเข้าหน้าแรก | อาจปรากฏเมื่อ login ผิดหลายครั้ง |
| **2FA**            | ❓ ไม่พบในหน้า Login   | อาจปรากฏหลัง login สำเร็จ        |
| **Cookie Consent** | ❌ ไม่มี               |                                  |
| **Rate Limiting**  | ❓ ยังไม่ทดสอบ         | ควรเพิ่ม delay ระหว่าง actions   |

---

## 🤖 ขั้นตอนสำหรับ Bot (Login Flow)

```
1. เปิดเบราว์เซอร์ (Playwright headless: false สำหรับ dev)
2. ไปที่ https://secure.peakaccount.com/
3. รอจนกว่า input[placeholder='กรุณากรอกข้อมูลอีเมล'] จะ visible
4. กรอกอีเมล → input[placeholder='กรุณากรอกข้อมูลอีเมล']
5. กรอกรหัสผ่าน → input[placeholder='กรุณากรอกข้อมูลรหัสผ่าน']
6. คลิก "ให้ฉันอยู่ในระบบต่อไป" (ถ้าต้องการ)
7. คลิก button:has-text("เข้าสู่ระบบ PEAK")
8. รอ navigation / ตรวจสอบว่า login สำเร็จ
9. ถ้ามี 2FA → จัดการตามขั้นตอน
```

### Playwright Code (ตัวอย่างเบื้องต้น)

```javascript
const { chromium } = require("playwright");

async function loginToPeak(email, password) {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // 1. Navigate
  await page.goto("https://secure.peakaccount.com/");

  // 2. Wait for email input
  await page.waitForSelector("input[placeholder='กรุณากรอกข้อมูลอีเมล']");

  // 3. Fill credentials
  await page.fill("input[placeholder='กรุณากรอกข้อมูลอีเมล']", email);
  await page.fill("input[placeholder='กรุณากรอกข้อมูลรหัสผ่าน']", password);

  // 4. Click login
  await page.click('button:has-text("เข้าสู่ระบบ PEAK")');

  // 5. Wait for navigation (after successful login)
  await page.waitForURL("**/home**", { timeout: 30000 });

  console.log("✅ Login successful!");
  return { browser, page };
}
```

---

## 📝 สิ่งที่ต้องสำรวจต่อ

- [ ] หน้าหลังจาก Login สำเร็จ (Dashboard / Home)
- [ ] หน้ากรอกค่าใช้จ่าย (Expense Entry)
- [ ] เส้นทาง Navigation ไปหน้ากรอกข้อมูล
- [ ] โครงสร้างฟอร์มกรอกค่าใช้จ่าย
- [ ] การเลือกบริษัท (ถ้ามีหลายบริษัท)
- [ ] ตรวจสอบว่ามี 2FA หลัง login ไหม
- [ ] ตรวจสอบ Rate Limiting / Bot Detection

---

## 📁 ไฟล์ที่เกี่ยวข้อง

| ไฟล์                                                      | คำอธิบาย                   |
| --------------------------------------------------------- | -------------------------- |
| `Documents_bot/01_peak_login_survey.md`                   | ไฟล์นี้ — ข้อมูลหน้า Login |
| `Documents_bot/peak_login_screenshot.png`                 | ภาพหน้าจอ Login            |
| _(ถัดไป)_ `Documents_bot/02_peak_dashboard_survey.md`     | สำรวจหน้า Dashboard        |
| _(ถัดไป)_ `Documents_bot/03_peak_expense_entry_survey.md` | สำรวจหน้ากรอกค่าใช้จ่าย    |
