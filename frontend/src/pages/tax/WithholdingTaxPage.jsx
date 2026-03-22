import React, { useState, useEffect } from 'react';
import { FileText, Download, X, Search, CheckCircle, Building2 } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import dayjs from 'dayjs';
import TaxCertificatePDF from '../../components/tax/TaxCertificatePDF';
import './WithholdingTaxPage.css';

// ─── Income type mapping ตามมาตรฐานกรมสรรพากร ───────────────────────────────
const INCOME_TYPES = [
  // Row 1 — มาตรา 40(1)
  { value: 'salary',      label: 'เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส (มาตรา 40(1))', row: 1, rate: null, pnd: '1ก' },
  // Row 2 — มาตรา 40(2)
  { value: 'commission',  label: 'ค่าธรรมเนียม ค่านายหน้า (มาตรา 40(2))',              row: 2, rate: 3,    pnd: '2'  },
  // Row 3 — มาตรา 40(3)
  { value: 'copyright',   label: 'ค่าแห่งลิขสิทธิ์ (มาตรา 40(3))',                     row: 3, rate: 3,    pnd: '3'  },
  // Row 4 — มาตรา 40(4)
  { value: 'interest',    label: 'ดอกเบี้ย (มาตรา 40(4)(ก))',                          row: 4, rate: 15,   pnd: '2'  },
  { value: 'dividend',    label: 'เงินปันผล (มาตรา 40(4)(ข))',                         row: 4, rate: 10,   pnd: '3'  },
  // Row 5 — มาตรา 3 เตรส → ภ.ง.ด.53
  { value: 'service',     label: 'ค่าบริการ (3%)',                                     row: 5, rate: 3,    pnd: '53' },
  { value: 'contract',    label: 'ค่าจ้างทำของ (3%)',                                   row: 5, rate: 3,    pnd: '53' },
  { value: 'rent',        label: 'ค่าเช่า (5%)',                                       row: 5, rate: 5,    pnd: '53' },
  { value: 'advertising', label: 'ค่าโฆษณา (2%)',                                      row: 5, rate: 2,    pnd: '53' },
  { value: 'transport',   label: 'ค่าขนส่ง (1%)',                                      row: 5, rate: 1,    pnd: '53' },
  // Row 6 — อื่น ๆ
  { value: 'other',       label: 'อื่น ๆ (ระบุ)',                                      row: 6, rate: null, pnd: null },
];

// Mock Data: Contacts (ระยะสั้น — Phase B จะดึงจาก API)
const mockContacts = [
  { id: 1, name: 'นาย ปริญญา เอก',              tax_id: '1100000000001', address: '123 ถ.สุขุมวิท กรุงเทพ' },
  { id: 2, name: 'บริษัท โค้ดดิ้ง สตูดิโอ จำกัด', tax_id: '0105555555552', address: '456 ถ.รัชดาภิเษก กรุงเทพ' },
  { id: 3, name: 'นางสาว สมหญิง สวยงาม',         tax_id: '1100000000003', address: '789 ถ.ลาดพร้าว กรุงเทพ' },
];

