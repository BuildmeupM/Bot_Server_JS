/**
 * OCR Image Pre-processing Module
 * ใช้ sharp สำหรับปรับปรุงคุณภาพภาพก่อนส่ง OCR
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * ปรับปรุงภาพให้เหมาะสมกับ OCR
 * - Grayscale: แปลงขาวดำ
 * - Sharpen: เพิ่มความคมชัด
 * - Normalize: ปรับ contrast อัตโนมัติ
 * - Resize: ขยายภาพเล็กเกินไป
 * 
 * @param {Buffer} inputBuffer - ไฟล์ภาพ (JPG/PNG/WEBP)
 * @param {object} options - ตัวเลือกเพิ่มเติม
 * @returns {Buffer} - ภาพที่ปรับปรุงแล้ว
 */
async function preprocessImage(inputBuffer, options = {}) {
    const {
        targetWidth = 2400,      // ความกว้างเป้าหมาย (ถ้าภาพเล็กเกินไป)
        minWidth = 800,          // ความกว้างขั้นต่ำ
        sharpenSigma = 1.5,      // ความคมชัด
        quality = 95,            // คุณภาพ output
        grayscale = true,        // แปลงขาวดำ
        normalize = true,        // ปรับ contrast อัตโนมัติ
        outputFormat = 'png',    // format output
    } = options;

    try {
        // ตรวจสอบข้อมูลภาพ
        const metadata = await sharp(inputBuffer).metadata();
        console.log(`📷 ภาพต้นฉบับ: ${metadata.width}x${metadata.height} (${metadata.format})`);

        let pipeline = sharp(inputBuffer);

        // 1. Rotate ตาม EXIF (ป้องกันภาพหมุน)
        pipeline = pipeline.rotate();

        // 2. ขยายภาพถ้าเล็กเกินไป
        if (metadata.width && metadata.width < minWidth) {
            const scale = targetWidth / metadata.width;
            pipeline = pipeline.resize({
                width: targetWidth,
                height: Math.round(metadata.height * scale),
                fit: 'fill',
                kernel: sharp.kernel.lanczos3
            });
            console.log(`🔍 ขยายภาพ: ${metadata.width} → ${targetWidth}px`);
        }

        // 3. แปลงขาวดำ (ลดสีรบกวน)
        if (grayscale) {
            pipeline = pipeline.grayscale();
        }

        // 4. ปรับ contrast อัตโนมัติ
        if (normalize) {
            pipeline = pipeline.normalize();
        }

        // 5. เพิ่มความคมชัด
        pipeline = pipeline.sharpen({
            sigma: sharpenSigma,
            m1: 1.5,   // flat areas sharpening
            m2: 2.0    // jagged areas sharpening
        });

        // 6. ลบ noise ด้วย median filter
        pipeline = pipeline.median(3);

        // 7. Output
        if (outputFormat === 'png') {
            pipeline = pipeline.png({ quality, compressionLevel: 6 });
        } else {
            pipeline = pipeline.jpeg({ quality, mozjpeg: true });
        }

        const outputBuffer = await pipeline.toBuffer();
        const outputMeta = await sharp(outputBuffer).metadata();
        console.log(`✅ ภาพปรับปรุง: ${outputMeta.width}x${outputMeta.height} (${outputFormat})`);

        return outputBuffer;

    } catch (err) {
        console.error('❌ Pre-processing error:', err.message);
        // ถ้า pre-process ไม่สำเร็จ ส่งภาพดิบกลับ
        return inputBuffer;
    }
}

/**
 * ตรวจสอบว่าไฟล์เป็นภาพหรือ PDF
 * @param {string} filename 
 * @returns {string} 'image' | 'pdf' | 'unknown'
 */
function getFileType(filename) {
    const ext = path.extname(filename).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp'].includes(ext)) {
        return 'image';
    }
    if (ext === '.pdf') {
        return 'pdf';
    }
    return 'unknown';
}

module.exports = {
    preprocessImage,
    getFileType
};
