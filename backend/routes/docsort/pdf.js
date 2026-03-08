const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const { PDFDocument } = require('pdf-lib');
const multer = require('multer');
const authMiddleware = require('../../middleware/auth');
const { logActivity } = require('../../database');

const router = express.Router();

const upload = multer({
    dest: path.join(__dirname, '..', '..', 'uploads'),
    limits: { fileSize: 300 * 1024 * 1024 }
});

// GET /api/pdf/info
router.get('/info', authMiddleware, async (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'กรุณาระบุ path ไฟล์' });

        const exists = await fs.pathExists(filePath);
        if (!exists) return res.status(404).json({ error: 'ไม่พบไฟล์' });

        const stat = await fs.stat(filePath);
        const fileBuffer = await fs.readFile(filePath);
        let pageCount = 0;
        let isEncrypted = false;

        try {
            const pdfDoc = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
            pageCount = pdfDoc.getPageCount();
        } catch (e) {
            if (e.message && e.message.includes('encrypted')) isEncrypted = true;
        }

        res.json({
            name: path.basename(filePath),
            path: filePath,
            size: stat.size,
            pageCount,
            isEncrypted,
            modified: stat.mtime
        });
    } catch (err) {
        console.error('PDF info error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอ่านข้อมูล PDF' });
    }
});

// POST /api/pdf/split
router.post('/split', authMiddleware, async (req, res) => {
    try {
        const { filePath, pages, outputDir, filenamePattern, splitMode, chunkSize } = req.body;
        if (!filePath || !outputDir) {
            return res.status(400).json({ error: 'กรุณาระบุ path ไฟล์และโฟลเดอร์ผลลัพธ์' });
        }

        const exists = await fs.pathExists(filePath);
        if (!exists) return res.status(404).json({ error: 'ไม่พบไฟล์ต้นทาง' });

        await fs.ensureDir(outputDir);
        const fileBuffer = await fs.readFile(filePath);
        const sourcePdf = await PDFDocument.load(fileBuffer);
        const totalPages = sourcePdf.getPageCount();
        const baseName = path.basename(filePath, '.pdf');
        const pattern = filenamePattern || baseName + '_page{page}';
        const outputFiles = [];
        const mode = splitMode || 'selected';

        if (mode === 'all') {
            // ── แยกทุกหน้า ──
            for (let i = 1; i <= totalPages; i++) {
                const newPdf = await PDFDocument.create();
                const [copiedPage] = await newPdf.copyPages(sourcePdf, [i - 1]);
                newPdf.addPage(copiedPage);
                const outputName = pattern.replace('{page}', i) + '.pdf';
                const outputPath = path.join(outputDir, outputName);
                await fs.writeFile(outputPath, await newPdf.save());
                outputFiles.push({ name: outputName, path: outputPath, page: i });
            }
        } else if (mode === 'chunks') {
            // ── แยกเป็นชุด (กำหนดเอง) ──
            const { chunks } = req.body;
            if (!Array.isArray(chunks) || chunks.length === 0) {
                return res.status(400).json({ error: 'กรุณากำหนดชุดอย่างน้อย 1 ชุด' });
            }
            for (let ci = 0; ci < chunks.length; ci++) {
                const chunkPages = parsePageRange(chunks[ci], totalPages);
                if (chunkPages.length === 0) continue;
                const newPdf = await PDFDocument.create();
                const pageIndices = chunkPages.filter(p => p >= 1 && p <= totalPages).map(p => p - 1);
                const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
                copiedPages.forEach(p => newPdf.addPage(p));
                const outputName = `${baseName}_ชุดที่${ci + 1}.pdf`;
                const outputPath = path.join(outputDir, outputName);
                await fs.writeFile(outputPath, await newPdf.save());
                outputFiles.push({ name: outputName, path: outputPath, pages: pageIndices.map(p => p + 1) });
            }
        } else {
            // ── selected / range ──
            if (!pages) return res.status(400).json({ error: 'กรุณาระบุหน้าที่จะแยก' });
            const pageNumbers = Array.isArray(pages) ? pages : parsePageRange(pages, totalPages);

            for (const pageNum of pageNumbers) {
                if (pageNum < 1 || pageNum > totalPages) continue;
                const newPdf = await PDFDocument.create();
                const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageNum - 1]);
                newPdf.addPage(copiedPage);
                const outputName = pattern.replace('{page}', pageNum) + '.pdf';
                const outputPath = path.join(outputDir, outputName);
                await fs.writeFile(outputPath, await newPdf.save());
                outputFiles.push({ name: outputName, path: outputPath, page: pageNum });
            }
        }

        logActivity(req.user.id, 'split', `${path.basename(filePath)} → ${outputFiles.length} files (${mode})`, filePath);
        res.json({ message: `แยกไฟล์สำเร็จ ${outputFiles.length} ไฟล์`, sourceFile: path.basename(filePath), outputFiles, mode });
    } catch (err) {
        console.error('Split error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแยก PDF' });
    }
});