export default function WithholdingTaxPage() {
  const [searchTerm, setSearchTerm]           = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);

  const [payerInfo, setPayerInfo] = useState({
    name:    '',
    tax_id:  '',
    address: '',
  });

  const [formData, setFormData] = useState({
    income_type:       '',
    income_label:      '',
    amount_before_tax: '',
    tax_rate:          '',
    date:              dayjs().format('YYYY-MM-DD'),
    issue_date:        dayjs().format('YYYY-MM-DD'),
    doc_number:        '',
    payer_type:        '1',
  });

  const [pdfUrl,   setPdfUrl]   = useState(null);
  const [pdfError, setPdfError] = useState(null);

  const selectedIncomeType = INCOME_TYPES.find(t => t.value === formData.income_type) || null;

  // คำนวณภาษี
  const amountBeforeTaxNum = parseFloat(formData.amount_before_tax) || 0;
  const taxRateNum         = parseFloat(formData.tax_rate) || 0;
  const taxAmountNum       = (amountBeforeTaxNum * taxRateNum) / 100;
  const netAmountNum       = amountBeforeTaxNum - taxAmountNum;

  const filteredContacts = mockContacts.filter(c =>
    c.name.includes(searchTerm) || c.tax_id.includes(searchTerm)
  );

  const handleSelectContact = (contact) => {
    setSelectedContact(contact);
    setSearchTerm(contact.name);
    setShowAutocomplete(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'income_type') {
      const found = INCOME_TYPES.find(t => t.value === value);
      setFormData(prev => ({
        ...prev,
        income_type:  value,
        income_label: found?.label || '',
        tax_rate:     (found?.rate !== null && found?.rate !== undefined)
                        ? String(found.rate)
                        : prev.tax_rate,
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handlePayerChange = (e) => {
    const { name, value } = e.target;
    setPayerInfo(prev => ({ ...prev, [name]: value }));
  };

  const buildRecord = (overrides = {}) => ({
    // Payee
    contact_name: selectedContact?.name || '',
    tax_id:       selectedContact?.tax_id || '',
    address:      selectedContact?.address || '',
    // Payer
    payer_name:    payerInfo.name,
    payer_tax_id:  payerInfo.tax_id,
    payer_address: payerInfo.address,
    // Income
    income_type:       formData.income_type,
    income_label:      formData.income_label,
    income_row:        selectedIncomeType?.row ?? 6,
    pnd_form:          selectedIncomeType?.pnd ?? null,
    amount_before_tax: formData.amount_before_tax,
    tax_rate:          formData.tax_rate,
    tax_amount:        taxAmountNum,
    date:              dayjs(formData.date).format('DD/MM/YYYY'),
    // Document
    issue_date: dayjs(formData.issue_date).format('DD/MM/YYYY'),
    doc_number: formData.doc_number,
    payer_type:  parseInt(formData.payer_type),
    ...overrides,
  });

  const handleDownloadPDF = async () => {
    const record = buildRecord();
    const blob   = await pdf(<TaxCertificatePDF record={record} />).toBlob();
    const url    = URL.createObjectURL(blob);
    const link   = document.createElement('a');
    link.href     = url;
    link.download = `50ทวิ_${record.contact_name}_${dayjs().format('YYYYMMDD')}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Preview record — ใช้ searchTerm แทนชื่อถ้ายังไม่ได้เลือก contact
  const previewRecord = buildRecord({
    contact_name: selectedContact ? selectedContact.name : searchTerm,
  });

  useEffect(() => {
    let isMounted = true;
    let timerId;

    const generatePdf = async () => {
      try {
        setPdfError(null);
        const blob = await pdf(<TaxCertificatePDF record={previewRecord} />).toBlob();
        if (isMounted) setPdfUrl(URL.createObjectURL(blob));
      } catch (err) {
        console.error('PDF Generation Error:', err);
        if (isMounted) setPdfError(err.message || 'Error generating PDF');
      }
    };

    timerId = setTimeout(generatePdf, 400);
    return () => { isMounted = false; clearTimeout(timerId); };
  }, [
    previewRecord.contact_name,
    previewRecord.tax_id,
    previewRecord.address,
    previewRecord.payer_name,
    previewRecord.payer_tax_id,
    previewRecord.payer_address,
    previewRecord.income_type,
    previewRecord.income_label,
    previewRecord.income_row,
    previewRecord.amount_before_tax,
    previewRecord.tax_rate,
    previewRecord.date,
    previewRecord.issue_date,
    previewRecord.doc_number,
    previewRecord.payer_type,
  ]);

  return (
    <div className="withholding-tax-container">
      <div className="tax-header">
        <h1>
          <FileText size={28} className="text-blue-600" />
          ออกหนังสือรับรอง 50 ทวิ
        </h1>
        <div className="header-actions">
          <button className="btn-primary" onClick={handleDownloadPDF}>
            <Download size={18} /> ออกเอกสาร (PDF)
          </button>
        </div>
      </div>

      <div className="tax-content">
        {/* ── Left Form Area ── */}
        <div className="form-card">

          {/* ── ส่วนที่ 1: ผู้มีหน้าที่หักภาษี (Payer) ── */}
          <h2 className="card-title">
            <Building2 size={16} className="inline mr-1" />
            ผู้มีหน้าที่หักภาษี ณ ที่จ่าย
          </h2>

          <div className="form-group">
            <label>ชื่อบริษัท / ชื่อ-นามสกุล</label>
            <input
              type="text" name="name" className="form-control"
              placeholder="ชื่อบริษัท หรือ ชื่อ-นามสกุล"
              value={payerInfo.name} onChange={handlePayerChange}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>เลขประจำตัวผู้เสียภาษี (13 หลัก)</label>
              <input
                type="text" name="tax_id" className="form-control"
                placeholder="0000000000000" maxLength={13}
                value={payerInfo.tax_id} onChange={handlePayerChange}
              />
            </div>
          </div>
          <div className="form-group">
            <label>ที่อยู่</label>
            <input
              type="text" name="address" className="form-control"
              placeholder="ที่อยู่ตามทะเบียน"
              value={payerInfo.address} onChange={handlePayerChange}
            />
          </div>

          {/* ── ส่วนที่ 2: ผู้ถูกหักภาษี (Payee) ── */}
          <h2 className="card-title mt-8 border-t pt-6">
            <Search size={16} className="inline mr-1" />
            ผู้ถูกหักภาษี ณ ที่จ่าย (คู่ค้า)
          </h2>

          <div className="form-group autocomplete-wrapper">
            <label>ค้นหาชื่อ หรือ เลขประจำตัวผู้เสียภาษี 13 หลัก</label>
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={18} />
              <input
                type="text" className="form-control pl-10"
                placeholder="พิมพ์เพื่อค้นหา..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowAutocomplete(true);
                  if (!e.target.value) setSelectedContact(null);
                }}
                onFocus={() => setShowAutocomplete(true)}
              />
              {selectedContact && (
                <CheckCircle className="absolute right-3 top-3 text-green-500" size={18} />
              )}
            </div>

            {showAutocomplete && searchTerm && (
              <div className="autocomplete-dropdown">
                {filteredContacts.length > 0 ? (
                  filteredContacts.map(contact => (
                    <div
                      key={contact.id}
                      className="autocomplete-item"
                      onClick={() => handleSelectContact(contact)}
                    >
                      <span className="contact-name">{contact.name}</span>
                      <span className="contact-taxid">เลขผู้เสียภาษี: {contact.tax_id}</span>
                    </div>
                  ))
                ) : (
                  <div className="autocomplete-item text-gray-500">ไม่พบข้อมูล</div>
                )}
              </div>
            )}
          </div>

          {selectedContact && (
            <div className="bg-gray-50 p-3 rounded-md mb-4 flex justify-between items-center text-sm border border-gray-100">
              <div>
                <p><strong>ชื่อ:</strong> {selectedContact.name}</p>
                <p><strong>เลขประจำตัว:</strong> {selectedContact.tax_id}</p>
                <p><strong>ที่อยู่:</strong> {selectedContact.address}</p>
              </div>
              <button
                className="text-red-500 hover:bg-red-50 p-1 rounded"
                onClick={() => { setSelectedContact(null); setSearchTerm(''); }}
                title="ลบข้อมูลที่เลือก"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* ── ส่วนที่ 3: รายละเอียดการจ่ายเงิน ── */}
          <h2 className="card-title mt-8 border-t pt-6">รายละเอียดการจ่ายเงิน</h2>

          {/* เลขที่ */}
          <div className="form-group">
            <label>เลขที่เอกสาร</label>
            <input
              type="text" name="doc_number" className="form-control"
              placeholder="—"
              value={formData.doc_number} onChange={handleChange}
            />
          </div>

          {/* วันที่จ่าย / วันที่ออกเอกสาร */}
          <div className="form-row">
            <div className="form-group">
              <label>วันที่จ่ายเงิน</label>
              <input type="date" name="date" className="form-control" value={formData.date} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>วันที่ออกเอกสาร</label>
              <input type="date" name="issue_date" className="form-control" value={formData.issue_date} onChange={handleChange} />
            </div>
          </div>

          {/* ประเภทเงินได้ + อัตราภาษี */}
          <div className="form-row">
            <div className="form-group">
              <label>ประเภทเงินได้</label>
              <select name="income_type" className="form-control" value={formData.income_type} onChange={handleChange}>
                <option value="">-- เลือกประเภท --</option>
                <optgroup label="มาตรา 40(1)">
                  <option value="salary">เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส</option>
                </optgroup>
                <optgroup label="มาตรา 40(2)">
                  <option value="commission">ค่าธรรมเนียม ค่านายหน้า</option>
                </optgroup>
                <optgroup label="มาตรา 40(3)">
                  <option value="copyright">ค่าแห่งลิขสิทธิ์</option>
                </optgroup>
                <optgroup label="มาตรา 40(4)">
                  <option value="interest">ดอกเบี้ย (15%)</option>
                  <option value="dividend">เงินปันผล (10%)</option>
                </optgroup>
                <optgroup label="มาตรา 3 เตรส — ภ.ง.ด.53">
                  <option value="service">ค่าบริการ (3%)</option>
                  <option value="contract">ค่าจ้างทำของ (3%)</option>
                  <option value="rent">ค่าเช่า (5%)</option>
                  <option value="advertising">ค่าโฆษณา (2%)</option>
                  <option value="transport">ค่าขนส่ง (1%)</option>
                </optgroup>
                <optgroup label="อื่น ๆ">
                  <option value="other">อื่น ๆ (ระบุเอง)</option>
                </optgroup>
              </select>
            </div>
            <div className="form-group">
              <label>หักภาษี (%)</label>
              <input
                type="number" name="tax_rate" className="form-control"
                placeholder="เช่น 3"
                value={formData.tax_rate} onChange={handleChange}
              />
            </div>
          </div>

          {/* ช่องระบุ อื่น ๆ */}
          {formData.income_type === 'other' && (
            <div className="form-group">
              <label>ระบุประเภทเงินได้ (อื่น ๆ)</label>
              <input
                type="text" name="income_label" className="form-control"
                placeholder="ระบุรายละเอียด..."
                value={formData.income_label} onChange={handleChange}
              />
            </div>
          )}

          {/* แสดง Row + ภ.ง.ด. ที่จะใช้ */}
          {selectedIncomeType && (
            <div className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded px-3 py-1.5 -mt-2 mb-3">
              ลงใน <strong>แถวที่ {selectedIncomeType.row}</strong> ของแบบฟอร์ม
              &nbsp;|&nbsp; ยื่นแบบ <strong>ภ.ง.ด.{selectedIncomeType.pnd || '—'}</strong>
            </div>
          )}

          {/* จำนวนเงิน */}
          <div className="form-group">
            <label>จำนวนเงินก่อนหักภาษี (บาท)</label>
            <input
              type="number" name="amount_before_tax"
              className="form-control text-lg font-semibold"
              placeholder="0.00"
              value={formData.amount_before_tax} onChange={handleChange}
            />
          </div>

          {/* ประเภทผู้จ่ายเงิน */}
          <div className="form-group">
            <label>ผู้จ่ายเงิน</label>
            <div className="flex flex-wrap gap-4 mt-1">
              {[
                { v: '1', label: '(1) หัก ณ ที่จ่าย' },
                { v: '2', label: '(2) ออกให้ตลอดไป' },
                { v: '3', label: '(3) ออกให้ครั้งเดียว' },
              ].map(opt => (
                <label key={opt.v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio" name="payer_type" value={opt.v}
                    checked={formData.payer_type === opt.v}
                    onChange={handleChange}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* สรุปยอดเงิน */}
          <div className="summary-box">
            <div className="summary-row">
              <span>ยอดก่อนภาษี:</span>
              <span>{amountBeforeTaxNum.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</span>
            </div>
            <div className="summary-row">
              <span>ภาษีหัก ณ ที่จ่าย ({formData.tax_rate || 0}%):</span>
              <span className="text-red-600">
                - {taxAmountNum.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
              </span>
            </div>
            <div className="summary-row total">
              <span>ยอดจ่ายสุทธิ:</span>
              <span>{netAmountNum.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</span>
            </div>
          </div>

        </div>

        {/* ── Right Preview Area ── */}
        <div className="preview-card">
          <h2 className="card-title">Live Preview (หน้าตาเอกสาร)</h2>
          <div className="preview-container">
            {pdfError ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ef4444', padding: '20px', textAlign: 'center' }}>
                <p className="font-bold mb-2">เกิดข้อผิดพลาดในการสร้าง PDF</p>
                <p className="text-sm">{pdfError}</p>
              </div>
            ) : pdfUrl ? (
              <iframe src={`${pdfUrl}#toolbar=0`} className="pdf-viewer" title="PDF Preview" />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6b7280' }}>
                กำลังสร้างเอกสาร...
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
