const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getPool } = require('../../mysql');

// Extracted modules
const { decrypt } = require('./encryption');
const { parseExcelData, getExcelVal } = require('./excel-parser');
const { jobs, jobQueue, createJob, getRunningCount, getSharedBrowser, MAX_CONCURRENT } = require('./job-queue');
const { addLog: rawAddLog, registerSSERoutes } = require('./sse-handler');

// Bind addLog to jobs map for convenience
const addLog = (jobId, level, message) => rawAddLog(jobs, jobId, level, message);

// Register SSE routes
registerSSERoutes(router, jobs);

// ==========================================
// QUEUE PROCESSOR
// ==========================================
async function processQueue() {
    while (jobQueue.length > 0 && getRunningCount() < MAX_CONCURRENT) {
        const jobId = jobQueue.shift();
        const job = jobs.get(jobId);
        if (!job || job.status !== 'queued') continue;

        executeJob(job).catch((err) => {
            console.error(`Job ${job.id} failed:`, err);
            job.status = 'error';
            job.finishedAt = new Date().toISOString();
            addLog(job.id, 'error', `เกิดข้อผิดพลาด: ${err.message}`);
        });
    }
}

// ==========================================
// JOB EXECUTOR (Main Playwright Flow)
// ==========================================
async function executeJob(job) {
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    addLog(job.id, 'info', '🚀 เริ่มต้นทำงาน...');

    try {
        // 0. Parse Excel
        addLog(job.id, 'info', `📁 กำลังอ่านออเดอร์จากไฟล์ Excel: ${job.excelPath}...`);
        try {
            const excelData = await parseExcelData(job.excelPath, addLog, job.id);
            job.excelData = excelData;

            if (excelData.skippedCount > 0) {
                addLog(job.id, 'error', `❌ พบ ${excelData.skippedCount} รายการที่ข้อมูลไม่ครบ — กรุณาแก้ไข Excel แล้วลองใหม่ (ระบบหยุดก่อน Login)`);
                job.status = 'error';
                job.finishedAt = new Date().toISOString();
                return;
            }
            if (excelData.missingFiles && excelData.missingFiles.length > 0) {
                addLog(job.id, 'error', `❌ พบ ${excelData.missingFiles.length} ไฟล์ต้นทางที่ไม่มีอยู่จริง — กรุณาเช็คไฟล์แล้วลองใหม่ (ระบบหยุดก่อน Login)`);
                job.status = 'error';
                job.finishedAt = new Date().toISOString();
                return;
            }
            if (excelData.transactions.length === 0) {
                addLog(job.id, 'error', `❌ ไม่พบรายการที่พร้อมทำงาน — กรุณาตรวจสอบ Excel`);
                job.status = 'error';
                job.finishedAt = new Date().toISOString();
                return;
            }

            addLog(job.id, 'success', `✅ อ่านไฟล์แล้วพบ ค่าใช้จ่าย ${excelData.transactions.length} รายการ | ข้อมูลผู้ขายรวม ${excelData.vendors.length} บริษัท`);
        } catch (excelErr) {
            addLog(job.id, 'error', `❌ ไม่สามารถอ่านไฟล์ Excel ได้: ${excelErr.message}`);
            throw excelErr;
        }

        // 1. Launch / reuse browser
        addLog(job.id, 'info', '🌐 กำลังเตรียมเบราว์เซอร์...');
        const sharedBrowser = await getSharedBrowser();
        addLog(job.id, 'info', '🔧 เตรียม Browser Instance เรียบร้อย');

        const context = await sharedBrowser.newContext({ viewport: null });
        const page = await context.newPage();

        job.browser = sharedBrowser;
        job.context = context;
        job.page = page;

        page.on('close', () => {
            addLog(job.id, 'warn', '⚠️ Page ถูกปิดจากภายนอก (detected by close event)');
        });
        addLog(job.id, 'success', '✅ เตรียมเบราว์เซอร์สำเร็จ');

        // 2. Login to PEAK
        addLog(job.id, 'info', '🔗 กำลังเข้าหน้า Login PEAK...');
        await page.goto('https://secure.peakaccount.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        addLog(job.id, 'success', '✅ เข้าหน้า Login สำเร็จ');

        addLog(job.id, 'info', '⏳ รอฟอร์ม Login โหลด...');
        const emailInput = page.locator("input[placeholder='กรุณากรอกข้อมูลอีเมล']");
        await emailInput.waitFor({ state: 'visible', timeout: 15000 });

        addLog(job.id, 'info', `📧 กรอกอีเมล: ${job.username}`);
        await emailInput.fill(job.username);

        const pool = getPool();
        const [profileRows] = await pool.execute('SELECT password FROM bot_profiles WHERE id = ?', [job.profileId]);
        const profileData = profileRows[0];
        if (!profileData) {
            addLog(job.id, 'error', `❌ ไม่พบ Profile ID: ${job.profileId} ใน Database`);
            throw new Error('Profile not found in MySQL');
        }
        const password = decrypt(profileData.password);

        addLog(job.id, 'info', '🔒 กรอกรหัสผ่าน: ********');
        await page.fill("input[placeholder='กรุณากรอกข้อมูลรหัสผ่าน']", password);

        addLog(job.id, 'info', '🖱️ คลิกเข้าสู่ระบบ PEAK...');
        await page.click('button:has-text("เข้าสู่ระบบ PEAK")');
        await page.waitForTimeout(2000);

        try {
            await page.waitForURL('**/*', { timeout: 15000 });
            const currentUrl = page.url();
            if (currentUrl.includes('/home') || currentUrl.includes('/selectlist')) {
                job.status = 'logged_in';
                addLog(job.id, 'success', `✅ Login สำเร็จ! (${currentUrl})`);
                await pool.execute('UPDATE bot_profiles SET status = ?, last_sync = ? WHERE id = ?', ['running', new Date().toISOString(), job.profileId]);
            } else {
                job.status = 'logged_in';
                addLog(job.id, 'warn', `⚠️ Login อาจไม่สำเร็จ — URL: ${currentUrl}`);
            }
        } catch (navErr) {
            job.status = 'logged_in';
            addLog(job.id, 'warn', '⚠️ รอ navigation timeout — กรุณาตรวจสอบเบราว์เซอร์');
        }

        // 3. Navigate to company + process transactions
        // NOTE: The rest of the executeJob flow (vendor handling, form filling, VAT,
        // file operations, payment) remains in the original bot-automation.js.
        // This index.js delegates to it via require('../bot-automation') for the
        // full flow. See bot-automation.js lines 444-2517 for the complete flow.
        //
        // For now, we keep the original bot-automation.js as the "legacy" executor
        // and this index.js as the new modular entry point for the API routes only.
        // The full migration of executeJob internals into sub-modules is Phase 2.2.

        const peakCode = job.peakCode;
        if (!peakCode) {
            addLog(job.id, 'error', '❌ ไม่พบ PEAK Code ในโปรไฟล์ ไม่สามารถเข้าหน้าบริษัทได้');
            job.status = 'error';
            throw new Error('Missing PEAK Code in Profile');
        }

        // Re-require the original file for the remaining flow
        // This preserves 100% backward compatibility while modules are gradually extracted
        const { executeJobFlow } = require('./peak-automation-flow');
        await executeJobFlow(job, page, context, pool, peakCode, addLog);

    } catch (error) {
        job.status = 'error';
        job.finishedAt = new Date().toISOString();
        addLog(job.id, 'error', `❌ เกิดข้อผิดพลาด: ${error.message}`);

        try { if (job.context) await job.context.close(); } catch (e) {}
        job.page = null;
        job.context = null;

        processQueue();
    }
}

// ==========================================
// API ROUTES
// ==========================================

// LIST EXCEL FILES
router.get('/excel-files', (req, res) => {
    try {
        let uploadsDir = req.query.dir;
        if (!uploadsDir) {
            uploadsDir = process.env.EXCEL_UPLOADS_DIR ||
                path.join('V:', 'A.โฟร์เดอร์หลัก', 'Build000 ทดสอบระบบ', 'test', 'ทดสอบระบบแยกเอกสาร');
        }

        if (!fs.existsSync(uploadsDir)) {
            try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (e) {
                console.warn('Could not create uploads directory', e.message);
            }
        }

        let excelFiles = [];
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            excelFiles = files
                .filter((file) => file.endsWith('.xlsx') && !file.startsWith('~$'))
                .map((f) => path.join(uploadsDir, f));
        }

        res.json({ success: true, files: excelFiles, directory: uploadsDir });
    } catch (error) {
        console.error('Error listing excel files:', error);
        res.status(500).json({ error: 'Failed to list excel files', details: error.message });
    }
});

