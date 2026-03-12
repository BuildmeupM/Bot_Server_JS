const express = require("express");
const router = express.Router();
const { getDB } = require("../database");
const { getPool } = require("../mysql");
const crypto = require("crypto");

const ENCRYPTION_KEY =
  process.env.JWT_SECRET || "fallback_secret_key_123456789012";

// ==========================================
// ENCRYPTION HELPERS
// ==========================================
function decrypt(text) {
  if (!text) return text;
  try {
    const key = crypto
      .createHash("sha256")
      .update(String(ENCRYPTION_KEY))
      .digest("base64")
      .substring(0, 32);
    let textParts = text.split(":");
    let iv = Buffer.from(textParts.shift(), "hex");
    let encryptedText = Buffer.from(textParts.join(":"), "hex");
    let decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    console.error("Decryption failed", e);
    return text;
  }
}

// ==========================================
// JOB QUEUE SYSTEM & BROWSER MANAGEMENT
// ==========================================
const MAX_CONCURRENT = 5;
const jobs = new Map(); // jobId -> job object
const jobQueue = []; // waiting job IDs
let jobCounter = 0;

// Shared Browser Instance for Memory Efficiency
let sharedBrowser = null;
const { chromium } = require("playwright");

// Cleanup old jobs periodically (every 1 hour), keeping jobs only for the last 24 hours
setInterval(
  () => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (const [jobId, job] of jobs.entries()) {
      const jobAgeDate = job.finishedAt || job.createdAt;
      if (jobAgeDate && now - new Date(jobAgeDate).getTime() > ONE_DAY_MS) {
        // Memory cleanup: close context if orphaned
        if (job.context) {
          job.context.close().catch(console.error);
        }
        jobs.delete(jobId);
      }
    }
  },
  60 * 60 * 1000,
);

function generateJobId() {
  jobCounter++;
  const ts = Date.now().toString(36);
  return `JOB-${ts}-${String(jobCounter).padStart(3, "0")}`;
}

function createJob(profileId, profile, excelPath) {
  const jobId = generateJobId();
  const job = {
    id: jobId,
    profileId,
    profileName: profile.platform,
    username: profile.username,
    software: profile.software,
    peakCode: profile.peak_code,
    vatStatus: profile.vat_status || 'registered',
    excelPath,
    status: "queued", // queued | running | logged_in | working | done | error | stopped
    logs: [],
    browser: null, // Note: browser property is left for backwards compatibility but we'll use sharedBrowser
    page: null,
    context: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
  };
  jobs.set(jobId, job);
  return job;
}

function addLog(jobId, level, message) {
  const job = jobs.get(jobId);
  if (!job) return;
  const entry = {
    time: new Date().toLocaleTimeString("th-TH", { hour12: false }),
    level, // info | success | warn | error
    message,
  };
  job.logs.push(entry);

  // Notify SSE clients
  const clients = sseClients.get(jobId);
  if (clients && clients.length) {
    const data = JSON.stringify(entry);
    clients.forEach((res) => {
      try {
        res.write(`data: ${data}\n\n`);
      } catch (e) {}
    });
  }
}

// SSE client tracking
const sseClients = new Map(); // jobId -> [res, res, ...]

// ==========================================
// EXCEL PARSER
// ==========================================
async function parseExcelData(excelPath, jobId) {
  const fs = require("fs");
  const path = require("path");
  const xlsx = require("xlsx");

  // Fallback if null
  if (!excelPath) throw new Error("ไม่ได้ระบุชื่อไฟล์ Excel");

  let filePath = excelPath;

  // If it's a relative filename, fallback to old default directory logic to preserve existing tests/behavior
  if (!excelPath.includes('/') && !excelPath.includes('\\')) {
    const uploadsDir =
      process.env.EXCEL_UPLOADS_DIR ||
      path.join(
        "V:",
        "A.โฟร์เดอร์หลัก",
        "Build000 ทดสอบระบบ",
        "test",
        "ทดสอบระบบแยกเอกสาร",
      );
    filePath = path.join(uploadsDir, excelPath);
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`ไม่พบไฟล์: ${filePath}`);
  }

  try {
    // Use fs.promises.readFile and wrap in a Promise to yield event loop
    return await new Promise(async (resolve, reject) => {
      try {
        const buffer = await fs.promises.readFile(filePath);

        // Note: xlsx.read with buffer is still sync, but doing readFile async
        // minimizes the total blocking time.
        const workbook = xlsx.read(buffer, { type: "buffer" });

        const getSheetData = (sheetName) => {
          if (workbook.Sheets[sheetName]) {
            return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
          }
          return [];
        };

        const vatTransactions = getSheetData("มีภาษีมูลค่าเพิ่ม");
        const nonVatTransactions = getSheetData("ไม่มีภาษีมูลค่าเพิ่ม");
        const vendors = getSheetData("ที่อยู่แต่ละบริษัท");

        const allTransactions = [...vatTransactions, ...nonVatTransactions];

        if (allTransactions.length === 0) {
          addLog(
            jobId,
            "warn",
            '⚠️ ไม่พบรายการค่าใช้จ่ายในชีต "มีภาษีมูลค่าเพิ่ม" และ "ไม่มีภาษีมูลค่าเพิ่ม"',
          );
        }
        if (vendors.length === 0) {
          addLog(
            jobId,
            "warn",
            '⚠️ ไม่พบข้อมูลผู้ขายในชีต "ที่อยู่แต่ละบริษัท"',
          );
        }

        // --- Validation: ตรวจสอบคอลัมน์ที่จำเป็น ---
        const requiredColumns = [
          'ลำดับ',
          'ชื่อบริษัท - ผู้ขาย',
          'เลขประจำตัวผู้เสียภาษี',
          'วันที่',
          'โค้ดบันทึกบัญชี',
          'ยอดก่อนภาษีมูลค่าเพิ่ม',
          'ยอดหลังบวกภาษีมูลค่าเพิ่ม',
          'ชื่อไฟล์ใหม่',
          'ชื่อไฟล์เก่า'
        ];

        // ฟังก์ชันหาค่าแบบยืดหยุ่น (รองรับชื่อคอลัมน์ที่มี whitespace ต่างกัน)
        const flexFind = (row, keyword) => {
          const cleanKw = keyword.replace(/[\n\r\s]/g, '');
          const key = Object.keys(row).find(k => k.replace(/[\n\r\s]/g, '').includes(cleanKw));
          return key ? row[key] : undefined;
        };

        let skippedCount = 0;
        const validTransactions = allTransactions.filter((tx, idx) => {
          const missingCols = [];
          for (const col of requiredColumns) {
            const val = flexFind(tx, col);
            if (val === undefined || val === null || String(val).trim() === '') {
              missingCols.push(col);
            }
          }
          if (missingCols.length > 0) {
            const rowNum = flexFind(tx, 'ลำดับ') || (idx + 1);
            addLog(jobId, "warn", `⚠️ ข้ามรายการที่ ${rowNum} — ข้อมูลไม่ครบ: ${missingCols.join(', ')}`);
            skippedCount++;
            return false;
          }
          return true;
        });

        if (skippedCount > 0) {
          addLog(jobId, "warn", `⚠️ ข้ามรายการทั้งหมด ${skippedCount} รายการ (ข้อมูลไม่ครบ) เหลือ ${validTransactions.length} รายการที่พร้อมทำงาน`);
        }

        // --- Validation: ตรวจสอบไฟล์ต้นทางว่ามีอยู่จริงหรือไม่ ---
        const excelDir = path.dirname(filePath);
        let missingFiles = [];
        for (const tx of validTransactions) {
          const oldFile = flexFind(tx, 'ชื่อไฟล์เก่า');
          if (oldFile && String(oldFile).trim()) {
            const srcPath = path.join(excelDir, String(oldFile).trim());
            if (!fs.existsSync(srcPath)) {
              const rowNum = flexFind(tx, 'ลำดับ') || '?';
              missingFiles.push({ row: rowNum, file: String(oldFile).trim() });
            }
          }
        }

        if (missingFiles.length > 0) {
          addLog(jobId, "error", `❌ พบ ${missingFiles.length} ไฟล์ต้นทางที่ไม่มีอยู่ในโฟลเดอร์:`);
          for (const mf of missingFiles) {
            addLog(jobId, "error", `   ❌ แถว ${mf.row}: ${mf.file}`);
          }
          addLog(jobId, "error", `📁 โฟลเดอร์: ${excelDir}`);
        }

        resolve({
          transactions: validTransactions,
          vendors: vendors,
          skippedCount: skippedCount,
          missingFiles: missingFiles,
        });
      } catch (innerE) {
        reject(innerE);
      }
    });
  } catch (e) {
    throw new Error(`เกิดข้อผิดพลาดในการอ่านไฟล์: ${e.message}`);
  }
}

// ==========================================
// QUEUE PROCESSOR
// ==========================================
function getRunningCount() {
  let count = 0;
  for (const job of jobs.values()) {
    if (["running", "logged_in", "working"].includes(job.status)) count++;
  }
  return count;
}

async function processQueue() {
  while (jobQueue.length > 0 && getRunningCount() < MAX_CONCURRENT) {
    const jobId = jobQueue.shift();
    const job = jobs.get(jobId);
    if (!job || job.status !== "queued") continue;

    // Start this job
    executeJob(job).catch((err) => {
      console.error(`Job ${job.id} failed:`, err);
      job.status = "error";
      job.finishedAt = new Date().toISOString();
      addLog(job.id, "error", `เกิดข้อผิดพลาด: ${err.message}`);
    });
  }
}