// POST /api/pdf/unlock
router.post('/unlock', authMiddleware, async (req, res) => {
    try {
        const { filePath, password, outputDir } = req.body;
        if (!filePath || !password) return res.status(400).json({ error: 'กรุณาระบุ path ไฟล์และรหัสผ่าน' });

        const exists = await fs.pathExists(filePath);
        if (!exists) return res.status(404).json({ error: 'ไม่พบไฟล์' });

        const fileBuffer = await fs.readFile(filePath);
        try {
            const pdfDoc = await PDFDocument.load(fileBuffer, { password });
            const pdfBytes = await pdfDoc.save();
            const baseName = path.basename(filePath, '.pdf');
            const destDir = outputDir || path.dirname(filePath);
            await fs.ensureDir(destDir);
            const outputPath = path.join(destDir, `${baseName}_unlocked.pdf`);
            await fs.writeFile(outputPath, pdfBytes);
            logActivity(req.user.id, 'unlock', path.basename(filePath), outputPath);
            res.json({ message: 'ปลดล็อคสำเร็จ', outputPath, outputName: path.basename(outputPath) });
        } catch (e) {
            if (e.message && e.message.includes('password')) {
                return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
            }
            throw e;
        }
    } catch (err) {
        console.error('Unlock error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการปลดล็อค PDF' });
    }
});

// POST /api/pdf/merge — Merge multiple PDF files into one
router.post('/merge', authMiddleware, async (req, res) => {
    try {
        const { filePaths, outputDir, outputName } = req.body;
        if (!filePaths || !Array.isArray(filePaths) || filePaths.length < 2) {
            return res.status(400).json({ error: 'กรุณาเลือกไฟล์ PDF อย่างน้อย 2 ไฟล์' });
        }

        const mergedPdf = await PDFDocument.create();
        for (const fp of filePaths) {
            const exists = await fs.pathExists(fp);
            if (!exists) return res.status(404).json({ error: `ไม่พบไฟล์: ${path.basename(fp)}` });
            const fileBuffer = await fs.readFile(fp);
            const srcPdf = await PDFDocument.load(fileBuffer, { ignoreEncryption: true });
            const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
            copiedPages.forEach(p => mergedPdf.addPage(p));
        }

        const destDir = outputDir || path.dirname(filePaths[0]);
        await fs.ensureDir(destDir);
        const finalName = (outputName || 'merged') + '.pdf';
        const outputPath = path.join(destDir, finalName);
        await fs.writeFile(outputPath, await mergedPdf.save());

        logActivity(req.user.id, 'pdf-merge', `${filePaths.length} files → ${finalName}`, outputPath);
        res.json({
            message: `รวมไฟล์สำเร็จ ${filePaths.length} ไฟล์ → ${finalName}`,
            outputPath,
            outputName: finalName,
            totalPages: mergedPdf.getPageCount()
        });
    } catch (err) {
        console.error('PDF merge error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการรวม PDF: ' + (err.message || '') });
    }
});

