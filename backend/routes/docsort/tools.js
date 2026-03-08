const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const authMiddleware = require('../../middleware/auth');
const { logActivity } = require('../../database');

const router = express.Router();

// POST /api/tools/heic-convert — Convert HEIC/HEIF to JPG/PNG
router.post('/heic-convert', authMiddleware, async (req, res) => {
    try {
        const { filePath, outputDir, outputFormat = 'jpg', quality = 90 } = req.body;
        if (!filePath) return res.status(400).json({ error: 'กรุณาระบุ path ไฟล์' });

        const exists = await fs.pathExists(filePath);
        if (!exists) return res.status(404).json({ error: 'ไม่พบไฟล์' });

        const ext = path.extname(filePath).toLowerCase();
        if (!['.heic', '.heif'].includes(ext)) {
            return res.status(400).json({ error: 'ไฟล์ต้องเป็น .heic หรือ .heif เท่านั้น' });
        }

        // Dynamic import for ESM-only modules
        const heicConvert = (await import('heic-convert')).default;
        const sharp = (await import('sharp')).default;

        const inputBuffer = await fs.readFile(filePath);
        const convertedBuffer = await heicConvert({
            buffer: new Uint8Array(inputBuffer),
            format: outputFormat.toUpperCase() === 'PNG' ? 'PNG' : 'JPEG',
            quality: quality / 100,
        });

        // Use sharp to optimize and ensure proper output
        let sharpPipeline = sharp(Buffer.from(convertedBuffer));
        if (outputFormat.toUpperCase() === 'PNG') {
            sharpPipeline = sharpPipeline.png({ quality });
        } else {
            sharpPipeline = sharpPipeline.jpeg({ quality });
        }
        const finalBuffer = await sharpPipeline.toBuffer();

        const destDir = outputDir || path.dirname(filePath);
        await fs.ensureDir(destDir);
        const baseName = path.basename(filePath, ext);
        const outputExt = outputFormat.toLowerCase() === 'png' ? '.png' : '.jpg';
        const outputPath = path.join(destDir, `${baseName}${outputExt}`);
        await fs.writeFile(outputPath, finalBuffer);

        logActivity(req.user.id, 'heic-convert', `${path.basename(filePath)} → ${baseName}${outputExt}`, outputPath);
        res.json({
            message: `แปลงไฟล์สำเร็จ: ${baseName}${outputExt}`,
            outputPath,
            outputName: `${baseName}${outputExt}`,
        });
    } catch (err) {
        console.error('HEIC convert error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแปลงไฟล์ HEIC: ' + (err.message || '') });
    }
});

// POST /api/tools/heic-convert-batch — Convert multiple HEIC files
router.post('/heic-convert-batch', authMiddleware, async (req, res) => {
    try {
        const { filePaths, outputDir, outputFormat = 'jpg', quality = 90 } = req.body;
        if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
            return res.status(400).json({ error: 'กรุณาระบุรายการไฟล์' });
        }

        const heicConvert = (await import('heic-convert')).default;
        const sharp = (await import('sharp')).default;

        const results = [];
        const errors = [];

        for (const filePath of filePaths) {
            try {
                const exists = await fs.pathExists(filePath);
                if (!exists) { errors.push({ file: path.basename(filePath), error: 'ไม่พบไฟล์' }); continue; }

                const ext = path.extname(filePath).toLowerCase();
                if (!['.heic', '.heif'].includes(ext)) { errors.push({ file: path.basename(filePath), error: 'ไม่ใช่ไฟล์ HEIC' }); continue; }

                const inputBuffer = await fs.readFile(filePath);
                const convertedBuffer = await heicConvert({
                    buffer: new Uint8Array(inputBuffer),
                    format: outputFormat.toUpperCase() === 'PNG' ? 'PNG' : 'JPEG',
                    quality: quality / 100,
                });

                let sharpPipeline = sharp(Buffer.from(convertedBuffer));
                if (outputFormat.toUpperCase() === 'PNG') {
                    sharpPipeline = sharpPipeline.png({ quality });
                } else {
                    sharpPipeline = sharpPipeline.jpeg({ quality });
                }
                const finalBuffer = await sharpPipeline.toBuffer();

                const destDir = outputDir || path.dirname(filePath);
                await fs.ensureDir(destDir);
                const baseName = path.basename(filePath, ext);
                const outputExt = outputFormat.toLowerCase() === 'png' ? '.png' : '.jpg';
                const outputPath = path.join(destDir, `${baseName}${outputExt}`);
                await fs.writeFile(outputPath, finalBuffer);

                results.push({ file: path.basename(filePath), outputName: `${baseName}${outputExt}` });
            } catch (e) {
                errors.push({ file: path.basename(filePath), error: e.message });
            }
        }

        logActivity(req.user.id, 'heic-convert-batch', `${results.length} files converted`, outputDir || '');
        res.json({
            message: `แปลงสำเร็จ ${results.length} ไฟล์${errors.length > 0 ? `, ผิดพลาด ${errors.length} ไฟล์` : ''}`,
            results,
            errors,
        });
    } catch (err) {
        console.error('HEIC batch error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแปลงไฟล์: ' + (err.message || '') });
    }
});

