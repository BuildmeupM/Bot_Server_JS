/**
 * OCR Batch Processor — ระบบประมวลผล OCR แบบ Parallel
 * 
 * แบ่งไฟล์ให้ Workers หลายตัว (1 API Key = 1 Worker)
 * ทำงานพร้อมกัน ไม่ซ้ำกัน พร้อมรายงานสถานะ Real-time
 */
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const { preprocessImage, getFileType } = require('./preprocess');
const { postProcessOcrData } = require('./postprocess');
const { applyCompanyRules } = require('./company-rules');
const { getPool } = require('../../mysql');

// ─── Auto-save company data from OCR results ───
async function autoSaveCompanies(data) {
    try {
        const pool = getPool();
        const validateTaxId = (id) => {
            if (!id) return false;
            const d = id.replace(/\D/g, '');
            if (d.length !== 13) return false;
            let sum = 0;
            for (let i = 0; i < 12; i++) sum += parseInt(d[i]) * (13 - i);
            let chk = 11 - (sum % 11);
            if (chk === 10) chk = 0; if (chk === 11) chk = 1;
            return chk === parseInt(d[12]);
        };
        const entries = [
            { taxId: data.sellerTaxId, nameTh: data.sellerNameTh, nameEn: data.sellerNameEn, address: data.sellerAddress },
            { taxId: data.buyerTaxId, nameTh: data.buyerNameTh, nameEn: data.buyerNameEn, address: data.buyerAddress }
        ];
        for (const e of entries) {
            if (!e.taxId) continue;
            const clean = e.taxId.replace(/\D/g, '');
            if (clean.length < 10) continue;
            await pool.execute(
                `INSERT INTO companies_master (tax_id, name_th, name_en, address, tax_id_valid, source)
                 VALUES (?, ?, ?, ?, ?, 'ocr')
                 ON DUPLICATE KEY UPDATE
                    name_th = COALESCE(VALUES(name_th), name_th),
                    name_en = COALESCE(VALUES(name_en), name_en),
                    address = COALESCE(VALUES(address), address),
                    times_seen = times_seen + 1,
                    last_seen_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP`,
                [clean, e.nameTh || null, e.nameEn || null, e.address || null, validateTaxId(e.taxId) ? 1 : 0]
            );
        }
    } catch (err) {
        console.error('⚠️ Auto-save company failed (non-critical):', err.message);
    }
}

// ─── Check if file was already OCR'd (by filename) ───
async function checkDuplicateFile(fileName) {
    try {
        const pool = getPool();
        const [rows] = await pool.execute(
            `SELECT * 
             FROM ocr_history WHERE file_name = ? AND status = 'done' LIMIT 1`,
            [fileName]
        );
        return rows.length > 0 ? rows[0] : null;
    } catch (err) {
        console.error('⚠️ Check duplicate failed:', err.message);
        return null;
    }
}

// ─── Extract build code + company name from file path ───
function extractBuildInfo(filePath) {
    if (!filePath) return { code: null, name: null };
    // Match "Build000 ชื่อบริษัท" from path — folder name between backslashes
    const match = filePath.match(/\\(Build\d+)\s+([^\\]+)\\/i);
    if (match) return { code: match[1], name: match[2].trim() };
    // Fallback: just build code without name
    const codeOnly = filePath.match(/Build\d+/i);
    return { code: codeOnly ? codeOnly[0] : null, name: null };
}

