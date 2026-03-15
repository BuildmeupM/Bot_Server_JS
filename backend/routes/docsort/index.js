const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const authMiddleware = require('../../middleware/auth');
const { logActivity } = require('../../mysql');

// Helper: sanitize text for WinAnsi encoding (standard fonts can't render Thai/CJK)
function safeText(str) {
    if (!str) return 'N/A';
    // Replace non-ASCII chars with their Unicode code representation
    return String(str).replace(/[^\x20-\x7E]/g, (ch) => `[U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}]`);
}

const router = express.Router();

// ── Helper: Build new filename from form data ──
function buildNewFilename(data) {
    const { docType, whtSubType, whtExpenseType, whtPercent, whtAmount,
        accountCodes, originalName, paymentCodes } = data;

    let docPart = '';

    const hasWHT = docType === 'WHT' || docType === 'WHT&VAT';
    const hasVAT = docType === 'VAT' || docType === 'WHT&VAT';

    if (hasWHT) {
        if (whtExpenseType === 'domestic') {
            docPart = `WHT${whtPercent || ''}% - ${whtAmount || ''}`;
        } else if (whtExpenseType === 'foreign') {
            if (whtSubType === 'wht54' || whtSubType === 'wht54-pp36') {
                let calcAmount = whtAmount || '';
                if (whtPercent && whtAmount) {
                    const amt = parseFloat(whtAmount);
                    const pct = parseFloat(whtPercent);
                    const tax = (amt * pct) / (100 - pct);
                    calcAmount = (amt + tax).toFixed(2).replace(/\.?0+$/, '');
                }
                docPart = `WHT54-${whtPercent || ''}% - ${calcAmount}`;
                if (whtSubType === 'wht54-pp36') docPart += ' - PP36';
            } else if (whtSubType === 'pp36') {
                docPart = 'PP36';
            } else {
                docPart = 'WHT';
            }
        } else {
            docPart = 'WHT';
        }
        if (hasVAT) docPart += '&VAT';
    } else if (docType === 'VAT') {
        docPart = 'VAT';
    } else if (docType === 'None_Vat') {
        docPart = 'None_Vat';
    }

    // Build account code part with amounts (matching frontend preview)
    const validAcctCodes = (accountCodes || []).filter(c => c.code);
    let acctPart = '';
    if (validAcctCodes.length === 1) {
        // Single code: code_totalAmount (totalAmount comes from docPart for WHT, or vatAmount/noneVatAmount)
        acctPart = validAcctCodes[0].code;
    } else if (validAcctCodes.length > 1) {
        const hasPerCodeAmounts = validAcctCodes.some(c => c.amount);
        if (hasPerCodeAmounts) {
            // code1_amt1_code2_amt2
            acctPart = validAcctCodes.map(c => [c.code, c.amount].filter(Boolean).join('_')).join('_');
        } else {
            acctPart = validAcctCodes.map(c => c.code).join('_');
        }
    }

    // Payment codes: code only, NO amounts
    const payPart = (paymentCodes || []).map(c => c.code).filter(Boolean).join('_');

    // Final: {ประเภทเอกสาร} - {โค้ดบัญชี_ยอดเงิน} - {ชื่อไฟล์เดิม} - {โค้ดชำระเงิน}.pdf
    const nameParts = [];
    if (docPart) nameParts.push(docPart);
    if (acctPart) nameParts.push(acctPart);
    if (originalName) nameParts.push(originalName);
    if (payPart) nameParts.push(payPart);

    const filename = nameParts.join(' - ') + '.pdf';

    return filename;
}

// ── Helper: Get category folder name from docType ──
function getCategoryFolder(docType) {
    if (docType === 'WHT' || docType === 'WHT&VAT') return 'WHT';
    if (docType === 'VAT') return 'VAT';
    if (docType === 'None_Vat') return 'None_Vat';
    return 'Other';
}