// POST /api/tools/extract-archive — Extract RAR/ZIP/7z archive
router.post('/extract-archive', authMiddleware, async (req, res) => {
    try {
        const { filePath, outputDir } = req.body;
        if (!filePath) return res.status(400).json({ error: 'กรุณาระบุ path ไฟล์' });

        const exists = await fs.pathExists(filePath);
        if (!exists) return res.status(404).json({ error: 'ไม่พบไฟล์' });

        const ext = path.extname(filePath).toLowerCase();
        if (!['.rar', '.zip', '.7z'].includes(ext)) {
            return res.status(400).json({ error: 'รองรับเฉพาะไฟล์ .rar, .zip, .7z' });
        }

        const baseName = path.basename(filePath, ext);
        // Always create a subfolder named after the archive file
        const parentDir = outputDir || path.dirname(filePath);
        const destDir = path.join(parentDir, baseName);
        await fs.ensureDir(destDir);

        let extractedFiles = [];

        if (ext === '.rar') {
            const { createExtractorFromFile } = require('node-unrar-js');
            const extractor = await createExtractorFromFile({ filepath: filePath, targetPath: destDir });
            const extracted = extractor.extract();
            const files = [...extracted.files];
            extractedFiles = files
                .filter(f => f.fileHeader && !f.fileHeader.flags.directory)
                .map(f => f.fileHeader.name);
        } else if (ext === '.zip') {
            // Use built-in Node.js approach with AdmZip or extract-zip
            // Since we have node-unrar-js, let's use a simple approach with yauzl or adm-zip
            // For simplicity, use child_process with PowerShell on Windows
            const { execSync } = require('child_process');
            execSync(`powershell -Command "Expand-Archive -Path '${filePath}' -DestinationPath '${destDir}' -Force"`, { timeout: 120000 });
            // List extracted files
            const walk = async (dir) => {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                let results = [];
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        results = results.concat(await walk(fullPath));
                    } else {
                        results.push(path.relative(destDir, fullPath));
                    }
                }
                return results;
            };
            extractedFiles = await walk(destDir);
        } else {
            return res.status(400).json({ error: 'ยังไม่รองรับไฟล์ .7z ในตอนนี้' });
        }

        logActivity(req.user.id, 'extract-archive', `${path.basename(filePath)} → ${extractedFiles.length} files`, destDir);
        res.json({
            message: `แตกไฟล์สำเร็จ ${extractedFiles.length} ไฟล์`,
            outputDir: destDir,
            files: extractedFiles,
        });
    } catch (err) {
        console.error('Extract archive error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแตกไฟล์: ' + (err.message || '') });
    }
});