// ─── Save OCR result to history (UPSERT — อัพเดทถ้าชื่อไฟล์ซ้ำ) ───
async function saveOcrHistory(data) {
    try {
        const pool = getPool();
        const buildInfo = extractBuildInfo(data.filePath);

        // ตรวจสอบว่ามี record เดิมของ file_name นี้หรือไม่
        const [existing] = await pool.execute(
            `SELECT id FROM ocr_history WHERE file_name = ? LIMIT 1`,
            [data.fileName]
        );

        if (existing.length > 0) {
            // ── UPDATE record เดิม ──
            await pool.execute(
                `UPDATE ocr_history SET
                    file_path = ?, document_type = ?, document_number = ?, document_date = ?,
                    seller_name = ?, seller_tax_id = ?, seller_branch = ?, seller_address = ?, buyer_name = ?, buyer_tax_id = ?, buyer_address = ?,
                    subtotal = ?, vat = ?, total = ?, processing_time_ms = ?,
                    ocr_by = ?, batch_job_id = ?, status = ?,
                    build_code = ?, build_name = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [
                    data.filePath || null,
                    data.documentType || null,
                    data.documentNumber || null,
                    data.documentDate || null,
                    data.sellerName || null,
                    data.sellerTaxId || null,
                    data.sellerBranch || null,
                    data.sellerAddress || null,
                    data.buyerName || null,
                    data.buyerTaxId || null,
                    data.buyerAddress || null,
                    data.subtotal || null,
                    data.vat || null,
                    data.total || null,
                    data.processingTimeMs || null,
                    data.ocrBy || null,
                    data.batchJobId || null,
                    data.status || 'done',
                    buildInfo.code,
                    buildInfo.name,
                    existing[0].id
                ]
            );
            console.log(`  📝 Updated existing OCR history for: ${data.fileName}`);
        } else {
            // ── INSERT record ใหม่ ──
            await pool.execute(
                `INSERT INTO ocr_history 
                 (file_name, file_path, document_type, document_number, document_date,
                  seller_name, seller_tax_id, seller_branch, seller_address, buyer_name, buyer_tax_id, buyer_address,
                  subtotal, vat, total, processing_time_ms, ocr_by, batch_job_id, status, build_code, build_name)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.fileName || null,
                    data.filePath || null,
                    data.documentType || null,
                    data.documentNumber || null,
                    data.documentDate || null,
                    data.sellerName || null,
                    data.sellerTaxId || null,
                    data.sellerBranch || null,
                    data.sellerAddress || null,
                    data.buyerName || null,
                    data.buyerTaxId || null,
                    data.buyerAddress || null,
                    data.subtotal || null,
                    data.vat || null,
                    data.total || null,
                    data.processingTimeMs || null,
                    data.ocrBy || null,
                    data.batchJobId || null,
                    data.status || 'done',
                    buildInfo.code,
                    buildInfo.name
                ]
            );
        }
    } catch (err) {
        console.error('⚠️ Save OCR history failed:', err.message);
    }
}

// ══════════════════════════════════════════════
// Job Store — เก็บสถานะ Job ทั้งหมดใน Memory
// ══════════════════════════════════════════════
const jobStore = new Map();

// ลบ Job เก่าหลัง 24 ชั่วโมง
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

// customFields สำหรับเอกสารทางการเงินไทย
const FINANCIAL_DOCUMENT_FIELDS = [
    { key: "ประเภทเอกสาร", description: "ประเภทของเอกสาร เช่น ใบกำกับภาษี, ใบเสร็จรับเงิน, ใบลดหนี้, ใบเพิ่มหนี้", example: "ใบกำกับภาษี" },
    { key: "เลขที่เอกสาร", description: "เลขที่ใบกำกับภาษี ใบเสร็จรับเงิน หรือเลขที่เอกสาร", example: "IV2024-001" },
    { key: "วันที่ออกเอกสาร", description: "วันที่ออกเอกสาร ในรูปแบบ วัน/เดือน/ปี", example: "15/01/2567" },
    { key: "ชื่อผู้ขาย (ไทย)", description: "ชื่อบริษัทหรือร้านค้าผู้ขาย ภาษาไทย", example: "บริษัท เอบีซี จำกัด" },
    { key: "ชื่อผู้ขาย (อังกฤษ)", description: "ชื่อบริษัทหรือร้านค้าผู้ขาย ภาษาอังกฤษ", example: "ABC Co., Ltd." },
    { key: "เลขผู้เสียภาษีผู้ขาย", description: "เลขประจำตัวผู้เสียภาษี 13 หลักของผู้ขาย", example: "0105550123456" },
    { key: "ที่อยู่ผู้ขาย", description: "ที่อยู่เต็มของผู้ขาย", example: "123 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110" },
    { key: "ชื่อผู้ซื้อ (ไทย)", description: "ชื่อบริษัทหรือร้านค้าผู้ซื้อ ภาษาไทย", example: "บริษัท ดีอีเอฟ จำกัด" },
    { key: "ชื่อผู้ซื้อ (อังกฤษ)", description: "ชื่อบริษัทหรือร้านค้าผู้ซื้อ ภาษาอังกฤษ", example: "DEF Co., Ltd." },
    { key: "เลขผู้เสียภาษีผู้ซื้อ", description: "เลขประจำตัวผู้เสียภาษี 13 หลักของผู้ซื้อ", example: "0105560789012" },
    { key: "ที่อยู่ผู้ซื้อ", description: "ที่อยู่เต็มของผู้ซื้อ", example: "456 ถ.พหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพฯ 10400" },
    { key: "มูลค่าก่อน VAT", description: "ยอดรวมก่อนหักภาษีมูลค่าเพิ่ม", example: "10,000.00" },
    { key: "ภาษีมูลค่าเพิ่ม", description: "จำนวนภาษีมูลค่าเพิ่ม VAT 7%", example: "700.00" },
    { key: "ยอดรวมสุทธิ", description: "ยอดรวมทั้งสิ้นที่ต้องชำระ (รวม VAT แล้ว)", example: "10,700.00" }
];