async function executeJob(job) {
  job.status = "running";
  job.startedAt = new Date().toISOString();
  addLog(job.id, "info", "🚀 เริ่มต้นทำงาน...");

  try {
    // 0. Parse Excel first
    addLog(
      job.id,
      "info",
      `📁 กำลังอ่านออเดอร์จากไฟล์ Excel: ${job.excelPath}...`,
    );
    try {
      const excelData = await parseExcelData(job.excelPath, job.id);
      job.excelData = excelData;
      
      // ถ้ามีรายการถูกข้าม (ข้อมูลไม่ครบ) → หยุดทันที ไม่เข้า Login
      if (excelData.skippedCount > 0) {
        addLog(job.id, "error", `❌ พบ ${excelData.skippedCount} รายการที่ข้อมูลไม่ครบ — กรุณาแก้ไข Excel แล้วลองใหม่ (ระบบหยุดก่อน Login)`);
        job.status = "error";
        job.finishedAt = new Date().toISOString();
        return;
      }

      // ถ้ามีไฟล์ต้นทางหายไป → หยุดทันที ไม่เข้า Login
      if (excelData.missingFiles && excelData.missingFiles.length > 0) {
        addLog(job.id, "error", `❌ พบ ${excelData.missingFiles.length} ไฟล์ต้นทางที่ไม่มีอยู่จริง — กรุณาเช็คไฟล์แล้วลองใหม่ (ระบบหยุดก่อน Login)`);
        job.status = "error";
        job.finishedAt = new Date().toISOString();
        return;
      }
      
      if (excelData.transactions.length === 0) {
        addLog(job.id, "error", `❌ ไม่พบรายการที่พร้อมทำงาน — กรุณาตรวจสอบ Excel`);
        job.status = "error";
        job.finishedAt = new Date().toISOString();
        return;
      }
      
      addLog(
        job.id,
        "success",
        `✅ อ่านไฟล์แล้วพบ ค่าใช้จ่าย ${excelData.transactions.length} รายการ | ข้อมูลผู้ขายรวม ${excelData.vendors.length} บริษัท`,
      );
    } catch (excelErr) {
      addLog(
        job.id,
        "error",
        `❌ ไม่สามารถอ่านไฟล์ Excel ได้: ${excelErr.message}`,
      );
      throw excelErr;
    }

    // 1. Launch / reuse browser
    addLog(job.id, "info", "🌐 กำลังเตรียมเบราว์เซอร์...");
    if (!sharedBrowser || !sharedBrowser.isConnected()) {
      addLog(
        job.id,
        "info",
        "🔧 กำลังเปิด Browser Instance หลัก (ครั้งแรก หรือเปิดใหม่)...",
      );
      sharedBrowser = await chromium.launch({
        headless: false,
        args: ["--start-maximized"],
      });
    }

    // Use an isolated context for each job
    const context = await sharedBrowser.newContext({ viewport: null });
    let page = await context.newPage();

    job.browser = sharedBrowser; // Store ref but we don't close it
    job.context = context;
    job.page = page;

    // ตรวจจับเมื่อ page ถูกปิดจากภายนอก (เช่น PEAK redirect)
    page.on("close", () => {
      addLog(
        job.id,
        "warn",
        "⚠️ Page ถูกปิดจากภายนอก (detected by close event)",
      );
    });
    addLog(job.id, "success", "✅ เตรียมเบราว์เซอร์สำเร็จ");

    // 2. Navigate to PEAK
    addLog(job.id, "info", "🔗 กำลังเข้าหน้า Login PEAK...");
    await page.goto("https://secure.peakaccount.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    addLog(job.id, "success", "✅ เข้าหน้า Login สำเร็จ");

    // 3. Wait for form using locator
    addLog(job.id, "info", "⏳ รอฟอร์ม Login โหลด...");
    const emailInput = page.locator(
      "input[placeholder='กรุณากรอกข้อมูลอีเมล']",
    );
    await emailInput.waitFor({ state: "visible", timeout: 15000 });

    // 4. Fill credentials
    addLog(job.id, "info", `📧 กรอกอีเมล: ${job.username}`);
    await emailInput.fill(job.username);

    // Decrypt password (from MySQL)
    const pool = getPool();
    const [profileRows] = await pool.execute("SELECT password FROM bot_profiles WHERE id = ?", [job.profileId]);
    const profileData = profileRows[0];
    if (!profileData) {
      addLog(job.id, "error", `❌ ไม่พบ Profile ID: ${job.profileId} ใน Database`);
      throw new Error("Profile not found in MySQL");
    }
    const password = decrypt(profileData.password);

    addLog(job.id, "info", "🔒 กรอกรหัสผ่าน: ********");
    await page.fill("input[placeholder='กรุณากรอกข้อมูลรหัสผ่าน']", password);

    // 5. Click login
    addLog(job.id, "info", "🖱️ คลิกเข้าสู่ระบบ PEAK...");
    await page.click('button:has-text("เข้าสู่ระบบ PEAK")');
    await page.waitForTimeout(2000); // รอให้หน้า redirect

    // 6. Wait for navigation
    try {
      await page.waitForURL("**/*", { timeout: 15000 });

      const currentUrl = page.url();
      if (currentUrl.includes("/home") || currentUrl.includes("/selectlist")) {
        job.status = "logged_in";
        addLog(job.id, "success", `✅ Login สำเร็จ! (${currentUrl})`);

        // Update DB status (MySQL)
        await pool.execute(
          "UPDATE bot_profiles SET status = ?, last_sync = ? WHERE id = ?",
          ["running", new Date().toISOString(), job.profileId]
        );
      } else {
        job.status = "logged_in";
        addLog(job.id, "warn", `⚠️ Login อาจไม่สำเร็จ — URL: ${currentUrl}`);
      }
    } catch (navErr) {
      job.status = "logged_in";
      addLog(
        job.id,
        "warn",
        "⚠️ รอ navigation timeout — กรุณาตรวจสอบเบราว์เซอร์",
      );
    }

    // 7. Navigate to Company Home Page using PEAK Code
    const peakCode = job.peakCode;
    if (peakCode) {
      addLog(
        job.id,
        "info",
        `🏢 กำลังเข้าสู่หน้าหลักของบริษัท (PEAK Code: ${peakCode})...`,
      );
      await page.goto(`https://secure.peakaccount.com/home?emi=${peakCode}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      addLog(job.id, "success", "✅ เข้าหน้าหลักบริษัทสำเร็จ");

      await page.waitForTimeout(500);

      // 7.5 ตรวจสอบสิทธิ์ผู้ใช้ — เข้าหน้า User Settings เพื่อเช็คว่ามี Kanokwan somsri อยู่ในระบบ
      addLog(job.id, "info", "🔑 กำลังตรวจสอบสิทธิ์ผู้ใช้ในระบบ...");
      try {
        await page.goto(
          `https://secure.peakaccount.com/setting/userSetting?emi=${peakCode}&reload=1`,
          { waitUntil: "domcontentloaded", timeout: 30000 }
        );
        await page.waitForTimeout(3000); // รอตารางโหลด

        // อ่านชื่อผู้ใช้ทั้งหมดจากตาราง
        const userNames = await page.evaluate(() => {
          const cells = document.querySelectorAll("#customTable .TabelBody table tr td p.crop");
          return Array.from(cells).map(el => el.textContent.trim());
        });

        addLog(job.id, "info", `📋 พบผู้ใช้ในระบบ ${userNames.length} คน: ${userNames.join(", ")}`);

        const requiredUser = "Kanokwan somsri";
        const found = userNames.some(
          name => name.toLowerCase() === requiredUser.toLowerCase()
        );

        if (found) {
          addLog(job.id, "success", `✅ พบ ${requiredUser} เป็นผู้ดูแลระบบ — ผ่านการตรวจสอบ`);
        } else {
          addLog(job.id, "error", `❌ ไม่พบ ${requiredUser} ในรายชื่อผู้ใช้ — หยุดการทำงาน`);
          throw new Error(`Permission check failed: ${requiredUser} not found in user settings`);
        }
      } catch (permErr) {
        if (permErr.message.includes("Permission check failed")) {
          throw permErr; // หยุดทำงานจริง
        }
        addLog(job.id, "warn", `⚠️ ตรวจสอบสิทธิ์ไม่สำเร็จ: ${permErr.message} — ทำงานต่อ`);
      }

      // 8. Navigate to Expense Entry Page
      addLog(job.id, "info", '📝 กำลังไปที่หน้า "บันทึกบัญชีค่าใช้จ่าย"...');
      await page.goto(
        `https://secure.peakaccount.com/expense/purchaseInventory?emi=${peakCode}`,
        { waitUntil: "domcontentloaded", timeout: 60000 },
      );
      addLog(job.id, "success", '✅ เข้าหน้า "บันทึกบัญชีค่าใช้จ่าย" สำเร็จ');

      job.status = "working";

      // --- เริ่มลูปข้อมูลจาก Excel (จัดกลุ่มตามเลขที่เอกสาร) ---
      const rawTransactions = job.excelData.transactions;
      const vendors = job.excelData.vendors;
      
      // จัดกลุ่มรายการที่มี "เลขที่เอกสาร" เดียวกันให้อยู่ในบิลเดียวกัน
      const groupedTransactions = [];
      let currentGroup = [];
      let currentDocNo = null;

      for (const tx of rawTransactions) {
          const docNo = tx["เลขที่เอกสาร"];
          // ถ้าเป็นบิลแรก หรือเลขเอกสารเหมือนเดิม ให้เข้ากลุ่มเดิม
          if (currentDocNo === null || docNo === currentDocNo) {
              currentGroup.push(tx);
              currentDocNo = docNo;
          } else {
              // ถ้าเลขเอกสารเปลี่ยน ให้ปิดกลุ่มเก่า เปิดกลุ่มใหม่
              groupedTransactions.push(currentGroup);
              currentGroup = [tx];
              currentDocNo = docNo;
          }
      }
      if (currentGroup.length > 0) {
          groupedTransactions.push(currentGroup);
      }

      for (let groupIdx = 0; groupIdx < groupedTransactions.length; groupIdx++) {
        const docGroup = groupedTransactions[groupIdx];
        const primaryTx = docGroup[0]; // ใช้แถวแรกเป็นข้อมูลหลักของบิล
        
        addLog(job.id, "info", `\n=========================================`);
        addLog(
          job.id,
          "info",
          `📦 [บิลที่ ${groupIdx + 1}/${groupedTransactions.length}] เริ่มประมวลผล (มี ${docGroup.length} รายการย่อย)`,
        );

        const rawVendorName = primaryTx["ชื่อบริษัท - ผู้ขาย"] || "ไม่ระบุชื่อ";
        const taxId = String(primaryTx["เลขประจำตัวผู้เสียภาษี"] || "").trim();
        const branch = String(primaryTx["สาขา"] || "").trim();
        const totalAmount = primaryTx["ยอดรวมสุทธิ"] || "0.00";

        addLog(job.id, "info", `▶️ เลขที่เอกสาร: ${primaryTx["เลขที่เอกสาร"]}`);
        addLog(job.id, "info", `▶️ ผู้ขาย: ${rawVendorName} | เลขภาษี: ${taxId}`);
        addLog(job.id, "info", `=========================================\n`);
        
        // ทุกรอบ(รวมรอบแรกด้วยถ้าพึ่งเปิดใหม่) เช็คสถานะ Page ให้ชัวร์ว่ายังไม่ตาย
        if (!page || page.isClosed()) {
          addLog(
            job.id,
            "warn",
            "⚠️ Browser page ถูกปิดไปแล้ว — กำลังเตรียมหน้าใหม่ (Recovery mode)...",
          );
          page = await job.context.newPage();
          job.page = page;
          page.on("close", () => {
            addLog(job.id, "warn", "⚠️ Page ถูกปิดจากภายนอก");
          });
        }

        try {
          // รีเฟรชหน้าบันทึกค่าใช้จ่ายใหม่ทุกบิล เพื่อเคลียร์ฟอร์มให้สะอาด เริ่มใบใหม่
          addLog(
            job.id,
            "info",
            `🔄 โหลดหน้าบันทึกค่าใช้จ่าย (เตรียมสร้างบิลใหม่)...`,
          );
          await page.goto(
            `https://secure.peakaccount.com/expense/invoiceCreate?emi=${peakCode}`,
            { waitUntil: "domcontentloaded", timeout: 60000 },
          );
          await page.waitForTimeout(2000); // ชะลอให้หน้าโหลดนิ่ง
        } catch (navErr) {
          addLog(
            job.id,
            "error",
            `❌ โหลดหน้าขึ้นไม่สำเร็จ: ${navErr.message}`,
          );
          continue; // ข้ามไปทำบิลถัดไปถ้ารีเฟรชหน้าไม่ขึ้น
        }

        try {
          // 1. จัดการข้อมูล Vendor
          if (!taxId) {
            addLog(
              job.id,
              "warn",
              `⚠️ ข้ามบิลที่ ${groupIdx + 1}: ไม่มีเลขประจำตัวผู้เสียภาษี`,
            );
            continue;
          }

          addLog(job.id, "info", `🔍 ค้นหาผู้ขายจาก เลขภาษี: ${taxId}`);

          // รอให้ฟอร์มโหลดเสร็จ — รอจนกว่าจะเห็นข้อความ 'ชื่อผู้ขาย' บนหน้า
          await page
            .getByText("ชื่อผู้ขาย")
            .first()
            .waitFor({ state: "visible", timeout: 20000 });
          await page.waitForTimeout(1000); // buffer เพิ่มอีกนิดให้ Vue render เสร็จ

          // คลิกตัวช่องค้นหาผู้ขายจาก Placeholder โดยตรง
          const vendorDropdown = page
            .getByPlaceholder("พิมพ์เพื่อค้นหาผู้ติดต่อ หรือสร้างผู้ติดต่อใหม่")
            .first();
          await vendorDropdown.waitFor({ state: "attached", timeout: 10000 });

          // หากซ่อนอยู่ภายใต้ wrapper ต้องบังคับคลิก
          addLog(job.id, "info", "🖱️ คลิกตัวเลือกผู้ขาย...");
          await vendorDropdown.click({ force: true, timeout: 5000 });
          await page.waitForTimeout(1000); // ชะลอให้ dropdown กางออกเต็มที่

          // หลังจากคลิก ค่อยๆ พิมพ์เพื่อกระตุ้นให้ระบบค้นหา
          addLog(job.id, "info", "⌨️ กำลังพิมพ์เลขภาษี: " + taxId);
          await vendorDropdown.fill(taxId);

          // หา parent container ของ vendorDropdown
          const vendorMultiselect = vendorDropdown
            .locator('xpath=ancestor::div[contains(@class,"multiselect")]')
            .first();

          addLog(job.id, "info", "⏳ รอดึงข้อมูลรายชื่อผู้ขาย (ให้เวลา API)...");
          try {
              // รอให้ตัวเลือก (li / span) โผล่ขึ้นมา — เพิ่มเวลาเป็น 5 วิ เพื่อให้ API โหลดรายการครบ
              await vendorMultiselect.locator('.multiselect__element').first().waitFor({ state: 'visible', timeout: 5000 });
          } catch(e) {}
          await page.waitForTimeout(1500); // ชะลอ 1.5 วิ ให้ Vue อัปเดต list สมบูรณ์ก่อนวิเคราะห์

          // --- วิเคราะห์ผลลัพธ์ใน Dropdown (เฉพาะ Dropdown ผู้ขาย) ---
          const allOptions = vendorMultiselect.locator(
            ".multiselect__content .multiselect__element",
          );
          const optionCount = await allOptions.count();
          addLog(
            job.id,
            "info",
            `📊 พบ ${optionCount} รายการใน Dropdown ผู้ขาย`,
          );

          // แยกรายการที่เป็นผู้ขายจริง (ไม่ใช่ปุ่ม "เพิ่มผู้ติดต่อ")
          const vendorOptions = [];
          for (let idx = 0; idx < optionCount; idx++) {
            const optEl = allOptions.nth(idx);
            const optText = (await optEl.innerText()).trim();
            if (!optText || optText.includes("เพิ่มผู้ติดต่อ")) continue;
            vendorOptions.push({ index: idx, text: optText });
          }

          addLog(
            job.id,
            "info",
            `🔎 พบผู้ขาย ${vendorOptions.length} รายการ (ไม่นับปุ่มเพิ่มผู้ติดต่อ)`,
          );
          // Log ตัวเลือกที่พบ (เฉพาะ 5 รายการแรก เพื่อไม่ให้ log เยอะ)
          vendorOptions.slice(0, 5).forEach((v, i) => {
            addLog(
              job.id,
              "info",
              `   🔹 [${i + 1}] ${v.text.substring(0, 80)}`,
            );
          });
          if (vendorOptions.length > 5) {
            addLog(
              job.id,
              "info",
              `   ... และอีก ${vendorOptions.length - 5} รายการ`,
            );
          }

          if (vendorOptions.length === 0) {
            // ไม่เจอผู้ขายเลย → คลิก "เพิ่มผู้ติดต่อ" จาก Dropdown โดยตรง
            addLog(
              job.id,
              "warn",
              `⚠️ ไม่พบผู้ขายในผลค้นหา → คลิก + เพิ่มผู้ติดต่อ`,
            );

            // หาปุ่ม "เพิ่มผู้ติดต่อ" จากใน vendor dropdown เดียวกัน
            const addContactOption = vendorMultiselect
              .locator(".multiselect__option")
              .filter({ hasText: "เพิ่มผู้ติดต่อ" })
              .first();
            if (await addContactOption.isVisible({ timeout: 3000 })) {
              await addContactOption.click();
              addLog(job.id, "info", "🖱️ คลิก + เพิ่มผู้ติดต่อ สำเร็จ");
            } else {
              // Fallback
              addLog(job.id, "warn", "⚠️ ไม่พบปุ่มใน Dropdown — ลอง fallback");
              const addContactBtn = page
                .getByText("+ เพิ่มผู้ติดต่อ", { exact: false })
                .first();
              await addContactBtn.click({ force: true });
            }
          } else {
            // มีข้อมูลผู้ขายใน Dropdown อย่างน้อย 1 รายการ ต้องเช็คหาสาขาที่ตรงกัน
            addLog(job.id, "info", `📋 วิเคราะห์หาสาขาที่ตรงกับใน Excel: "${branch || 'สำนักงานใหญ่'}"`);
            
            const branchNumTarget = branch ? branch.replace(/\D/g, '').padStart(5, '0') : '00000';
            const isTargetHQ = !branch || branch === '00000' || branch === '0000' || branch.toLowerCase() === 'สำนักงานใหญ่';
            
            let matchedOpt = null;
            
            for (const opt of vendorOptions) {
                // ข้ามหัวข้อแบ่งกลุ่มที่ไม่ใช่ข้อมูลผู้ขาย
                const trimmed = opt.text.trim();
                if (trimmed === "ทั้งหมด" || trimmed === "รายการที่ใช้บ่อย") continue;
                
                // ดึงเลขสาขา 5 หลักจากข้อความ (เช่น "(00069)" → "00069")
                const branchMatch = opt.text.match(/\((\d{5})\)/);
                const optBranchNum = branchMatch ? branchMatch[1] : null;
                
                // ตรวจสอบว่ารายการนี้เป็นสำนักงานใหญ่หรือไม่
                const isOptHQ = opt.text.includes('สำนักงานใหญ่') 
                    || optBranchNum === '00000'
                    || (!optBranchNum && !opt.text.includes('สาขา')); // ไม่มีเลขสาขาเลย = ถือว่า HQ (แต่ต้องไม่ใช่หัวข้อกลุ่ม)
                
                // ถ้ามีเลขสาขาย่อย (ไม่ใช่ 00000) = ไม่ใช่ HQ แน่นอน
                const isOptBranch = optBranchNum && optBranchNum !== '00000';
                
                let isMatch = false;
                if (isTargetHQ) {
                    // เป้าหมายคือสำนักงานใหญ่ → ต้องเจอ option ที่เป็น HQ ชัดเจน และต้องไม่มีเลขสาขาย่อย
                    if (isOptHQ && !isOptBranch) {
                        isMatch = true;
                    }
                } else {
                    // เป้าหมายคือสาขาย่อย → ต้องเจอเลข branchNumTarget ตรงกัน
                    if (!isOptHQ && (opt.text.includes(branchNumTarget) || opt.text.includes(branch))) {
                        isMatch = true;
                    }
                }
                
                if (isMatch) {
                    matchedOpt = opt;
                    break;
                }
            }
            
            if (matchedOpt) {
                addLog(job.id, "success", `✅ พบสาขาที่ตรงกัน 🖱️ กำลังคลิกเลือก...`);
                // ใช้ allOptions.nth() ไม่ใช่ vendorMultiselect.locator('.multiselect__option').nth() เพื่อดึงตัวที่ถูกต้อง
                const targetOptElement = allOptions.nth(matchedOpt.index).locator('.multiselect__option');
                await targetOptElement.click();
                await page.waitForTimeout(2000);
            } else {
                addLog(job.id, "warn", `⚠️ ไม่พบสาขาที่ตรงกับ "${branch || 'สำนักงานใหญ่'}" ในระบบ -> ต้องเพิ่มผู้ติดต่อใหม่`);
                
                // คลิก "เพิ่มผู้ติดต่อ" — ลองหลายวิธีเพราะ PEAK เปลี่ยน DOM บ่อย
                let addClicked = false;
                
                // วิธี 1: หาจาก .multiselect__option ภายใน vendorMultiselect
                try {
                    const addOpt1 = vendorMultiselect
                      .locator(".multiselect__option")
                      .filter({ hasText: "เพิ่มผู้ติดต่อ" })
                      .first();
                    if (await addOpt1.isVisible({ timeout: 2000 })) {
                        await addOpt1.click({ force: true });
                        addClicked = true;
                        addLog(job.id, "info", "🖱️ คลิก + เพิ่มผู้ติดต่อ สำเร็จ (วิธี 1: multiselect__option)");
                    }
                } catch (e) {}
                
                // วิธี 2: หาจาก .multiselect__element ที่มีข้อความ เพิ่มผู้ติดต่อ
                if (!addClicked) {
                    try {
                        const addOpt2 = vendorMultiselect
                          .locator(".multiselect__element")
                          .filter({ hasText: "เพิ่มผู้ติดต่อ" })
                          .first();
                        if (await addOpt2.isVisible({ timeout: 2000 })) {
                            await addOpt2.click({ force: true });
                            addClicked = true;
                            addLog(job.id, "info", "🖱️ คลิก + เพิ่มผู้ติดต่อ สำเร็จ (วิธี 2: multiselect__element)");
                        }
                    } catch (e) {}
                }
                
                // วิธี 3: หาจาก page ทั้งหน้าด้วย text
                if (!addClicked) {
                    try {
                        const addOpt3 = page.getByText("เพิ่มผู้ติดต่อ", { exact: false }).first();
                        if (await addOpt3.isVisible({ timeout: 2000 })) {
                            await addOpt3.click({ force: true });
                            addClicked = true;
                            addLog(job.id, "info", "🖱️ คลิก + เพิ่มผู้ติดต่อ สำเร็จ (วิธี 3: getByText)");
                        }
                    } catch (e) {}
                }
                
                // วิธี 4: ใช้ evaluate + dispatchEvent เพื่อ trigger Vue event handler
                if (!addClicked) {
                    try {
                        const clicked = await page.evaluate(() => {
                            // หา element ที่มีข้อความ "เพิ่มผู้ติดต่อ" และมองเห็นอยู่
                            const allEls = Array.from(document.querySelectorAll('span, div, li, p, a, button'));
                            const addEl = allEls.find(el => {
                                const text = el.textContent.trim();
                                return (text.includes('เพิ่มผู้ติดต่อ') || text.includes('+ เพิ่มผู้ติดต่อ')) && el.offsetWidth > 0;
                            });
                            if (addEl) {
                                // ใช้ MouseEvent แทน native click เพื่อให้ Vue จับ event ได้
                                addEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                                return true;
                            }
                            return false;
                        });
                        if (clicked) {
                            addClicked = true;
                            addLog(job.id, "info", "🖱️ คลิก + เพิ่มผู้ติดต่อ สำเร็จ (วิธี 4: JS dispatchEvent)");
                        }
                    } catch (e) {
                        addLog(job.id, "error", `❌ ไม่สามารถคลิกปุ่ม 'เพิ่มผู้ติดต่อ' ได้ทุกวิธี: ${e.message}`);
                    }
                }
                
                await page.waitForTimeout(1000);
                
                // หักล้าง array เพื่อให้ block ถัดไปทำงานเหมือนเป็นของใหม่
                vendorOptions.length = 0;
            }
          }

          // ถ้าเข้า "เพิ่มผู้ติดต่อ" → กรอกข้อมูลใน Modal
          if (vendorOptions.length === 0) {
            // 1. รอ Modal โหลดเสร็จ — ใช้ input.inputId (ช่องกรอกเลขภาษี 13 หลัก) เป็นตัวเช็ค
            // เพราะ element นี้มีเฉพาะใน Modal เท่านั้น ไม่มีในหน้าหลัก
            addLog(job.id, "info", "⏳ รอ Modal เพิ่มผู้ติดต่อโหลด...");
            try {
                await page.locator('input.inputId').first().waitFor({ state: 'visible', timeout: 15000 });
            } catch (modalWaitErr) {
                addLog(job.id, "warn", `⚠️ Modal ไม่ปรากฏภายใน 15 วิ — ลองคลิก 'เพิ่มผู้ติดต่อ' อีกครั้ง...`);
                // ปิด Dropdown ก่อนแล้วลองคลิกใหม่
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);
                // คลิกช่อง vendor ใหม่
                await vendorDropdown.click({ force: true });
                await page.waitForTimeout(1000);
                // หาปุ่มเพิ่มผู้ติดต่อใน Dropdown ที่กางใหม่
                const retryAddBtn = page.locator('.multiselect__option').filter({ hasText: 'เพิ่มผู้ติดต่อ' }).first();
                if (await retryAddBtn.isVisible({ timeout: 3000 })) {
                    await retryAddBtn.click();
                    addLog(job.id, "info", "🖱️ คลิก + เพิ่มผู้ติดต่อ สำเร็จ (Retry)");
                }
                // รออีกรอบ
                await page.locator('input.inputId').first().waitFor({ state: 'visible', timeout: 15000 });
            }
            await page.waitForTimeout(1000); // ให้ Vue render เต็มที่
            addLog(job.id, "success", "✅ Modal เพิ่มผู้ติดต่อปรากฏแล้ว");

            // ใช้ page เป็น base แทน modalContent เพื่อหลีกเลี่ยงการจับ Scope ผิด
            const modalContent = page;

            // 2. กรอกเลขประจำตัวผู้เสียภาษี 13 หลัก
            addLog(job.id, "info", `✍️ กำลังพิมพ์เลขภาษี 13 หลัก: ${taxId}`);

            // โครงสร้างของเลข 13 หลัก เป็นกล่อง 13 กล่องแยกกัน (class="inputId")
            const allInputBoxes = modalContent.locator("input.inputId");
            const totalBoxes = await allInputBoxes.count();

            // ปกติฟอร์มลักษณะนี้ แม้จะหน้าตาเหมือน 13 ช่อง แต่มักจะมี input ซ่อนอยู่ 1 ตัว หรือพิมพ์ต่อกันได้เลย
            // เราหา input ตัวแรกในชุดแล้วสั่ง fill ลวดเดียว
            if (totalBoxes >= 13 && taxId.length === 13) {
              addLog(job.id, "info", `แยกกรอกทีละช่อง 13 กล่อง`);
              for (let i = 0; i < 13; i++) {
                const digit = taxId.charAt(i);
                const box = allInputBoxes.nth(i);
                await box.focus(); // แนะนำให้ focus ก่อนพิมพ์กันเหนียว
                await box.fill(digit);
              }
            } else {
              addLog(
                job.id,
                "warn",
                `⚠️ ไม่พบช่องกรอกแบบแยก 13 ช่อง (พบ ${totalBoxes}) ลอง Fallback แบบเดิม...`,
              );
              const taxInput = page.locator("#inputTaxId input").first();
              await taxInput.focus();
              await taxInput.fill("");
              await taxInput.pressSequentially(taxId, { delay: 30 }); // พิมพ์ทีละตัวให้ระบบ format ให้
            }
            await page.waitForTimeout(1000);

            // 3. จัดการเรื่อง "สาขา"
            const isHeadOffice =
              !branch ||
              branch === "00000" ||
              branch === "0000" ||
              branch === "สำนักงานใหญ่";

            if (isHeadOffice) {
              addLog(job.id, "info", "🏢 เลือกสาขา: สำนักงานใหญ่ -> กดค้นหา");
              // "สำนักงานใหญ่" ถูกเลือกอยู่แล้ว (default) → ไปกดค้นหาได้เลย
            } else {
              const paddedBranch = branch.replace(/\D/g, "").padStart(5, "0");
              addLog(job.id, "info", `🏬 เลือกสาขา: ย่อย (${paddedBranch})`);

              // คลิกวิทยุ "สาขา" ใน Modal
              const branchRadioLabel = modalContent
                .locator("label")
                .filter({ hasText: /^สาขา$/ })
                .first();
              await branchRadioLabel.click();
              await page.waitForTimeout(1000); // รอให้ช่องกรอกสาขาโผล่มา

              addLog(
                job.id,
                "info",
                `⌨️ กำลังพิมพ์เลขสาขา 5 หลัก: ${paddedBranch}`,
              );

              // โครงสร้างหน้าเว็บเป็นกล่องเดี่ยว 5 กล่อง (แยกตัวอักษร)
              // จากการตรวจสอบ DOM: ทุกกล่องในหน้า (ทั้งเลขผู้เสียภาษีและสาขา) ใช้ class "inputId"
              // เลขผู้เสียภาษีมี 13 กล่อง (Index 0-12)
              // เลขสาขามี 5 กล่อง (Index 13-17)
              const allInputBoxes = modalContent.locator("input.inputId");
              const totalBoxes = await allInputBoxes.count();

              if (totalBoxes >= 18) {
                // กรอกลงกล่องที่ 14 ถึง 18 (Index 13 ถึง 17)
                for (let i = 0; i < 5; i++) {
                  const digit = paddedBranch[i];
                  const box = allInputBoxes.nth(13 + i);
                  await box.focus();
                  await box.fill("");
                  await box.pressSequentially(digit);
                  await page.waitForTimeout(10); // หายใจ 10ms พอให้ Vue ทัน
                }
              } else {
                // Fallback เผื่อ PEAK แอบซ่อนกล่องหรือเปลี่ยน UI ให้เป็นกล่องข้อความธรรมดา
                addLog(
                  job.id,
                  "warn",
                  `⚠️ ไม่พบช่องกรอกสาขาแบบกล่องแยก 5 ช่อง (พบทั้งหมด ${totalBoxes} ช่อง) ลอง Fallback แบบเดิม...`,
                );

                // หา label "สาขา" แล้วคลิกกล่อง input หลัง label
                const branchRadioWrapper = modalContent
                  .getByText(/^สาขา$/)
                  .locator("..")
                  .locator("..");
                const fallbackInput = branchRadioWrapper
                  .locator('input[type="text"]')
                  .first();

                if (await fallbackInput.isVisible()) {
                  await fallbackInput.focus();
                  await fallbackInput.fill("");
                  await fallbackInput.pressSequentially(paddedBranch, {
                    delay: 30,
                  });
                } else {
                  // กด tab ถัดจาก radio แล้วพิมพ์
                  await page.keyboard.press("Tab");
                  await page.waitForTimeout(200);
                  await page.keyboard.type(paddedBranch, { delay: 30 });
                }
              }
              await page.waitForTimeout(1000);
            }

            // 4. กดปุ่ม [ค้นหา] เพื่อเชื่อมต่อ API กรมพัฒน์
            addLog(
              job.id,
              "info",
              `⏳ รอให้ระบบ PEAK อัปเดตข้อมูลสาขา 1 วินาที...`,
            );
            await page.waitForTimeout(1000); // รอ 1 วินาทีหลังจากกรอกสาขาเสร็จ ค่อยกดปุ่มค้นหา

            // ใช้ xpath ที่ชี้ไปที่ปุ่มที่เขียนว่า "ค้นหา" เป๊ะๆ เพื่อหลีกเลี่ยงการไปโดนปุ่ม "ค้นหาด้วยชื่อ"
            const searchBtn = modalContent
              .locator("xpath=//button[normalize-space()='ค้นหา']")
              .first();
            await searchBtn.click();
            addLog(
              job.id,
              "info",
              `🔍 กดปุ่ม "ค้นหา" (เชื่อมต่อกรมพัฒน์ฯ) เรียบร้อยแล้ว`,
            );

            // รอโหลดดิ้งของ PEAK หายไป
            try {
              await page.waitForSelector(".IsLoadingBg", {
                state: "hidden",
                timeout: 10000,
              });
            } catch (e) {}

            // รีบดักจับข้อความแจ้งเตือนทันที (เพราะข้อความอาจปรากฏขึ้นแล้วหายไปอย่างรวดเร็ว)
            try {
              const errorLocator = modalContent.locator(
                ':text-matches("เลขที่สาขาไม่ถูกต้อง", "i")',
              );
              const successLocator = modalContent.locator(
                ':text-matches("ค้นหาสำเร็จ", "i")',
              );

              // รอให้อันใดอันหนึ่งโผล่ขึ้นมา (ให้เวลา 3 วินาที)
              await errorLocator
                .or(successLocator)
                .first()
                .waitFor({ state: "visible", timeout: 3000 });

              if (await errorLocator.isVisible()) {
                addLog(
                  job.id,
                  "warn",
                  `⚠️ จับข้อความ "เลขที่สาขาไม่ถูกต้อง" ได้ทัน! -> กำลังกดค้นหาซ้ำ...`,
                );
                await searchBtn.click();
                try {
                  await page.waitForSelector(".IsLoadingBg", {
                    state: "hidden",
                    timeout: 10000,
                  });
                } catch (e) {}
                await page.waitForTimeout(2000); // ชะลอให้ข้อมูลที่อยู่โหลดเสร็จหลังกดรอบสอง
              } else if (await successLocator.isVisible()) {
                addLog(
                  job.id,
                  "success",
                  `✅ พบข้อความ "ค้นหาสำเร็จ" จากระบบแจ้งเตือน`,
                );
              }
            } catch (e) {
              addLog(
                job.id,
                "info",
                `⏳ รอ 3 วินาทีแล้วไม่มีข้อความแจ้งเตือน (ทำงานต่อ)`,
              );
            }

            // 5. ดึงข้อมูลที่อยู่จาก Excel มาเติม
            // ค้นหา vendor จาก Sheet "ที่อยู่แต่ละบริษัท" (ระวังชื่อคอลัมน์ใน Excel มีช่องว่างหรือขึ้นบรรทัดใหม่)
            const vendorMaster = vendors.find((v) => {
              const taxKey = Object.keys(v).find((k) =>
                k.replace(/[\n\r\s]/g, "").includes("เลขประจำตัวผู้เสียภาษี"),
              );
              return taxKey
                ? String(v[taxKey]).replace(/\D/g, "") === taxId
                : false;
            });

            if (vendorMaster) {
              addLog(job.id, "info", `📍 ตรวจสอบช่องที่อยู่...`);

              // ปัญหาของ PEAK คือกล่อง Input แบบย่อ อาจทำให้ actionability (คลิก) ผิดพลาดได้ถ้าฟอร์มโดนบังด้วย Text
              // วิธีที่ชัวร์ที่สุดคือเช็คว่ามีคำว่า "แขวง/ตำบล" ปรากฏบนจอหรือไม่ (ถ้าไม่มี = แบบฟอร์มถูกย่ออยู่ 100%)
              const subDistrictLabel = modalContent.getByText("แขวง/ตำบล").first();
              let isExpanded = await subDistrictLabel.isVisible({ timeout: 1000 }).catch(() => false);
              
              if (!isExpanded) {
                try {
                  // หา Container ของ "ที่อยู่จดทะเบียน" เพื่อหากดปุ่ม ย่อ/ขยาย ที่ถูกต้อง
                  addLog(job.id, "info", `🗂️ ฟอร์มที่อยู่ถูกย่ออยู่ กำลังกางออก...`);
                  const addressHeader = modalContent.locator('text="ที่อยู่จดทะเบียน"').first();
                  // มักจะอยู่ใน block ควบคู่กัน หรือใช้ .first() เป็น fallback
                  const expandBtn = modalContent.locator('text="ย่อ/ขยาย"').first();
                  
                  if (await expandBtn.isVisible({ timeout: 2000 })) {
                    // ใช้ force click เผื่อมี element ใสๆ บังปุ่ม
                    await expandBtn.click({ force: true });
                    await page.waitForTimeout(1500); // รอฟอร์ม Animation กางออกสมบูรณ์
                  }
                } catch (e) {
                  addLog(job.id, "warn", `⚠️ ไม่สามารถกดกางช่องที่อยู่ได้: ${e.message}`);
                }
              }

              // Address input หลัก (สำหรับใส่บ้านเลขที่/ถนน)
              const addressInput = modalContent
                .locator('input[placeholder*="กรุณาระบุเลขที่"], input[placeholder*="ซอย ถนน อาคาร"]')
                .first();

              if (await addressInput.isVisible()) {
                const currentAddr = await addressInput.inputValue();

                // 2. ดึงข้อความสรุปที่อยู่จาก PEAK (มักจะอยู่ใต้ #AddcontactBox)
                let fullWebText = "";
                try {
                  const summaryP = modalContent.locator('#AddcontactBox > p').last(); // last p is usually the address summary
                  if (await summaryP.isVisible({ timeout: 2000 })) {
                    fullWebText = await summaryP.innerText();
                  } else {
                    // Fallback ไปอ่านจากกล่อง Input แทน
                    fullWebText = currentAddr;
                    const allInputs = await modalContent.locator('#AddcontactBox input[type="text"]').elementHandles();
                    for (const input of allInputs) {
                      try { fullWebText += " " + (await input.inputValue()); } catch (e) {}
                    }
                  }
                } catch (e) {
                  fullWebText = currentAddr;
                }

                // fallback ถ้าไม่มีอะไรเลย
                if (!fullWebText || fullWebText.trim() === "") fullWebText = currentAddr;

                // ค้นหาคอลัมน์ที่อยู่จาก Excel (ยืดหยุ่นคำค้นหา)
                let fullAddress = "";
                const fullAddrKey = Object.keys(vendorMaster).find((k) =>
                  k.replace(/[\n\r\s]/g, "").includes("ที่อยู่รวม"),
                );
                const sysAddrKey = Object.keys(vendorMaster).find((k) =>
                  k.replace(/[\n\r\s]/g, "").includes("ที่อยู่ตามระบบ"),
                );

                if (fullAddrKey && vendorMaster[fullAddrKey]) {
                  fullAddress = String(vendorMaster[fullAddrKey]).trim();
                } else if (sysAddrKey && vendorMaster[sysAddrKey]) {
                  fullAddress = String(vendorMaster[sysAddrKey]).trim();
                }

                // ฟังก์ชันตัวช่วยสำหรับล้างข้อมูลเก่าและกดปุ่มกระจายข้อมูล
                const fillAndDistribute = async (addressText) => {
                  try {
                    // รอให้กล่องปรากฏขึ้นมาแน่ๆ ก่อนนำไปคลิก
                    await addressInput.waitFor({ state: "visible", timeout: 2000 });
                  } catch (e) {
                    addLog(job.id, "warn", `⚠️ ไม่พบกล่องกรอกข้อมูลที่อยู่ หรือกล่องอาจจะยังโหลดไม่เสร็จ... ลองเขียนทับ (Force)`);
                  }

                  try {
                    // ใช้ force click เพื่อทะลุป้าย Text ที่ PEAK ชอบสร้างมาทับ
                    await addressInput.focus();
                    await addressInput.click({ clickCount: 3, force: true });
                    await page.keyboard.press("Backspace");
                    await page.waitForTimeout(200);
                  } catch (e) {
                    addLog(job.id, "warn", `⚠️ มีข้อผิดพลาดขณะพยายามล้างข้อมูลเก่า: ${e.message}`);
                  }

                  // 2. ใส่ข้อมูลเต็มไปก่อน เพื่อให้ปุ่ม "กระจายข้อมูล" ทำงานได้
                  await addressInput.fill(addressText);
                  await addressInput.press("Enter");

                  // 3. กดปุ่ม "กระจายข้อมูล" เพื่อให้ PEAK จัดการแยก แขวง/เขต/จังหวัด ให้อัตโนมัติ
                  try {
                    const distributeBtn = modalContent
                      .getByText("กระจายข้อมูล")
                      .first();
                    if (await distributeBtn.isVisible({ timeout: 1000 })) {
                      await distributeBtn.click();
                      await page.waitForTimeout(1500); // รอ PEAK แยกข้อมูลลงช่องต่างๆ
                    }
                  } catch (e) {}

                  // 4. ตัดเอาเฉพาะบ้านเลขที่/ถนน เพื่อไม่ให้ซ้ำซ้อนกับช่อง แขวง/เขต ด้านล่าง
                  const match = addressText.match(
                    /\s(ตำบล|ต\.|แขวง|อำเภอ|อ\.|เขต|จังหวัด|จ\.|กทม\.|กรุงเทพมหานคร|กรุงเทพฯ|\b\d{5}\b)/,
                  );
                  if (match && match.index > 3) {
                    let line1 = addressText.substring(0, match.index).trim();
                    line1 = line1.replace(/,+$/, "").trim(); // ลบลูกน้ำท้ายประโยค

                    // 5. ล้างอีกรอบแล้วใส่เฉพาะส่วนแรก
                    await addressInput.focus();
                    await addressInput.click({ clickCount: 3, force: true });
                    await page.keyboard.press("Backspace");
                    await page.waitForTimeout(200);
                    await addressInput.fill(line1);
                    await addressInput.press("Enter");
                  }
                };

                // ฟังก์ชันช่วยทำความสะอาดข้อความเพื่อเปรียบเทียบ (ลบช่องว่าง, คำนำหน้า ตำบล/อำเภอ/จังหวัด ที่มักเขียนต่างกัน)
                const normalizeAddr = (text) => {
                  if (!text) return "";
                  return text
                    .replace(/[\s\n\r\t]/g, "") // ลบ whitespace ทุกชนิด
                    .replace(
                      /(ตำบล|ต\.|อำเภอ|อ\.|จังหวัด|จ\.|หมู่ที่|หมู่|ม\.|เลขที่|ซอย|ซ\.|ถนน|ถ\.|กรุงเทพมหานคร|กรุงเทพฯ|กทม\.|แขวง|เขต)/g,
                      "",
                    )
                    .toLowerCase();
                };

                // นโยบายใหม่: ตรวจสอบแบบยืดหยุ่น (Fuzzy Match)
                if (fullAddress && fullAddress.trim() !== "") {
                  // เช็คจาก Mega String (ที่รวมทุกกล่องใน Popup ไว้แล้ว)
                  const normCurrentMega = normalizeAddr(fullWebText);
                  const normExcel = normalizeAddr(fullAddress);

                  // ถ้าข้อมูลหลักจาก Excel "ไม่โผล่" อยู่ในคลัง Mega String ของเว็บ ค่อยทับ
                  if (!normCurrentMega.includes(normExcel) && !normExcel.includes(normCurrentMega)) {
                    addLog(
                      job.id,
                      "info",
                      `⚠️ ข้อมูลบนเว็บไม่ตรงกับ Excel -> ลบแล้วใส่ใหม่... (เว็บ: "${fullWebText.substring(0, 30)}..." | Excel: "${fullAddress.substring(0, 30)}...")`,
                    );
                    await fillAndDistribute(fullAddress);
                    addLog(
                      job.id,
                      "success",
                      `✅ เติมที่อยู่จากไฟล์ Excel สมบูรณ์: "${fullAddress}"`,
                    );
                  } else {
                    addLog(
                      job.id,
                      "info",
                      `✅ ข้อมูลที่อยู่บนเว็บเป๊ะกับ Excel แล้ว (ข้ามการพิมพ์ทับ)`,
                    );
                  }
                } else {
                  // ถ้าใน Excel ไม่มีที่อยู่ ก็จำใจใช้ของเว็บไปตามสภาพ (ถ้าเว็บมี)
                  if (
                    !currentAddr ||
                    currentAddr.trim() === "" ||
                    currentAddr.length < 10
                  ) {
                    addLog(
                      job.id,
                      "warn",
                      `⚠️ ไม่มีข้อมูลที่อยู่ในไฟล์ Excel สำหรับเจ้านี้ (และหน้าเว็บก็ไม่มี)`,
                    );
                  } else {
                    addLog(
                      job.id,
                      "info",
                      `✅ ระบบ PEAK ดึงที่อยู่มาให้แล้ว และไม่มีข้อมูลใน Excel ให้เทียบทับ ("${currentAddr}")`,
                    );
                  }
                }
              } else {
                addLog(
                  job.id,
                  "warn",
                  `⚠️ หาช่องกรอกที่อยู่ไม่พบ (Input ผิดรูปแบบ หรือหาไม่เจอ)`,
                );
              }
            }

            // 6. กดปุ่ม [เพิ่ม] บันทึกผู้ติดต่อใหม่
            addLog(job.id, "info", `💾 บันทึกผู้ติดต่อใหม่...`);

            // รอ IsLoadingBg หายไปเผื่อระบบกำลังประมวลผลที่อยู่
            try {
              await page.waitForSelector(".IsLoadingBg", {
                state: "hidden",
                timeout: 10000,
              });
            } catch (e) {}
            await page.waitForTimeout(500);

            const saveBtn = modalContent.getByRole("button", { name: "เพิ่ม", exact: true }).first();
            try {
              if (await saveBtn.isVisible({ timeout: 2000 })) {
                await saveBtn.click();
              } else {
                // Fallback เผื่อหาไม่เจอด้วย ByRole
                const altSave = modalContent.locator("button:has-text('เพิ่ม')").last();
                await altSave.click({ force: true });
              }
            } catch (e) {
              addLog(job.id, "warn", `⚠️ กดปุ่มเพิ่มไม่ได้ ลองใช้ Force Click`);
              await saveBtn.click({ force: true });
            }

            // รอ Modal ปิด
            try {
               await page.locator('.modal-mask, .el-dialog__wrapper').waitFor({ state: "hidden", timeout: 10000 });
            } catch (e) {}
            await page.waitForTimeout(1000); // Wait for the add animation
            addLog(job.id, "success", `✅ สร้างผู้ติดต่อใหม่สำเร็จ`);
          }

          // --- จบขั้นตอน Vendor ---
          // --- จบขั้นตอน Vendor ---

          // --- เริ่มขั้นตอน กรอกข้อมูลหลักและรายการ ---
          addLog(job.id, "info", "📝 กำลังกรอกข้อมูลวันที่, เลขที่เอกสาร และ บัญชี/ค่าใช้จ่าย...");
          
          // 1. วันที่ (ทำครั้งเดียวต่อบิล)
          const issueDate = primaryTx["วันที่"];
          if (issueDate) {
              addLog(job.id, "info", `📅 กำลังกรอกวันที่ออก (ค่าจาก Excel: ${issueDate})...`);
              // หาช่องวันที่ออก จาก name attribute ที่บอทหรอก
              const issueDateEl = page.locator('input[name="วันที่ออก"]').first();
              try {
                  await issueDateEl.waitFor({ state: 'attached', timeout: 5000 });
              } catch(e) {}
              
              if (await issueDateEl.isVisible() || await issueDateEl.count() > 0) {
                  let dateStr = String(issueDate).trim();
                  // หากเป็น Format ตัวเลขดิบของ Excel (เช่น 45000)
                  if (!isNaN(dateStr) && Number(dateStr) >= 20000) {
                      const d = new Date(Math.round((Number(dateStr) - 25569) * 86400 * 1000));
                      const day = String(d.getDate()).padStart(2, '0');
                      const mon = String(d.getMonth() + 1).padStart(2, '0');
                      const yr = String(d.getFullYear());
                      dateStr = `${day}/${mon}/${yr}`;
                      addLog(job.id, "info", `🔄 แปลงวันที่จาก Excel serial (${issueDate}) → ${dateStr}`);
                  } else if (dateStr.includes('-')) {
                      // สมมติมาแปลกเป็น YYYY-MM-DD ให้สลับกลับ
                      const parts = dateStr.split('-');
                      if (parts.length === 3) dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
                      addLog(job.id, "info", `🔄 แปลงวันที่จาก YYYY-MM-DD → ${dateStr}`);
                  }
                  
                  await issueDateEl.click();
                  // ใช้ดรากเพื่อคลุมดำและลบ หรือกรอกทับ
                  await issueDateEl.press('Control+a');
                  await issueDateEl.press('Backspace');
                  await issueDateEl.pressSequentially(dateStr, { delay: 10 });
                  await issueDateEl.press('Enter');
                  addLog(job.id, "success", `✅ กรอกวันที่ออก: ${dateStr} สำเร็จ`);
              } else {
                  addLog(job.id, "warn", `⚠️ หาช่อง 'วันที่ออก' ไม่พบ ให้ใช้งานวันที่ตั้งต้นของระบบ`);
              }
          } else {
              addLog(job.id, "info", `📅 ไม่มีข้อมูลวันที่ใน Excel ใช้วันที่ตั้งต้นของระบบ`);
          }
          // 1.5 วันที่ครบกำหนด (Due Date) — กรอกเฉพาะเมื่อ Excel มีข้อมูล
          const dueDate = primaryTx["วันครบกำหนดชำระ"];
          if (dueDate) {
              addLog(job.id, "info", `📅 กำลังกรอกวันที่ครบกำหนด (ค่าจาก Excel: ${dueDate})...`);
              const dueDateEl = page.locator('input[name="วันที่ครบกำหนด"]').first();
              try {
                  await dueDateEl.waitFor({ state: 'attached', timeout: 5000 });
              } catch(e) {}
              
              if (await dueDateEl.isVisible() || await dueDateEl.count() > 0) {
                  let dueDateStr = String(dueDate).trim();
                  // แปลง format เดียวกับวันที่ออก
                  if (!isNaN(dueDateStr) && Number(dueDateStr) >= 20000) {
                      const d = new Date(Math.round((Number(dueDateStr) - 25569) * 86400 * 1000));
                      const day = String(d.getDate()).padStart(2, '0');
                      const mon = String(d.getMonth() + 1).padStart(2, '0');
                      const yr = String(d.getFullYear());
                      dueDateStr = `${day}/${mon}/${yr}`;
                      addLog(job.id, "info", `🔄 แปลงวันครบกำหนดจาก Excel serial (${dueDate}) → ${dueDateStr}`);
                  } else if (dueDateStr.includes('-')) {
                      const parts = dueDateStr.split('-');
                      if (parts.length === 3) dueDateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
                      addLog(job.id, "info", `🔄 แปลงวันครบกำหนดจาก YYYY-MM-DD → ${dueDateStr}`);
                  }
                  
                  await dueDateEl.click();
                  await dueDateEl.press('Control+a');
                  await dueDateEl.press('Backspace');
                  await dueDateEl.pressSequentially(dueDateStr, { delay: 10 });
                  await dueDateEl.press('Enter');
                  addLog(job.id, "success", `✅ กรอกวันที่ครบกำหนด: ${dueDateStr} สำเร็จ`);
              } else {
                  addLog(job.id, "warn", `⚠️ หาช่อง 'วันที่ครบกำหนด' ไม่พบบนหน้าเว็บ`);
              }
          }
          
          // 2. เลขที่เอกสาร (Tax Invoice No / Document No) (ทำครั้งเดียวต่อบิล)
          const docNo = primaryTx["เลขที่เอกสาร"];
          if (docNo) {
              addLog(job.id, "info", `📝 กำลังกรอกเลขที่ใบกำกับภาษี: ${docNo}...`);
              const taxInvInput = page.getByPlaceholder("ระบุเลขที่ใบกำกับภาษี").first();
              if (await taxInvInput.isVisible()) {
                  await taxInvInput.fill("");
                  await taxInvInput.pressSequentially(String(docNo), { delay: 10 });
                  addLog(job.id, "success", `✅ กรอกเลขที่ใบกำกับภาษี: ${docNo} สำเร็จ`);
              } else {
                  addLog(job.id, "warn", `⚠️ หาช่อง 'เลขที่ใบกำกับภาษี' ไม่พบ`);
              }
          } else {
              addLog(job.id, "info", `📝 ไม่มีข้อมูลเลขที่เอกสารใน Excel (ข้ามขั้นตอน)`);
          }
          
          // --- วนลูปกรอกรายการสินค้า/บัญชี ภายในบิลนี้ ---
          for (let itemIdx = 0; itemIdx < docGroup.length; itemIdx++) {
            const itemTx = docGroup[itemIdx];
            const displayRowNum = itemIdx + 1;
            addLog(job.id, "info", `📌 กำลังกรอกรายการที่ ${displayRowNum}/${docGroup.length}...`);
            
            // ถ้าเป็นรายการที่ 2 เป็นต้นไป ให้กดปุ่ม "เพิ่มรายการใหม่" ก่อน
            if (itemIdx > 0) {
                addLog(job.id, "info", `➕ กดปุ่ม 'เพิ่มรายการใหม่' สำหรับแถวที่ ${displayRowNum}`);
                const addRowBtn = page.getByText("เพิ่มรายการใหม่", { exact: false }).first();
                if (await addRowBtn.count() > 0) {
                    await addRowBtn.click();
                    await page.waitForTimeout(300); // รอ UI สร้างแถวใหม่
                } else {
                    addLog(job.id, "warn", `⚠️ หาปุ่ม 'เพิ่มรายการใหม่' ไม่พบ อาจจะกรอกข้อมูลทับของเดิม`);
                }
            }
          
          // 3. บัญชี/ค่าใช้จ่าย (Account Code) — Vue Multiselect Component
          const accCode = itemTx["โค้ดบันทึกบัญชี"];
          if (accCode) {
              addLog(job.id, "info", `📦 ค้นหาและระบุ โค้ดบันทึกบัญชี: ${accCode} (รายการที่ ${displayRowNum})`);
              
              // Scroll ลงไปที่ตาราง "รายการ" ก่อน เพื่อบังคับให้ Vue render element ออกมา
              const itemsSection = page.getByText("รายการ").first();
              try {
                  await itemsSection.scrollIntoViewIfNeeded();
                  await page.waitForTimeout(200);
              } catch(e) {}
              
              // หา Input หรือ Container ที่มองเห็นได้
              let triggerElement = null;
              let found = false;
              
              // วิธี 1: หาจาก placeholder ตรงๆ - ถ้าแถวก่อนหน้าถูกเลือกไปแล้ว input อาจหายไป ใช้ .last() เพื่ออ้างอิงแถวใหม่ล่าสุด
              const sel1 = page.locator('input[placeholder*="บัญชี/ค่าใช้จ่าย"]:visible').last();
              // วิธี 2: หาสำหรับหน้า purchaseInventory
              const sel2 = page.locator('input[placeholder*="รหัสบัญชี"]:visible').last();
              // วิธี 3: หาช่อง textSelectedDropdown
              const sel3 = page.locator('.textSelectedDropdown:visible').last();
              
              for (const [idx, sel] of [[1, sel1], [2, sel2], [3, sel3]]) {
                  try {
                      const cnt = await sel.count();
                      if (cnt > 0) {
                          triggerElement = sel;
                          found = true;
                          addLog(job.id, "info", `🔍 พบช่องบัญชี/ค่าใช้จ่ายด้วยวิธีที่ ${idx}`);
                          break;
                      }
                  } catch(e) {}
              }
              
              if (found && triggerElement) {
                  try {
                      // 1. คลิกที่ Trigger เพื่อเปิด Dropdown
                      await triggerElement.scrollIntoViewIfNeeded();
                      await triggerElement.click({ force: true });
                      await page.waitForTimeout(400); // รอให้ Vue Active + กาง DOM
                      
                      // 2. ดึง input ตัวที่รับคีย์บอร์ด ซึ่งจะอยู่ใน .multiselect--active
                      let accInput = page.locator('.multiselect--active input.multiselect__input').first();
                      if ((await accInput.count()) === 0) {
                          // ถ้าหาไม่เจอ ให้พิมพ์ลงตัว trigger เดิมเผื่อใช้ได้
                          accInput = triggerElement;
                      }
                      
                      // ล้างค่าเก่าแล้วพิมพ์ทีละตัว
                      await accInput.fill(String(accCode).trim());
                      addLog(job.id, "info", `⌨️ พิมพ์ค้นหาบัญชี: ${accCode} เรียบร้อย รอ Dropdown แสดงผล...`);
                      
                      try {
                          // ตัดเวลาดีเลย์ทิ้ง ให้รอปุ่ม "เพิ่มบัญชีใหม่" หรือตัวเลขบัญชีที่ตรงกันโผล่มารวดเร็วแทน
                          const activeDropdownLoc = page.locator('.multiselect--active').first();
                          await activeDropdownLoc.locator("li.multiselect__element").first().waitFor({ state: 'visible', timeout: 1500 });
                      } catch (e) {}
                      await page.waitForTimeout(150); // เซฟเผื่อ Vue Render กระตุกนิดนึง
                      
                      // 3. ตรวจสอบ Dropdown Option
                      const activeDropdown = page.locator('.multiselect--active').first(); // จำกัด Scope เฉพาะช่องที่เปิดอยู่
                      const accOption = activeDropdown.locator("li.multiselect__element span").filter({ hasText: new RegExp(String(accCode).trim(), "i") }).first();
                      
                      const addNewBtn = activeDropdown.locator("li.multiselect__element").filter({ hasText: "เพิ่มบัญชีใหม่" });
                      const allOptions = activeDropdown.locator("li.multiselect__element");
                      const totalOptions = await allOptions.count();
                      const addNewCount = await addNewBtn.count();
                      
                      if (totalOptions <= 1 && addNewCount > 0) {
                          // ❌ มีแค่ "เพิ่มบัญชีใหม่" = โค้ดบัญชีไม่มีในระบบ
                          await accInput.press('Escape');
                          await page.waitForTimeout(300);
                          addLog(job.id, "error", `❌ หาโค้ดบัญชี ${accCode} ไม่เจอในระบบ PEAK (มีแต่ตัวเลือก "เพิ่มบัญชีใหม่") — ข้ามขั้นตอนนี้`);
                      } else if (await accOption.isVisible({ timeout: 2000 })) {
                          // ✅ เจอโค้ดที่ตรง → คลิกเลือก (ใช้ evaluate click เพื่อหลีกเลี่ยงបញ្หา Element is outside of the viewport)
                          await accOption.evaluate((el) => el.click());
                          addLog(job.id, "success", `✅ เลือกบัญชี/ค่าใช้จ่ายโค้ด: ${accCode} เรียบร้อยแล้ว`);
                      } else if (totalOptions > 1) {
                          // มีรายการอื่นแต่ไม่ตรงเป๊ะ → เลือกตัวแรกที่ไม่ใช่ "เพิ่มบัญชีใหม่"
                          for (let oi = 0; oi < totalOptions; oi++) {
                              const optText = await allOptions.nth(oi).textContent();
                              if (!optText.includes("เพิ่มบัญชีใหม่") && !optText.includes("ทั้งหมด")) {
                                  await allOptions.nth(oi).evaluate((el) => el.click());
                                  addLog(job.id, "warn", `⚠️ ไม่พบบัญชีโค้ด ${accCode} เป๊ะ จึงเลือก: "${optText.trim()}"`);
                                  break;
                              }
                          }
                      } else {
                          await accInput.press('Escape');
                          addLog(job.id, "error", `❌ หาโค้ดบัญชี ${accCode} ไม่เจอในระบบ PEAK — ข้ามขั้นตอนนี้`);
                      }
                  } catch (fillErr) {
                      addLog(job.id, "warn", `⚠️ เกิดข้อผิดพลาดขณะกรอกบัญชี: ${fillErr.message}`);
                  }
              } else {
                  addLog(job.id, "warn", `⚠️ หาช่อง 'บัญชี/ค่าใช้จ่าย' แบบที่มองเห็นได้ ไม่พบเลย`);
              }
          }
          
          // 3.5 ตั้งค่า ประเภทราคา ให้เป็น "รวมภาษี" (ทำแค่ครั้งเดียวในรายการแรกของบิล)
          if (itemIdx === 0) {
              try {
                  await page.keyboard.press('Escape');
                  await page.waitForTimeout(100);

                  addLog(job.id, "info", `⚙️ กำลังตั้งค่า 'ประเภทราคา' เป็น 'รวมภาษี'...`);

                  // Step 1: Scroll to dropdown ก่อน แล้วค่อยอ่านพิกัด (แยก 2 steps เพราะ scroll ต้อง settle ก่อน)
                  await page.evaluate(() => {
                      const priceTypeValues = ['แยกภาษี', 'รวมภาษี', 'ไม่มี'];
                      const allMultiselects = Array.from(document.querySelectorAll('.multiselect'));
                      const priceTypeMulti = allMultiselects.find(ms => {
                          const singleLabel = ms.querySelector('.multiselect__single p, .singleLabel p');
                          return singleLabel && priceTypeValues.some(v => singleLabel.textContent.trim() === v);
                      });
                      if (priceTypeMulti) priceTypeMulti.scrollIntoView({ block: 'center' });
                  });
                  await page.waitForTimeout(200); // รอให้ scroll settle

                  // Step 2: อ่านพิกัดหลัง scroll เสร็จ
                  const priceTypeRect = await page.evaluate(() => {
                      const priceTypeValues = ['แยกภาษี', 'รวมภาษี', 'ไม่มี'];
                      const allMultiselects = Array.from(document.querySelectorAll('.multiselect'));
                      const priceTypeMulti = allMultiselects.find(ms => {
                          const singleLabel = ms.querySelector('.multiselect__single p, .singleLabel p');
                          return singleLabel && priceTypeValues.some(v => singleLabel.textContent.trim() === v);
                      });
                      if (!priceTypeMulti) return null;
                      const rect = priceTypeMulti.getBoundingClientRect();
                      if (rect.width === 0 || rect.height === 0) return null;
                      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                  });

                  if (priceTypeRect) {
                      await page.mouse.click(priceTypeRect.x, priceTypeRect.y);
                      await page.waitForTimeout(300);

                      // ค้นหาตัวเลือก "รวมภาษี" ใน dropdown ที่เปิดอยู่ และหาตำแหน่ง XY
                      const vatOptRect = await page.evaluate(() => {
                          const lis = Array.from(document.querySelectorAll('li.multiselect__element'));
                          const opt = lis.find(li => li.textContent.trim() === 'รวมภาษี');
                          if (!opt) return null;
                          const rect = opt.getBoundingClientRect();
                          if (rect.width === 0) return null;
                          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                      });

                      if (vatOptRect) {
                          await page.mouse.click(vatOptRect.x, vatOptRect.y);
                          addLog(job.id, "success", `✅ ตั้งค่า 'ประเภทราคา' เป็น 'รวมภาษี' สำเร็จ`);
                      } else {
                          await page.keyboard.press('Escape');
                          addLog(job.id, "warn", `⚠️ หาตัวเลือก 'รวมภาษี' ในหน้าจอไม่พบ`);
                      }
                      await page.waitForTimeout(200);
                  } else {
                      addLog(job.id, "warn", `⚠️ หาตำแหน่ง 'ประเภทราคา' ในหน้าจอไม่พบ`);
                  }
              } catch (e) {
                  addLog(job.id, "warn", `⚠️ เกิดข้อผิดพลาดตอนตั้งค่าประเภทราคา: ${e.message}`);
              }
          }

          // 4. ราคา/หน่วย (Price per Unit)
          const priceStr = itemTx["ยอดหลังบวกภาษีมูลค่าเพิ่ม"];
          if (priceStr !== undefined && priceStr !== null) {
              const priceNum = String(priceStr).replace(/,/g, "").trim();
              if (priceNum !== "") {
                  addLog(job.id, "info", `💰 กำลังกรอกราคา/หน่วย: ${priceNum} (รายการที่ ${displayRowNum})`);
                  try {
                      // จาก HTML จริง: input อยู่ใน <div id="inputPrice"> → ใช้ selector นี้ตรงๆ ได้เลย
                      // ใช้ .last() เพื่อหาช่องกรอกราคาของแถวล่าสุด (แถวที่เพิ่งกดเพิ่มมาใหม่)
                      const priceInputLocator = page.locator('#inputPrice input').last();
                      
                      if (await priceInputLocator.count() > 0) {
                          // คลิกและพิมพ์
                          await priceInputLocator.click({ force: true });
                          await page.keyboard.press('Control+a');
                          await page.keyboard.press('Backspace');
                          await page.keyboard.type(priceNum, { delay: 0 });
                          await page.waitForTimeout(200);
                          await page.keyboard.press('Tab');
                          addLog(job.id, "success", `✅ กรอกราคา/หน่วย ${priceNum} สำเร็จ`);
                      } else {
                          addLog(job.id, "warn", `⚠️ หาช่อง 'ราคา/หน่วย' (#inputPrice input) ไม่พบ`);
                      }
                      
                      // --- Helper เพื่อหา Key ที่อาจจะมีเว้นวรรคหรือขึ้นบรรทัดใหม่จาก Excel ---
                      const getExcelVal = (tx, keyword) => {
                          const keys = Object.keys(tx);
                          const matchedKey = keys.find(k => k.replace(/\s+/g, '').includes(keyword));
                          return matchedKey ? tx[matchedKey] : undefined;
                      };

                      // 5. ภาษี (VAT)
                      const vatAmtStr = getExcelVal(itemTx, "ยอดภาษีมูลค่าเพิ่ม");
                      const vatAmtNum = parseFloat(String(vatAmtStr || "0").replace(/,/g, "").trim());
                      const targetVatText = (!isNaN(vatAmtNum) && vatAmtNum > 0) ? "7%" : "ไม่มี";
                      
                      addLog(job.id, "info", `⚙️ กำลังระบุ 'ภาษี' เป็น: ${targetVatText} (จาก Excel ยอด = ${vatAmtStr || '0'})`);
                      try {
                          // หา container dropdownTax ของบรรทัดล่าสุด
                          const vatContainer = page.locator('#dropdownTax').last();
                          if (await vatContainer.count() > 0) {
                              // เปิด dropdown
                              await vatContainer.click({ force: true });
                              await page.waitForTimeout(300); // รอ DOM กาง
                              
                              // หาและคลิกตัวเลือก 7% หรือ ไม่มี ภายใน dropdown ของ div เดียวกัน (.selectInputDropdown)
                              const dropdownArea = vatContainer.locator('.selectInputDropdown').first();
                              
                              // ใน PEAK Dropdown แบบใหม่บางทีต้องมองหา li หรือ dropdown content
                              // แต่เนื่องจากเรากดเปิด container ไปแล้ว ตัวเลือกโผล่ในหน้าต่าง 
                              // ลองหาโดยตรงจาก page ให้ชัวร์ (เพราะบางทีมัน render นอก container เป็น portal) หรือถ้าอยู่ใน container
                              const vatOption = page.locator('.dropdown .textSelectedDropdown p, .dropdown .multiselect__option span, .selectInputDropdown p', { hasText: new RegExp(`^\\s*${targetVatText}\\s*$`, 'i') }).last();
                              
                              try {
                                  await vatOption.waitFor({ state: 'visible', timeout: 3000 });
                                  await vatOption.click({ force: true });
                                  await page.waitForTimeout(200);
                                  addLog(job.id, "success", `✅ เลือกระบุ 'ภาษี' เป็น '${targetVatText}' สำเร็จ`);
                              } catch (e) {
                                  await page.keyboard.press('Escape');
                                  addLog(job.id, "warn", `⚠️ ไม่พบตัวเลือกภาษี: '${targetVatText}' ใน Dropdown หรือโหลดช้าเกินไป`);
                              }
                          } else {
                              addLog(job.id, "warn", `⚠️ หาช่อง 'ภาษี' (#dropdownTax) ไม่พบ`);
                          }
                      } catch (vatErr) {
                          addLog(job.id, "warn", `⚠️ เกิดข้อผิดพลาดขณะตั้งค่าภาษี: ${vatErr.message}`);
                      }
                      
                      // 6. หัก ณ ที่จ่าย (Withholding Tax)
                      const whtVal = getExcelVal(itemTx, "หักณที่จ่าย");
                      if (whtVal !== undefined && whtVal !== null && String(whtVal).trim() !== "") {
                          // ตัด % และช่องว่างซ้ายขวาทิ้งทั้งหมด (รองรับทั้ง "5" และ "5%")
                          const cleanWht = String(whtVal).replace(/%/g, '').trim();
                          
                          // ใน Dropdown จะมี % ต่อท้ายเสมอ ยกเว้นค่า "ไม่มี" หรือ "กำหนดเอง" (ถ้ามี)
                          // แต่ Excel จะกรอกเป็นตัวเลข ดังนั้นเราเติม % ให้เสมอ ถือว่าเป็นตัวเลขภาษี
                          const targetWhtText = `${cleanWht}%`;
                          
                          addLog(job.id, "info", `📝 กำลังระบุ 'หัก ณ ที่จ่าย': ${targetWhtText} (ข้อมูล Excel = ${whtVal})...`);
                          
                          try {
                              // หา container #taxWithheld ของแถวที่กำลังทำงานอยู่ (ใช้ .last() เพื่อให้แน่ใจว่าดึงของแถวสุดท้าย)
                              const whtContainer = page.locator('#taxWithheld').last();
                              
                              if (await whtContainer.count() > 0) {
                                  // 1. คลิกเปิด Dropdown (คลิกที่ส่วน .whtDropdown)
                                  const whtDropdownBtn = whtContainer.locator('.whtDropdown').first();
                                  await whtDropdownBtn.scrollIntoViewIfNeeded();
                                  await whtDropdownBtn.click({ force: true });
                                  await page.waitForTimeout(300); // รอ animation กางลงมา
                                  
                                  // 2. ค้นหา span ภายใน .dropdown .product ของ whtContainer นี้
                                  const whtOption = whtContainer.locator('.dropdown .product span', { hasText: new RegExp(`^\\s*${targetWhtText}\\s*$`, 'i') }).first();
                                  
                                  try {
                                      await whtOption.waitFor({ state: 'visible', timeout: 3000 });
                                      await whtOption.click({ force: true });
                                      await page.waitForTimeout(500); // เพิ่มเวลาให้ระบบประมวลผลภาษีก่อนกดเพิ่มรายการใหม่
                                      addLog(job.id, "success", `✅ เลือกระบุ 'หัก ณ ที่จ่าย' เป็น '${targetWhtText}' สำเร็จ`);
                                  } catch (e) {
                                      // ถ้าหาไม่เจอ ให้คลิกปิด
                                      await page.keyboard.press('Escape');
                                      addLog(job.id, "warn", `⚠️ ไม่พบตัวเลือกเปอร์เซ็นต์หัก ณ ที่จ่าย: '${targetWhtText}' ใน Dropdown หรือโหลดช้าเกินไป`);
                                  }
                              } else {
                                  addLog(job.id, "warn", `⚠️ หาช่อง 'หัก ณ ที่จ่าย' (#taxWithheld) ของรายนี้ไม่พบ`);
                              }
                          } catch (whtErr) {
                              addLog(job.id, "warn", `⚠️ เกิดข้อผิดพลาดขณะระบุ หัก ณ ที่จ่าย: ${whtErr.message}`);
                          }
                      }
                      
                      } catch (priceErr) {
                          addLog(job.id, "warn", `⚠️ เกิดข้อผิดพลาดขณะกรอกราคา: ${priceErr.message}`);
                      }
                  }
              }
          } // End of items loop

          // --- 6.5 กรอกเอกสารอ้างอิง (ถ้ามีใน Excel) ---
          const getExcelValFlex = (tx, keyword) => {
              const keys = Object.keys(tx);
              const matchedKey = keys.find(k => k.replace(/[\n\r\s]/g, '').includes(keyword));
              return matchedKey ? tx[matchedKey] : undefined;
          };
          
          const refValue = getExcelValFlex(primaryTx, "อ้างอิง");
          if (refValue && String(refValue).trim() !== "") {
              const refStr = String(refValue).trim();
              addLog(job.id, "info", `📎 กำลังกรอกเอกสารอ้างอิง: ${refStr}...`);
              try {
                  const refInput = page.getByPlaceholder("ระบุเอกสารอ้างอิง ถ้ามี").first();
                  if (await refInput.isVisible({ timeout: 3000 })) {
                      await refInput.scrollIntoViewIfNeeded();
                      await refInput.click({ force: true });
                      await refInput.fill("");
                      await refInput.pressSequentially(refStr, { delay: 10 });
                      await page.waitForTimeout(200);
                      addLog(job.id, "success", `✅ กรอกเอกสารอ้างอิง: ${refStr} สำเร็จ`);
                  } else {
                      addLog(job.id, "warn", `⚠️ หาช่อง 'อ้างอิง' ไม่พบบนหน้าเว็บ`);
                  }
              } catch (refErr) {
                  addLog(job.id, "warn", `⚠️ เกิดข้อผิดพลาดขณะกรอกอ้างอิง: ${refErr.message}`);
              }
          }

          // --- 6.6 กรอกหมายเหตุสำหรับผู้ขาย (ถ้ามีใน Excel) ---
          const noteValue = getExcelValFlex(primaryTx, "หมายเหตุ");
          if (noteValue && String(noteValue).trim() !== "") {
              const noteStr = String(noteValue).trim();
              addLog(job.id, "info", `📝 กำลังกรอกหมายเหตุสำหรับผู้ขาย: ${noteStr.substring(0, 50)}${noteStr.length > 50 ? '...' : ''}...`);
              try {
                  // คลิก "ย่อ/ขยาย" เพื่อเปิดส่วนหมายเหตุ (ถ้ายังย่ออยู่)
                  const noteSection = page.locator('#RecordExternal').first();
                  if (await noteSection.count() > 0) {
                      await noteSection.scrollIntoViewIfNeeded();
                      
                      // เช็คว่า textarea มองเห็นไหม ถ้าไม่เห็น ต้องกดกาง
                      const noteTextarea = page.locator('textarea#หมายเหตุสำหรับผู้ขาย, textarea[id="หมายเหตุสำหรับผู้ขาย"]').first();
                      let isTextareaVisible = await noteTextarea.isVisible({ timeout: 1000 }).catch(() => false);
                      
                      if (!isTextareaVisible) {
                          // กดปุ่ม "ย่อ/ขยาย" ภายใน section หมายเหตุ
                          const expandBtn = noteSection.locator('p.textBlue', { hasText: 'ย่อ/ขยาย' }).first();
                          if (await expandBtn.isVisible({ timeout: 2000 })) {
                              await expandBtn.click({ force: true });
                              await page.waitForTimeout(500); // รอ animation กาง
                              addLog(job.id, "info", `🔽 กดกางส่วน 'หมายเหตุสำหรับผู้ขาย' แล้ว`);
                          }
                      }
                      
                      // กรอกข้อมูลลง textarea
                      await noteTextarea.waitFor({ state: 'visible', timeout: 3000 });
                      await noteTextarea.click({ force: true });
                      await noteTextarea.fill("");
                      await noteTextarea.fill(noteStr);
                      await page.waitForTimeout(200);
                      addLog(job.id, "success", `✅ กรอกหมายเหตุสำหรับผู้ขายสำเร็จ`);
                  } else {
                      addLog(job.id, "warn", `⚠️ หาส่วน 'หมายเหตุสำหรับผู้ขาย' (#RecordExternal) ไม่พบบนหน้าเว็บ`);
                  }
              } catch (noteErr) {
                  addLog(job.id, "warn", `⚠️ เกิดข้อผิดพลาดขณะกรอกหมายเหตุ: ${noteErr.message}`);
              }
          }

          // --- 7. ชำระเงิน: ทุกกรณีเลือก "ยังไม่ชำระเงิน (ตั้งหนี้ไว้ก่อน)" ---
          // เก็บโค้ดชำระเงินจาก Excel ไว้ใช้หลังอนุมัติ + ตรวจ VAT + จัดการไฟล์
          const getExcelValOuter = (tx, keyword) => {
              const ObjectKeys = Object.keys(tx);
              const matchedKey = ObjectKeys.find(k => k.replace(/[\n\r\s]/g, '').includes(keyword));
              return matchedKey ? tx[matchedKey] : undefined;
          };
          const payCodeStr = getExcelValOuter(primaryTx, "โค้ดตัดชำระเงิน");

          addLog(job.id, "info", `💳 กำลังเลือก 'ยังไม่ชำระเงิน (ตั้งหนี้ไว้ก่อน)'...`);

          // ลบ: ส่วนเลือกช่องทางชำระเงินแบบเดิม (ย้ายไปทำหลัง VAT + File ops)
          try {
              await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
              await page.waitForTimeout(500);
              
              const unpaidLabel = page.locator('div.cursorPointer p.textBlue', { hasText: 'ยังไม่ชำระเงิน' }).first();
              if (await unpaidLabel.isVisible({ timeout: 3000 })) {
                  await unpaidLabel.scrollIntoViewIfNeeded();
                  await unpaidLabel.click({ force: true });
                  await page.waitForTimeout(500);
                  addLog(job.id, "success", `✅ เลือก 'ยังไม่ชำระเงิน (ตั้งหนี้ไว้ก่อน)' สำเร็จ`);
              } else {
                  addLog(job.id, "warn", `⚠️ ไม่พบปุ่ม 'ยังไม่ชำระเงิน (ตั้งหนี้ไว้ก่อน)'`);
              }
          } catch (unpaidErr) {
              addLog(job.id, "warn", `⚠️ เกิดข้อผิดพลาดขณะระบุยังไม่ชำระเงิน: ${unpaidErr.message}`);
          }
          addLog(
            job.id,
            "success",
            `✅ จบขั้นตอนการกรอกข้อมูลหลักสำหรับบิลที่ ${groupIdx + 1} (เอกสาร ${primaryTx["เลขที่เอกสาร"]})`,
          );
                   
                   // ดึงยอด VAT จากหน้าจอ
          addLog(job.id, "info", "\u2705 \u0e01\u0e33\u0e25\u0e31\u0e07\u0e14\u0e33\u0e40\u0e19\u0e34\u0e19\u0e01\u0e32\u0e23\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01: \u0e04\u0e25\u0e34\u0e01\u0e1b\u0e38\u0e48\u0e21 '\u0e2d\u0e19\u0e38\u0e21\u0e31\u0e15\u0e34\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e04\u0e48\u0e32\u0e43\u0e0a\u0e49\u0e08\u0e48\u0e32\u0e22'");
          try {
              const approveButton = page.locator('div.button.mint p', { hasText: /^\u0e2d\u0e19\u0e38\u0e21\u0e31\u0e15\u0e34\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e04\u0e48\u0e32\u0e43\u0e0a\u0e49\u0e08\u0e48\u0e32\u0e22$/ }).first();
              await approveButton.waitFor({ state: 'visible', timeout: 5000 });
              await approveButton.scrollIntoViewIfNeeded();
              await approveButton.click({ force: true });
              addLog(job.id, "success", "\u2705 \u0e01\u0e14\u0e1b\u0e38\u0e48\u0e21 '\u0e2d\u0e19\u0e38\u0e21\u0e31\u0e15\u0e34\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e04\u0e48\u0e32\u0e43\u0e0a\u0e49\u0e08\u0e48\u0e32\u0e22' \u0e40\u0e23\u0e35\u0e22\u0e1a\u0e23\u0e49\u0e2d\u0e22\u0e41\u0e25\u0e49\u0e27");

              try {
                  const docIdElement = page.locator('span', { hasText: /^#[A-Z]+-\d+$/ }).first();
                  await docIdElement.waitFor({ state: 'visible', timeout: 15000 });

                  const rawData = await docIdElement.innerText();
                  const finalDocId = rawData.replace('#', '').trim();

                  addLog(job.id, "success", `\u0e2d\u0e19\u0e38\u0e21\u0e31\u0e15\u0e34\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08! \u0e44\u0e14\u0e49\u0e23\u0e31\u0e1a\u0e40\u0e25\u0e02\u0e17\u0e35\u0e48\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23\u0e43\u0e2b\u0e21\u0e48: ${finalDocId}`);

                  let expectedVat = 0;
                  for (const row of docGroup) {
                      const vStr = row["\u0e22\u0e2d\u0e14\u0e20\u0e32\u0e29\u0e35\u0e21\u0e39\u0e25\u0e04\u0e48\u0e32\u0e40\u0e1e\u0e34\u0e48\u0e21"] || row["\u0e20\u0e32\u0e29\u0e35\u0e21\u0e39\u0e25\u0e04\u0e48\u0e32\u0e40\u0e1e\u0e34\u0e48\u0e21"] || "0";
                      expectedVat += parseFloat(String(vStr).replace(/,/g, '')) || 0;
                  }

                  let actualVat = 0;
                   try {
                       actualVat = await page.evaluate(() => {
                           const bodyText = document.body.innerText;
                           const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l);
                           for (let i = lines.length - 1; i >= 0; i--) {
                               if (lines[i].includes('\u0e20\u0e32\u0e29\u0e35\u0e21\u0e39\u0e25\u0e04\u0e48\u0e32\u0e40\u0e1e\u0e34\u0e48\u0e21') && !lines[i].includes('\u0e23\u0e2d\u0e04\u0e33\u0e19\u0e27\u0e13')) {
                                   const matches = lines[i].replace(/,/g, '').match(/[\d.]+/g);
                                   if (matches && matches.length > 0) {
                                       let val = parseFloat(matches[matches.length - 1]);
                                       if (val === 7 && lines[i].includes('7%')) {
                                           if (matches.length > 1) {
                                               val = parseFloat(matches[matches.length - 2]);
                                           } else if (i + 1 < lines.length) {
                                               const nm = lines[i + 1].replace(/,/g, '').match(/[\d.]+/g);
                                               val = (nm && nm.length > 0) ? parseFloat(nm[0]) : 0;
                                           } else { val = 0; }
                                       }
                                       return val;
                                   } else if (i + 1 < lines.length) {
                                       const nm2 = lines[i + 1].replace(/,/g, '').match(/[\d.]+/g);
                                       if (nm2 && nm2.length > 0) return parseFloat(nm2[0]);
                                   }
                               }
                           }
                           return 0;
                       });
                   } catch (vErr) {
                      addLog(job.id, "warn", `⚠️ ไม่สามารถดึงยอดภาษีจากหน้าเว็บเพื่อตรวจสอบได้: ${vErr.message}`);
                  }
                  
                  // เทียบยอด (ใช้ Math.abs เพื่อป้องกันปัญหาทศนิยมปัดเศษ)
                  if (Math.abs(expectedVat - actualVat) > 0.05) {
                      addLog(job.id, "warn", `⚠️ ยอดภาษีมูลค่าเพิ่มไม่ตรงกัน! (Excel: ${expectedVat}, หน้าเว็บ: ${actualVat})`);
                      addLog(job.id, "info", `🔄 กำลังเข้าสู่โหมดแก้ไขเอกสาร...`);
                      
                      try {
                          // ตรวจสอบว่า page ยังเปิดอยู่ก่อนเข้าโหมดแก้ไข
                          if (page.isClosed()) {
                              addLog(job.id, "warn", "⚠️ Page ถูกปิดแล้ว — ไม่สามารถแก้ไข VAT ได้");
                              // เปิดหน้าใหม่จาก context เดิม
                              page = await job.context.newPage();
                              job.page = page;
                              addLog(job.id, "info", "🔄 เปิดหน้าใหม่จาก context เดิม");
                              // กลับไปหน้าเอกสารที่เพิ่งสร้าง
                              await page.goto(`https://secure.peakaccount.com/expense/purchaseInventory/${finalDocId}?emi=${job.peakCode}`, {
                                  waitUntil: 'domcontentloaded', timeout: 30000
                              });
                              await page.waitForTimeout(3000);
                          }

                          // คลิกปุ่ม "ตัวเลือก" (หลาย selector fallback)
                          let optionsClicked = false;
                          const optSelectors = [
                              page.locator('div.buttonNotDefaultOption p', { hasText: 'ตัวเลือก' }).first(),
                              page.getByText('ตัวเลือก', { exact: true }).first(),
                              page.locator('button, div', { hasText: 'ตัวเลือก' }).last()
                          ];
                          for (const optBtn of optSelectors) {
                              try {
                                  if (await optBtn.isVisible({ timeout: 2000 })) {
                                      await optBtn.scrollIntoViewIfNeeded();
                                      await optBtn.click({ force: true });
                                      optionsClicked = true;
                                      break;
                                  }
                              } catch (e) {}
                          }
                          await page.waitForTimeout(1000); // รอเมนูกาง (เพิ่มเป็น 1 วิ)
                          
                          // คลิกคำว่า "แก้ไข" (หลาย selector fallback)
                          let editClicked = false;
                          const editSelectors = [
                              page.locator('div.optionBox div.option', { hasText: 'แก้ไข' }).first(),
                              page.locator('.option', { hasText: 'แก้ไข' }).first(),
                              page.getByText('แก้ไข', { exact: true }).first()
                          ];
                          for (const editOpt of editSelectors) {
                              try {
                                  if (await editOpt.isVisible({ timeout: 3000 })) {
                                      await editOpt.click({ force: true });
                                      editClicked = true;
                                      break;
                                  }
                              } catch (e) {}
                          }
                          // Fallback: JS evaluate
                          if (!editClicked) {
                              await page.evaluate(() => {
                                  const els = Array.from(document.querySelectorAll('div, span, p, a'));
                                  const editEl = els.find(el => el.textContent.trim() === 'แก้ไข' && el.offsetWidth > 0);
                                  if (editEl) editEl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                              });
                              addLog(job.id, "info", "🖱️ คลิก 'แก้ไข' ผ่าน JS fallback");
                          }
                          
                          addLog(job.id, "success", `✅ เข้าสู่หน้าแก้ไขเรียบร้อยแล้ว รอดำเนินการปรับปรุงภาษี...`);
                          
                          // รอหน้าเว็บโหลดเสร็จ
                          await page.waitForLoadState('domcontentloaded');
                          await page.waitForTimeout(3000); // เพิ่มเวลารอ PEAK render
                          
                          // เลื่อนลงล่างสุดเพื่อหาไอคอน "แก้ไขภาษี"
                          const editIcon = page.locator('i.fa-pen.cursor, #iconClick').last();
                          await editIcon.waitFor({ state: 'visible', timeout: 30000 }); // เผื่อเวลาระบบ PEAK โหลดหน้านานสุด 30 วิ
                          
                          await editIcon.scrollIntoViewIfNeeded();
                          await editIcon.click({ force: true });
                          addLog(job.id, "info", `กดไอคอนแก้ไขภาษีเรียบร้อย กำลังกรอกยอดภาษีที่ถูกต้อง (${expectedVat})`);
                          
                          // รอช่อง Input กรอกภาษีปรากฏขึ้น แล้วกรอกข้อมูล
                          const vatInput = page.locator('input[placeholder="0.00"]').last();
                          await vatInput.waitFor({ state: 'visible', timeout: 3000 });
                          await vatInput.click({ force: true });
                          await vatInput.fill('');
                          await vatInput.pressSequentially(expectedVat.toString(), { delay: 10 });
                          await vatInput.press('Enter');
                          addLog(job.id, "success", `✅ แก้ไขยอดภาษีมูลค่าเพิ่มเป็น ${expectedVat} สำเร็จ`);
                          
                          // กดย้ำไปที่พื้นที่ว่างใกล้ช่องกรอกเพื่อกระตุ้นให้ระบบ (Vue) บันทึกค่าลงตัวแปร
                          // เนื่องจากจอเลื่อนลงมาแล้ว เราจำลองคลิกเมาส์ไปที่พิกัด 10, 600 (ด้านล่างมุมซ้าย)
                          await page.mouse.click(10, 500);
                          addLog(job.id, "info", `🖱️ คลิกพื้นที่ว่างเพื่อยืนยันข้อมูลแก้ไขภาษี...`);
                          
                          // รอให้ Vue อัปเดต state ของช่อง Input ให้เรียบร้อย
                          await page.waitForTimeout(1000); 
                          
                          // เช็คว่ามี "ยังไม่ชำระเงิน (ตั้งหนี้ไว้ก่อน)" แสดงอยู่ไหม ถ้ามีให้คลิกก่อน
                          const notPaidLink = page.locator('p.textBlue', { hasText: 'ยังไม่ชำระเงิน (ตั้งหนี้ไว้ก่อน)' }).first();
                          if (await notPaidLink.isVisible({ timeout: 2000 }).catch(() => false)) {
                              await notPaidLink.scrollIntoViewIfNeeded();
                              await notPaidLink.click({ force: true });
                              addLog(job.id, "info", `🔄 คลิก 'ยังไม่ชำระเงิน (ตั้งหนี้ไว้ก่อน)' ก่อนบันทึก`);
                              await page.waitForTimeout(500);
                          }
                          
                          // กดบันทึกฉบับที่แก้แล้ว
                          const saveEditedBtn = page.locator('div.purple.textblack button', { hasText: 'บันทึก' }).first();
                          await saveEditedBtn.waitFor({ state: 'visible', timeout: 5000 });
                          await saveEditedBtn.scrollIntoViewIfNeeded();
                          // เลื่อนเมาส์ไปชี้ก่อนกด เพื่อจำลองคนใช้งานจริงๆ และเพิ่ม delay ตรง click() นิดหน่อย
                          await saveEditedBtn.hover();
                          await saveEditedBtn.click({ force: true, delay: 100 });
                          
                          addLog(job.id, "success", `✅ กดปุ่ม 'บันทึก' การแก้ไขเรียบร้อยแล้ว รอระบบประมวลผล...`);
                          
                          // รอจนโหลดหน้าเสร็จ (10 วิสำหรับพัฒนา)
                          await page.waitForTimeout(10000);
                          
                      } catch (editErr) {
                          addLog(job.id, "warn", `⚠️ ไม่สามารถกดปุ่มแก้ไขเอกสารได้หรือแก้ไขยอดภาษีไม่สำเร็จ: ${editErr.message}`);
                      }
                  } else {
                      addLog(job.id, "success", `✅ ยอดภาษีมูลค่าเพิ่มตรงกัน (${actualVat}) ไม่ต้องแก้ไขเพิ่มเติม`);
                  }
                  // --------------------------------------------------------
                  
                  // --- 10. เปลี่ยนชื่อไฟล์ (File Rename) ---
                  try {
                      const fsRename = require('fs');
                      const pathRename = require('path');
                      
                      // ดึงข้อมูลจาก Excel
                      const getFlexVal = (tx, kw) => {
                          const k = Object.keys(tx).find(k => k.replace(/[\n\r\s]/g, '').includes(kw));
                          return k ? tx[k] : undefined;
                      };
                      const oldFileName = getFlexVal(primaryTx, 'ชื่อไฟล์เก่า');
                      const newFileName = getFlexVal(primaryTx, 'ชื่อไฟล์ใหม่');
                      
                      if (oldFileName && String(oldFileName).trim() && newFileName && String(newFileName).trim()) {
                          const oldFileStr = String(oldFileName).trim();
                          const newFileStr = String(newFileName).trim();
                          const excelDir = pathRename.dirname(job.excelPath);
                          
                          // หาไฟล์ต้นทางในโฟลเดอร์เดียวกับ Excel
                          const srcPath = pathRename.join(excelDir, oldFileStr);
                          
                          if (fsRename.existsSync(srcPath)) {
                              // ดึงนามสกุลไฟล์เดิม
                              const fileExt = pathRename.extname(oldFileStr);
                              
                              // ตรวจสอบ vatStatus จาก DB และยอด VAT จาก Excel
                              const isVatRegistered = job.vatStatus === 'registered';
                              const hasVatAmount = expectedVat > 0;
                              
                              // เช็ค WHT จาก Excel (ทุก row ในบิลนี้)
                              let hasWhtForName = false;
                              for (const row of docGroup) {
                                  const whtV = getFlexVal(row, 'เปอร์เซ็นต์หักณที่จ่าย') || getFlexVal(row, 'หักณที่จ่าย');
                                  if (whtV && parseFloat(String(whtV).replace(/[^0-9.]/g, '')) > 0) {
                                      hasWhtForName = true;
                                      break;
                                  }
                              }
                              
                              let destName = '';
                              const whtPrefix = hasWhtForName ? 'WHT ' : '';
                              
                              if (isVatRegistered && hasVatAmount) {
                                  // จดทะเบียนภาษี + มียอด VAT → [WHT] dd_mm_yyyy EXP-NUMBER ชื่อไฟล์ใหม่ VAT
                                  let dateForName = '';
                                  const rawDate = primaryTx['วันที่'];
                                  if (rawDate) {
                                      let dStr = String(rawDate).trim();
                                      if (!isNaN(dStr) && Number(dStr) >= 20000) {
                                          const d = new Date(Math.round((Number(dStr) - 25569) * 86400 * 1000));
                                          dateForName = `${String(d.getDate()).padStart(2,'0')}_${String(d.getMonth()+1).padStart(2,'0')}_${d.getFullYear()}`;
                                      } else if (dStr.includes('/')) {
                                          dateForName = dStr.replace(/\//g, '_');
                                      } else if (dStr.includes('-')) {
                                          const p = dStr.split('-');
                                          if (p.length === 3) dateForName = `${p[2]}_${p[1]}_${p[0]}`;
                                      }
                                  }
                                  destName = `${whtPrefix}${dateForName} ${finalDocId} ${newFileStr} VAT${fileExt}`;
                              } else {
                                  // ยังไม่จดภาษี หรือ จดแล้วแต่ไม่มียอด VAT → [WHT] EXP-NUMBER ชื่อไฟล์ใหม่
                                  destName = `${whtPrefix}${finalDocId} ${newFileStr}${fileExt}`;
                              }
                              
                              const destPath = pathRename.join(excelDir, destName);
                              
                              addLog(job.id, 'info', `📁 กำลังคัดลอกและเปลี่ยนชื่อไฟล์...`);
                              addLog(job.id, 'info', `   ต้นฉบับ: ${oldFileStr}`);
                              addLog(job.id, 'info', `   ชื่อใหม่: ${destName}`);
                              
                              fsRename.copyFileSync(srcPath, destPath);
                              addLog(job.id, 'success', `✅ เปลี่ยนชื่อไฟล์สำเร็จ: ${destName}`);
                              
                              // --- 10.5 อัปโหลดไฟล์เข้า PEAK (ลากไฟล์ไปวางใน uploadBox) ---
                              try {
                                  addLog(job.id, 'info', `📤 กำลังอัปโหลดไฟล์ ${destName} เข้า PEAK...`);
                                  
                                  // เลื่อนหน้าลงไปหา uploadBox
                                  const uploadBox = page.locator('.uploadBox').first();
                                  await uploadBox.scrollIntoViewIfNeeded();
                                  await page.waitForTimeout(500);
                                  
                                  // วิธี 1: หา hidden input[type="file"] ใกล้ๆ uploadBox
                                  let uploaded = false;
                                  const fileInput = page.locator('input[type="file"]').first();
                                  
                                  if (await fileInput.count() > 0) {
                                      await fileInput.setInputFiles(destPath);
                                      uploaded = true;
                                      addLog(job.id, 'info', `📤 อัปโหลดผ่าน input[type="file"] (วิธี 1)`);
                                  }
                                  
                                  // วิธี 2: ใช้ filechooser event (กดปุ่ม "เพิ่มไฟล์ใหม่" แล้วเลือกไฟล์)
                                  if (!uploaded) {
                                      try {
                                          const addFileBtn = page.locator('button', { hasText: 'เพิ่มไฟล์ใหม่' }).first();
                                          if (await addFileBtn.isVisible({ timeout: 2000 })) {
                                              const [fileChooser] = await Promise.all([
                                                  page.waitForEvent('filechooser', { timeout: 5000 }),
                                                  addFileBtn.click({ force: true })
                                              ]);
                                              await fileChooser.setFiles(destPath);
                                              uploaded = true;
                                              addLog(job.id, 'info', `📤 อัปโหลดผ่านปุ่ม "เพิ่มไฟล์ใหม่" (วิธี 2)`);
                                          }
                                      } catch (fcErr) {}
                                  }
                                  
                                  if (uploaded) {
                                      await page.waitForTimeout(2000); // รอ PEAK ประมวลผลไฟล์
                                      addLog(job.id, 'success', `✅ อัปโหลดไฟล์เข้า PEAK สำเร็จ: ${destName}`);
                                  } else {
                                      addLog(job.id, 'warn', `⚠️ ไม่สามารถอัปโหลดไฟล์เข้า PEAK ได้อัตโนมัติ`);
                                  }
                              } catch (uploadErr) {
                                  addLog(job.id, 'warn', `⚠️ เกิดข้อผิดพลาดขณะอัปโหลดไฟล์: ${uploadErr.message}`);
                              }
                              
                              // --- 10.6 จัดระเบียบไฟล์ (ย้ายไฟล์เข้าโฟลเดอร์) ---
                              try {
                                  addLog(job.id, 'info', `📂 กำลังจัดระเบียบไฟล์...`);
                                  
                                  // 1. ย้ายไฟล์ต้นฉบับ → โฟลเดอร์ "ต้นฉบับ"
                                  const origDir = pathRename.join(excelDir, 'ต้นฉบับ');
                                  fsRename.mkdirSync(origDir, { recursive: true });
                                  const origDest = pathRename.join(origDir, oldFileStr);
                                  fsRename.renameSync(srcPath, origDest);
                                  addLog(job.id, 'info', `   📁 ย้ายต้นฉบับ → ต้นฉบับ/${oldFileStr}`);
                                  
                                  // 2. ย้ายไฟล์ที่ตั้งชื่อใหม่ → โฟลเดอร์ "เอกสารบันทึกแล้ว/{WHT|VAT|NoneVat}"
                                  // เช็คเงื่อนไข WHT / VAT จากข้อมูลใน Excel
                                  let hasWht = false;
                                  for (const row of docGroup) {
                                      const whtVal = getFlexVal(row, 'เปอร์เซ็นต์หักณที่จ่าย') || getFlexVal(row, 'หักณที่จ่าย');
                                      if (whtVal && parseFloat(String(whtVal).replace(/[^0-9.]/g, '')) > 0) {
                                          hasWht = true;
                                          break;
                                      }
                                  }
                                  
                                  let subFolder = 'NoneVat';
                                  if (hasWht) {
                                      subFolder = 'WHT';
                                  } else if (hasVatAmount) {
                                      subFolder = 'VAT';
                                  }
                                  
                                  const recordedDir = pathRename.join(excelDir, 'เอกสารบันทึกแล้ว', subFolder);
                                  fsRename.mkdirSync(recordedDir, { recursive: true });
                                  const recordedDest = pathRename.join(recordedDir, destName);
                                  fsRename.renameSync(destPath, recordedDest);
                                  addLog(job.id, 'success', `   📁 ย้ายไฟล์ใหม่ → เอกสารบันทึกแล้ว/${subFolder}/${destName}`);
                                  
                                  addLog(job.id, 'success', `✅ จัดระเบียบไฟล์เสร็จสมบูรณ์`);
                              } catch (moveErr) {
                                  addLog(job.id, 'warn', `⚠️ เกิดข้อผิดพลาดขณะย้ายไฟล์: ${moveErr.message}`);
                              }
                          } else {
                              addLog(job.id, 'warn', `⚠️ ไม่พบไฟล์ต้นทาง: ${oldFileStr} ในโฟลเดอร์ ${excelDir}`);
                          }
                      }
                  } catch (renameErr) {
                      addLog(job.id, 'warn', `⚠️ เกิดข้อผิดพลาดขณะเปลี่ยนชื่อไฟล์: ${renameErr.message}`);
                  }
                  
                   // --- 11. Payment Modal ---
                   if (payCodeStr && String(payCodeStr).trim() !== "") {
                       const payCode = String(payCodeStr).trim();
                       addLog(job.id, "info", `[PAY] Starting payment (code: ${payCode})...`);
                       try {
                           // Always reload doc page to ensure correct state after VAT/file steps
                           if (page.isClosed()) {
                               page = await job.context.newPage();
                               job.page = page;
                           }
                           addLog(job.id, "info", `[PAY] Reloading doc page before payment...`);
                           await page.goto(
                               `https://secure.peakaccount.com/expense/purchaseInventory/${finalDocId}?emi=${job.peakCode}`,
                               { waitUntil: 'domcontentloaded', timeout: 30000 }
                           );
                           await page.waitForTimeout(4000);
                           addLog(job.id, "success", `[PAY] Doc loaded OK`);

                           // 11.1 Click payment tab
                           const paymentTab = page.locator('div.tap p', { hasText: 'ข้อมูลการชำระ' }).first();
                           await paymentTab.waitFor({ state: 'visible', timeout: 15000 });
                           await paymentTab.scrollIntoViewIfNeeded();
                           await paymentTab.click({ force: true });
                           await page.waitForTimeout(1500);

                           // 11.2 Click pay button
                           const payBtn = page.locator('div.mint.textblack button', { hasText: 'จ่ายชำระ' }).first();
                           await payBtn.waitFor({ state: 'visible', timeout: 10000 });
                           await payBtn.scrollIntoViewIfNeeded();
                           await payBtn.click({ force: true });

                           // 11.3 Wait for modal AND dropdown content to fully load
                           const paymentModal = page.locator('div.modalBox').first();
                           await paymentModal.waitFor({ state: 'visible', timeout: 15000 });
                           await page.waitForSelector('#DropdownPaymentBankAccount', { state: 'visible', timeout: 15000 });
                           addLog(job.id, "success", `[PAY] Modal content loaded`);

                           // 11.4 Select payment channel via multiselect
                           let payDropdownBox = null;
                           const ddSelectors = [
                               '#DropdownPaymentBankAccount div.multiselect',
                               '#DropdownPaymentBankAccount .multiselect',
                               '[id*="PaymentBankAccount"] div.multiselect',
                               '[id*="PaymentBankAccount"] .multiselect',
                           ];
                           for (const sel of ddSelectors) {
                               try {
                                   const el = page.locator(sel).first();
                                   await el.waitFor({ state: 'visible', timeout: 5000 });
                                   payDropdownBox = el;
                                   break;
                               } catch (e) {}
                           }
                           if (!payDropdownBox) {
                               throw new Error('[PAY] Cannot find #DropdownPaymentBankAccount in Modal');
                           }
                           await payDropdownBox.scrollIntoViewIfNeeded();
                           await payDropdownBox.locator('.multiselect__tags').click({ force: true });
                           await page.waitForTimeout(500);
                           const payInput = payDropdownBox.locator('input.multiselect__input');
                           await payInput.click({ force: true });
                           await payInput.fill('');
                           await payInput.pressSequentially(payCode, { delay: 30 });
                           await page.waitForTimeout(1500);

                           const ddOptions = payDropdownBox.locator('ul.multiselect__content li.multiselect__element');
                           try { await ddOptions.first().waitFor({ state: 'visible', timeout: 3000 }); } catch (e) {}
                           const optCount = await ddOptions.count();
                           let isSelected = false;
                           for (let i = 0; i < optCount; i++) {
                               const label = await ddOptions.nth(i).innerText();
                               if (label && label.replace(/[\n\r]/g, ' ').includes(payCode)) {
                                   await ddOptions.nth(i).click({ force: true });
                                   isSelected = true;
                                   break;
                               }
                           }
                           if (!isSelected && optCount > 0) {
                               await ddOptions.first().click({ force: true });
                               isSelected = true;
                           }
                           await page.waitForTimeout(500);

                           // 11.5 Confirm payment
                           const confirmBtn = paymentModal.locator('button', { hasText: 'ชำระเงิน' }).first();
                           await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
                           await confirmBtn.click({ force: true });
                           await page.waitForTimeout(5000);
                           addLog(job.id, "success", `[PAY] Payment complete! (code: ${payCode})`);

                       } catch (payModalErr) {
                           addLog(job.id, "warn", `[PAY] Error during payment: ${payModalErr.message}`);
                       }
                   }
                  
              } catch (extractErr) {
                  addLog(job.id, "warn", `⚠️ ไม่สามารถดึงเลขที่เอกสารใหม่ได้ (อาจบันทึกสำเร็จแต่หา element ไม่เจอ): ${extractErr.message}`);
              }
              
          } catch (approveErr) {
              addLog(job.id, "warn", `⚠️ ไม่สามารถกดปุ่ม 'อนุมัติบันทึกค่าใช้จ่าย' ได้: ${approveErr.message}`);
          }
        } catch (rowErr) {
          addLog(
            job.id,
            "error",
            `❌ เกิดข้อผิดพลาดในบิลที่ ${groupIdx + 1} (เอกสาร ${docGroup[0]["เลขที่เอกสาร"]}): ${rowErr.message}`,
          );

          // แคปหน้าจอเพื่อ Debug
          try {
            if (!page.isClosed()) {
              const fs = require("fs");
              const path = require("path");
              const screenshotDir = path.join(__dirname, "..", "screenshots");
              fs.mkdirSync(screenshotDir, { recursive: true });
              const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
              const screenshotPath = path.join(
                screenshotDir,
                `error_bill${groupIdx + 1}_${timestamp}.png`,
              );
              await page.screenshot({ path: screenshotPath, fullPage: true });
              addLog(
                job.id,
                "info",
                `📸 แคปหน้าจอ Error แล้ว: ${screenshotPath}`,
              );
            }
          } catch (ssErr) {
            addLog(
              job.id,
              "warn",
              `⚠️ ไม่สามารถแคปหน้าจอได้: ${ssErr.message}`,
            );
          }
        }
      }
      // --- จบลูป ---

      // TODO: OCR reading phase will start here
      addLog(
        job.id,
        "info",
        "📋 รอคำสั่งถัดไป... (รอ 10 วินาทีก่อนปิดรอบ เพื่อให้เห็นหน้าจอ)",
      );

      // Keeping bot open to view page and prevent premature closure of the context
      await page.waitForTimeout(10000);

      // Mark Job as finished officially so frontend stops polling
      job.status = "finished";
      job.finishedAt = new Date().toISOString();
      addLog(job.id, "success", "🎉 บอททำงานเสร็จสมบูรณ์");

      // ค่อยปิด context เมื่อทุกอย่างเสร็จสิ้นจริงๆ
      try {
        if (job.context) await job.context.close();
      } catch (e) {}
    } else {
      addLog(
        job.id,
        "error",
        "❌ ไม่พบ PEAK Code ในโปรไฟล์ ไม่สามารถเข้าหน้าบริษัทได้",
      );
      job.status = "error";
      throw new Error("Missing PEAK Code in Profile");
    }
  } catch (error) {
    job.status = "error";
    job.finishedAt = new Date().toISOString();
    addLog(job.id, "error", `❌ เกิดข้อผิดพลาด: ${error.message}`);

    // Cleanup Context (Keep sharedBrowser alive)
    try {
      if (job.context) await job.context.close();
    } catch (e) {}
    job.page = null;
    job.context = null;

    // Try next in queue
    processQueue();
  }
}

// ==========================================
// API: LIST EXCEL FILES
// ==========================================
router.get("/excel-files", (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");
    
    let uploadsDir = req.query.dir;
    if (!uploadsDir) {
      uploadsDir =
        process.env.EXCEL_UPLOADS_DIR ||
        path.join(
          "V:",
          "A.โฟร์เดอร์หลัก",
          "Build000 ทดสอบระบบ",
          "test",
          "ทดสอบระบบแยกเอกสาร",
        );
    }

    // Ensure directory exists
    if (!fs.existsSync(uploadsDir)) {
      // Only try to create if it's not a root drive that we might not have permission to write to
      try {
        fs.mkdirSync(uploadsDir, { recursive: true });
      } catch (e) {
        console.warn("Could not create uploads directory", e.message);
      }
    }

    let excelFiles = [];
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      excelFiles = files.filter(
        (file) => file.endsWith(".xlsx") && !file.startsWith("~$"),
      ).map((f) => path.join(uploadsDir, f));
    }

    res.json({ success: true, files: excelFiles, directory: uploadsDir });
  } catch (error) {
    console.error("Error listing excel files:", error);
    res
      .status(500)
      .json({ error: "Failed to list excel files", details: error.message });
  }
});