// START BOT
router.post('/start', async (req, res) => {
    const { profileId, excelPath } = req.body;
    if (!profileId) return res.status(400).json({ error: 'Missing profileId' });

    try {
        const pool = getPool();
        const [profileRows] = await pool.execute('SELECT * FROM bot_profiles WHERE id = ?', [profileId]);
        const profile = profileRows[0];
        if (!profile) return res.status(404).json({ error: 'Profile not found' });

        const job = createJob(profileId, profile, excelPath);

        if (getRunningCount() < MAX_CONCURRENT) {
            addLog(job.id, 'info', '🎯 เริ่มทำงานทันที (ไม่ต้องรอคิว)');
            executeJob(job).catch((err) => {
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
            maxConcurrent: MAX_CONCURRENT,
        });
    } catch (error) {
        console.error('Bot start error:', error);
        res.status(500).json({ error: 'Failed to start bot', details: error.message });
    }
});

// LIST JOBS
router.get('/jobs', (req, res) => {
    const jobList = [];
    for (const [id, job] of jobs) {
        // Parse progress from logs — pattern: 📦 [บิลที่ X/Y]
        let progressCurrent = 0, progressTotal = 0;
        for (let i = job.logs.length - 1; i >= 0; i--) {
            const m = job.logs[i].message?.match(/บิลที่\s*(\d+)\s*\/\s*(\d+)/);
            if (m) {
                progressCurrent = parseInt(m[1], 10);
                progressTotal = parseInt(m[2], 10);
                break;
            }
        }

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
            progressCurrent,
            progressTotal,
        });
    }
    const order = { running: 0, logged_in: 0, working: 0, queued: 1, finished: 2, done: 2, error: 3, stopped: 4 };
    jobList.sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5));

    res.json({
        jobs: jobList,
        runningCount: getRunningCount(),
        queuedCount: jobQueue.length,
        maxConcurrent: MAX_CONCURRENT,
    });
});

// GET JOB LOGS
router.get('/logs/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json({ jobId: job.id, status: job.status, logs: job.logs });
});

// STOP JOB
router.post('/stop/:jobId', async (req, res) => {
    const jobId = req.params.jobId;
    const job = jobs.get(jobId);
    if (!job) return res.json({ success: true, message: 'Job not found' });

    const qIdx = jobQueue.indexOf(jobId);
    if (qIdx > -1) jobQueue.splice(qIdx, 1);

    if (job.browser) {
        try { await job.browser.close(); } catch (e) {}
        job.browser = null;
        job.page = null;
        job.context = null;
    }

    job.status = 'stopped';
    job.finishedAt = new Date().toISOString();
    addLog(jobId, 'warn', '⏹️ บอทถูกหยุดโดยผู้ใช้');

    try {
        const pool = getPool();
        await pool.execute('UPDATE bot_profiles SET status = ? WHERE id = ?', ['idle', job.profileId]);
    } catch (e) {}

    processQueue();
    res.json({ success: true, message: 'Bot stopped' });
});

module.exports = router;
