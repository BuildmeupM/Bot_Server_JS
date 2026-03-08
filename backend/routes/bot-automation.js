const express = require('express');
const router = express.Router();
const { getDB } = require('../database');
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.JWT_SECRET || 'fallback_secret_key_123456789012';

// ==========================================
// ENCRYPTION HELPERS
// ==========================================
function decrypt(text) {
    if (!text) return text;
    try {
        const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest('base64').substring(0, 32);
        let textParts = text.split(':');
        let iv = Buffer.from(textParts.shift(), 'hex');
        let encryptedText = Buffer.from(textParts.join(':'), 'hex');
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
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
const jobs = new Map();        // jobId -> job object
const jobQueue = [];           // waiting job IDs
let jobCounter = 0;

// Shared Browser Instance for Memory Efficiency
let sharedBrowser = null;
const { chromium } = require('playwright');

// Cleanup old jobs periodically (every 1 hour), keeping jobs only for the last 24 hours
setInterval(() => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (const [jobId, job] of jobs.entries()) {
        const jobAgeDate = job.finishedAt || job.createdAt;
        if (jobAgeDate && (now - new Date(jobAgeDate).getTime() > ONE_DAY_MS)) {
            // Memory cleanup: close context if orphaned
            if (job.context) {
                job.context.close().catch(console.error);
            }
            jobs.delete(jobId);
        }
    }
}, 60 * 60 * 1000);

function generateJobId() {
    jobCounter++;
    const ts = Date.now().toString(36);
    return `JOB-${ts}-${String(jobCounter).padStart(3, '0')}`;
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
        excelPath,
        status: 'queued',  // queued | running | logged_in | working | done | error | stopped
        logs: [],
        browser: null, // Note: browser property is left for backwards compatibility but we'll use sharedBrowser
        page: null,
        context: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null
    };
    jobs.set(jobId, job);
    return job;
}

function addLog(jobId, level, message) {
    const job = jobs.get(jobId);
    if (!job) return;
    const entry = {
        time: new Date().toLocaleTimeString('th-TH', { hour12: false }),
        level,  // info | success | warn | error
        message
    };
    job.logs.push(entry);

    // Notify SSE clients
    const clients = sseClients.get(jobId);
    if (clients && clients.length) {
        const data = JSON.stringify(entry);
        clients.forEach(res => {
            try { res.write(`data: ${data}\n\n`); } catch (e) {}
        });
    }
}

// SSE client tracking
const sseClients = new Map(); // jobId -> [res, res, ...]