// ══════════════════════════════════════════════
// แบ่งไฟล์ให้ Workers แบบ Round-robin (ไม่ซ้ำ)
// ══════════════════════════════════════════════
function distributeFiles(filePaths, workerCount) {
    const buckets = Array.from({ length: workerCount }, () => []);
    filePaths.forEach((filePath, index) => {
        buckets[index % workerCount].push(filePath);
    });
    return buckets;
}

// ══════════════════════════════════════════════
// สร้าง Batch Job
// ══════════════════════════════════════════════
function createBatchJob(filePaths, activeKeys, maxWorkers, user) {
    // จำกัดจำนวน Workers ไม่เกินจำนวน active keys
    const workerCount = Math.min(maxWorkers || activeKeys.length, activeKeys.length, filePaths.length);
    const distribution = distributeFiles(filePaths, workerCount);

    const jobId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const buildInfo = extractBuildInfo(filePaths[0] || '');
    let jobName = 'คิวงาน OCR';
    if (buildInfo && buildInfo.code) {
        jobName = `${buildInfo.code} ${buildInfo.name || ''}`.trim();
    } else if (filePaths.length > 0) {
        jobName = path.basename(path.dirname(filePaths[0]));
    }

    const workers = distribution.map((files, index) => ({
        workerId: index + 1,
        keyId: activeKeys[index].id,
        keyName: activeKeys[index].name,
        apiKey: activeKeys[index].key,
        files: files,
        status: 'waiting',       // waiting → processing → done / error
        currentFile: null,
        currentFileIndex: 0,
        completed: 0,
        total: files.length,
        creditsUsed: 0,
        results: [],
        errors: [],
        startTime: null,
        endTime: null
    }));

    const job = {
        jobId,
        jobName,
        status: 'processing',       // processing → completed / failed
        createdAt: new Date().toISOString(),
        createdBy: user ? { username: user.username, displayName: user.display_name || user.username } : { username: 'system', displayName: 'System' },
        totalFiles: filePaths.length,
        workerCount,
        workers,
        startTime: Date.now(),
        endTime: null
    };

    jobStore.set(jobId, job);

    // ── ลบ Job เก่าอัตโนมัติ ──
    setTimeout(() => { jobStore.delete(jobId); }, JOB_TTL_MS);

    return job;
}