// POST /api/tools/create-zip — Create a ZIP archive from multiple files
router.post('/create-zip', authMiddleware, async (req, res) => {
    try {
        const { filePaths, outputDir, outputName } = req.body;
        if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
            return res.status(400).json({ error: 'กรุณาเลือกไฟล์อย่างน้อย 1 ไฟล์' });
        }

        // Verify all files exist
        for (const fp of filePaths) {
            const exists = await fs.pathExists(fp);
            if (!exists) return res.status(404).json({ error: `ไม่พบไฟล์: ${path.basename(fp)}` });
        }

        const archiver = require('archiver');
        const destDir = outputDir || path.dirname(filePaths[0]);
        await fs.ensureDir(destDir);
        const zipName = (outputName || 'archive') + '.zip';
        const zipPath = path.join(destDir, zipName);

        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        await new Promise((resolve, reject) => {
            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);

            for (const fp of filePaths) {
                archive.file(fp, { name: path.basename(fp) });
            }

            archive.finalize();
        });

        const stat = await fs.stat(zipPath);
        logActivity(req.user.id, 'create-zip', `${filePaths.length} files → ${zipName}`, zipPath);
        res.json({
            message: `สร้างไฟล์ ZIP สำเร็จ: ${zipName} (${filePaths.length} ไฟล์)`,
            outputPath: zipPath,
            outputName: zipName,
            fileCount: filePaths.length,
            zipSize: stat.size
        });
    } catch (err) {
        console.error('Create ZIP error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้าง ZIP: ' + (err.message || '') });
    }
});

// POST /api/tools/unlock-excel — Unlock password-protected Excel file
router.post('/unlock-excel', authMiddleware, async (req, res) => {
    try {
        const { filePath, password, outputDir } = req.body;
        if (!filePath || !password) {
            return res.status(400).json({ error: 'กรุณาระบุ path ไฟล์และรหัสผ่าน' });
        }

        const exists = await fs.pathExists(filePath);
        if (!exists) return res.status(404).json({ error: 'ไม่พบไฟล์' });

        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.xlsx') {
            return res.status(400).json({ error: 'รองรับเฉพาะไฟล์ .xlsx เท่านั้น' });
        }

        const XlsxPopulate = require('xlsx-populate');
        try {
            // Read file as buffer first to avoid Unicode path issues in xlsx-populate
            const fileBuffer = await fs.readFile(filePath);
            const workbook = await XlsxPopulate.fromDataAsync(fileBuffer, { password });

            // Remove sheet protection from all sheets
            workbook.sheets().forEach(sheet => {
                // Access sheet protection if available
                try {
                    if (sheet._sheetProtectionNode) {
                        sheet._node.children = sheet._node.children.filter(
                            c => c.name !== 'sheetProtection'
                        );
                    }
                } catch (e) { /* sheet might not have protection */ }
            });

            const destDir = outputDir || path.dirname(filePath);
            await fs.ensureDir(destDir);
            const baseName = path.basename(filePath, ext);
            const outputPath = path.join(destDir, `${baseName}_unlocked.xlsx`);

            // Save to buffer then write via fs to avoid disk I/O error with Unicode paths
            const outputBuffer = await workbook.outputAsync();
            await fs.writeFile(outputPath, outputBuffer);

            logActivity(req.user.id, 'unlock-excel', path.basename(filePath), outputPath);
            res.json({
                message: `ปลดล็อคสำเร็จ: ${baseName}_unlocked.xlsx`,
                outputPath,
                outputName: `${baseName}_unlocked.xlsx`
            });
        } catch (e) {
            if (e.message && (e.message.includes('password') || e.message.includes('encrypt') || e.message.includes('CFB'))) {
                return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
            }
            throw e;
        }
    } catch (err) {
        console.error('Unlock Excel error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการปลดล็อค Excel: ' + (err.message || '') });
    }
});

// GET /api/tools/serve-file — Serve a file for preview (accepts token via query for img/iframe)
router.get('/serve-file', async (req, res) => {
    try {
        // Accept token from query or header (Bypassed)
        const token = req.query.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
        // Bypassing JWT check to allow previews without login
        // if (!token) return res.status(401).json({ error: 'Unauthorized' });
        // const jwt = require('jsonwebtoken');
        // try {
        //     jwt.verify(token, process.env.JWT_SECRET || 'bmu-secret-key-2024');
        // } catch { return res.status(401).json({ error: 'Invalid token' }); }

        const filePath = req.query.filePath;
        if (!filePath) return res.status(400).json({ error: 'กรุณาระบุ path ไฟล์' });

        const exists = await fs.pathExists(filePath);
        if (!exists) return res.status(404).json({ error: 'ไม่พบไฟล์' });

        const ext = path.extname(filePath).toLowerCase();
        const mimeMap = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
            '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
            '.pdf': 'application/pdf', '.txt': 'text/plain',
        };
        const contentType = mimeMap[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(filePath))}"`);
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    } catch (err) {
        console.error('Serve file error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาด: ' + (err.message || '') });
    }
});

