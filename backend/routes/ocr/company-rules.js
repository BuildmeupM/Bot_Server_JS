/**
 * OCR Company Custom Rules Module
 * กฎพิเศษสำหรับแต่ละบริษัท — เพิ่ม rules ได้โดยไม่ต้องแก้โค้ดหลัก
 * 
 * วิธีเพิ่ม rule ใหม่:
 * 1. เพิ่ม entry ใน COMPANY_RULES โดยใช้ เลขผู้เสียภาษี เป็น key
 * 2. เขียน transform function ที่รับ data และ return data ที่แก้ไขแล้ว
 */

// ══════════════════════════════════════════════
// Company Custom Rules
// Key = เลขผู้เสียภาษี (13 หลัก)
// ══════════════════════════════════════════════
const COMPANY_RULES = {
    // ═══════════ ตัวอย่าง (แก้ไขหรือลบได้) ═══════════
    // 
    // "0105550123456": {
    //     name: "บริษัท ตัวอย่าง จำกัด",
    //     description: "แปลงเลขที่เอกสารให้เป็นรูปแบบ INV-YYYY-XXXX",
    //     transform: (data) => {
    //         // ตัวอย่าง: แปลงเลขที่เอกสาร
    //         if (data.documentNumber) {
    //             const match = data.documentNumber.match(/(\d{4})(\d+)/);
    //             if (match) {
    //                 data.documentNumber = `INV-${match[1]}-${match[2]}`;
    //             }
    //         }
    //         return data;
    //     }
    // },
    //
    // "0105560789012": {
    //     name: "บริษัท ทดสอบ จำกัด",
    //     description: "วันที่ใช้รูปแบบ yyyy-mm-dd",
    //     transform: (data) => {
    //         // แปลงวันที่จาก dd/mm/yyyy → yyyy-mm-dd
    //         if (data.documentDate) {
    //             const parts = data.documentDate.split('/');
    //             if (parts.length === 3) {
    //                 data.documentDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    //             }
    //         }
    //         return data;
    //     }
    // }
};

// ══════════════════════════════════════════════
// Apply company-specific rules
// ══════════════════════════════════════════════

/**
 * ตรวจสอบและใช้กฎพิเศษตามบริษัท
 * @param {object} data - ข้อมูลที่ผ่าน post-processing แล้ว
 * @returns {object} - ข้อมูลที่ถูกแปลงตาม company rules (ถ้ามี)
 */
function applyCompanyRules(data) {
    // ลองจับคู่ด้วย sellerTaxId ก่อน
    let rule = COMPANY_RULES[data.sellerTaxId];
    let matchedBy = 'seller';

    // ถ้าไม่เจอ ลองจับคู่ด้วย buyerTaxId
    if (!rule && data.buyerTaxId) {
        rule = COMPANY_RULES[data.buyerTaxId];
        matchedBy = 'buyer';
    }

    // ถ้าไม่มี rule → คืนข้อมูลเดิม
    if (!rule) {
        return { data, ruleApplied: null };
    }

    console.log(`🏢 พบ Company Rule: ${rule.name} (จับคู่จาก ${matchedBy})`);

    // ใช้ transform function
    try {
        const transformedData = rule.transform({ ...data });
        return {
            data: transformedData,
            ruleApplied: {
                taxId: matchedBy === 'seller' ? data.sellerTaxId : data.buyerTaxId,
                companyName: rule.name,
                description: rule.description || '',
                matchedBy
            }
        };
    } catch (err) {
        console.error(`❌ Company Rule error (${rule.name}):`, err.message);
        data.warnings = data.warnings || [];
        data.warnings.push(`⚠️ Company Rule error: ${err.message}`);
        return { data, ruleApplied: null };
    }
}

/**
 * แสดงรายชื่อ Company Rules ที่มีทั้งหมด
 */
function listCompanyRules() {
    return Object.entries(COMPANY_RULES).map(([taxId, rule]) => ({
        taxId,
        name: rule.name,
        description: rule.description || ''
    }));
}

module.exports = {
    COMPANY_RULES,
    applyCompanyRules,
    listCompanyRules
};
