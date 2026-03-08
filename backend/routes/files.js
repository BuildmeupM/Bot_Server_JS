const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const authMiddleware = require('../middleware/auth');
const { logActivity } = require('../database');

const router = express.Router();

// ── MIME & file-type helpers ──────────────────────────────────
const MIME_MAP = {
    // Images
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.tiff': 'image/tiff', '.tif': 'image/tiff',
    // Video
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
    // Audio
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.aac': 'audio/aac',
    // PDF
    '.pdf': 'application/pdf',
    // Text / Code
    '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json',
    '.xml': 'text/xml', '.log': 'text/plain', '.md': 'text/plain',
    '.js': 'text/plain', '.ts': 'text/plain', '.py': 'text/plain',
    '.html': 'text/html', '.css': 'text/css', '.sql': 'text/plain',
    '.yml': 'text/plain', '.yaml': 'text/plain', '.env': 'text/plain',
    '.ini': 'text/plain', '.cfg': 'text/plain', '.conf': 'text/plain',
    // Office
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Archive
    '.zip': 'application/zip', '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed', '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
};

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.tiff', '.tif'];
const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
const AUDIO_EXTS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];
const TEXT_EXTS = ['.txt', '.csv', '.json', '.xml', '.log', '.md', '.js', '.ts', '.py', '.html', '.css', '.sql', '.yml', '.yaml', '.env', '.ini', '.cfg', '.conf'];
const OFFICE_EXTS = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];

function getFileType(filename) {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.pdf') return 'pdf';
    if (IMAGE_EXTS.includes(ext)) return 'image';
    if (VIDEO_EXTS.includes(ext)) return 'video';
    if (AUDIO_EXTS.includes(ext)) return 'audio';
    if (TEXT_EXTS.includes(ext)) return 'text';
    if (OFFICE_EXTS.includes(ext)) return 'office';
    return 'other';
}

function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    return MIME_MAP[ext] || 'application/octet-stream';
}

// POST /api/files/browse — list files/folders in a directory
router.post('/browse', authMiddleware, async (req, res) => {
    try {
        const { dirPath } = req.body;
        if (!dirPath) {
            return res.status(400).json({ error: 'กรุณาระบุ path โฟลเดอร์' });
        }

        const exists = await fs.pathExists(dirPath);
        if (!exists) {
            return res.status(404).json({ error: 'ไม่พบโฟลเดอร์ที่ระบุ' });
        }

        const stat = await fs.stat(dirPath);
        if (!stat.isDirectory()) {
            return res.status(400).json({ error: 'path ที่ระบุไม่ใช่โฟลเดอร์' });
        }

        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const items = [];

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            try {
                const entryStat = await fs.stat(fullPath);
                const item = {
                    name: entry.name,
                    path: fullPath,
                    isDirectory: entry.isDirectory(),
                    size: entryStat.size,
                    modified: entryStat.mtime,
                };
                if (!entry.isDirectory()) {
                    const ft = getFileType(entry.name);
                    item.fileType = ft;
                    item.isPdf = (ft === 'pdf');
                }
                items.push(item);
            } catch (e) {
                // skip inaccessible files
            }
        }

        items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });

        res.json({ currentPath: dirPath, parentPath: path.dirname(dirPath), items });
    } catch (err) {
        console.error('Browse error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอ่านโฟลเดอร์' });
    }
});

// GET /api/files/preview — serve any file for preview with correct MIME type
router.get('/preview', authMiddleware, async (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'กรุณาระบุ path ไฟล์' });

        const exists = await fs.pathExists(filePath);
        if (!exists) return res.status(404).json({ error: 'ไม่พบไฟล์' });

        const stat = await fs.stat(filePath);
        const mime = getMimeType(filePath);
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(filePath))}"`);
        fs.createReadStream(filePath).pipe(res);
    } catch (err) {
        console.error('Preview error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอ่านไฟล์' });
    }
});

// PUT /api/files/rename
router.put('/rename', authMiddleware, async (req, res) => {
    try {
        const { filePath, newName } = req.body;
        if (!filePath || !newName) return res.status(400).json({ error: 'กรุณาระบุ path และชื่อใหม่' });

        const exists = await fs.pathExists(filePath);
        if (!exists) return res.status(404).json({ error: 'ไม่พบไฟล์' });

        const dir = path.dirname(filePath);
        const newPath = path.join(dir, newName);
        if (await fs.pathExists(newPath)) return res.status(409).json({ error: 'ไฟล์ชื่อนี้มีอยู่แล้ว' });

        await fs.rename(filePath, newPath);
        logActivity(req.user.id, 'rename', `${path.basename(filePath)} → ${newName}`, newPath);
        res.json({ message: 'เปลี่ยนชื่อสำเร็จ', oldPath: filePath, newPath, newName });
    } catch (err) {
        console.error('Rename error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเปลี่ยนชื่อ' });
    }
});

// PUT /api/files/move
router.put('/move', authMiddleware, async (req, res) => {
    try {
        const { filePath, destDir } = req.body;
        if (!filePath || !destDir) return res.status(400).json({ error: 'กรุณาระบุ path ต้นทางและปลายทาง' });

        const fileExists = await fs.pathExists(filePath);
        if (!fileExists) return res.status(404).json({ error: 'ไม่พบไฟล์ต้นทาง' });

        await fs.ensureDir(destDir);
        const fileName = path.basename(filePath);
        const destPath = path.join(destDir, fileName);
        if (await fs.pathExists(destPath)) return res.status(409).json({ error: 'ไฟล์ชื่อนี้มีอยู่ในโฟลเดอร์ปลายทางแล้ว' });

        await fs.move(filePath, destPath);
        logActivity(req.user.id, 'move', `${fileName} → ${destDir}`, destPath);
        res.json({ message: 'ย้ายไฟล์สำเร็จ', oldPath: filePath, newPath: destPath });
    } catch (err) {
        console.error('Move error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการย้ายไฟล์' });
    }
});

// DELETE /api/files/delete
router.delete('/delete', authMiddleware, async (req, res) => {
    try {
        const { filePath } = req.body;
        if (!filePath) return res.status(400).json({ error: 'กรุณาระบุ path ไฟล์' });

        const exists = await fs.pathExists(filePath);
        if (!exists) return res.status(404).json({ error: 'ไม่พบไฟล์' });

        const fileName = path.basename(filePath);
        await fs.remove(filePath);
        logActivity(req.user.id, 'delete', fileName, filePath);
        res.json({ message: 'ลบไฟล์สำเร็จ', filePath });
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบไฟล์' });
    }
});

// GET /api/files/drives — list available drives (Windows)
router.get('/drives', authMiddleware, async (req, res) => {
    try {
        const drives = [];
        for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
            const drivePath = `${letter}:\\`;
            try {
                await fs.access(drivePath);
                drives.push({ name: `${letter}:`, path: drivePath });
            } catch (e) { }
        }
        res.json({ drives });
    } catch (err) {
        res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
});

module.exports = router;
