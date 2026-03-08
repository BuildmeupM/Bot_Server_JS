// ── Export Excel Utility — PEAK_ImportExpense ──
// สร้างไฟล์ Excel จากข้อมูลที่อ่านได้จาก A.K.F Reader
import * as XLSX from 'xlsx'

/**
 * แปลงวันที่จากรูปแบบต่างๆ เป็น yyyymmdd
 * รองรับ: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
 * ถ้าปี > 2500 จะถือว่าเป็น พ.ศ. และลบ 543
 */
function formatDateToYYYYMMDD(dateStr) {
    if (!dateStr) return ''

    // แยกตัวคั่น / - .
    const parts = dateStr.split(/[\/\-\.]/)
    if (parts.length !== 3) return dateStr // ไม่สามารถแปลงได้

    let day = parts[0].padStart(2, '0')
    let month = parts[1].padStart(2, '0')
    let year = parts[2]

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
    if (!amountStr) return ''
    const cleaned = amountStr.replace(/,/g, '')
    const num = parseFloat(cleaned)
    return isNaN(num) ? amountStr : num
}

/**
 * สร้างและดาวน์โหลดไฟล์ PEAK_ImportExpense.xlsx
 * @param {Array} results - ผลลัพธ์จากการอ่าน PDF
 * @param {string} customerName - ชื่อลูกค้า (ใส่เหมือนกันทุกรายการ)
 * @param {string} paymentMethod - รับชำระโดย (ใส่เหมือนกันทุกรายการ)
 */
export function exportToExcel(results, customerName, paymentMethod) {
    // กำหนด Header ตาม spec
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

    // สร้างข้อมูลแต่ละแถว
    const rows = results.map((item, index) => [
        index + 1,                                          // ลำดับที่*
        formatDateToYYYYMMDD(item.date),                    // วันที่เอกสาร (yyyymmdd)
        item.docNumber || '',                               // เลขที่เอกสาร
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
        parseAmount(item.grandTotal),                       // ราคาต่อหน่วย (ยอดรวมทั้งสิ้น)
        '',                                                 // ส่วนลดต่อหน่วย (ว่าง)
        '7%',                                               // อัตราภาษี
        '',                                                 // ถูกหัก ณ ที่จ่าย (ว่าง)
        paymentMethod || '',                                // รับชำระโดย
        '',                                                 // หมายเหตุ (ว่าง)
        '',                                                 // กลุ่มจัดประเภท (ว่าง)
    ])

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
        { wch: 14 },  // หมายเหตุ
        { wch: 16 },  // กลุ่มจัดประเภท
    ]

    // สร้าง workbook
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ImportExpense')

    // ดาวน์โหลดไฟล์
    XLSX.writeFile(wb, 'PEAK_ImportExpense.xlsx')
}