// ==========================================
// API: START BOT (Queue a job)
// ==========================================
router.post("/start", async (req, res) => {
  const { profileId, excelPath } = req.body;
  if (!profileId) return res.status(400).json({ error: "Missing profileId" });

  try {
    const pool = getPool();
    const [profileRows] = await pool.execute("SELECT * FROM bot_profiles WHERE id = ?", [profileId]);
    const profile = profileRows[0];
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    const job = createJob(profileId, profile, excelPath);

    if (getRunningCount() < MAX_CONCURRENT) {
      addLog(job.id, "info", "🎯 เริ่มทำงานทันที (ไม่ต้องรอคิว)");
      executeJob(job).catch((err) => {
        job.status = "error";
        job.finishedAt = new Date().toISOString();
        addLog(job.id, "error", `เกิดข้อผิดพลาด: ${err.message}`);
      });
    } else {
      jobQueue.push(job.id);
      const position = jobQueue.length;
      addLog(
        job.id,
        "warn",
        `⏳ เข้าคิวรอ — ลำดับที่ ${position} (กำลังรัน ${getRunningCount()}/${MAX_CONCURRENT})`,
      );
    }

    res.json({
      success: true,
      jobId: job.id,
      status: job.status,
      queuePosition: job.status === "queued" ? jobQueue.indexOf(job.id) + 1 : 0,
      runningCount: getRunningCount(),
      maxConcurrent: MAX_CONCURRENT,
    });
  } catch (error) {
    console.error("Bot start error:", error);
    res
      .status(500)
      .json({ error: "Failed to start bot", details: error.message });
  }
});