// ══════════════════════════════════════════════
// Worker: อ่าน OCR ทีละไฟล์ (Sequential ภายใน Worker)
// ══════════════════════════════════════════════
async function processWorker(job, workerIndex, apiUrl) {
    const worker = job.workers[workerIndex];
    worker.status = 'processing';
    worker.startTime = Date.now();

    console.log(`\n🔧 Worker ${worker.workerId} (${worker.keyName}) เริ่มทำงาน — ${worker.total} ไฟล์`);

    for (let i = 0; i < worker.files.length; i++) {
        const filePath = worker.files[i];
        const fileName = path.basename(filePath);
        const fileStartTime = Date.now();

        worker.currentFile = filePath;
        worker.currentFileIndex = i + 1;

        console.log(`  📄 Worker ${worker.workerId}: [${i + 1}/${worker.total}] กำลังอ่าน ${fileName}...`);

        try {
            // 0. ตรวจสอบว่าไฟล์เคย OCR แล้วหรือยัง (ข้ามถ้า forceReprocess)
            if (!job.forceReprocess) {
                const duplicate = await checkDuplicateFile(fileName);
                if (duplicate) {
                    const fileTimeMs = Date.now() - fileStartTime;
                    worker.results.push({
                        file: fileName,
                        filePath,
                        status: 'done',
                        timeMs: fileTimeMs,
                        data: {
                            documentType: duplicate.document_type || null,
                            documentNumber: duplicate.document_number || null,
                            documentDate: duplicate.document_date || null,
                            sellerNameTh: duplicate.seller_name || null,
                            sellerTaxId: duplicate.seller_tax_id || null,
                            sellerBranch: duplicate.seller_branch || null,
                            buyerNameTh: duplicate.buyer_name || null,
                            buyerTaxId: duplicate.buyer_tax_id || null,
                            subtotal: duplicate.subtotal || null,
                            vat: duplicate.vat || null,
                            total: duplicate.total || null,
                            rawData: { note: 'ข้อมูลเดิมจากฐานข้อมูล (ไม่มีข้อมูลดิบในรอบนี้)' }
                        },
                        skippedReason: `ไฟล์นี้เคย OCR แล้วเมื่อ ${duplicate.created_at}`,
                        warnings: ['⚠️ ดึงจากข้อมูลเดิมที่เคยอ่านแล้ว (ไม่เสียเครดิต)']
                    });
                    worker.completed++;
                    console.log(`  ⏭️ Worker ${worker.workerId}: ${fileName} — ข้าม (เคย OCR แล้ว)`);
                    continue;
                }
            }

            // 1. ตรวจสอบไฟล์
            if (!fs.existsSync(filePath)) {
                throw new Error(`ไม่พบไฟล์: ${filePath}`);
            }

            // 2. อ่านไฟล์
            let fileBuffer = fs.readFileSync(filePath);
            const fileType = getFileType(fileName);

            // 3. Pre-processing (เฉพาะภาพ)
            let processedBuffer = fileBuffer;
            if (fileType === 'image') {
                processedBuffer = await preprocessImage(fileBuffer, {
                    grayscale: true,
                    normalize: true,
                    sharpenSigma: 1.5
                });
            }

            // 4. ส่งไปยัง AksornOCR
            const form = new FormData();
            const ext = path.extname(fileName).toLowerCase();
            const mimeType = ext === '.pdf' ? 'application/pdf'
                : ext === '.png' ? 'image/png'
                    : 'image/jpeg';

            form.append('file', processedBuffer, {
                filename: fileName,
                contentType: mimeType
            });
            form.append('model', 'aksonocr-1.0');
            form.append('customFields', JSON.stringify(FINANCIAL_DOCUMENT_FIELDS));

            const ocrResponse = await axios.post(apiUrl, form, {
                headers: {
                    ...form.getHeaders(),
                    'X-API-Key': worker.apiKey
                },
                timeout: 60000,
                validateStatus: () => true
            });

            // AksornOCR returns 200 or 201 on success
            const isSuccess = ocrResponse.status === 200 || ocrResponse.status === 201;

            if (isSuccess) {
                worker.creditsUsed++;
            } else {
                throw new Error(`AksornOCR HTTP ${ocrResponse.status}: ${JSON.stringify(ocrResponse.data).substring(0, 200)}`);
            }

            // 5. Extract + Post-process
            // AksornOCR response shape: { success: true, data: { field1: val1, ... } }
            const rawOcrResult = ocrResponse.data;
            let rawFields = {};

            if (rawOcrResult && rawOcrResult.data && typeof rawOcrResult.data === 'object') {
                // Primary: { success, data: { ... } }
                rawFields = { ...rawOcrResult.data };
            } else if (rawOcrResult && rawOcrResult.extracted_data) {
                const fields = rawOcrResult.extracted_data.fields || rawOcrResult.extracted_data;
                if (Array.isArray(fields)) {
                    fields.forEach(f => {
                        if (f.key && f.value !== undefined) rawFields[f.key] = f.value;
                    });
                } else if (typeof fields === 'object') {
                    rawFields = { ...fields };
                }
            } else if (rawOcrResult && typeof rawOcrResult === 'object') {
                rawFields = { ...rawOcrResult };
            }

            const processedData = postProcessOcrData(rawFields);
            const { data: finalData, ruleApplied } = applyCompanyRules(processedData);

            const fileTimeMs = Date.now() - fileStartTime;

            worker.results.push({
                file: fileName,
                filePath,
                status: 'done',
                timeMs: fileTimeMs,
                data: finalData,
                ruleApplied: ruleApplied || null,
                warnings: finalData.warnings || []
            });

            // Auto-save company data to master DB
            await autoSaveCompanies(finalData);

            // Save OCR history (ป้องกันอ่านซ้ำ)
            await saveOcrHistory({
                fileName,
                filePath,
                documentType: finalData.documentType,
                documentNumber: finalData.documentNumber,
                documentDate: finalData.documentDate,
                sellerName: finalData.sellerName,
                sellerTaxId: finalData.sellerTaxId,
                sellerBranch: finalData.sellerBranch,
                sellerAddress: finalData.sellerAddress,
                buyerName: finalData.buyerName,
                buyerTaxId: finalData.buyerTaxId,
                buyerAddress: finalData.buyerAddress,
                subtotal: finalData.subtotal,
                vat: finalData.vat,
                total: finalData.total,
                processingTimeMs: fileTimeMs,
                ocrBy: job.createdBy ? job.createdBy.username : null,
                batchJobId: job.jobId,
                status: 'done'
            });

            worker.completed++;
            console.log(`  ✅ Worker ${worker.workerId}: ${fileName} — สำเร็จ (${fileTimeMs}ms)`);

        } catch (err) {
            const fileTimeMs = Date.now() - fileStartTime;
            worker.errors.push({
                file: fileName,
                filePath,
                error: err.message,
                timeMs: fileTimeMs
            });
            worker.completed++;
            console.error(`  ❌ Worker ${worker.workerId}: ${fileName} — ผิดพลาด: ${err.message}`);
        }
    }

    worker.status = 'done';
    worker.currentFile = null;
    worker.endTime = Date.now();

    const totalWorkerTime = worker.endTime - worker.startTime;
    console.log(`✅ Worker ${worker.workerId} เสร็จสิ้น — ${worker.results.length} สำเร็จ, ${worker.errors.length} ผิดพลาด, ${worker.creditsUsed} เครดิต (${totalWorkerTime}ms)\n`);
}

