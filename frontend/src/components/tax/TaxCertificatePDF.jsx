import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
  family: 'THSarabunNew',
  fonts: [
    { src: '/fonts/THSarabunNew/THSarabunNew.ttf' },
    { src: '/fonts/THSarabunNew/THSarabunNew Bold.ttf', fontWeight: 'bold' },
  ],
});

const THBText = (number) => {
  if (isNaN(number) || number <= 0) return '';
  return `( ${Number(number).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท )`;
};

// react-pdf border helpers
const B  = (w = 1) => ({ borderWidth: w, borderStyle: 'solid', borderColor: '#000' });
const BB = (w = 1) => ({ borderBottomWidth: w, borderBottomStyle: 'solid', borderBottomColor: '#000' });
const BR = (w = 1) => ({ borderRightWidth: w,  borderRightStyle: 'solid',  borderRightColor: '#000' });
const BT = (w = 1) => ({ borderTopWidth: w,    borderTopStyle: 'solid',    borderTopColor: '#000' });
const BL = (w = 1) => ({ borderLeftWidth: w,   borderLeftStyle: 'solid',   borderLeftColor: '#000' });

const s = StyleSheet.create({
  page: {
    fontFamily: 'THSarabunNew',
    fontSize: 11,
    paddingTop: 20,
    paddingBottom: 15,
    paddingLeft: 30,
    paddingRight: 30,
    backgroundColor: '#fff',
  },

  // === HEADER ===
  hdrWrap:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  hdrLeft:     { width: '50%', fontSize: 8 },
  hdrRight:    { flexDirection: 'column', alignItems: 'flex-end' },
  hdrRightRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  titleWrap:   { alignItems: 'center', marginBottom: 2 },
  title:       { fontSize: 16, fontWeight: 'bold' },
  subtitle:    { fontSize: 11 },

  // === SECTION BOX ===
  secBox:       { ...B(), paddingTop: 4, paddingBottom: 6, paddingLeft: 6, paddingRight: 6, marginBottom: 2 },
  secRow:       { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 3 },
  secRowCenter: { flexDirection: 'row', alignItems: 'center' },

  bold: { fontWeight: 'bold' },
  fs7:  { fontSize: 7 },
  fs8:  { fontSize: 8 },
  fs9:  { fontSize: 9 },
  fs10: { fontSize: 10 },

  // Dotted underline
  dottedLine:  { borderBottomWidth: 1, borderBottomStyle: 'dotted', borderBottomColor: '#000', flexGrow: 1, marginLeft: 3, minHeight: 13 },
  dottedFixed: { borderBottomWidth: 1, borderBottomStyle: 'dotted', borderBottomColor: '#000' },

  // Tax ID boxes
  taxIdWrap: { flexDirection: 'row', alignItems: 'center' },
  taxIdBox:  { width: 13, height: 15, ...B(), justifyContent: 'center', alignItems: 'center', marginLeft: 1 },
  taxIdDash: { marginLeft: 2, marginRight: 1, fontSize: 10 },

  // Checkbox
  cbWrap:  { flexDirection: 'row', alignItems: 'center', marginRight: 6 },
  cbBox:   { width: 11, height: 11, ...B(), marginRight: 3, justifyContent: 'center', alignItems: 'center' },
  cbCheck: { fontSize: 10, marginTop: -1 },

  // Checkbox section
  chkSec: { paddingTop: 3, paddingBottom: 3, paddingLeft: 6, paddingRight: 6, marginBottom: 0 },
  chkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 1 },

  // === TABLE ===
  tbl:      { ...BT(), ...BL(), ...BR(), marginTop: 1 },
  tHead:    { flexDirection: 'row', ...BB(), textAlign: 'center', alignItems: 'center', backgroundColor: '#f0f0f0' },
  tRow:     { flexDirection: 'row', ...BB() },
  tRowNoBB: { flexDirection: 'row' },

  thDesc: { ...BR(), width: '52%',    paddingTop: 3, paddingBottom: 3, paddingLeft: 4, paddingRight: 4, fontWeight: 'bold', textAlign: 'center' },
  thDate: { ...BR(), width: '13%',    paddingTop: 3, paddingBottom: 3, paddingLeft: 2, paddingRight: 2, fontWeight: 'bold', textAlign: 'center' },
  thAmt:  { ...BR(), width: '17.5%',  paddingTop: 3, paddingBottom: 3, paddingLeft: 2, paddingRight: 2, fontWeight: 'bold', textAlign: 'center' },
  thTax:  {          width: '17.5%',  paddingTop: 3, paddingBottom: 3, paddingLeft: 2, paddingRight: 2, fontWeight: 'bold', textAlign: 'center' },

  tdDesc: { ...BR(), width: '52%',    paddingTop: 1, paddingBottom: 1, paddingLeft: 4,  paddingRight: 2 },
  tdDate: { ...BR(), width: '13%',    paddingTop: 1, paddingBottom: 1, paddingLeft: 2,  paddingRight: 2, textAlign: 'center', fontSize: 9 },
  tdAmt:  { ...BR(), width: '17.5%',  paddingTop: 1, paddingBottom: 1, paddingLeft: 2,  paddingRight: 4, textAlign: 'right' },
  tdTax:  {          width: '17.5%',  paddingTop: 1, paddingBottom: 1, paddingLeft: 2,  paddingRight: 4, textAlign: 'right' },

  indent1: { marginLeft: 12 },
  indent2: { marginLeft: 24 },
  indent3: { marginLeft: 36 },

  // === FOOTER ===
  footWrap: { flexDirection: 'row', ...BB(), ...BL(), ...BR() },
  footWarn: { width: '38%', ...BR(), padding: 4, fontSize: 9 },
  footSign: { width: '62%', padding: 6, alignItems: 'center', position: 'relative' },

  noteText: { fontSize: 7, marginTop: 3 },

  // Summary row
  sumRow:   { flexDirection: 'row', ...BB(), backgroundColor: '#fafafa' },
  sumLabel: { ...BR(), width: '52%',   paddingTop: 2, paddingBottom: 2, paddingLeft: 4, paddingRight: 4, textAlign: 'center', fontWeight: 'bold' },
  sumDate:  { ...BR(), width: '13%',   paddingTop: 2, paddingBottom: 2 },
  sumAmt:   { ...BR(), width: '17.5%', paddingTop: 2, paddingBottom: 2, paddingLeft: 2, paddingRight: 4, textAlign: 'right', fontWeight: 'bold' },
  sumTax:   {          width: '17.5%', paddingTop: 2, paddingBottom: 2, paddingLeft: 2, paddingRight: 4, textAlign: 'right', fontWeight: 'bold' },

  fullRow:     { ...BB(), paddingTop: 2, paddingBottom: 2, paddingLeft: 4, paddingRight: 4 },
  fullRowNoBB: {          paddingTop: 2, paddingBottom: 2, paddingLeft: 4, paddingRight: 4 },
});