// ── POST /api/rename-process/execute — Single file rename + PDF + categorize ──
router.post('/execute', authMiddleware, async (req, res) => {
    try {
        const { filePath, companyName, docType, whtSubType, whtExpenseType,
            whtPercent, whtAmount, accountCodes, paymentCodes,
            originalName } = req.body;

        if (!filePath) return res.status(400).json({ error: 'กรุณาระบุ path ไฟล์' });
        if (!docType) return res.status(400).json({ error: 'กรุณาเลือกประเภทเอกสาร' });

        const exists = await fs.pathExists(filePath);
        if (!exists) return res.status(404).json({ error: 'ไม่พบไฟล์ที่ระบุ' });

        const sourceDir = path.dirname(filePath);
        const sourceFilename = path.basename(filePath);

        // Build new filename
        const newFilename = buildNewFilename({
            docType, whtSubType, whtExpenseType, whtPercent, whtAmount,
            accountCodes, originalName: originalName || path.parse(sourceFilename).name,
            paymentCodes
        });

        // Create category folders
        const categoryFolder = getCategoryFolder(docType);
        const categoryDir = path.join(sourceDir, categoryFolder);
        const originalDir = path.join(sourceDir, 'ต้นฉบับ');

        await fs.ensureDir(categoryDir);
        await fs.ensureDir(originalDir);

        const ext = path.extname(filePath).toLowerCase();
        const newPdfPath = path.join(categoryDir, newFilename);

        // Read original file bytes first
        const fileBytes = await fs.readFile(filePath);

        if (ext === '.pdf') {
            // Original is PDF → write with new name
            await fs.writeFile(newPdfPath, fileBytes);
        } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
            // Original is image → embed into a PDF page
            const pdfDoc = await PDFDocument.create();

            let img;
            if (ext === '.png') {
                img = await pdfDoc.embedPng(fileBytes);
            } else {
                img = await pdfDoc.embedJpg(fileBytes);
            }

            // Create page matching image aspect ratio (fit A4-ish width)
            const pageWidth = 595.28;
            const scale = pageWidth / img.width;
            const pageHeight = img.height * scale;

            const page = pdfDoc.addPage([pageWidth, pageHeight]);
            page.drawImage(img, {
                x: 0,
                y: 0,
                width: pageWidth,
                height: pageHeight
            });

            const pdfBytes = await pdfDoc.save();
            await fs.writeFile(newPdfPath, pdfBytes);
        } else {
            // Other file types → write with new name
            await fs.writeFile(newPdfPath, fileBytes);
        }

        // Auto-detect: only backup if not already in ต้นฉบับ
        const originalBackupPath = path.join(originalDir, sourceFilename);
        const alreadyBackedUp = await fs.pathExists(originalBackupPath);
        if (!alreadyBackedUp) {
            await fs.writeFile(originalBackupPath, fileBytes);
        }
        await fs.remove(filePath);

        // Log activity
        if (req.user) {
            logActivity(req.user.id, 'rename_process',
                `Renamed: ${sourceFilename} → ${newFilename} (${docType})`, filePath);
        }

        res.json({
            message: 'เปลี่ยนชื่อไฟล์สำเร็จ',
            newFilename,
            newPath: newPdfPath,
            originalBackup: originalBackupPath,
            categoryFolder
        });

    } catch (err) {
        console.error('Rename process error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเปลี่ยนชื่อไฟล์' });
    }
});