// ==========================================
// API: LIST ALL JOBS
// ==========================================
router.get("/jobs", (req, res) => {
  const jobList = [];
  for (const [id, job] of jobs) {
    jobList.push({
      id: job.id,
      profileId: job.profileId,
      profileName: job.profileName,
      username: job.username,
      excelPath: job.excelPath,
      status: job.status,
      logCount: job.logs.length,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    });
  }
  // Sort: running first, then queued, then done
  const order = {
    running: 0,
    logged_in: 0,
    working: 0,
    queued: 1,
    done: 2,
    error: 3,
    stopped: 4,
  };
  jobList.sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5));

  res.json({
    jobs: jobList,
    runningCount: getRunningCount(),
    queuedCount: jobQueue.length,
    maxConcurrent: MAX_CONCURRENT,
  });
});

// ==========================================
// API: GET JOB LOGS
// ==========================================
router.get("/logs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  res.json({
    jobId: job.id,
    status: job.status,
    logs: job.logs,
  });
});

// ==========================================
// API: SSE STREAM (Real-time logs)
// ==========================================
router.get("/stream/:jobId", (req, res) => {
  const jobId = req.params.jobId;
  const job = jobs.get(jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send existing logs first
  job.logs.forEach((entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  });

  // Register client
  if (!sseClients.has(jobId)) sseClients.set(jobId, []);
  sseClients.get(jobId).push(res);

  // Cleanup on disconnect
  req.on("close", () => {
    const clients = sseClients.get(jobId);
    if (clients) {
      const idx = clients.indexOf(res);
      if (idx > -1) clients.splice(idx, 1);
      if (clients.length === 0) sseClients.delete(jobId);
    }
  });
});

// ==========================================
// API: STOP JOB
// ==========================================
router.post("/stop/:jobId", async (req, res) => {
  const jobId = req.params.jobId;
  const job = jobs.get(jobId);
  if (!job) return res.json({ success: true, message: "Job not found" });

  // Remove from queue if queued
  const qIdx = jobQueue.indexOf(jobId);
  if (qIdx > -1) jobQueue.splice(qIdx, 1);

  // Close browser if running
  if (job.browser) {
    try {
      await job.browser.close();
    } catch (e) {}
    job.browser = null;
    job.page = null;
    job.context = null;
  }

  job.status = "stopped";
  job.finishedAt = new Date().toISOString();
  addLog(jobId, "warn", "⏹️ บอทถูกหยุดโดยผู้ใช้");

  // Update profile status (MySQL)
  try {
    const pool = getPool();
    await pool.execute("UPDATE bot_profiles SET status = ? WHERE id = ?", [
      "idle",
      job.profileId,
    ]);
  } catch (e) {}

  // Process next in queue
  processQueue();

  res.json({ success: true, message: "Bot stopped" });
});

module.exports = router;
