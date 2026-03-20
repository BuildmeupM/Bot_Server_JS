/**
 * Company Profile: กรมศุลกากร (Thai Customs Department)
 * 
 * ใบเสร็จรับเงินจากกรมศุลกากร จะถูกแยกเป็น 2 บรรทัด:
 *   บรรทัด 1: ภาษีมูลค่าเพิ่ม — คำนวณยอดก่อน VAT กลับจาก (VAT × 100) / 7
 *   บรรทัด 2: อากรขาเข้า — ใช้ยอดที่อ่านได้ตรงๆ
 * 
 * เลขที่เอกสาร: ใช้ "เลขที่ชำระอากร/วันเดือนปี" ทั้งหมด
 * วันที่: parse จากส่วนท้ายของเลขที่ชำระอากร (dd-mm-yy → dd/mm/yyyy)
 */

module.exports = {
    name: 'กรมศุลกากร',
    description: 'ใบเสร็จรับเงินจากกรมศุลกากร — แยกเป็น 2 รายการ (ภาษีมูลค่าเพิ่ม + อากรขาเข้า)',

    // ─── Detection ───
    detect: (data, rawFields) => {
        const sellerName = (data.sellerName || data.sellerNameTh || '').trim();
        // ตรวจจากชื่อผู้ขาย
        if (sellerName.includes('กรมศุลกากร')) return true;
        // ตรวจจาก raw fields (เผื่อ post-process ยังไม่ได้ map)
        const rawSeller = (rawFields['ชื่อผู้ขาย (ไทย)'] || '').trim();
        if (rawSeller.includes('กรมศุลกากร')) return true;
        return false;
    },

    // ─── Custom OCR Fields (ส่งเพิ่มเติมให้ AksornOCR) ───
    customFields: [
        {
            key: 'เลขที่ชำระอากร/วันเดือนปี',
            description: 'เลขที่ชำระอากรและวันเดือนปี เช่น 2801-093810/15-01-69',
            example: '2801-093810/15-01-69'
        },
        {
            key: 'ค่าอากรขาเข้า',
            description: 'จำนวนเงินค่าอากรขาเข้า',
            example: '6,041.00'
        },
        {
            key: 'ค่าภาษีมูลค่าเพิ่ม',
            description: 'จำนวนเงินค่าภาษีมูลค่าเพิ่มที่ระบุในใบเสร็จ',
            example: '21,722.00'
        },
        {
            key: 'เลขที่ใบขนสินค้า',
            description: 'เลขที่ใบขนสินค้า',
            example: 'A015-0690107652 (2835)'
        }
    ],

    // ─── Transform: แปลง 1 record → 2 บรรทัด ───
    transform: (data, rawFields) => {
        // 1. เลขที่เอกสาร — ใช้ custom field ก่อน, fallback สร้างจาก standard fields
        let customsPaymentRef = (rawFields['เลขที่ชำระอากร/วันเดือนปี'] || '').trim();

        if (!customsPaymentRef) {
            // Fallback: สร้างจาก เลขที่เอกสาร + วันที่
            // OCR อ่านได้ "2801-093810" + วันที่ "15/01/2569"
            const docNo = data.documentNumber || rawFields['เลขที่เอกสาร'] || '';
            const rawDate = rawFields['วันที่ออกเอกสาร'] || '';

            if (docNo && rawDate) {
                // แปลงวันที่จาก dd/mm/yyyy → dd-mm-yy (พ.ศ. 2 หลัก)
                const dateMatch = rawDate.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
                if (dateMatch) {
                    let yr = parseInt(dateMatch[3], 10);
                    // แปลงเป็น พ.ศ. ถ้ายังไม่ใช่
                    if (yr < 2400) yr += 543;
                    // ตัดเหลือ 2 หลักสุดท้าย
                    const shortYear = String(yr).slice(-2);
                    customsPaymentRef = `${docNo}/${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}-${shortYear}`;
                } else {
                    customsPaymentRef = docNo;
                }
            } else {
                customsPaymentRef = docNo || data.documentNumber;
            }
        }

        // 2. Parse วันที่ — ใช้จาก ref ก่อน, fallback ใช้ standard date (ผ่าน postProcess แล้ว)
        const documentDate = parseDateFromRef(customsPaymentRef) || data.documentDate;

        // 3. Parse ยอดเงิน
        //    Custom fields → ค่าอากรขาเข้า, ค่าภาษีมูลค่าเพิ่ม
        //    Standard fallback → มูลค่าก่อน VAT (อ่านเป็น data.subtotal), ภาษีมูลค่าเพิ่ม (data.vat)
        const importDuty = parseAmount(rawFields['ค่าอากรขาเข้า'])
            || parseAmount(data.subtotal);

        const vatAmount = parseAmount(rawFields['ค่าภาษีมูลค่าเพิ่ม'])
            || parseAmount(data.vat);

        // 4. คำนวณ VAT กลับ: ยอดก่อน VAT = (VAT × 100) / 7
        const preVat = vatAmount > 0 ? roundTwo((vatAmount * 100) / 7) : 0;
        const totalWithVat = roundTwo(preVat + vatAmount);

        // 5. ข้อมูลอ้างอิง
        const customsDeclaration = (rawFields['เลขที่ใบขนสินค้า'] || '').trim();

        // 6. สร้าง 2 บรรทัด
        return [
            // บรรทัด 1: ภาษีมูลค่าเพิ่ม
            {
                ...data,
                documentNumber: customsPaymentRef,
                documentDate,
                subtotal: preVat.toFixed(2),
                vat: vatAmount.toFixed(2),
                total: totalWithVat.toFixed(2),
                lineNumber: 1,
                lineDescription: 'ภาษีมูลค่าเพิ่ม',
                warnings: [],
                _customsDeclaration: customsDeclaration
            },
            // บรรทัด 2: อากรขาเข้า
            {
                ...data,
                documentNumber: customsPaymentRef,
                documentDate,
                subtotal: importDuty.toFixed(2),
                vat: '0.00',
                total: importDuty.toFixed(2),
                lineNumber: 2,
                lineDescription: 'อากรขาเข้า',
                warnings: [],
                _customsDeclaration: customsDeclaration
            }
        ];
    }
};

// ══════════════════════════════════════════════
// Helper Functions
// ══════════════════════════════════════════════

/**
 * Parse วันที่จากเลขที่ชำระอากร
 * เช่น "2801-093810/15-01-69" → "15/01/2026"
 */
function parseDateFromRef(ref) {
    if (!ref) return null;

    // จับ dd-mm-yy หรือ dd-mm-yyyy ท้ายสุด
    const match = ref.match(/(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    if (!match) return null;

    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    let year = parseInt(match[3], 10);

    // แปลง 2 หลัก → 4 หลัก (ปี พ.ศ.)
    if (year < 100) {
        year += 2500;
    }

    // แปลง พ.ศ. → ค.ศ.
    if (year > 2400) {
        year -= 543;
    }

    // Validate
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    if (year < 1900 || year > 2100) return null;

    return `${day}/${month}/${year}`;
}

/**
 * Parse จำนวนเงินจาก string
 */
function parseAmount(raw) {
    if (!raw && raw !== 0) return 0;
    const cleaned = String(raw)
        .replace(/,/g, '')
        .replace(/\s/g, '')
        .replace(/บาท|฿|THB/gi, '')
        .trim();
    const match = cleaned.match(/(\d+\.?\d*)/);
    if (!match) return 0;
    return parseFloat(match[1]) || 0;
}

/**
 * ปัดทศนิยม 2 ตำแหน่ง
 */
function roundTwo(num) {
    return Math.round(num * 100) / 100;
}