// ── POST /api/rename-process/execute-batch — Batch rename ──
router.post('/execute-batch', authMiddleware, async (req, res) => {
    try {
        const { files } = req.body;
        // files = [{ filePath, companyName, docType, whtSubType, whtExpenseType,
        //            whtPercent, whtAmount, accountCodes, paymentCodes, originalName }]

        if (!Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ error: 'กรุณาเลือกไฟล์อย่างน้อย 1 ไฟล์' });
        }

        const results = [];
        const errors = [];

        for (const fileData of files) {
            try {
                const { filePath, companyName, docType, whtSubType, whtExpenseType,
                    whtPercent, whtAmount, accountCodes, paymentCodes, originalName } = fileData;

                if (!filePath || !docType) {
                    errors.push({ filePath, error: 'ข้อมูลไม่ครบ' });
                    continue;
                }

                const exists = await fs.pathExists(filePath);
                if (!exists) {
                    errors.push({ filePath, error: 'ไม่พบไฟล์' });
                    continue;
                }

                const sourceDir = path.dirname(filePath);
                const sourceFilename = path.basename(filePath);

                const newFilename = buildNewFilename({
                    docType, whtSubType, whtExpenseType, whtPercent, whtAmount,
                    accountCodes, originalName: originalName || path.parse(sourceFilename).name,
                    paymentCodes
                });

                const categoryFolder = getCategoryFolder(docType);
                const categoryDir = path.join(sourceDir, categoryFolder);
                const originalDir = path.join(sourceDir, 'ต้นฉบับ');

                await fs.ensureDir(categoryDir);
                await fs.ensureDir(originalDir);

                const ext = path.extname(filePath).toLowerCase();
                const newPdfPath = path.join(categoryDir, newFilename);

                // Read original file bytes first
                const fileBytes = await fs.readFile(filePath);

                if (ext === '.pdf') {
                    await fs.writeFile(newPdfPath, fileBytes);
                } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
                    const pdfDoc = await PDFDocument.create();
                    let img;
                    if (ext === '.png') {
                        img = await pdfDoc.embedPng(fileBytes);
                    } else {
                        img = await pdfDoc.embedJpg(fileBytes);
                    }
                    const pageWidth = 595.28;
                    const scale = pageWidth / img.width;
                    const pageHeight = img.height * scale;
                    const page = pdfDoc.addPage([pageWidth, pageHeight]);
                    page.drawImage(img, { x: 0, y: 0, width: pageWidth, height: pageHeight });
                    const pdfBytes = await pdfDoc.save();
                    await fs.writeFile(newPdfPath, pdfBytes);
                } else {
                    await fs.writeFile(newPdfPath, fileBytes);
                }

                // Auto-detect: only backup if not already in ต้นฉบับ
                const originalBackupPath = path.join(originalDir, sourceFilename);
                const alreadyBackedUp = await fs.pathExists(originalBackupPath);
                if (!alreadyBackedUp) {
                    await fs.writeFile(originalBackupPath, fileBytes);
                }
                await fs.remove(filePath);

                if (req.user) {
                    logActivity(req.user.id, 'batch_rename',
                        `Batch renamed: ${sourceFilename} → ${newFilename}`, filePath);
                }

                results.push({
                    originalFile: sourceFilename,
                    newFilename,
                    newPath: newPdfPath,
                    categoryFolder
                });

            } catch (fileErr) {
                errors.push({ filePath: fileData.filePath, error: fileErr.message });
            }
        }

        res.json({
            message: `เปลี่ยนชื่อสำเร็จ ${results.length}/${files.length} ไฟล์`,
            results,
            errors
        });

    } catch (err) {
        console.error('Batch rename error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเปลี่ยนชื่อไฟล์แบบชุด' });
    }
});

// ── POST /api/rename-process/backup-all — Backup files to ต้นฉบับ folder ──
router.post('/backup-all', authMiddleware, async (req, res) => {
    try {
        const { directoryPath, fileNames } = req.body;

        if (!directoryPath) return res.status(400).json({ error: 'กรุณาระบุ path โฟลเดอร์' });

        const exists = await fs.pathExists(directoryPath);
        if (!exists) return res.status(404).json({ error: 'ไม่พบโฟลเดอร์ที่ระบุ' });

        const backupDir = path.join(directoryPath, 'ต้นฉบับ');
        await fs.ensureDir(backupDir);

        // Folders to skip (system/category folders created by the app)
        const skipFolders = ['ต้นฉบับ', 'WHT', 'VAT', 'None_Vat'];

        const entries = await fs.readdir(directoryPath, { withFileTypes: true });

        // If fileNames provided, filter to only those files
        const filteredEntries = fileNames && Array.isArray(fileNames) && fileNames.length > 0
            ? entries.filter(e => fileNames.includes(e.name))
            : entries;

        let backed = 0;
        let skipped = 0;

        for (const entry of filteredEntries) {
            const srcPath = path.join(directoryPath, entry.name);
            const destPath = path.join(backupDir, entry.name);

            // Skip system folders
            if (entry.isDirectory() && skipFolders.includes(entry.name)) {
                continue;
            }

            // Skip if already backed up
            const alreadyExists = await fs.pathExists(destPath);
            if (alreadyExists) {
                skipped++;
                continue;
            }

            if (entry.isFile()) {
                const bytes = await fs.readFile(srcPath);
                await fs.writeFile(destPath, bytes);
            } else if (entry.isDirectory()) {
                await fs.copy(srcPath, destPath);
            }
            backed++;
        }

        if (req.user) {
            try {
                logActivity(req.user.id, 'backup_all',
                    `Backed up ${backed} files to ต้นฉบับ (skipped ${skipped})`, directoryPath);
            } catch (logErr) {
                console.warn('Log activity failed (non-critical):', logErr.message);
            }
        }

        res.json({
            message: `สำรองข้อมูลสำเร็จ ${backed} ไฟล์`,
            backed,
            skipped,
            total: filteredEntries.length
        });

    } catch (err) {
        console.error('Backup all error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสำรองข้อมูล' });
    }
});