// ─── Tax ID Boxes (13 digits, grouped 1-4-5-2-1) ──────────────────────────────
const TaxIdBoxes = ({ taxId = '' }) => {
  const chars  = taxId.replace(/\D/g, '').padEnd(13, ' ').split('').slice(0, 13);
  const groups = [
    chars.slice(0, 1),
    chars.slice(1, 5),
    chars.slice(5, 10),
    chars.slice(10, 12),
    chars.slice(12, 13),
  ];
  return (
    <View style={s.taxIdWrap}>
      {groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <Text style={s.taxIdDash}>-</Text>}
          {group.map((ch, ci) => (
            <View key={`${gi}-${ci}`} style={s.taxIdBox}>
              <Text style={{ fontSize: 10 }}>{ch.trim()}</Text>
            </View>
          ))}
        </React.Fragment>
      ))}
    </View>
  );
};

const CB = ({ label, checked }) => (
  <View style={s.cbWrap}>
    <View style={s.cbBox}>
      {checked && <Text style={s.cbCheck}>✓</Text>}
    </View>
    <Text style={s.fs10}>{label}</Text>
  </View>
);

// ─── Helper: คืนค่า date/amount/tax สำหรับ row ที่ตรงกับ income_row ─────────
const makeRowData = (income_row, targetRow, date, amount_before_tax, tax_amount, fmtAmt) => {
  if (income_row !== targetRow) return { date: '', amt: '', tax: '' };
  return {
    date: date || '',
    amt:  fmtAmt(amount_before_tax),
    tax:  fmtAmt(tax_amount),
  };
};

