/**
 * Company Profiles Registry
 * Auto-load ทุก profile ในโฟลเดอร์นี้ แล้วให้ OCR pipeline เรียกใช้
 */
const fs = require('fs');
const path = require('path');

const profiles = [];

// Auto-load all profile files (ข้ามไฟล์ index.js)
const profileDir = __dirname;
const files = fs.readdirSync(profileDir).filter(f => f !== 'index.js' && f.endsWith('.js'));

for (const file of files) {
    try {
        const profile = require(path.join(profileDir, file));
        if (profile && profile.name && typeof profile.detect === 'function') {
            profiles.push({ ...profile, _fileName: file });
            console.log(`📂 Loaded company profile: ${profile.name} (${file})`);
        }
    } catch (err) {
        console.error(`❌ Failed to load company profile: ${file}`, err.message);
    }
}

/**
 * ตรวจสอบว่าข้อมูล OCR ตรงกับ profile ไหน
 * @param {object} data - ข้อมูลที่ผ่าน postProcess แล้ว
 * @param {object} rawFields - raw fields จาก AksornOCR
 * @returns {object|null} - profile ที่ match หรือ null
 */
function detectProfile(data, rawFields) {
    for (const profile of profiles) {
        try {
            if (profile.detect(data, rawFields)) {
                return profile;
            }
        } catch (err) {
            console.error(`❌ Profile detect error (${profile.name}):`, err.message);
        }
    }
    return null;
}

/**
 * รวม custom fields จากทุก profile (ต่อท้าย standard fields)
 * @returns {Array} - custom fields เพิ่มเติม
 */
function getAllCustomFields() {
    const fields = [];
    const seenKeys = new Set();

    for (const profile of profiles) {
        if (!profile.customFields) continue;
        for (const field of profile.customFields) {
            if (!seenKeys.has(field.key)) {
                seenKeys.add(field.key);
                fields.push(field);
            }
        }
    }
    return fields;
}

/**
 * แสดง profiles ทั้งหมด
 */
function listProfiles() {
    return profiles.map(p => ({
        name: p.name,
        description: p.description || '',
        fileName: p._fileName,
        customFieldsCount: (p.customFields || []).length,
        customFields: (p.customFields || []).map(f => f.key)
    }));
}

module.exports = { detectProfile, getAllCustomFields, listProfiles };