// POST /api/pdf/to-image — Convert PDF pages to JPG/PNG images
// Uses pdfjs-dist v3.x to render PDF pages onto node-canvas, then sharp for final output
router.post('/to-image', authMiddleware, async (req, res) => {
    try {
        const { filePath, outputDir, outputFormat = 'jpg', quality = 90, dpi = 150, outputBaseName } = req.body;
        if (!filePath) return res.status(400).json({ error: 'กรุณาระบุ path ไฟล์' });

        const exists = await fs.pathExists(filePath);
        if (!exists) return res.status(404).json({ error: 'ไม่พบไฟล์' });

        const sharp = (await import('sharp')).default;
        const { createCanvas } = require('canvas');
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

        const fileBuffer = await fs.readFile(filePath);
        const uint8Array = new Uint8Array(fileBuffer);
        const pdfDocument = await pdfjsLib.getDocument({ data: uint8Array, verbosity: 0 }).promise;
        const totalPages = pdfDocument.numPages;
        const baseName = outputBaseName || path.basename(filePath, '.pdf');
        const destDir = outputDir || path.dirname(filePath);
        await fs.ensureDir(destDir);

        const outputFiles = [];
        const scale = dpi / 72; // PDF default is 72 DPI

        // NodeCanvasFactory — required by pdfjs-dist for rendering images in PDFs
        class NodeCanvasFactory {
            create(width, height) {
                const c = createCanvas(width, height);
                return { canvas: c, context: c.getContext('2d') };
            }
            reset(canvasAndContext, width, height) {
                canvasAndContext.canvas.width = width;
                canvasAndContext.canvas.height = height;
            }
            destroy(canvasAndContext) {
                canvasAndContext.canvas.width = 0;
                canvasAndContext.canvas.height = 0;
                canvasAndContext.canvas = null;
                canvasAndContext.context = null;
            }
        }
        const canvasFactory = new NodeCanvasFactory();

        for (let i = 1; i <= totalPages; i++) {
            const page = await pdfDocument.getPage(i);
            const viewport = page.getViewport({ scale });

            // Create a canvas and render the PDF page onto it
            const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
            const context = canvas.getContext('2d');

            // pdfjs-dist render with canvasFactory for Node.js
            await page.render({
                canvasContext: context,
                viewport: viewport,
                canvasFactory: canvasFactory,
            }).promise;

            // Get raw RGBA pixel data from canvas
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const rawPixels = Buffer.from(imageData.data.buffer);

            // Use sharp to convert raw RGBA pixels to JPG/PNG
            const ext = outputFormat.toLowerCase() === 'png' ? '.png' : '.jpg';
            const outputName = `${baseName}_page${i}${ext}`;
            const outputPath = path.join(destDir, outputName);

            let sharpPipeline = sharp(rawPixels, {
                raw: {
                    width: canvas.width,
                    height: canvas.height,
                    channels: 4
                }
            });

            if (outputFormat.toLowerCase() === 'png') {
                sharpPipeline = sharpPipeline.png();
            } else {
                sharpPipeline = sharpPipeline.jpeg({ quality });
            }

            await sharpPipeline.toFile(outputPath);
            outputFiles.push({ name: outputName, path: outputPath, page: i });

            // Cleanup
            page.cleanup();
        }

        logActivity(req.user.id, 'pdf-to-image', `${path.basename(filePath)} → ${outputFiles.length} ${outputFormat.toUpperCase()} files`, destDir);
        res.json({
            message: `แปลงสำเร็จ ${outputFiles.length} หน้า เป็น ${outputFormat.toUpperCase()}`,
            outputFiles,
            totalPages
        });
    } catch (err) {
        console.error('PDF to image error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแปลง PDF เป็นรูปภาพ: ' + (err.message || '') });
    }
});


function parsePageRange(rangeStr, totalPages) {
    const pages = [];
    const parts = String(rangeStr).split(',').map(s => s.trim());
    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number);
            for (let i = start; i <= Math.min(end, totalPages); i++) {
                if (i >= 1) pages.push(i);
            }
        } else {
            const num = Number(part);
            if (num >= 1 && num <= totalPages) pages.push(num);
        }
    }
    return [...new Set(pages)].sort((a, b) => a - b);
}

module.exports = router;