// ─── Component ────────────────────────────────────────────────────────────────
const TaxCertificatePDF = ({ record }) => {
  const {
    // Payee
    contact_name, tax_id, address,
    // Payer
    payer_name, payer_tax_id, payer_address,
    // Income
    income_row   = 6,
    income_label = '',
    pnd_form     = null,
    amount_before_tax,
    tax_amount,
    date,
    // Document
    issue_date   = '',
    book_number  = '',
    doc_number   = '',
    payer_type   = 1,
  } = record;

  const fmtAmt = (v) => v ? Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '';

  // Row data helpers
  const rd = (targetRow) => makeRowData(income_row, targetRow, date, amount_before_tax, tax_amount, fmtAmt);
  const r1 = rd(1);
  const r2 = rd(2);
  const r3 = rd(3);
  const r4 = rd(4);
  const r5 = rd(5);
  const r6 = rd(6);

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ══════ HEADER — 3-column layout ══════ */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>

          {/* Left: ฉบับที่ 1 / 2 */}
          <View style={{ width: '40%' }}>
            <Text style={s.fs8}>ฉบับที่ 1  (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)</Text>
            <Text style={s.fs8}>ฉบับที่ 2  (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)</Text>
          </View>

          {/* Center: title + subtitle */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.title}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</Text>
            <Text style={s.subtitle}>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</Text>
          </View>

          {/* Right: เลขที่ */}
          <View style={{ width: '15%', alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={s.fs10}>เลขที่</Text>
              <View style={[s.dottedFixed, { width: 55, marginLeft: 3, position: 'relative' }]}>
                {doc_number ? (
                  <Text style={{ position: 'absolute', left: 2, bottom: 0, fontSize: 10 }}>{doc_number}</Text>
                ) : null}
              </View>
            </View>
          </View>

        </View>

        {/* ══════ PAYER (ผู้มีหน้าที่หักภาษี) ══════ */}
        <View style={s.secBox}>
          <View style={s.secRow}>
            <Text style={s.bold}>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย : -</Text>
            <View style={{ width: 20 }} />
            <Text style={s.fs10}>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*</Text>
            <View style={{ width: 6 }} />
            <TaxIdBoxes taxId={payer_tax_id || ''} />
          </View>

          <View style={s.secRow}>
            <Text style={s.bold}>ชื่อ</Text>
            <View style={{ flex: 1, position: 'relative' }}>
              <View style={s.dottedLine} />
              <Text style={{ position: 'absolute', bottom: 1, left: 8, fontSize: 11 }}>{payer_name || ''}</Text>
            </View>
            <View style={{ width: 6 }} />
            <Text style={s.fs10}>เลขประจำตัวผู้เสียภาษีอากร</Text>
            <View style={[s.dottedFixed, { width: 55, marginLeft: 3 }]} />
          </View>
          <Text style={[s.fs7, { marginLeft: 20, color: '#555', marginBottom: 3 }]}>(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</Text>

          <View style={s.secRow}>
            <Text style={s.bold}>ที่อยู่</Text>
            <View style={{ flex: 1, position: 'relative' }}>
              <View style={s.dottedLine} />
              <Text style={{ position: 'absolute', bottom: 1, left: 8, fontSize: 11 }}>{payer_address || ''}</Text>
            </View>
          </View>
          <Text style={[s.fs7, { marginLeft: 20, color: '#555' }]}>(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)</Text>
        </View>

        {/* ══════ PAYEE (ผู้ถูกหักภาษี) ══════ */}
        <View style={s.secBox}>
          <View style={s.secRow}>
            <Text style={s.bold}>ผู้ถูกหักภาษี ณ ที่จ่าย : -</Text>
            <View style={{ width: 20 }} />
            <Text style={s.fs10}>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*</Text>
            <View style={{ width: 6 }} />
            <TaxIdBoxes taxId={tax_id || ''} />
          </View>

          <View style={s.secRow}>
            <Text style={s.bold}>ชื่อ</Text>
            <View style={{ flex: 1, position: 'relative' }}>
              <View style={s.dottedLine} />
              <Text style={{ position: 'absolute', bottom: 1, left: 8, fontSize: 11 }}>{contact_name}</Text>
            </View>
            <View style={{ width: 6 }} />
            <Text style={s.fs10}>เลขประจำตัวผู้เสียภาษีอากร</Text>
            <View style={[s.dottedFixed, { width: 55, marginLeft: 3 }]} />
          </View>
          <Text style={[s.fs7, { marginLeft: 20, color: '#555', marginBottom: 3 }]}>(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</Text>

          <View style={s.secRow}>
            <Text style={s.bold}>ที่อยู่</Text>
            <View style={{ flex: 1, position: 'relative' }}>
              <View style={s.dottedLine} />
              <Text style={{ position: 'absolute', bottom: 1, left: 8, fontSize: 11 }}>{address}</Text>
            </View>
          </View>
          <Text style={[s.fs7, { marginLeft: 20, color: '#555' }]}>(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)</Text>
        </View>

        {/* ══════ CHECKBOX SECTION (ลำดับที่ / ภ.ง.ด.) ══════ */}
        <View style={s.chkSec}>
          <View style={s.chkRow}>
            <Text style={[s.bold, s.fs10]}>ลำดับที่</Text>
            <View style={{ width: 4 }} />
            <View style={[s.dottedFixed, { width: 40 }]} />
            <View style={{ width: 6 }} />
            <Text style={s.fs10}>ในแบบ</Text>
            <View style={{ width: 10 }} />
            <CB label="(1) ภ.ง.ด.1ก"       checked={pnd_form === '1ก'} />
            <CB label="(2) ภ.ง.ด.1ก พิเศษ" checked={false} />
            <CB label="(3) ภ.ง.ด.2"         checked={pnd_form === '2'} />
            <CB label="(4) ภ.ง.ด.3"         checked={pnd_form === '3'} />
          </View>
          <View style={s.chkRow}>
            <Text style={[s.fs7, { color: '#555', marginRight: 10 }]}>(ให้สามารถอ้างอิงหรือสอบยันกันได้ระหว่างลำดับที่ตามหนังสือรับรองฯ กับแบบแสดงรายการภาษีที่หักที่จ่าย)</Text>
            <CB label="(5) ภ.ง.ด.2ก" checked={false} />
            <CB label="(6) ภ.ง.ด.3ก" checked={false} />
            <CB label="(7) ภ.ง.ด.53"  checked={pnd_form === '53'} />
          </View>
        </View>

        {/* ══════ INCOME TABLE ══════ */}
        <View style={s.tbl}>

          {/* Table Header */}
          <View style={s.tHead}>
            <View style={s.thDesc}><Text style={s.bold}>ประเภทเงินได้พึงประเมินที่จ่าย</Text></View>
            <View style={s.thDate}><Text style={[s.bold, s.fs9]}>วัน เดือน</Text><Text style={[s.bold, s.fs9]}>หรือปีภาษี ที่จ่าย</Text></View>
            <View style={s.thAmt}><Text style={s.bold}>จำนวนเงินที่จ่าย</Text></View>
            <View style={s.thTax}><Text style={[s.bold, s.fs9]}>ภาษีที่หัก</Text><Text style={[s.bold, s.fs9]}>และนำส่งไว้</Text></View>
          </View>

          {/* Row 1 — มาตรา 40(1) */}
          <View style={s.tRow}>
            <View style={s.tdDesc}><Text style={s.fs10}>1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)</Text></View>
            <View style={s.tdDate}><Text>{r1.date}</Text></View>
            <View style={s.tdAmt}><Text>{r1.amt}</Text></View>
            <View style={s.tdTax}><Text>{r1.tax}</Text></View>
          </View>

          {/* Row 2 — มาตรา 40(2) */}
          <View style={s.tRow}>
            <View style={s.tdDesc}><Text style={s.fs10}>2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)</Text></View>
            <View style={s.tdDate}><Text>{r2.date}</Text></View>
            <View style={s.tdAmt}><Text>{r2.amt}</Text></View>
            <View style={s.tdTax}><Text>{r2.tax}</Text></View>
          </View>

          {/* Row 3 — มาตรา 40(3) */}
          <View style={s.tRow}>
            <View style={s.tdDesc}><Text style={s.fs10}>3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)</Text></View>
            <View style={s.tdDate}><Text>{r3.date}</Text></View>
            <View style={s.tdAmt}><Text>{r3.amt}</Text></View>
            <View style={s.tdTax}><Text>{r3.tax}</Text></View>
          </View>

          {/* Row 4 — มาตรา 40(4) ดอกเบี้ย/เงินปันผล */}
          <View style={s.tRow}>
            <View style={s.tdDesc}>
              <Text style={s.fs10}>4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)</Text>
              <Text style={[s.fs10, s.indent1]}>(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)</Text>
              <Text style={[s.fs9, s.indent2]}>(1) กรณีผู้ได้รับเงินปันผลได้รับเครดิตภาษี  โดยจ่ายจาก</Text>
              <Text style={[s.fs9, s.indent3]}>กำไรสุทธิของกิจการที่ต้องเสียภาษีเงินได้นิติบุคคลในอัตราดังนี้</Text>
              <Text style={[s.fs9, s.indent3]}>(1.1) อัตราร้อยละ 30  ของกำไรสุทธิ</Text>
              <Text style={[s.fs9, s.indent3]}>(1.2) อัตราร้อยละ 25  ของกำไรสุทธิ</Text>
              <Text style={[s.fs9, s.indent3]}>(1.3) อัตราร้อยละ 20  ของกำไรสุทธิ</Text>
              <Text style={[s.fs9, s.indent3]}>(1.4) อัตราอื่น ๆ (ระบุ)..................ของกำไรสุทธิ</Text>
              <Text style={[s.fs9, s.indent2]}>(2) กรณีผู้ได้รับเงินปันผลไม่ได้รับเครดิตภาษี  เนื่องจากจ่ายจาก</Text>
              <Text style={[s.fs9, s.indent3]}>(2.1) กำไรสุทธิของกิจการที่ได้รับยกเว้นภาษีเงินได้นิติบุคคล</Text>
              <Text style={[s.fs9, s.indent3]}>(2.2) เงินปันผลหรือเงินส่วนแบ่งของกำไรที่ได้รับยกเว้นไม่ต้องนำมารวม</Text>
              <Text style={[s.fs9, s.indent3]}>     คำนวณเป็นรายได้เพื่อเสียภาษีเงินได้นิติบุคคล</Text>
              <Text style={[s.fs9, s.indent3]}>(2.3) กำไรสุทธิส่วนที่ได้หักผลขาดทุนสุทธิยกมาไม่เกิน 5 ปี</Text>
              <Text style={[s.fs9, s.indent3]}>     ก่อนรอบระยะเวลาบัญชีปีปัจจุบัน</Text>
              <Text style={[s.fs9, s.indent3]}>(2.4) กำไรที่รับรู้ทางบัญชีโดยวิธีส่วนได้เสีย (equity method)</Text>
              <Text style={[s.fs9, s.indent3]}>(2.5) อื่น ๆ (ระบุ)........................................................</Text>
            </View>
            <View style={s.tdDate}><Text>{r4.date}</Text></View>
            <View style={s.tdAmt}><Text>{r4.amt}</Text></View>
            <View style={s.tdTax}><Text>{r4.tax}</Text></View>
          </View>

          {/* Row 5 — มาตรา 3 เตรส */}
          <View style={s.tRow}>
            <View style={s.tdDesc}>
              <Text style={s.fs10}>5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา</Text>
              <Text style={[s.fs10, s.indent1]}>3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใด ๆ เนื่องจากการส่งเสริมการขาย รางวัล</Text>
              <Text style={[s.fs10, s.indent1]}>ในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้าง</Text>
              <Text style={[s.fs10, s.indent1]}>ทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ</Text>
            </View>
            <View style={s.tdDate}><Text>{r5.date}</Text></View>
            <View style={s.tdAmt}><Text>{r5.amt}</Text></View>
            <View style={s.tdTax}><Text>{r5.tax}</Text></View>
          </View>

          {/* Row 6 — อื่น ๆ */}
          <View style={s.tRow}>
            <View style={s.tdDesc}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                <Text style={s.fs10}>6. อื่น ๆ (ระบุ) </Text>
                <View style={s.dottedLine}>
                  <Text style={{ fontSize: 11 }}>{income_row === 6 ? income_label : ''}</Text>
                </View>
              </View>
            </View>
            <View style={s.tdDate}><Text>{r6.date}</Text></View>
            <View style={s.tdAmt}><Text>{r6.amt}</Text></View>
            <View style={s.tdTax}><Text>{r6.tax}</Text></View>
          </View>

          {/* Summary Row */}
          <View style={s.sumRow}>
            <View style={s.sumLabel}><Text style={s.bold}>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</Text></View>
            <View style={s.sumDate} />
            <View style={s.sumAmt}><Text style={s.bold}>{fmtAmt(amount_before_tax)}</Text></View>
            <View style={s.sumTax}><Text style={s.bold}>{fmtAmt(tax_amount)}</Text></View>
          </View>

          {/* ภาษีรวม (ตัวอักษร) */}
          <View style={s.fullRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={s.bold}>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)</Text>
              <View style={{ flex: 1, marginLeft: 6, backgroundColor: '#f5f5f5', paddingTop: 2, paddingBottom: 2, paddingLeft: 6, paddingRight: 6 }}>
                <Text>{THBText(tax_amount)}</Text>
              </View>
            </View>
          </View>

          {/* กองทุน */}
          <View style={s.fullRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[s.bold, s.fs9]}>เงินที่จ่ายเข้า</Text>
              <Text style={s.fs8}> กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน....................บาท  กองทุนประกันสังคม....................บาท  กองทุนสำรองเลี้ยงชีพ....................บาท</Text>
            </View>
          </View>

          {/* ผู้จ่ายเงิน checkbox */}
          <View style={s.fullRowNoBB}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={[s.bold, { marginRight: 8 }]}>ผู้จ่ายเงิน</Text>
              <CB label="(1) หัก ณ ที่จ่าย"   checked={payer_type === 1} />
              <CB label="(2) ออกให้ตลอดไป"    checked={payer_type === 2} />
              <CB label="(3) ออกให้ครั้งเดียว" checked={payer_type === 3} />
              <View style={s.secRowCenter}>
                <CB label="(4) อื่น ๆ (ระบุ)" checked={false} />
                <View style={[s.dottedFixed, { width: 80 }]} />
              </View>
            </View>
          </View>
        </View>

        {/* ══════ FOOTER ══════ */}
        <View style={s.footWrap}>
          <View style={s.footWarn}>
            <Text style={[s.bold, { marginBottom: 3 }]}>คำเตือน</Text>
            <Text style={{ marginLeft: 14 }}>ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย</Text>
            <Text>ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวล</Text>
            <Text>รัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35</Text>
            <Text>แห่งประมวลรัษฎากร</Text>
          </View>
          <View style={s.footSign}>
            <Text style={s.fs10}>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความเป็นจริงทุกประการ</Text>
            <View style={{ marginTop: 18 }}>
              <Text style={s.fs10}>ลงชื่อ..............................................................................ผู้จ่ายเงิน</Text>
            </View>
            <View style={{ marginTop: 8 }}>
              <Text style={s.fs9}>
                {issue_date || '(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)'}
              </Text>
            </View>
            {/* ประทับตรา */}
            <View style={{ position: 'absolute', right: 15, bottom: 12, width: 45, height: 45, borderWidth: 1, borderStyle: 'solid', borderColor: '#999', borderRadius: 22, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={[s.fs7, { textAlign: 'center', color: '#888' }]}>ประทับตรา</Text>
              <Text style={[s.fs7, { textAlign: 'center', color: '#888' }]}>นิติบุคคล</Text>
              <Text style={[s.fs7, { textAlign: 'center', color: '#888' }]}>(ถ้ามี)</Text>
            </View>
          </View>
        </View>

        {/* ══════ NOTES ══════ */}
        <Text style={s.noteText}>หมายเหตุ  เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง   1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง</Text>
        <Text style={s.noteText}>                                                         2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า</Text>
        <Text style={s.noteText}>                                                         3. กรณีอื่น ๆ นอกเหนือจาก 1. และ 2. ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร</Text>

      </Page>
    </Document>
  );
};

export default TaxCertificatePDF;
