const { parseFileNamePattern } = require('./backend/routes/ocr/excel-export');

const tests = [
    'TaxInvoice-กรรมการสำรองจ่าย-Jan_2026_ชุดที่4.pdf',
    'VAT_12345 - TaxInvoice-กรรมการสำรองจ่าย-Jan_2026_ชุดที่1 Ch001.pdf',
    'VAT_1234 - ซื้อสินค้า 456.pdf',
    'VAT - 51330_500 - TaxInvoice-ชุดที่2 - 1000.pdf',
    'WHT4% - 51330_1000 - TaxInvoice-กรรมการ CH001.pdf',
    'None_Vat_51330 - ค่าเช่า.pdf',
];

tests.forEach(f => {
    console.log('\n=== ' + f);
    const r = parseFileNamePattern(f);
    console.log('  originalName:', r.originalName || '(empty)');
    console.log('  paymentCodes:', JSON.stringify(r.paymentCodes));
});
