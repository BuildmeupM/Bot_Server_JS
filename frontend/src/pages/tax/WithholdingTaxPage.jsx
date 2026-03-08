import React, { useState, useEffect } from 'react';
import { FileText, Download, X, Search, CheckCircle } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import dayjs from 'dayjs';
import TaxCertificatePDF from '../../components/tax/TaxCertificatePDF';
import './WithholdingTaxPage.css';

// Mock Data: Contacts
const mockContacts = [
  { id: 1, name: 'นาย ปริญญา เอก', tax_id: '1100000000001', address: '123 ถ.สุขุมวิท กรุงเทพ', default_rate: 3, default_income_type: 'ค่าบริการ' },
  { id: 2, name: 'บริษัท โค้ดดิ้ง สตูดิโอ จำกัด', tax_id: '0105555555552', address: '456 ถ.รัชดาภิเษก กรุงเทพ', default_rate: 3, default_income_type: 'ค่าบริการ' },
  { id: 3, name: 'นางสาว สมหญิง สวยงาม', tax_id: '1100000000003', address: '789 ถ.ลาดพร้าว กรุงเทพ', default_rate: 5, default_income_type: 'ค่าเช่า' },
];

export default function WithholdingTaxPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  
  const [formData, setFormData] = useState({
    income_type: '',
    amount_before_tax: '',
    tax_rate: '',
    date: dayjs().format('YYYY-MM-DD'),
  });
  
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfError, setPdfError] = useState(null);

  // Calculate taxes
  const amountBeforeTaxNum = parseFloat(formData.amount_before_tax) || 0;
  const taxRateNum = parseFloat(formData.tax_rate) || 0;
  const taxAmountNum = (amountBeforeTaxNum * taxRateNum) / 100;
  const netAmountNum = amountBeforeTaxNum - taxAmountNum;

  const filteredContacts = mockContacts.filter(c => 
    c.name.includes(searchTerm) || c.tax_id.includes(searchTerm)
  );

  const handleSelectContact = (contact) => {
    setSelectedContact(contact);
    setSearchTerm(contact.name);
    setShowAutocomplete(false);
    
    // Auto populate defaults
    setFormData(prev => ({
      ...prev,
      income_type: contact.default_income_type || '',
      tax_rate: contact.default_rate || '',
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleDownloadPDF = async () => {
    const record = {
      contact_name: selectedContact?.name || '',
      tax_id: selectedContact?.tax_id || '',
      address: selectedContact?.address || '',
      income_type: formData.income_type,
      amount_before_tax: formData.amount_before_tax,
      tax_rate: formData.tax_rate,
      tax_amount: taxAmountNum,
      date: formData.date
    };

    const blob = await pdf(<TaxCertificatePDF record={record} />).toBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `50ทวิ_${record.contact_name}_${dayjs().format('YYYYMMDD')}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Prepare data for live preview
  const previewRecord = {
    contact_name: selectedContact ? selectedContact.name : searchTerm,
    tax_id: selectedContact?.tax_id || '',
    address: selectedContact?.address || '',
    income_type: formData.income_type,
    amount_before_tax: formData.amount_before_tax,
    tax_rate: formData.tax_rate,
    tax_amount: taxAmountNum,
    date: dayjs(formData.date).format('DD/MM/YYYY')
  };

  useEffect(() => {
    let isMounted = true;
    let timerId;

    const generatePdf = async () => {
      try {
        setPdfError(null);
        const blob = await pdf(<TaxCertificatePDF record={previewRecord} />).toBlob();
        if (isMounted) {
          const url = URL.createObjectURL(blob);
          setPdfUrl(url);
        }
      } catch (err) {
        console.error('PDF Generation Error:', err);
        if (isMounted) {
            setPdfError(err.message || 'Error generating PDF');
        }
      }
    };

    // Debounce generation to avoid lag while typing
    timerId = setTimeout(() => {
      generatePdf();
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(timerId);
    };
  }, [
    previewRecord.contact_name,
    previewRecord.tax_id,
    previewRecord.address,
    previewRecord.income_type,
    previewRecord.amount_before_tax,
    previewRecord.tax_rate,
    previewRecord.date
  ]);

  return (
    <div className="withholding-tax-container">
      <div className="tax-header">
        <h1>
          <FileText size={28} className="text-blue-600" />
          ออกหนังสือรับรอง 50 ทวิ (Mockup)
        </h1>
        <div className="header-actions">
          <button className="btn-primary" onClick={handleDownloadPDF}>
            <Download size={18} /> ออกเอกสาร (PDF)
          </button>
        </div>
      </div>

      <div className="tax-content">
        {/* Left Form Area */}
        <div className="form-card">
          <h2 className="card-title">ข้อมูลผู้รับเงิน (คู่ค้า)</h2>
          
          <div className="form-group autocomplete-wrapper">
            <label>ค้นหาชื่อ หรือ เลขประจำตัวผู้เสียภาษี 13 หลัก</label>
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={18} />
              <input 
                type="text" 
                className="form-control pl-10" 
                placeholder="พิมพ์เพื่อค้นหา..." 
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowAutocomplete(true);
                  if(!e.target.value) setSelectedContact(null);
                }}
                onFocus={() => setShowAutocomplete(true)}
              />
              {selectedContact && (
                <CheckCircle className="absolute right-3 top-3 text-green-500" size={18} />
              )}
            </div>

            {/* Autocomplete Dropdown */}
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
                      <span className="contact-taxid">เลขผู้เสียภาษี: {contact.tax_id} | อัตราประจำ: {contact.default_rate}%</span>
                    </div>
                  ))
                ) : (
                  <div className="autocomplete-item text-gray-500">ไม่พบข้อมูล (พิมพ์เพื่อสร้างใหม่)</div>
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

          <h2 className="card-title mt-8 border-t pt-6">รายละเอียดการจ่ายเงิน</h2>
          <div className="form-row">
            <div className="form-group">
              <label>วันที่จ่ายเงิน</label>
              <input type="date" name="date" className="form-control" value={formData.date} onChange={handleChange} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>ประเภทเงินได้</label>
              <select name="income_type" className="form-control" value={formData.income_type} onChange={handleChange}>
                <option value="">-- เลือกประเภท --</option>
                <option value="ค่าบริการ">ค่าบริการ (3%)</option>
                <option value="ค่าจ้างทำของ">ค่าจ้างทำของ (3%)</option>
                <option value="ค่าขนส่ง">ค่าขนส่ง (1%)</option>
                <option value="ค่าเช่า">ค่าเช่า (5%)</option>
                <option value="ค่าโฆษณา">ค่าโฆษณา (2%)</option>
              </select>
            </div>
            <div className="form-group">
              <label>หักภาษี (%)</label>
              <input type="number" name="tax_rate" className="form-control" placeholder="เช่น 3" value={formData.tax_rate} onChange={handleChange} />
            </div>
          </div>

          <div className="form-group">
            <label>จำนวนเงินก่อนหักภาษี (บาท)</label>
            <input type="number" name="amount_before_tax" className="form-control text-lg font-semibold" placeholder="0.00" value={formData.amount_before_tax} onChange={handleChange} />
          </div>

          {/* สรุปยอดเงิน */}
          <div className="summary-box">
            <div className="summary-row">
              <span>ยอดก่อนภาษี:</span>
              <span>{amountBeforeTaxNum.toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท</span>
            </div>
            <div className="summary-row">
              <span>ภาษีหัก ณ ที่จ่าย ({formData.tax_rate || 0}%):</span>
              <span className="text-red-600">- {taxAmountNum.toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท</span>
            </div>
            <div className="summary-row total">
              <span>ยอดจ่ายสุทธิ:</span>
              <span>{netAmountNum.toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท</span>
            </div>
          </div>

        </div>

        {/* Right Preview Area */}
        <div className="preview-card">
          <h2 className="card-title">Live Preview (หน้าตาเอกสาร)</h2>
          <div className="preview-container">
            {pdfError ? (
               <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ef4444', padding: '20px', textAlign: 'center' }}>
                 <p className="font-bold mb-2">เกิดข้อผิดพลาดในการสร้าง PDF</p>
                 <p className="text-sm">{pdfError}</p>
               </div>
            ) : pdfUrl ? (
              <iframe 
                src={`${pdfUrl}#toolbar=0`} 
                className="pdf-viewer" 
                title="PDF Preview" 
              />
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
