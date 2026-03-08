// ── Export Excel Utility สำหรับ OCR Batch Results ──
// สร้างไฟล์ Excel (PEAK_ImportExpense) จากผลลัพธ์ OCR batch
import * as XLSX from 'xlsx'

/**
 * แปลงวันที่จากรูปแบบต่างๆ เป็น yyyymmdd
 * รองรับ: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, yyyy-mm-dd
 * ถ้าปี > 2500 จะถือว่าเป็น พ.ศ. และลบ 543
 */
function formatDateToYYYYMMDD(dateStr) {
    if (!dateStr) return ''

    // แยกตัวคั่น / - .
    const parts = dateStr.split(/[\/\-\.]/)
    if (parts.length !== 3) return dateStr

    let day, month, year

    // ตรวจสอบ format: ถ้าตัวแรกมี 4 หลัก = yyyy-mm-dd
    if (parts[0].length === 4) {
        year = parts[0]
        month = parts[1].padStart(2, '0')
        day = parts[2].padStart(2, '0')
    } else {
        day = parts[0].padStart(2, '0')
        month = parts[1].padStart(2, '0')
        year = parts[2]
    }

    // ถ้าปีมี 2 หลัก → เพิ่มเป็น 4 หลัก
    if (year.length === 2) {
        const numYear = parseInt(year)
        year = (numYear > 50 ? '19' : '20') + year
    }

    // ถ้าปี > 2500 → เป็น พ.ศ. ลบ 543
    let numYear = parseInt(year)
    if (numYear > 2500) {
        numYear -= 543
    }

    return `${numYear}${month}${day}`
}

/**
 * แปลงค่าเงินจาก string เป็น number
 * เช่น "1,234.56" → 1234.56
 */
function parseAmount(amountStr) {
    if (!amountStr && amountStr !== 0) return ''
    const cleaned = String(amountStr).replace(/,/g, '')
    const num = parseFloat(cleaned)
    return isNaN(num) ? '' : num
}

/**
 * สร้างและดาวน์โหลดไฟล์ PEAK_ImportExpense.xlsx จาก OCR batch results
 * @param {Array} results - ผลลัพธ์ OCR จาก jobDetail.results
 *   แต่ละ item มีรูปแบบ: { file, status, data: { documentDate, documentNumber, total, subtotal, vat, sellerNameTh, ... } }
 * @param {string} customerName - ชื่อลูกค้า (ใส่เหมือนกันทุกรายการ)
 * @param {string} paymentMethod - รับชำระโดย (ใส่เหมือนกันทุกรายการ)
 */
export function exportOcrToExcel(results, customerName, paymentMethod) {
    // กรองเฉพาะที่สำเร็จ (มี data)
    const validResults = results.filter(r => r.data && r.status !== 'error')

    // กำหนด Header ตาม spec PEAK_ImportExpense
    const headers = [
        'ลำดับที่*',
        'วันที่เอกสาร',
        'เลขที่เอกสาร',
        'อ้างอิงถึง',
        'ลูกค้า',
        'เลขทะเบียน 13 หลัก',
        'เลขสาขา 5 หลัก',
        'การออกใบกำกับภาษี',
        'ประเภทราคา',
        'สินค้า/บริการ',
        'บัญชี',
        'คำอธิบาย',
        'จำนวน',
        'ราคาต่อหน่วย',
        'ส่วนลดต่อหน่วย',
        'อัตราภาษี',
        'ถูกหัก ณ ที่จ่าย(ถ้ามี)',
        'รับชำระโดย',
        'หมายเหตุ',
        'กลุ่มจัดประเภท',
    ]

    // สร้างข้อมูลแต่ละแถว — map จาก OCR fields
    const rows = validResults.map((item, index) => {
        const d = item.data || {}
        return [
            index + 1,                                          // ลำดับที่*
            formatDateToYYYYMMDD(d.documentDate),               // วันที่เอกสาร (yyyymmdd)
            d.documentNumber || '',                             // เลขที่เอกสาร
            '',                                                 // อ้างอิงถึง (ว่าง)
            customerName || '',                                 // ลูกค้า
            '',                                                 // เลขทะเบียน 13 หลัก (ว่าง)
            '',                                                 // เลขสาขา 5 หลัก (ว่าง)
            1,                                                  // การออกใบกำกับภาษี
            2,                                                  // ประเภทราคา
            '',                                                 // สินค้า/บริการ (ว่าง)
            '410101',                                           // บัญชี
            'รายได้จากการขายสินค้า',                              // คำอธิบาย
            1,                                                  // จำนวน
            parseAmount(d.total),                               // ราคาต่อหน่วย (ยอดรวมสุทธิ)
            '',                                                 // ส่วนลดต่อหน่วย (ว่าง)
            '7%',                                               // อัตราภาษี
            '',                                                 // ถูกหัก ณ ที่จ่าย (ว่าง)
            paymentMethod || '',                                // รับชำระโดย
            d.sellerNameTh || item.file || '',                  // หมายเหตุ (ชื่อผู้ขาย/ชื่อไฟล์)
            '',                                                 // กลุ่มจัดประเภท (ว่าง)
        ]
    })

    // สร้าง worksheet (header + rows)
    const wsData = [headers, ...rows]
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // ตั้งค่าความกว้างคอลัมน์
    ws['!cols'] = [
        { wch: 10 },  // ลำดับที่
        { wch: 14 },  // วันที่เอกสาร
        { wch: 18 },  // เลขที่เอกสาร
        { wch: 14 },  // อ้างอิงถึง
        { wch: 20 },  // ลูกค้า
        { wch: 18 },  // เลขทะเบียน 13 หลัก
        { wch: 16 },  // เลขสาขา 5 หลัก
        { wch: 20 },  // การออกใบกำกับภาษี
        { wch: 14 },  // ประเภทราคา
        { wch: 16 },  // สินค้า/บริการ
        { wch: 10 },  // บัญชี
        { wch: 28 },  // คำอธิบาย
        { wch: 8 },   // จำนวน
        { wch: 16 },  // ราคาต่อหน่วย
        { wch: 16 },  // ส่วนลดต่อหน่วย
        { wch: 12 },  // อัตราภาษี
        { wch: 24 },  // ถูกหัก ณ ที่จ่าย
        { wch: 16 },  // รับชำระโดย
        { wch: 28 },  // หมายเหตุ
        { wch: 16 },  // กลุ่มจัดประเภท
    ]

    // สร้าง workbook
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ImportExpense')

    // ดาวน์โหลดไฟล์
    const now = new Date()
    const ts = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}`
    XLSX.writeFile(wb, `PEAK_ImportExpense_OCR_${ts}.xlsx`)
}