// ══════════════════════════════════════════════
// เริ่มทำงาน Batch (ทุก Worker ทำงานพร้อมกัน)
// ══════════════════════════════════════════════
async function startBatchProcessing(job, apiUrl) {
    console.log(`\n══════════════════════════════════════════════`);
    console.log(`🚀 เริ่ม Batch Job: ${job.jobId}`);
    console.log(`📁 ไฟล์ทั้งหมด: ${job.totalFiles} | Workers: ${job.workerCount}`);
    console.log(`══════════════════════════════════════════════`);

    // รัน Workers ทั้งหมดพร้อมกัน (Promise.allSettled ไม่หยุดเมื่อ error)
    const workerPromises = job.workers.map((_, index) =>
        processWorker(job, index, apiUrl)
    );

    await Promise.allSettled(workerPromises);

    // อัพเดตสถานะ Job
    job.endTime = Date.now();
    const totalSuccess = job.workers.reduce((sum, w) => sum + w.results.length, 0);
    const totalErrors = job.workers.reduce((sum, w) => sum + w.errors.length, 0);
    const totalCredits = job.workers.reduce((sum, w) => sum + w.creditsUsed, 0);

    job.status = totalErrors === job.totalFiles ? 'failed' : 'completed';

    console.log(`══════════════════════════════════════════════`);
    console.log(`🏁 Batch Job เสร็จสิ้น: ${job.jobId}`);
    console.log(`   สำเร็จ: ${totalSuccess} | ผิดพลาด: ${totalErrors} | เครดิต: ${totalCredits}`);
    console.log(`   เวลา: ${job.endTime - job.startTime}ms`);
    console.log(`══════════════════════════════════════════════\n`);
}