// ==========================================
// EXCEL PARSER
// ==========================================
async function parseExcelData(filename, jobId) {
    const fs = require('fs');
    const path = require('path');
    const xlsx = require('xlsx');
    
    // Fallback if null
    if (!filename) throw new Error('ไม่ได้ระบุชื่อไฟล์ Excel');
    
    const uploadsDir = process.env.EXCEL_UPLOADS_DIR || path.join('V:', 'A.โฟร์เดอร์หลัก', 'Build000 ทดสอบระบบ', 'test', 'ทดสอบระบบแยกเอกสาร');
    const filePath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filePath)) {
        throw new Error(`ไม่พบไฟล์: ${filename}`);
    }

    try {
        // Use fs.promises.readFile and wrap in a Promise to yield event loop
        return await new Promise(async (resolve, reject) => {
            try {
                const buffer = await fs.promises.readFile(filePath);
                
                // Note: xlsx.read with buffer is still sync, but doing readFile async 
                // minimizes the total blocking time.
                const workbook = xlsx.read(buffer, { type: 'buffer' });
                
                const getSheetData = (sheetName) => {
                    if (workbook.Sheets[sheetName]) {
                        return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
                    }
                    return [];
                };

                const vatTransactions = getSheetData('มีภาษีมูลค่าเพิ่ม');
                const nonVatTransactions = getSheetData('ไม่มีภาษีมูลค่าเพิ่ม');
                const vendors = getSheetData('ที่อยู่แต่ละบริษัท');

                const allTransactions = [...vatTransactions, ...nonVatTransactions];

                if (allTransactions.length === 0) {
                    addLog(jobId, 'warn', '⚠️ ไม่พบรายการค่าใช้จ่ายในชีต "มีภาษีมูลค่าเพิ่ม" และ "ไม่มีภาษีมูลค่าเพิ่ม"');
                }
                if (vendors.length === 0) {
                    addLog(jobId, 'warn', '⚠️ ไม่พบข้อมูลผู้ขายในชีต "ที่อยู่แต่ละบริษัท"');
                }

                resolve({
                    transactions: allTransactions,
                    vendors: vendors
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
        if (['running', 'logged_in', 'working'].includes(job.status)) count++;
    }
    return count;
}

async function processQueue() {
    while (jobQueue.length > 0 && getRunningCount() < MAX_CONCURRENT) {
        const jobId = jobQueue.shift();
        const job = jobs.get(jobId);
        if (!job || job.status !== 'queued') continue;

        // Start this job
        executeJob(job).catch(err => {
            console.error(`Job ${job.id} failed:`, err);
            job.status = 'error';
            job.finishedAt = new Date().toISOString();
            addLog(job.id, 'error', `เกิดข้อผิดพลาด: ${err.message}`);
        });
    }
}

async function executeJob(job) {
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    addLog(job.id, 'info', '🚀 เริ่มต้นทำงาน...');

    try {
        // 0. Parse Excel first
        addLog(job.id, 'info', `📁 กำลังอ่านออเดอร์จากไฟล์ Excel: ${job.excelPath}...`);
        try {
            const excelData = await parseExcelData(job.excelPath, job.id);
            job.excelData = excelData;
            addLog(job.id, 'success', `✅ อ่านไฟล์แล้วพบ ค่าใช้จ่าย ${excelData.transactions.length} รายการ | ข้อมูลผู้ขายรวม ${excelData.vendors.length} บริษัท`);
        } catch (excelErr) {
            addLog(job.id, 'error', `❌ ไม่สามารถอ่านไฟล์ Excel ได้: ${excelErr.message}`);
            throw excelErr;
        }

        // 1. Launch / reuse browser
        addLog(job.id, 'info', '🌐 กำลังเตรียมเบราว์เซอร์...');
        if (!sharedBrowser || !sharedBrowser.isConnected()) {
            addLog(job.id, 'info', '🔧 กำลังเปิด Browser Instance หลัก (ครั้งแรก หรือเปิดใหม่)...');
            sharedBrowser = await chromium.launch({
                headless: false,
                args: ['--start-maximized']
            });
        }
        
        // Use an isolated context for each job
        const context = await sharedBrowser.newContext({ viewport: null });
        let page = await context.newPage();

        job.browser = sharedBrowser; // Store ref but we don't close it
        job.context = context;
        job.page = page;
        
        // ตรวจจับเมื่อ page ถูกปิดจากภายนอก (เช่น PEAK redirect)
        page.on('close', () => {
            addLog(job.id, 'warn', '⚠️ Page ถูกปิดจากภายนอก (detected by close event)');
        });
        addLog(job.id, 'success', '✅ เตรียมเบราว์เซอร์สำเร็จ');

        // 2. Navigate to PEAK
        addLog(job.id, 'info', '🔗 กำลังเข้าหน้า Login PEAK...');
        await page.goto('https://secure.peakaccount.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        addLog(job.id, 'success', '✅ เข้าหน้า Login สำเร็จ');

        // 3. Wait for form using locator
        addLog(job.id, 'info', '⏳ รอฟอร์ม Login โหลด...');
        const emailInput = page.locator("input[placeholder='กรุณากรอกข้อมูลอีเมล']");
        await emailInput.waitFor({ state: 'visible', timeout: 15000 });

        // 4. Fill credentials
        addLog(job.id, 'info', `📧 กรอกอีเมล: ${job.username}`);
        await emailInput.fill(job.username);

        // Decrypt password
        const db = getDB();
        const profile = db.prepare('SELECT password FROM bot_profiles WHERE id = ?').get(job.profileId);
        const password = decrypt(profile.password);

        addLog(job.id, 'info', '🔒 กรอกรหัสผ่าน: ********');
        await page.fill("input[placeholder='กรุณากรอกข้อมูลรหัสผ่าน']", password);

        // 5. Click login
        addLog(job.id, 'info', '🖱️ คลิกเข้าสู่ระบบ PEAK...');
        await page.click('button:has-text("เข้าสู่ระบบ PEAK")');
        await page.waitForTimeout(2000); // รอให้หน้า redirect

        // 6. Wait for navigation
        try {
            await page.waitForURL('**/*', { timeout: 15000 });

            const currentUrl = page.url();
            if (currentUrl.includes('/home') || currentUrl.includes('/selectlist')) {
                job.status = 'logged_in';
                addLog(job.id, 'success', `✅ Login สำเร็จ! (${currentUrl})`);

                // Update DB status
                db.prepare('UPDATE bot_profiles SET status = ?, last_sync = ? WHERE id = ?')
                    .run('running', new Date().toISOString(), job.profileId);
            } else {
                job.status = 'logged_in';
                addLog(job.id, 'warn', `⚠️ Login อาจไม่สำเร็จ — URL: ${currentUrl}`);
            }
        } catch (navErr) {
            job.status = 'logged_in';
            addLog(job.id, 'warn', '⚠️ รอ navigation timeout — กรุณาตรวจสอบเบราว์เซอร์');
        }

        // 7. Navigate to Company Home Page using PEAK Code
        const peakCode = job.peakCode;
        if (peakCode) {
            addLog(job.id, 'info', `🏢 กำลังเข้าสู่หน้าหลักของบริษัท (PEAK Code: ${peakCode})...`);
            await page.goto(`https://secure.peakaccount.com/home?emi=${peakCode}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            addLog(job.id, 'success', '✅ เข้าหน้าหลักบริษัทสำเร็จ');
            
            await page.waitForTimeout(500); // Reduced from 1500ms to 500ms

            // 8. Navigate to Expense Entry Page
            addLog(job.id, 'info', '📝 กำลังไปที่หน้า "บันทึกบัญชีค่าใช้จ่าย"...');
            await page.goto(`https://secure.peakaccount.com/expense/purchaseInventory?emi=${peakCode}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
            addLog(job.id, 'success', '✅ เข้าหน้า "บันทึกบัญชีค่าใช้จ่าย" สำเร็จ');
            
            job.status = 'working';
            
            // --- เริ่มลูปข้อมูลจาก Excel ---
            // TODO: เอา .slice(0, 1) ออกเมื่อพัฒนาเสร็จ เพื่อให้รันทุกรายการ
            const transactions = job.excelData.transactions.slice(0, 1);
            const vendors = job.excelData.vendors;

            for (let i = 0; i < transactions.length; i++) {
                const tx = transactions[i];
                const rowNum = i + 1;
                addLog(job.id, 'info', `\n-----------------------------------------`);
                addLog(job.id, 'info', `📦 [รายการ ${rowNum}/${transactions.length}] เริ่มประมวลผลข้อมูลจาก Excel`);
                
                const rawVendorName = tx['ชื่อบริษัท - ผู้ขาย'] || 'ไม่ระบุชื่อ';
                const taxId = String(tx['เลขประจำตัวผู้เสียภาษี'] || '').trim();
                const branch = String(tx['สาขา'] || '').trim();
                const totalAmount = tx['ยอดรวมสุทธิ'] || '0.00';
                
                addLog(job.id, 'info', `▶️ ผู้ขาย: ${rawVendorName}`);
                addLog(job.id, 'info', `▶️ เลขภาษี: ${taxId} | สาขา: ${branch}`);
                addLog(job.id, 'info', `▶️ ยอดเงินรวม: ${totalAmount} บาท`);
                addLog(job.id, 'info', `-----------------------------------------\n`);
                // ทุกรอบ(รวมรอบแรกด้วยถ้าพึ่งเปิดใหม่) เช็คสถานะ Page ให้ชัวร์ว่ายังไม่ตาย
                if (!page || page.isClosed()) {
                    addLog(job.id, 'warn', '⚠️ Browser page ถูกปิดไปแล้ว — กำลังเตรียมหน้าใหม่ (Recovery mode)...');
                    page = await job.context.newPage();
                    job.page = page;
                    page.on('close', () => {
                        addLog(job.id, 'warn', '⚠️ Page ถูกปิดจากภายนอก');
                    });
                }

                try {
                    // รีเฟรชหน้าบันทึกค่าใช้จ่ายใหม่ทุกรอบ เพื่อเคลียร์ฟอร์มให้สะอาด
                    addLog(job.id, 'info', `🔄 โหลดหน้าบันทึกค่าใช้จ่าย (เตรียมพร้อมรายการ ${rowNum})...`);
                    await page.goto(`https://secure.peakaccount.com/expense/purchaseInventory?emi=${peakCode}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    await page.waitForTimeout(2000); // ชะลอให้หน้าโหลดนิ่ง
                } catch (navErr) {
                    addLog(job.id, 'error', `❌ โหลดหน้าขึ้นไม่สำเร็จ: ${navErr.message}`);
                    continue; // ข้ามไปทำบิลถัดไปถ้ารีเฟรชหน้าไม่ขึ้น
                }

                try {
                    // 1. จัดการข้อมูล Vendor (taxId, branch ประกาศไว้ด้านบนแล้ว)
                    
                    if (!taxId) {
                        addLog(job.id, 'warn', `⚠️ ข้ามรายการที่ ${rowNum}: ไม่มีเลขประจำตัวผู้เสียภาษี`);
                        continue;
                    }

                    addLog(job.id, 'info', `🔍 ค้นหาผู้ขายจาก เลขภาษี: ${taxId}`);
                    
                    // รอให้ฟอร์มโหลดเสร็จ — รอจนกว่าจะเห็นข้อความ 'ชื่อผู้ขาย' บนหน้า
                    await page.getByText('ชื่อผู้ขาย').first().waitFor({ state: 'visible', timeout: 20000 });
                    await page.waitForTimeout(1000); // buffer เพิ่มอีกนิดให้ Vue render เสร็จ
                    
                    // คลิกตัวช่องค้นหาผู้ขายจาก Placeholder โดยตรง
                    const vendorDropdown = page.getByPlaceholder('พิมพ์เพื่อค้นหาผู้ติดต่อ หรือสร้างผู้ติดต่อใหม่').first();
                    await vendorDropdown.waitFor({ state: 'attached', timeout: 10000 });
                    
                    // หากซ่อนอยู่ภายใต้ wrapper ต้องบังคับคลิก
                    addLog(job.id, 'info', '🖱️ คลิกตัวเลือกผู้ขาย...');
                    await vendorDropdown.click({ force: true, timeout: 5000 });
                    await page.waitForTimeout(1000); // ชะลอให้ dropdown กางออกเต็มที่
                    
                    // หลังจากคลิก ค่อยๆ พิมพ์เพื่อกระตุ้นให้ระบบค้นหา
                    addLog(job.id, 'info', `⌨️ กำลังพิมพ์เลขภาษี: ${taxId}`);
                    
                    // ใช้ fill() วางพรวดเดียวเลย จะได้เร็วขึ้นกว่า pressSequentially แบบหน่วงเวลา
                    await vendorDropdown.fill(taxId);
                    
                    addLog(job.id, 'info', '⏳ รอดึงข้อมูลรายชื่อผู้ขาย (ให้เวลา API)...');
                    await page.waitForTimeout(2500); // ชะลอให้ API ค้นหาตอบกลับมา (ลดเวลาลงเพื่อให้ทำงานเร็วขึ้น) 
                    
                    // --- วิเคราะห์ผลลัพธ์ใน Dropdown (เฉพาะ Dropdown ผู้ขาย) ---
                    // ⚠️ สำคัญ: ต้อง scope ให้ตรงเฉพาะ Dropdown ผู้ขาย ไม่ใช่ทุก multiselect บนหน้า
                    // หา parent container ของ vendorDropdown (div.multiselect ที่ครอบ input ค้นหาผู้ขาย)
                    const vendorMultiselect = vendorDropdown.locator('xpath=ancestor::div[contains(@class,"multiselect")]').first();
                    const allOptions = vendorMultiselect.locator('.multiselect__content .multiselect__element');
                    const optionCount = await allOptions.count();
                    addLog(job.id, 'info', `📊 พบ ${optionCount} รายการใน Dropdown ผู้ขาย`);

                    // แยกรายการที่เป็นผู้ขายจริง (ไม่ใช่ปุ่ม "เพิ่มผู้ติดต่อ")
                    const vendorOptions = [];
                    for (let idx = 0; idx < optionCount; idx++) {
                        const optEl = allOptions.nth(idx);
                        const optText = (await optEl.innerText()).trim();
                        if (!optText || optText.includes('เพิ่มผู้ติดต่อ')) continue;
                        vendorOptions.push({ index: idx, text: optText });
                    }

                    addLog(job.id, 'info', `🔎 พบผู้ขาย ${vendorOptions.length} รายการ (ไม่นับปุ่มเพิ่มผู้ติดต่อ)`);
                    // Log ตัวเลือกที่พบ (เฉพาะ 5 รายการแรก เพื่อไม่ให้ log เยอะ)
                    vendorOptions.slice(0, 5).forEach((v, i) => {
                        addLog(job.id, 'info', `   🔹 [${i+1}] ${v.text.substring(0, 80)}`);
                    });
                    if (vendorOptions.length > 5) {
                        addLog(job.id, 'info', `   ... และอีก ${vendorOptions.length - 5} รายการ`);
                    }

                    if (vendorOptions.length === 0) {
                        // ไม่เจอผู้ขายเลย → คลิก "เพิ่มผู้ติดต่อ" จาก Dropdown โดยตรง
                        addLog(job.id, 'warn', `⚠️ ไม่พบผู้ขายในผลค้นหา → คลิก + เพิ่มผู้ติดต่อ`);
                        
                        // หาปุ่ม "เพิ่มผู้ติดต่อ" จากใน vendor dropdown เดียวกัน
                        const addContactOption = vendorMultiselect.locator('.multiselect__option').filter({ hasText: 'เพิ่มผู้ติดต่อ' }).first();
                        if (await addContactOption.isVisible({ timeout: 3000 })) {
                            await addContactOption.click();
                            addLog(job.id, 'info', '🖱️ คลิก + เพิ่มผู้ติดต่อ สำเร็จ');
                        } else {
                            // Fallback
                            addLog(job.id, 'warn', '⚠️ ไม่พบปุ่มใน Dropdown — ลอง fallback');
                            const addContactBtn = page.getByText('+ เพิ่มผู้ติดต่อ', { exact: false }).first();
                            await addContactBtn.click({ force: true });
                        }
                    } else {
                        // มีข้อมูลผู้ขายใน Dropdown อย่างน้อย 1 รายการ
                        // ** [ปิดระบบตรวจสอบสาขาชั่วคราว ตามคำขอของผู้ใช้ เพื่อให้รันโฟลวข้ามไปทำส่วนอื่นต่ออย่างรวดเร็ว] **
                        addLog(job.id, 'info', `⚠️ [ข้ามการตรวจสอบสาขาชั่วคราว] มีผู้ขายให้เลือก ${vendorOptions.length} รายการ → เลือกรายการแรก`);
                        const firstOption = vendorMultiselect.locator('.multiselect__option').first();
                        await firstOption.click();
                        addLog(job.id, 'success', `✅ เลือกผู้ติดต่อ: ${vendorOptions[0].text.substring(0, 50)}...`);
                        
                        /*
                        addLog(job.id, 'info', `📋 วิเคราะห์ข้อมูลใน Dropdown และค้นหาสาขาที่ตรงกับใน Excel: "${branch || 'สำนักงานใหญ่'}"`);
                        
                        const branchNumTarget = branch ? branch.replace(/\D/g, '').padStart(5, '0') : '00000';
                        const isTargetHQ = !branch || branch === '00000' || branch === '0000' || branch.toLowerCase() === 'สำนักงานใหญ่';
                        
                        let matchedOpt = null;
                        
                        // วนลูปอ่านข้อมูลทุกบรรทัดในผลลัพธ์เพื่อวิเคราะห์ความตรงกันของสาขา
                        for (const opt of vendorOptions) {
                            addLog(job.id, 'info', `   🔍 ตรวจสอบ: "${opt.text.replace(/\n/g, ' ')}"`);
                            
                            // สกัดข้อมูลสาขาจากข้อความของ PEAK (รูปแบบมักมีคำว่า สาขา, สำนักงานใหญ่ หรือตัวเลขในวงเล็บ)
                            const isOptHQ = opt.text.includes('สำนักงานใหญ่') || opt.text.includes('(00000)') || opt.text.includes('สาขา 00000');
                            
                            let isMatch = false;
                            
                            if (isTargetHQ) {
                                // Excel ระบุเป็น สำนักงานใหญ่
                                if (isOptHQ || (!opt.text.includes('สาขา') && !opt.text.match(/\(\d{5}\)/))) {
                                    isMatch = true;
                                    addLog(job.id, 'success', `   ✅ พบสาขาที่ตรงกัน (สำนักงานใหญ่)`);
                                } else {
                                    addLog(job.id, 'info', `   ❌ ไม่ตรงเป้าหมาย (พบเป็นสาขาย่อย)`);
                                }
                            } else {
                                // Excel ระบุเป็น สาขาย่อย
                                if (!isOptHQ && (opt.text.includes(branchNumTarget) || opt.text.includes(branch))) {
                                    isMatch = true;
                                    addLog(job.id, 'success', `   ✅ พบสาขาที่ตรงกัน (สาขาย่อย: ${branchNumTarget})`);
                                } else {
                                    addLog(job.id, 'info', `   ❌ ไม่ตรงเป้าหมาย`);
                                }
                            }
                            }
                            
                            if (isMatch) {
                                matchedOpt = opt;
                                break; // เจอส่วนที่ตรงเป้าหมายแล้ว หยุดลูป
                            }
                        }
                        
                        // ทำการตัดสินใจคลิกเลือก
                        if (matchedOpt) {
                            addLog(job.id, 'success', `🖱️ คลิกเลือกผู้ขายที่ตรงกันเรียบร้อย`);
                            const targetOptElement = allOptions.nth(matchedOpt.index).locator('.multiselect__option');
                            await targetOptElement.click();
                            await page.waitForTimeout(3000);
                        } else {
                            // ถ้าหาสาขาที่ตรงเป๊ะไม่เจอเลย
                            if (vendorOptions.length === 1) {
                                addLog(job.id, 'warn', `⚠️ สาขาไม่ตรงเป๊ะ แต่มีผู้ขายรายการเดียว จึงอนุโลมเลือกรายการนี้: ${vendorOptions[0].text.replace(/\n/g, ' ').substring(0, 60)}`);
                                const targetOptElement = allOptions.nth(vendorOptions[0].index).locator('.multiselect__option');
                                await targetOptElement.click();
                                await page.waitForTimeout(3000);
                            } else {
                                addLog(job.id, 'warn', `⚠️ ไม่พบสาขาที่ตรงกับ "${branch}" ในทุกรายการ -> จำเป็นต้องเลือกรายการแรกไปก่อน: ${vendorOptions[0].text.replace(/\n/g, ' ').substring(0, 60)}`);
                                const targetOptElement = allOptions.nth(vendorOptions[0].index).locator('.multiselect__option');
                                await targetOptElement.click();
                                await page.waitForTimeout(3000);
                            }
                        }
                        */
                    }

                    // ถ้าเข้า "เพิ่มผู้ติดต่อ" → กรอกข้อมูลใน Modal
                    if (vendorOptions.length === 0) {
                        // 1. รอ Modal โหลดเสร็จ
                        addLog(job.id, 'info', '⏳ รอ Modal เพิ่มผู้ติดต่อโหลด...');
                        // ไม่ใช้ class .modal-content แล้ว เพราะโครงสร้าง PEAK อาจเปลี่ยน ให้รอแค่ Text Header ปรากฏ
                        await page.getByText('เพิ่มผู้ติดต่อ', { exact: true }).first().waitFor({ state: 'visible', timeout: 15000 });
                        await page.waitForTimeout(1000); // ให้ Vue render เต็มที่

                        // ใช้ page เป็น base แทน modalContent เพื่อหลีกเลี่ยงการจับ Scope ผิด
                        const modalContent = page;

                        // 2. กรอกเลขประจำตัวผู้เสียภาษี 13 หลัก
                        addLog(job.id, 'info', `✍️ กำลังพิมพ์เลขภาษี 13 หลัก: ${taxId}`);
                        
                        // โครงสร้างของเลข 13 หลัก เป็นกล่อง 13 กล่องแยกกัน (class="inputId")
                        const allInputBoxes = modalContent.locator('input.inputId');
                        const totalBoxes = await allInputBoxes.count();
                        
                        // ปกติฟอร์มลักษณะนี้ แม้จะหน้าตาเหมือน 13 ช่อง แต่มักจะมี input ซ่อนอยู่ 1 ตัว หรือพิมพ์ต่อกันได้เลย
                        // เราหา input ตัวแรกในชุดแล้วสั่ง fill ลวดเดียว
                        if (totalBoxes >= 13 && taxId.length === 13) {
                            addLog(job.id, 'info', `แยกกรอกทีละช่อง 13 กล่อง`);
                            for(let i=0; i<13; i++) {
                                const digit = taxId.charAt(i);
                                const box = allInputBoxes.nth(i);
                                await box.focus(); // แนะนำให้ focus ก่อนพิมพ์กันเหนียว
                                await box.fill(digit);
                            }
                        } else {
                            addLog(job.id, 'warn', `⚠️ ไม่พบช่องกรอกแบบแยก 13 ช่อง (พบ ${totalBoxes}) ลอง Fallback แบบเดิม...`);
                            const taxInput = page.locator('#inputTaxId input').first();
                            await taxInput.focus();
                            await taxInput.fill('');
                            await taxInput.pressSequentially(taxId, { delay: 30 }); // พิมพ์ทีละตัวให้ระบบ format ให้
                        }
                        await page.waitForTimeout(1000);

                        // 3. จัดการเรื่อง "สาขา"
                        const isHeadOffice = !branch || branch === '00000' || branch === '0000' || branch === 'สำนักงานใหญ่';
                        
                        if (isHeadOffice) {
                            addLog(job.id, 'info', '🏢 เลือกสาขา: สำนักงานใหญ่ -> กดค้นหา');
                            // "สำนักงานใหญ่" ถูกเลือกอยู่แล้ว (default) → ไปกดค้นหาได้เลย
                        } else {
                            const paddedBranch = branch.replace(/\D/g, '').padStart(5, '0');
                            addLog(job.id, 'info', `🏬 เลือกสาขา: ย่อย (${paddedBranch})`);
                            
                            // คลิกวิทยุ "สาขา" ใน Modal
                            const branchRadioLabel = modalContent.locator('label').filter({ hasText: /^สาขา$/ }).first();
                            await branchRadioLabel.click();
                            await page.waitForTimeout(1000); // รอให้ช่องกรอกสาขาโผล่มา
                            
                            addLog(job.id, 'info', `⌨️ กำลังพิมพ์เลขสาขา 5 หลัก: ${paddedBranch}`);
                            
                            // โครงสร้างหน้าเว็บเป็นกล่องเดี่ยว 5 กล่อง (แยกตัวอักษร)
                            // จากการตรวจสอบ DOM: ทุกกล่องในหน้า (ทั้งเลขผู้เสียภาษีและสาขา) ใช้ class "inputId"
                            // เลขผู้เสียภาษีมี 13 กล่อง (Index 0-12)
                            // เลขสาขามี 5 กล่อง (Index 13-17)
                            const allInputBoxes = modalContent.locator('input.inputId');
                            const totalBoxes = await allInputBoxes.count();
                            
                            if (totalBoxes >= 18) {
                                // กรอกลงกล่องที่ 14 ถึง 18 (Index 13 ถึง 17)
                                for(let i = 0; i < 5; i++) {
                                     const digit = paddedBranch[i];
                                     const box = allInputBoxes.nth(13 + i);
                                     await box.focus();
                                     await box.fill(''); 
                                     await box.pressSequentially(digit); 
                                     await page.waitForTimeout(10); // หายใจ 10ms พอให้ Vue ทัน
                                 }
                            } else {
                                // Fallback เผื่อ PEAK แอบซ่อนกล่องหรือเปลี่ยน UI ให้เป็นกล่องข้อความธรรมดา
                                addLog(job.id, 'warn', `⚠️ ไม่พบช่องกรอกสาขาแบบกล่องแยก 5 ช่อง (พบทั้งหมด ${totalBoxes} ช่อง) ลอง Fallback แบบเดิม...`);
                                
                                // หา label "สาขา" แล้วคลิกกล่อง input หลัง label
                                const branchRadioWrapper = modalContent.getByText(/^สาขา$/).locator('..').locator('..');
                                const fallbackInput = branchRadioWrapper.locator('input[type="text"]').first();
                                
                                if (await fallbackInput.isVisible()) {
                                    await fallbackInput.focus();
                                    await fallbackInput.fill('');
                                    await fallbackInput.pressSequentially(paddedBranch, { delay: 30 });
                                } else {
                                     // กด tab ถัดจาก radio แล้วพิมพ์
                                     await page.keyboard.press('Tab');
                                     await page.waitForTimeout(200);
                                     await page.keyboard.type(paddedBranch, { delay: 30 });
                                }
                            }
                            await page.waitForTimeout(1000);
                        }
                        
                        // 4. กดปุ่ม [ค้นหา] เพื่อเชื่อมต่อ API กรมพัฒน์
                        addLog(job.id, 'info', `⏳ รอให้ระบบ PEAK อัปเดตข้อมูลสาขา 1 วินาที...`);
                        await page.waitForTimeout(1000); // รอ 1 วินาทีหลังจากกรอกสาขาเสร็จ ค่อยกดปุ่มค้นหา
                        
                        // ใช้ xpath ที่ชี้ไปที่ปุ่มที่เขียนว่า "ค้นหา" เป๊ะๆ เพื่อหลีกเลี่ยงการไปโดนปุ่ม "ค้นหาด้วยชื่อ"
                        const searchBtn = modalContent.locator("xpath=//button[normalize-space()='ค้นหา']").first();
                        await searchBtn.click();
                        addLog(job.id, 'info', `🔍 กดปุ่ม "ค้นหา" (เชื่อมต่อกรมพัฒน์ฯ) เรียบร้อยแล้ว`);
                        
                        // รอโหลดดิ้งของ PEAK หายไป
                        try { await page.waitForSelector('.IsLoadingBg', { state: 'hidden', timeout: 10000 }); } catch (e) {}
                        
                        // รีบดักจับข้อความแจ้งเตือนทันที (เพราะข้อความอาจปรากฏขึ้นแล้วหายไปอย่างรวดเร็ว)
                        try {
                            const errorLocator = modalContent.locator(':text-matches("เลขที่สาขาไม่ถูกต้อง", "i")');
                            const successLocator = modalContent.locator(':text-matches("ค้นหาสำเร็จ", "i")');
                            
                            // รอให้อันใดอันหนึ่งโผล่ขึ้นมา (ให้เวลา 3 วินาที)
                            await errorLocator.or(successLocator).first().waitFor({ state: 'visible', timeout: 3000 });
                            
                            if (await errorLocator.isVisible()) {
                                addLog(job.id, 'warn', `⚠️ จับข้อความ "เลขที่สาขาไม่ถูกต้อง" ได้ทัน! -> กำลังกดค้นหาซ้ำ...`);
                                await searchBtn.click();
                                try { await page.waitForSelector('.IsLoadingBg', { state: 'hidden', timeout: 10000 }); } catch (e) {}
                                await page.waitForTimeout(2000); // ชะลอให้ข้อมูลที่อยู่โหลดเสร็จหลังกดรอบสอง
                            } else if (await successLocator.isVisible()) {
                                addLog(job.id, 'success', `✅ พบข้อความ "ค้นหาสำเร็จ" จากระบบแจ้งเตือน`);
                            }
                        } catch (e) {
                            addLog(job.id, 'info', `⏳ รอ 3 วินาทีแล้วไม่มีข้อความแจ้งเตือน (ทำงานต่อ)`);
                        }

                        // 5. ดึงข้อมูลที่อยู่จาก Excel มาเติม
                        // ค้นหา vendor จาก Sheet "ที่อยู่แต่ละบริษัท" (ระวังชื่อคอลัมน์ใน Excel มีช่องว่างหรือขึ้นบรรทัดใหม่)
                        const vendorMaster = vendors.find(v => {
                            const taxKey = Object.keys(v).find(k => k.replace(/[\n\r\s]/g, '').includes('เลขประจำตัวผู้เสียภาษี'));
                            return taxKey ? String(v[taxKey]).replace(/\D/g, '') === taxId : false;
                        });

                        if (vendorMaster) {
                            addLog(job.id, 'info', `📍 ตรวจสอบช่องที่อยู่...`);
                            
                            // หน้าจอ PEAK มักจะซ่อนที่อยู่ไว้ ต้องกด "ย่อ/ขยาย" ก่อน
                            const addressInput = modalContent.locator('input[placeholder*="กรุณาระบุเลขที่"]').first();
                            
                            if (!(await addressInput.isVisible())) {
                                // พยายามหากล่องที่เขียนว่า "ที่อยู่จดทะเบียน" และมีคำว่า "ย่อ/ขยาย" อยู่ใกล้ๆ
                                // หรือกดปุ่ม "ย่อ/ขยาย" ตัวแรกสุดซึ่งมักจะเป็นของที่อยู่
                                try {
                                    const expandBtn = modalContent.getByText('ย่อ/ขยาย').first();
                                    await expandBtn.click();
                                    await page.waitForTimeout(500); // รอฟอร์มกางออก
                                } catch (e) {
                                    addLog(job.id, 'warn', `⚠️ ไม่สามารถกดขยายช่องที่อยู่ได้`);
                                }
                            }
                            
                            if(await addressInput.isVisible()) {
                                const currentAddr = await addressInput.inputValue();
                                
                                // เก็บข้อความทั้งหมดบนฟอร์ม (รวมทุกช่อง input และข้อความธรรมดา) มาต่อกันเป็น Mega String 
                                // เพื่อเช็คว่าจริงๆ หน้าเว็บนี้มีที่อยู่ครบแล้วหรือยัง (เพราะ PEAK ชอบแยก ตำบล/อำเภอ ไปไว้กล่องอื่น)
                                let fullWebText = '';
                                try {
                                    // 1. ดึงข้อความดิบ (เช่น กรณีย่อฟอร์มไว้อยู่)
                                    fullWebText += (await modalContent.innerText()) + ' ';
                                    
                                    // 2. ดึงข้อความจากทุกช่อง Input (กรณีฟอร์มขยายแล้ว ข้อมูลกระจายอยู่หลายกล่อง)
                                    const allInputs = await modalContent.locator('input[type="text"]').elementHandles();
                                    for (const input of allInputs) {
                                        try { fullWebText += (await input.inputValue()) + ' '; } catch(e) {}
                                    }
                                } catch (e) {}

                                // fallback ถ้าดึง Mega String หรือหา input ไม่เจอ ให้ใช้อันเดิม
                                if (fullWebText.trim() === '') fullWebText = currentAddr;
                                
                                // ค้นหาคอลัมน์ที่อยู่แบบยืดหยุ่น (ตัดช่องว่าง/บรรทัดใหม่ทิ้งก่อนเทียบ)
                                let fullAddress = '';
                                const fullAddrKey = Object.keys(vendorMaster).find(k => k.replace(/[\n\r\s]/g, '').includes('ที่อยู่รวม'));
                                const sysAddrKey = Object.keys(vendorMaster).find(k => k.replace(/[\n\r\s]/g, '').includes('ที่อยู่ตามระบบ'));
                                
                                if (fullAddrKey && vendorMaster[fullAddrKey]) {
                                    fullAddress = String(vendorMaster[fullAddrKey]).trim();
                                } else if (sysAddrKey && vendorMaster[sysAddrKey]) {
                                    fullAddress = String(vendorMaster[sysAddrKey]).trim();
                                }
                                
                                // ฟังก์ชันตัวช่วยสำหรับล้างข้อมูลเก่าและกดปุ่มกระจายข้อมูล
                                const fillAndDistribute = async (addressText) => {
                                    await addressInput.focus();
                                    
                                    // 1. ล้างข้อมูลด้วยคีย์บอร์ดเพื่อแก้บัค UI ของ PEAK ที่จำค่าเก่า
                                    await addressInput.click({ clickCount: 3 }); 
                                    await page.keyboard.press('Backspace');      
                                    await page.waitForTimeout(200); 

                                    // 2. ใส่ข้อมูลเต็มไปก่อน เพื่อให้ปุ่ม "กระจายข้อมูล" ทำงานได้
                                    await addressInput.fill(addressText);
                                    await addressInput.press('Enter');           
                                    
                                    // 3. กดปุ่ม "กระจายข้อมูล" เพื่อให้ PEAK จัดการแยก แขวง/เขต/จังหวัด ให้อัตโนมัติ
                                    try {
                                        const distributeBtn = modalContent.getByText('กระจายข้อมูล').first();
                                        if (await distributeBtn.isVisible({ timeout: 1000 })) {
                                            await distributeBtn.click();
                                            await page.waitForTimeout(1500); // รอ PEAK แยกข้อมูลลงช่องต่างๆ
                                        }
                                    } catch (e) {
                                    }

                                    // 4. ตัดเอาเฉพาะบ้านเลขที่/ถนน เพื่อไม่ให้ซ้ำซ้อนกับช่อง แขวง/เขต ด้านล่าง
                                    const match = addressText.match(/\s(ตำบล|ต\.|แขวง|อำเภอ|อ\.|เขต|จังหวัด|จ\.|กทม\.|กรุงเทพมหานคร|กรุงเทพฯ|\b\d{5}\b)/);
                                    if (match && match.index > 3) {
                                        let line1 = addressText.substring(0, match.index).trim();
                                        line1 = line1.replace(/,+$/, '').trim(); // ลบลูกน้ำท้ายประโยค
                                        
                                        // 5. ล้างอีกรอบแล้วใส่เฉพาะส่วนแรก
                                        await addressInput.focus();
                                        await addressInput.click({ clickCount: 3 }); 
                                        await page.keyboard.press('Backspace');      
                                        await page.waitForTimeout(200); 
                                        await addressInput.fill(line1);
                                        await addressInput.press('Enter');
                                    }
                                };
                                
                                 // ฟังก์ชันช่วยทำความสะอาดข้อความเพื่อเปรียบเทียบ (ลบช่องว่าง, คำนำหน้า ตำบล/อำเภอ/จังหวัด ที่มักเขียนต่างกัน)
                                 const normalizeAddr = (text) => {
                                     if (!text) return '';
                                     return text.replace(/[\s\n\r]/g, '')
                                                .replace(/(ตำบล|ต\.|อำเภอ|อ\.|จังหวัด|จ\.|หมู่ที่|หมู่|ม\.|เลขที่|ซอย|ซ\.|ถนน|ถ\.|กรุงเทพมหานคร|กรุงเทพฯ|กทม\.|แขวง|เขต)/g, '');
                                 };

                                 // นโยบายใหม่: ตรวจสอบแบบยืดหยุ่น (Fuzzy Match) แบบรวมกล่อง
                                 if (fullAddress && fullAddress.trim() !== '') {
                                     // เช็คจาก Mega String (ที่รวมทุกกล่องใน Popup ไว้แล้ว)
                                     const normCurrentMega = normalizeAddr(fullWebText);
                                     const normExcel = normalizeAddr(fullAddress);
                                     
                                     // ถ้าข้อมูลหลักจาก Excel "ไม่โผล่" อยู่ในคลัง Mega String ของเว็บ ค่อยทับ
                                     if (!normCurrentMega.includes(normExcel)) {
                                         addLog(job.id, 'info', `⚠️ ข้อมูลรวมบนเว็บไม่ตรงกับ Excel (เว็บ: "${currentAddr}...") -> ลบแล้วใส่ใหม่...`);
                                         await fillAndDistribute(fullAddress);
                                         addLog(job.id, 'success', `✅ เติมที่อยู่จากไฟล์ Excel สมบูรณ์: "${fullAddress}"`);
                                     } else {
                                         addLog(job.id, 'info', `✅ ข้อมูลที่อยู่รวมบนเว็บครบถ้วนตรงกับ Excel แล้ว (ไม่ต้องทับซ้ำ)`);
                                     }
                                 } else {
                                         addLog(job.id, 'info', `✅ ข้อมูลที่อยู่บนเว็บตรงกับ Excel แล้ว (ไม่ต้องทับซ้ำ)`);
                                     }
                                 } else {
                                     // ถ้าใน Excel ไม่มีที่อยู่ ก็จำใจใช้ของเว็บไปตามสภาพ (ถ้าเว็บมี)
                                     if (!currentAddr || currentAddr.trim() === '' || currentAddr.length < 10) {
                                         addLog(job.id, 'warn', `⚠️ ไม่มีข้อมูลที่อยู่ในไฟล์ Excel สำหรับเจ้านี้ (และหน้าเว็บก็ไม่มี)`);
                                     } else {
                                         addLog(job.id, 'info', `✅ ระบบ PEAK ดึงที่อยู่มาให้แล้ว และไม่มีข้อมูลใน Excel ให้เทียบทับ ("${currentAddr}")`);
                                     }
                                 }
                            } else {
                                addLog(job.id, 'warn', `⚠️ หาช่องกรอกที่อยู่ไม่พบ (Input ผิดรูปแบบ หรือหาไม่เจอ)`);
                            }
                        }

                        // 6. กดปุ่ม [เพิ่ม] บันทึกผู้ติดต่อใหม่
                        addLog(job.id, 'info', `💾 บันทึกผู้ติดต่อใหม่...`);
                        
                        // รอ IsLoadingBg หายไปเผื่อระบบกำลังประมวลผลที่อยู่
                        try { await page.waitForSelector('.IsLoadingBg', { state: 'hidden', timeout: 10000 }); } catch (e) {}
                        await page.waitForTimeout(500);

                        const saveBtn = modalContent.locator('button').filter({ hasText: /^เพิ่ม$/ }).first();
                        await saveBtn.click({ force: true });
                        
                        // รอ Modal ปิด
                        await modalContent.waitFor({ state: 'hidden', timeout: 15000 });
                        addLog(job.id, 'success', `✅ สร้างผู้ติดต่อใหม่สำเร็จ`);
                    }

                    // --- จบขั้นตอน Vendor --- 
                    // TODO: กรอกรายการสินค้า / ยอดเงิน ในสเต็ปถัดไป
                    addLog(job.id, 'success', `✅ จบขั้นตอน Vendor สำหรับรายการที่ ${rowNum}`);

                } catch (rowErr) {
                    addLog(job.id, 'error', `❌ เกิดข้อผิดพลาดในรายการที่ ${rowNum}: ${rowErr.message}`);
                    
                    // แคปหน้าจอเพื่อ Debug
                    try {
                        if (!page.isClosed()) {
                            const fs = require('fs');
                            const path = require('path');
                            const screenshotDir = path.join(__dirname, '..', 'screenshots');
                            fs.mkdirSync(screenshotDir, { recursive: true });
                            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                            const screenshotPath = path.join(screenshotDir, `error_row${rowNum}_${timestamp}.png`);
                            await page.screenshot({ path: screenshotPath, fullPage: true });
                            addLog(job.id, 'info', `📸 แคปหน้าจอ Error แล้ว: ${screenshotPath}`);
                        }
                    } catch (ssErr) {
                        addLog(job.id, 'warn', `⚠️ ไม่สามารถแคปหน้าจอได้: ${ssErr.message}`);
                    }
                }
            }
            // --- จบลูป ---

            // TODO: OCR reading phase will start here
            addLog(job.id, 'info', '📋 รอคำสั่งถัดไป... (รอ 10 วินาทีก่อนปิดรอบ เพื่อให้เห็นหน้าจอ)');

            // Keeping bot open to view page and prevent premature closure of the context
            await page.waitForTimeout(10000);
            
            // Mark Job as finished officially so frontend stops polling
            job.status = 'finished';
            job.finishedAt = new Date().toISOString();
            addLog(job.id, 'success', '🎉 บอททำงานเสร็จสมบูรณ์');
            
            // ค่อยปิด context เมื่อทุกอย่างเสร็จสิ้นจริงๆ
            try { if (job.context) await job.context.close(); } catch (e) {}

        } else {
            addLog(job.id, 'error', '❌ ไม่พบ PEAK Code ในโปรไฟล์ ไม่สามารถเข้าหน้าบริษัทได้');
            job.status = 'error';
            throw new Error('Missing PEAK Code in Profile');
        }

    } catch (error) {
        job.status = 'error';
        job.finishedAt = new Date().toISOString();
        addLog(job.id, 'error', `❌ เกิดข้อผิดพลาด: ${error.message}`);

        // Cleanup Context (Keep sharedBrowser alive)
        try { if (job.context) await job.context.close(); } catch (e) {}
        job.page = null;
        job.context = null;

        // Try next in queue
        processQueue();
    }
}

// ==========================================
// API: LIST EXCEL FILES
// ==========================================
router.get('/excel-files', (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const uploadsDir = process.env.EXCEL_UPLOADS_DIR || path.join('V:', 'A.โฟร์เดอร์หลัก', 'Build000 ทดสอบระบบ', 'test', 'ทดสอบระบบแยกเอกสาร');
        
        // Ensure directory exists
        if (!fs.existsSync(uploadsDir)) {
            // Only try to create if it's not a root drive that we might not have permission to write to
            try {
                fs.mkdirSync(uploadsDir, { recursive: true });
            } catch(e) {
                console.warn("Could not create uploads directory", e.message);
            }
        }
        
        let excelFiles = [];
        if (fs.existsSync(uploadsDir)) {
             const files = fs.readdirSync(uploadsDir);
             excelFiles = files.filter(file => 
                 file.endsWith('.xlsx') && !file.startsWith('~$') 
             );
        }
        
        res.json({ success: true, files: excelFiles, directory: uploadsDir });
    } catch (error) {
        console.error('Error listing excel files:', error);
        res.status(500).json({ error: 'Failed to list excel files', details: error.message });
    }
});

// ==========================================
// API: START BOT (Queue a job)
// ==========================================
router.post('/start', async (req, res) => {
    const { profileId, excelPath } = req.body;
    if (!profileId) return res.status(400).json({ error: 'Missing profileId' });

    try {
        const db = getDB();
        const profile = db.prepare('SELECT * FROM bot_profiles WHERE id = ?').get(profileId);
        if (!profile) return res.status(404).json({ error: 'Profile not found' });

        const job = createJob(profileId, profile, excelPath);

        if (getRunningCount() < MAX_CONCURRENT) {
            addLog(job.id, 'info', '🎯 เริ่มทำงานทันที (ไม่ต้องรอคิว)');
            executeJob(job).catch(err => {
                job.status = 'error';
                job.finishedAt = new Date().toISOString();
                addLog(job.id, 'error', `เกิดข้อผิดพลาด: ${err.message}`);
            });
        } else {
            jobQueue.push(job.id);
            const position = jobQueue.length;
            addLog(job.id, 'warn', `⏳ เข้าคิวรอ — ลำดับที่ ${position} (กำลังรัน ${getRunningCount()}/${MAX_CONCURRENT})`);
        }

        res.json({
            success: true,
            jobId: job.id,
            status: job.status,
            queuePosition: job.status === 'queued' ? jobQueue.indexOf(job.id) + 1 : 0,
            runningCount: getRunningCount(),
            maxConcurrent: MAX_CONCURRENT
        });
    } catch (error) {
        console.error('Bot start error:', error);
        res.status(500).json({ error: 'Failed to start bot', details: error.message });
    }
});

// ==========================================
// API: LIST ALL JOBS
// ==========================================
router.get('/jobs', (req, res) => {
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
            finishedAt: job.finishedAt
        });
    }
    // Sort: running first, then queued, then done
    const order = { running: 0, logged_in: 0, working: 0, queued: 1, done: 2, error: 3, stopped: 4 };
    jobList.sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5));

    res.json({
        jobs: jobList,
        runningCount: getRunningCount(),
        queuedCount: jobQueue.length,
        maxConcurrent: MAX_CONCURRENT
    });
});

// ==========================================
// API: GET JOB LOGS
// ==========================================
router.get('/logs/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    res.json({
        jobId: job.id,
        status: job.status,
        logs: job.logs
    });
});

// ==========================================
// API: SSE STREAM (Real-time logs)
// ==========================================
router.get('/stream/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    const job = jobs.get(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send existing logs first
    job.logs.forEach(entry => {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
    });

    // Register client
    if (!sseClients.has(jobId)) sseClients.set(jobId, []);
    sseClients.get(jobId).push(res);

    // Cleanup on disconnect
    req.on('close', () => {
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
router.post('/stop/:jobId', async (req, res) => {
    const jobId = req.params.jobId;
    const job = jobs.get(jobId);
    if (!job) return res.json({ success: true, message: 'Job not found' });

    // Remove from queue if queued
    const qIdx = jobQueue.indexOf(jobId);
    if (qIdx > -1) jobQueue.splice(qIdx, 1);

    // Close browser if running
    if (job.browser) {
        try { await job.browser.close(); } catch (e) {}
        job.browser = null;
        job.page = null;
        job.context = null;
    }

    job.status = 'stopped';
    job.finishedAt = new Date().toISOString();
    addLog(jobId, 'warn', '⏹️ บอทถูกหยุดโดยผู้ใช้');

    // Update profile status
    try {
        const db = getDB();
        db.prepare('UPDATE bot_profiles SET status = ? WHERE id = ?').run('idle', job.profileId);
    } catch (e) {}

    // Process next in queue
    processQueue();

    res.json({ success: true, message: 'Bot stopped' });
});

module.exports = router;