// POST /api/tools/image-to-pdf — Convert multiple images to a single PDF
router.post('/image-to-pdf', authMiddleware, async (req, res) => {
    try {
        const { filePaths, outputDir, outputName = 'images', pageSize = 'A4' } = req.body;
        if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
            return res.status(400).json({ error: 'กรุณาเลือกไฟล์รูปภาพอย่างน้อย 1 ไฟล์' });
        }

        const sharp = (await import('sharp')).default;
        const { PDFDocument } = require('pdf-lib');

        // กำหนดขนาดหน้า (หน่วย: points, 1 inch = 72 points)
        const PAGE_SIZES = {
            'A4': { width: 595.28, height: 841.89 },
            'Letter': { width: 612, height: 792 },
        };

        const SUPPORTED_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];

        const pdfDoc = await PDFDocument.create();
        const errors = [];
        let successCount = 0;

        for (const filePath of filePaths) {
            try {
                const exists = await fs.pathExists(filePath);
                if (!exists) { errors.push({ file: path.basename(filePath), error: 'ไม่พบไฟล์' }); continue; }

                const ext = path.extname(filePath).toLowerCase();
                if (!SUPPORTED_EXT.includes(ext)) {
                    errors.push({ file: path.basename(filePath), error: 'ไม่รองรับนามสกุลนี้' });
                    continue;
                }

                // ใช้ sharp แปลงทุกฟอร์แมตเป็น PNG buffer (รองรับ transparency)
                const metadata = await sharp(filePath).metadata();
                const imgWidth = metadata.width;
                const imgHeight = metadata.height;

                // แปลงเป็น PNG เพื่อให้ pdf-lib embed ได้
                const pngBuffer = await sharp(filePath).png().toBuffer();

                // กำหนดขนาดหน้า — Original ใช้ขนาดจริงของรูป, อื่นๆ ใช้ขนาดมาตรฐาน
                let pgWidth, pgHeight;
                if (pageSize === 'Original') {
                    // แปลง pixel → points (สมมุติ 96 DPI)
                    pgWidth = imgWidth * 72 / 96;
                    pgHeight = imgHeight * 72 / 96;
                } else {
                    const sz = PAGE_SIZES[pageSize] || PAGE_SIZES['A4'];
                    pgWidth = sz.width;
                    pgHeight = sz.height;
                }

                const page = pdfDoc.addPage([pgWidth, pgHeight]);
                const pngImage = await pdfDoc.embedPng(pngBuffer);

                // คำนวณ fit-to-page (ยังคงสัดส่วน)
                const margin = pageSize === 'Original' ? 0 : 20;
                const availW = pgWidth - margin * 2;
                const availH = pgHeight - margin * 2;
                const scale = Math.min(availW / pngImage.width, availH / pngImage.height, 1);
                const drawW = pngImage.width * scale;
                const drawH = pngImage.height * scale;
                const x = (pgWidth - drawW) / 2;
                const y = (pgHeight - drawH) / 2;

                page.drawImage(pngImage, { x, y, width: drawW, height: drawH });
                successCount++;
            } catch (e) {
                errors.push({ file: path.basename(filePath), error: e.message });
            }
        }

        if (successCount === 0) {
            return res.status(400).json({ error: 'ไม่สามารถแปลงรูปภาพได้เลย', errors });
        }

        const pdfBytes = await pdfDoc.save();
        const destDir = outputDir || path.dirname(filePaths[0]);
        await fs.ensureDir(destDir);
        const pdfName = `${outputName}.pdf`;
        const outputPath = path.join(destDir, pdfName);
        await fs.writeFile(outputPath, pdfBytes);

        const stat = await fs.stat(outputPath);
        logActivity(req.user.id, 'image-to-pdf', `${successCount} images → ${pdfName}`, outputPath);
        res.json({
            message: `สร้าง PDF สำเร็จ: ${pdfName} (${successCount} รูป, ${(stat.size / 1024).toFixed(0)} KB)`,
            outputPath,
            outputName: pdfName,
            pageCount: successCount,
            fileSize: stat.size,
            errors,
        });
    } catch (err) {
        console.error('Image to PDF error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแปลงรูปเป็น PDF: ' + (err.message || '') });
    }
});

module.exports = router;