// ══════════════════════════════════════════════
// ดึงสถานะ Job (สำหรับ polling)
// ══════════════════════════════════════════════
function getJobStatus(jobId) {
    const job = jobStore.get(jobId);
    if (!job) return null;

    const totalCompleted = job.workers.reduce((sum, w) => sum + w.completed, 0);
    const totalSuccess = job.workers.reduce((sum, w) => sum + w.results.length, 0);
    const totalErrors = job.workers.reduce((sum, w) => sum + w.errors.length, 0);
    const totalCredits = job.workers.reduce((sum, w) => sum + w.creditsUsed, 0);
    const elapsedMs = job.endTime
        ? (job.endTime - job.startTime)
        : (Date.now() - job.startTime);

    return {
        jobId: job.jobId,
        jobName: job.jobName,
        status: job.status,
        createdAt: job.createdAt,
        createdBy: job.createdBy,
        progress: {
            completed: totalCompleted,
            total: job.totalFiles,
            percent: Math.round((totalCompleted / job.totalFiles) * 100)
        },
        workers: job.workers.map(w => ({
            workerId: w.workerId,
            keyName: w.keyName,
            status: w.status,
            currentFile: w.currentFile ? path.basename(w.currentFile) : null,
            currentFilePath: w.currentFile,
            currentFileIndex: w.currentFileIndex,
            completed: w.completed,
            total: w.total,
            creditsUsed: w.creditsUsed,
            results: w.results.map(r => ({
                file: r.file,
                status: r.status,
                timeMs: r.timeMs,
                warnings: r.warnings
            })),
            errors: w.errors
        })),
        summary: {
            totalFiles: job.totalFiles,
            success: totalSuccess,
            failed: totalErrors,
            totalCreditsUsed: totalCredits,
            elapsedMs,
            avgTimePerFile: totalCompleted > 0 ? Math.round(elapsedMs / totalCompleted) : 0
        },
        // ผลลัพธ์ OCR (แสดงทั้งระหว่างทำและหลังทำเสร็จ)
        results: job.workers.flatMap(w => w.results),
        errors: job.workers.flatMap(w => w.errors)
    };
}

// ══════════════════════════════════════════════
// รายการ Jobs ทั้งหมด
// ══════════════════════════════════════════════
function listJobs() {
    const jobs = [];
    for (const [jobId, job] of jobStore) {
        const totalCompleted = job.workers.reduce((sum, w) => sum + w.completed, 0);
        const totalSuccess = job.workers.reduce((sum, w) => sum + w.results.length, 0);
        const totalErrors = job.workers.reduce((sum, w) => sum + w.errors.length, 0);
        const totalCredits = job.workers.reduce((sum, w) => sum + w.creditsUsed, 0);
        const elapsedMs = job.endTime ? (job.endTime - job.startTime) : (Date.now() - job.startTime);
        jobs.push({
            jobId,
            jobName: job.jobName,
            status: job.status,
            totalFiles: job.totalFiles,
            completed: totalCompleted,
            success: totalSuccess,
            failed: totalErrors,
            creditsUsed: totalCredits,
            elapsedMs,
            percent: Math.round((totalCompleted / job.totalFiles) * 100),
            createdAt: job.createdAt,
            createdBy: job.createdBy,
            workerCount: job.workerCount
        });
    }
    // เรียงจากใหม่สุด → เก่าสุด
    jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return jobs;
}

module.exports = {
    createBatchJob,
    startBatchProcessing,
    getJobStatus,
    listJobs,
    distributeFiles
};