// ── POST /api/rename-process/consolidate — Merge category files from subfolders ──
router.post('/consolidate', authMiddleware, async (req, res) => {
    try {
        const { directoryPath, recursive = false } = req.body;
        const CATEGORIES = ['WHT', 'VAT', 'None_Vat'];

        if (!directoryPath) return res.status(400).json({ error: 'กรุณาระบุ path โฟลเดอร์' });

        const exists = await fs.pathExists(directoryPath);
        if (!exists) return res.status(404).json({ error: 'ไม่พบโฟลเดอร์ที่ระบุ' });

        // Ensure top-level category folders exist
        for (const cat of CATEGORIES) {
            await fs.ensureDir(path.join(directoryPath, cat));
        }

        // Collect all subdirectory category folders
        async function findCategoryFolders(dir, depth) {
            const results = [];
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                if (CATEGORIES.includes(entry.name)) continue; // skip top-level category folders
                if (entry.name === 'ต้นฉบับ') continue;

                const subDir = path.join(dir, entry.name);

                // Check if this subfolder has category folders inside
                for (const cat of CATEGORIES) {
                    const catPath = path.join(subDir, cat);
                    const catExists = await fs.pathExists(catPath);
                    if (catExists) {
                        results.push({ category: cat, sourcePath: catPath, parentName: entry.name });
                    }
                }

                // Recurse if needed
                if (recursive && depth < 10) {
                    const deeper = await findCategoryFolders(subDir, depth + 1);
                    results.push(...deeper);
                }
            }
            return results;
        }

        const categoryFolders = await findCategoryFolders(directoryPath, 0);

        let moved = 0;
        let skipped = 0;
        const details = [];

        for (const { category, sourcePath, parentName } of categoryFolders) {
            const destDir = path.join(directoryPath, category);
            const files = await fs.readdir(sourcePath, { withFileTypes: true });

            for (const file of files) {
                if (!file.isFile()) continue;

                const srcFile = path.join(sourcePath, file.name);
                let destFile = path.join(destDir, file.name);

                // Handle duplicate names by prefixing parent folder name
                if (await fs.pathExists(destFile)) {
                    const ext = path.extname(file.name);
                    const base = path.basename(file.name, ext);
                    destFile = path.join(destDir, `${base} (${parentName})${ext}`);

                    // If still exists, skip
                    if (await fs.pathExists(destFile)) {
                        skipped++;
                        continue;
                    }
                }

                const bytes = await fs.readFile(srcFile);
                await fs.writeFile(destFile, bytes);
                await fs.remove(srcFile);
                moved++;
            }

            // Clean up empty source folder
            const remaining = await fs.readdir(sourcePath);
            if (remaining.length === 0) {
                await fs.remove(sourcePath);
            }

            details.push({ parentName, category, filesMoved: files.filter(f => f.isFile()).length });
        }

        try {
            if (req.user) {
                logActivity(req.user.id, 'consolidate',
                    `Consolidated ${moved} files into ${CATEGORIES.join('/')} (skipped ${skipped})`, directoryPath);
            }
        } catch (logErr) {
            console.warn('Log activity failed (non-critical):', logErr.message);
        }

        res.json({
            message: `รวมเอกสารสำเร็จ ${moved} ไฟล์`,
            moved,
            skipped,
            foldersScanned: categoryFolders.length,
            details
        });

    } catch (err) {
        console.error('Consolidate error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการรวมเอกสาร' });
    }
});

module.exports = router;
