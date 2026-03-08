// ── A.K.F Reader Page — หน้าหลักระบบอ่านไฟล์ A.K.F ──
// อ่านไฟล์ PDF ใบกำกับภาษี ดึงข้อมูลสำคัญอัตโนมัติด้วย pdfjs-dist
import { useState, useCallback, useRef, useEffect } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import Sidebar from '../../components/Sidebar'
import FileUploadZone from './FileUploadZone'
import ProcessingStatus from './ProcessingStatus'
import ResultCard from './ResultCard'
import PdfPreview from './PdfPreview'
import ExportExcelModal from './ExportExcelModal'
import { exportToExcel } from './exportExcel'
import SummarySection from './SummarySection'

// ตั้งค่า PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

// ══════════════════════════════════════════
// Regex Patterns สำหรับดึงข้อมูลจาก PDF
// (ตามเอกสาร pdf_read_system_overview.md)
// ══════════════════════════════════════════
const PATTERNS = {
    docNumber: [
        /เลขที่ใบ(?:กำกับ|กํากับ)ภาษี[:\s]*([A-Z0-9\-]+)/i,
        /(?:Invoice|Tax Invoice)\s*(?:No\.?|#)\s*[:\s]*([A-Z0-9\-]+)/i,
        /เลขที่เอกสาร[:\s]*([A-Z0-9\-]+)/i,
        /No\.\s*([A-Z]{2,3}\d{6,})/i,
    ],
    orderNumber: [
        /เลขที่คำสั่งซื้อ[:\s]*([A-Z0-9\-]+)/i,
        /(?:Order|PO)\s*(?:No\.?|#)\s*[:\s]*([A-Z0-9\-]+)/i,
    ],
    date: [
        /วันที่[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/,
        /Date[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    ],
    preVat: [
        /รวมเงิน(?:สุทธิ)?(?:สินค้า)?(?:ที่)?เสียภาษี[\s\/]*(?:Pre[- ]?VAT\s*Amount)?[\s:]*([\d,]+\.?\d*)/i,
        /Pre[- ]?VAT\s*(?:Amount)?[\s:]*([\d,]+\.?\d*)/i,
        /(?:มูลค่า(?:ก่อน|สินค้า)(?:ภาษี)?|ราคาก่อน\s*(?:VAT|ภาษี))[:\s]*([\d,]+\.?\d*)/i,
        /(?:Amount before|Subtotal before)\s*(?:VAT|Tax)[:\s]*([\d,]+\.?\d*)/i,
        /มูลค่าสินค้า[:\s]*([\d,]+\.?\d*)/i,
    ],
    vat: [
        /(?:ภาษีมูลค่าเพิ่ม|VAT)\s*(?:7\s*%)?[:\s]*([\d,]+\.?\d*)/i,
        /(?:Tax|VAT)\s*(?:Amount)?[:\s]*([\d,]+\.?\d*)/i,
    ],
    grandTotal: [
        /(?:จำนวนเงินรวมทั้งสิ้น|ยอดรวมทั้งสิ้น|Grand\s*Total|จำนวน(?:เงิน)?รวม(?:สุทธิ)?)[:\s]*([\d,]+\.?\d*)/i,
        /(?:Total\s*(?:Amount)?|NET\s*TOTAL)[:\s]*([\d,]+\.?\d*)/i,
    ],
    subTotal: [
        /Sub\s*Total[:\s]*([\d,]+\.?\d*)/i,
        /รวมเงิน[:\s]*([\d,]+\.?\d*)/i,
    ],
    discount: [
        /(?:ส่วนลด|Discount)[:\s]*([\d,]+\.?\d*)/i,
    ],
    issuer: [
        /(?:บริษัท\s+.+?(?:จำกัด|จํากัด)(?:\s*\(มหาชน\))?)/,
    ],
    taxId: [
        /(?:เลขประจำตัวผู้เสียภาษี|Tax\s*ID|TIN)[:\s]*(\d{13})/i,
        /(\d{1}\s*\d{4}\s*\d{5}\s*\d{2}\s*\d{1})/,
    ],
    customer: [
        /(?:ลูกค้า|Customer|นาม(?:ผู้ซื้อ)?)[:\s/]*(.+?)(?:\n|$)/i,
    ],
}

// ดึงข้อมูลจากข้อความ PDF
function extractData(text) {
    const result = {}
    for (const [key, patterns] of Object.entries(PATTERNS)) {
        for (const pattern of patterns) {
            const match = text.match(pattern)
            if (match) {
                // สำหรับ issuer ใช้ full match, อื่นๆ ใช้ capture group 1
                result[key] = key === 'issuer' ? match[0].trim() : (match[1] || '').trim()
                break
            }
        }
        if (!result[key]) result[key] = ''
    }
    return result
}

// คำนวณ Confidence Score จาก 5 ฟิลด์สำคัญ
function calcConfidence(data) {
    const criticalFields = ['docNumber', 'date', 'preVat', 'vat', 'grandTotal']
    const found = criticalFields.filter(f => data[f] && data[f] !== '-' && data[f].length > 0)
    return Math.round((found.length / criticalFields.length) * 100)
}

// อ่านข้อความจาก PDF ด้วย pdfjs-dist (ทีละหน้า)
async function readPdfText(file) {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const pages = []

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        // เรียงข้อความตามตำแหน่ง Y (บนลงล่าง) แล้ว X (ซ้ายไปขวา)
        const items = textContent.items
            .filter(item => item.str.trim().length > 0)
            .sort((a, b) => {
                const yDiff = b.transform[5] - a.transform[5] // Y สูง = ด้านบน
                if (Math.abs(yDiff) > 5) return yDiff
                return a.transform[4] - b.transform[4] // X น้อย = ซ้าย
            })

        // ประกอบข้อความ
        let pageText = ''
        let lastY = null
        for (const item of items) {
            const y = Math.round(item.transform[5])
            if (lastY !== null && Math.abs(y - lastY) > 5) {
                pageText += '\n'
            } else if (lastY !== null) {
                pageText += ' '
            }
            pageText += item.str
            lastY = y
        }

        pages.push({
            pageNum: i,
            text: pageText.trim(),
            itemCount: items.length,
        })
    }

    return { totalPages: pdf.numPages, pages }
}

// ── Styles ──
const S = {
    rawTextContainer: {
        marginTop: 16,
    },
    rawTextToggle: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        background: '#f8f9fb',
        border: '1px solid #e8ecf1',
        borderRadius: 10,
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
        color: '#6b7280',
        transition: 'all 0.2s',
        width: '100%',
        fontFamily: 'Inter, sans-serif',
        textAlign: 'left',
    },
    rawTextBox: {
        marginTop: 8,
        padding: '16px',
        background: '#1e1e2d',
        borderRadius: 12,
        color: '#e2e8f0',
        fontSize: 12,
        fontFamily: "'Fira Code', 'Consolas', monospace",
        lineHeight: 1.8,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxHeight: 400,
        overflowY: 'auto',
        border: '1px solid #2d2d3f',
    },
    pageHeader: {
        color: '#f97316',
        fontWeight: 700,
        fontSize: 12,
        marginBottom: 4,
        display: 'block',
    },
    pageDivider: {
        borderTop: '1px dashed #3d3d50',
        margin: '12px 0',
    },
    highlightedText: {
        background: 'rgba(249,115,22,0.2)',
        color: '#fb923c',
        borderRadius: 3,
        padding: '0 3px',
    },
}

// ── Hero SVG Component ──
function AkmHeroSVG({ size = 160 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="100" cy="100" r="90" fill="#fff7ed" opacity="0.6" />
            <circle cx="100" cy="100" r="70" fill="#ffedd5" opacity="0.5" />
            <rect x="55" y="30" width="90" height="115" rx="8" fill="white" stroke="#f97316" strokeWidth="3" />
            <rect x="55" y="30" width="90" height="28" rx="8" fill="#f97316" />
            <rect x="55" y="50" width="90" height="8" fill="#f97316" />
            <text x="100" y="48" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="Inter">PDF</text>
            <rect x="68" y="72" width="64" height="4" rx="2" fill="#fed7aa" />
            <rect x="68" y="82" width="50" height="4" rx="2" fill="#fed7aa" />
            <rect x="68" y="92" width="58" height="4" rx="2" fill="#fed7aa" />
            <rect x="68" y="102" width="40" height="4" rx="2" fill="#fed7aa" />
            <rect x="68" y="112" width="55" height="4" rx="2" fill="#fed7aa" />
            <rect x="68" y="122" width="45" height="4" rx="2" fill="#fed7aa" />
            <circle cx="145" cy="135" r="24" fill="white" stroke="#f97316" strokeWidth="3" />
            <circle cx="145" cy="135" r="15" fill="#fff7ed" />
            <line x1="162" y1="152" x2="178" y2="168" stroke="#f97316" strokeWidth="4" strokeLinecap="round" />
            <circle cx="60" cy="160" r="18" fill="#22c55e" opacity="0.15" />
            <path d="M50 160 L57 167 L70 153" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

// ── Raw Text Viewer Component ──
function RawTextViewer({ rawPages }) {
    const [isOpen, setIsOpen] = useState(false)

    if (!rawPages || rawPages.length === 0) return null

    return (
        <div style={S.rawTextContainer}>
            <button style={S.rawTextToggle} onClick={() => setIsOpen(!isOpen)}>
                <span>{isOpen ? '🔽' : '▶️'}</span>
                <span>📝 ข้อความดิบที่อ่านได้จาก PDF ({rawPages.length} หน้า)</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8b8fa3' }}>
                    {rawPages.reduce((sum, p) => sum + p.text.length, 0).toLocaleString()} ตัวอักษร
                </span>
            </button>
            {isOpen && (
                <div style={S.rawTextBox}>
                    {rawPages.map((page, i) => (
                        <div key={page.pageNum}>
                            {i > 0 && <div style={S.pageDivider} />}
                            <span style={S.pageHeader}>
                                ═══ หน้า {page.pageNum} ({page.itemCount} ชิ้นข้อความ) ═══
                            </span>
                            {page.text || '(ไม่พบข้อความในหน้านี้)'}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default function AkmReaderPage() {
    const [files, setFiles] = useState([])
    const [results, setResults] = useState([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [processStatus, setProcessStatus] = useState({
        total: 0, processed: 0, success: 0, failed: 0, currentStep: 'upload',
    })
    const [filter, setFilter] = useState('all')
    const [errors, setErrors] = useState([])
    const [selectedResult, setSelectedResult] = useState(null)
    const [previewWidth, setPreviewWidth] = useState(420)
    const [showExportModal, setShowExportModal] = useState(false)
    const isDragging = useRef(false)
    const dragStartX = useRef(0)
    const dragStartW = useRef(420)

    // ── Drag to resize preview column ──
    const onDragStart = useCallback((e) => {
        e.preventDefault()
        isDragging.current = true
        dragStartX.current = e.clientX
        dragStartW.current = previewWidth
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }, [previewWidth])

    useEffect(() => {
        const onMove = (e) => {
            if (!isDragging.current) return
            const diff = dragStartX.current - e.clientX
            const newW = Math.max(300, Math.min(800, dragStartW.current + diff))
            setPreviewWidth(newW)
        }
        const onUp = () => {
            if (!isDragging.current) return
            isDragging.current = false
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
    }, [])

    // ═══════════════════════════════════════
    // ประมวลผล PDF จริง ด้วย pdfjs-dist
    // แยกทีละหน้า = 1 ใบกำกับภาษี
    // แล้วรวมหน้าที่มีเลขเอกสารเดียวกัน
    // ═══════════════════════════════════════
    const startProcessing = useCallback(async () => {
        if (files.length === 0) return
        setIsProcessing(true)
        setResults([])
        setErrors([])

        const allPageResults = [] // ผลลัพธ์ทีละหน้า
        const allErrors = []
        let totalPages = 0

        // ═══ ขั้นตอนที่ 2: อ่าน PDF ═══
        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            try {
                setProcessStatus({
                    total: 0, processed: 0, success: 0, failed: 0,
                    currentStep: 'reading',
                })

                const pdfData = await readPdfText(file)
                totalPages += pdfData.totalPages

                // อัพเดท total ทันทีที่รู้จำนวนหน้า
                setProcessStatus(prev => ({
                    ...prev, total: totalPages, currentStep: 'extracting',
                }))

                // ═══ ขั้นตอนที่ 3: ดึงข้อมูลทีละหน้า ═══
                for (let p = 0; p < pdfData.pages.length; p++) {
                    const pageData = pdfData.pages[p]

                    setProcessStatus(prev => ({
                        ...prev,
                        currentStep: 'extracting',
                        processed: allPageResults.length,
                    }))

                    // ดึงข้อมูลจากหน้านี้
                    const extractedData = extractData(pageData.text)
                    const confidence = calcConfidence(extractedData)

                    allPageResults.push({
                        ...extractedData,
                        confidence,
                        mergedPages: 0,
                        fileName: file.name,
                        pageNum: pageData.pageNum,
                        pages: `${pageData.pageNum}`,
                        rawPages: [pageData],
                        rawFullText: pageData.text,
                    })
                }
            } catch (err) {
                console.error(`❌ อ่านไฟล์ ${file.name} ล้มเหลว:`, err)
                allErrors.push({ fileName: file.name, error: err.message || 'ไม่สามารถอ่าน PDF ได้' })
            }
        }

        // ═══ ขั้นตอนที่ 5: รวมหน้าที่มีเลขเอกสารเดียวกัน ═══
        setProcessStatus(prev => ({
            ...prev, currentStep: 'merging', processed: allPageResults.length,
        }))

        const mergedMap = new Map() // docNumber → merged result
        const noDocResults = [] // หน้าที่ไม่มีเลขเอกสาร

        for (const page of allPageResults) {
            const docNum = page.docNumber?.trim()
            if (!docNum) {
                // ไม่มีเลขเอกสาร → แยกเป็นรายการเดี่ยว
                noDocResults.push(page)
                continue
            }

            if (mergedMap.has(docNum)) {
                // รวมเข้ากับเอกสารที่มีเลขเดียวกัน
                const existing = mergedMap.get(docNum)
                existing.mergedPages += 1
                existing.rawPages = [...existing.rawPages, ...page.rawPages]
                existing.rawFullText += '\n\n' + page.rawFullText
                existing.pages += `, ${page.pages}`

                // อัพเดทฟิลด์ที่ว่าง ด้วยข้อมูลจากหน้าใหม่
                for (const key of Object.keys(PATTERNS)) {
                    if ((!existing[key] || existing[key] === '') && page[key]) {
                        existing[key] = page[key]
                    }
                }
                // คำนวณ confidence ใหม่หลังรวม
                existing.confidence = calcConfidence(existing)
            } else {
                mergedMap.set(docNum, { ...page, mergedPages: 1 })
            }
        }

        // รวมผลลัพธ์ทั้งหมด (มีเลข + ไม่มีเลข) แล้วใส่ id
        const finalResults = [...mergedMap.values(), ...noDocResults]
            .map((r, i) => ({ ...r, id: i + 1 }))

        const successCount = finalResults.length
        const failCount = allErrors.length

        // เสร็จสิ้น
        setProcessStatus({
            total: totalPages,
            processed: totalPages,
            success: successCount,
            failed: failCount,
            currentStep: 'done',
        })
        setResults(finalResults)
        setErrors(allErrors)
        setIsProcessing(false)
    }, [files])

    // อัพเดทผลลัพธ์เมื่อแก้ไข
    const handleUpdateResult = (updatedData) => {
        setResults(prev => prev.map(r => r.id === updatedData.id ? updatedData : r))
    }

    // ส่งออก Excel
    const handleExportConfirm = (customerName, paymentMethod) => {
        exportToExcel(results, customerName, paymentMethod)
        setShowExportModal(false)
    }

    // กรองผลลัพธ์
    const filteredResults = results.filter(r => {
        if (filter === 'high') return r.confidence >= 100
        if (filter === 'low') return r.confidence < 100
        return true
    })

    // สถิติ
    const stats = {
        total: results.length,
        perfect: results.filter(r => r.confidence >= 100).length,
        warning: results.filter(r => r.confidence < 100 && r.confidence >= 60).length,
        error: results.filter(r => r.confidence < 60).length,
    }

    return (
        <div className="app-layout">
            <Sidebar active="akm-reader" />
            <main className="main-content">
                {/* ══════ HERO SECTION ══════ */}
                <div className="bot-hero animate-in">
                    <div className="bot-hero-content">
                        <div className="bot-hero-badge">📖 A.K.F File Reader</div>
                        <h1 className="bot-hero-title">ระบบอ่านไฟล์ A.K.F</h1>
                        <p className="bot-hero-desc">
                            อ่านไฟล์ PDF ใบกำกับภาษีอัตโนมัติ — ดึงข้อมูลสำคัญ เช่น เลขที่เอกสาร
                            วันที่ ยอดเงิน VAT โดยไม่ต้องพิมพ์เอง ลดเวลาทำงาน 80-90%
                        </p>
                        <div className="bot-hero-actions">
                            <button
                                className="bot-hero-btn primary"
                                disabled={files.length === 0 || isProcessing}
                                onClick={startProcessing}
                            >
                                <span>🔍</span> {isProcessing ? 'กำลังประมวลผล...' : 'เริ่มอ่านเอกสาร'}
                            </button>
                            {results.length > 0 && (
                                <button
                                    className="bot-hero-btn primary"
                                    onClick={() => setShowExportModal(true)}
                                    style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)' }}
                                >
                                    <span>📊</span> ส่งออก Excel
                                </button>
                            )}
                            <button className="bot-hero-btn secondary" onClick={() => {
                                setFiles([])
                                setResults([])
                                setErrors([])
                                setProcessStatus({ total: 0, processed: 0, success: 0, failed: 0, currentStep: 'upload' })
                            }}>
                                <span>🔄</span> เริ่มใหม่
                            </button>
                        </div>
                    </div>
                    <div className="bot-hero-visual">
                        <div className="bot-hero-robot-wrap">
                            <AkmHeroSVG size={160} />
                            <div className="bot-hero-glow"></div>
                        </div>
                    </div>
                    <div className="bot-hero-circle c1"></div>
                    <div className="bot-hero-circle c2"></div>
                    <div className="bot-hero-circle c3"></div>
                </div>

                {/* ══════ สถิติ ══════ */}
                {results.length > 0 && (
                    <div className="bot-stats-grid animate-in" style={{ animationDelay: '.1s' }}>
                        <div className="bot-stat-card">
                            <div className="bot-stat-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}>📄</div>
                            <div className="bot-stat-info">
                                <div className="bot-stat-value">{stats.total}</div>
                                <div className="bot-stat-label">เอกสารทั้งหมด</div>
                            </div>
                        </div>
                        <div className="bot-stat-card">
                            <div className="bot-stat-icon" style={{ background: '#f0fdf4', color: '#22c55e' }}>✅</div>
                            <div className="bot-stat-info">
                                <div className="bot-stat-value">{stats.perfect}</div>
                                <div className="bot-stat-label">แม่นยำ 100%</div>
                            </div>
                        </div>
                        <div className="bot-stat-card">
                            <div className="bot-stat-icon" style={{ background: '#fffbeb', color: '#f59e0b' }}>⚠️</div>
                            <div className="bot-stat-info">
                                <div className="bot-stat-value">{stats.warning}</div>
                                <div className="bot-stat-label">ต้องตรวจสอบ</div>
                            </div>
                        </div>
                        <div className="bot-stat-card">
                            <div className="bot-stat-icon" style={{ background: '#fef2f2', color: '#ef4444' }}>🔴</div>
                            <div className="bot-stat-info">
                                <div className="bot-stat-value">{stats.error}</div>
                                <div className="bot-stat-label">ต้องแก้ไข</div>
                            </div>
                        </div>
                    </div>
                )}


                {/* ══════ ขั้นตอนที่ 1: อัพโหลดไฟล์ ══════ */}
                <div className="animate-in" style={{ animationDelay: '.15s' }}>
                    <h2 style={{
                        fontSize: 16, fontWeight: 700, marginBottom: 16,
                        display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                        <span style={{
                            width: 28, height: 28, background: 'linear-gradient(135deg, #f97316, #fb923c)',
                            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, color: '#fff',
                        }}>1</span>
                        เลือกไฟล์ PDF
                    </h2>
                    <FileUploadZone files={files} onFilesChange={setFiles} />
                </div>

                {/* ══════ สรุปยอดรวม ══════ */}
                {results.length > 0 && (
                    <div className="animate-in" style={{ animationDelay: '.17s' }}>
                        <SummarySection results={results} />
                    </div>
                )}

                {/* ══════ สถานะการประมวลผล ══════ */}
                {processStatus.total > 0 && (
                    <div className="animate-in" style={{ animationDelay: '.2s' }}>
                        <h2 style={{
                            fontSize: 16, fontWeight: 700, marginBottom: 16,
                            display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                            <span style={{
                                width: 28, height: 28, background: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
                                borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 14, color: '#fff',
                            }}>2</span>
                            สถานะการประมวลผล
                        </h2>
                        <ProcessingStatus {...processStatus} />
                    </div>
                )}

                {/* ══════ Errors ══════ */}
                {errors.length > 0 && (
                    <div className="animate-in" style={{ animationDelay: '.22s' }}>
                        <div style={{
                            background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12,
                            padding: '14px 20px', marginBottom: 20
                        }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>
                                ❌ ไฟล์ที่อ่านไม่ได้ ({errors.length} ไฟล์)
                            </div>
                            {errors.map((err, i) => (
                                <div key={i} style={{ fontSize: 13, color: '#7f1d1d', marginBottom: 4 }}>
                                    • <strong>{err.fileName}</strong>: {err.error}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ══════ ผลลัพธ์ ══════ */}
                {results.length > 0 && (
                    <div className="animate-in" style={{ animationDelay: '.25s' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            marginBottom: 16, flexWrap: 'wrap', gap: 12,
                        }}>
                            <h2 style={{
                                fontSize: 16, fontWeight: 700,
                                display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                                <span style={{
                                    width: 28, height: 28, background: 'linear-gradient(135deg, #22c55e, #4ade80)',
                                    borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 14, color: '#fff',
                                }}>3</span>
                                ผลลัพธ์การอ่าน ({filteredResults.length} เอกสาร)
                            </h2>

                            {/* ตัวกรอง */}
                            <div style={{ display: 'flex', gap: 6 }}>
                                {[
                                    { key: 'all', label: 'ทั้งหมด', count: stats.total },
                                    { key: 'high', label: '🟢 แม่นยำ', count: stats.perfect },
                                    { key: 'low', label: '🟡 ต้องตรวจสอบ', count: stats.warning + stats.error },
                                ].map(f => (
                                    <button
                                        key={f.key}
                                        onClick={() => setFilter(f.key)}
                                        style={{
                                            padding: '6px 14px',
                                            border: `1.5px solid ${filter === f.key ? '#f97316' : '#e8ecf1'}`,
                                            borderRadius: 8,
                                            background: filter === f.key ? '#fff7ed' : '#fff',
                                            color: filter === f.key ? '#f97316' : '#6b7280',
                                            fontSize: 12,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            fontFamily: 'Inter, sans-serif',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {f.label} ({f.count})
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ═══ Split View: Result Cards + Resizable PDF Preview ═══ */}
                        <div style={{
                            display: 'flex',
                            gap: 0,
                            alignItems: 'flex-start',
                        }}>
                            {/* ── ซ้าย: รายการ ResultCard ── */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                {filteredResults.map(result => (
                                    <div
                                        key={result.id}
                                        onClick={() => setSelectedResult(result)}
                                        style={{
                                            cursor: 'pointer',
                                            borderRadius: 16,
                                            outline: selectedResult?.id === result.id
                                                ? '2.5px solid #f97316' : '2.5px solid transparent',
                                            outlineOffset: 2,
                                            transition: 'outline 0.15s',
                                        }}
                                    >
                                        <ResultCard
                                            data={result}
                                            onUpdate={handleUpdateResult}
                                        />
                                        <RawTextViewer rawPages={result.rawPages} />
                                        <div style={{ height: 16 }} />
                                    </div>
                                ))}

                                {filteredResults.length === 0 && (
                                    <div style={{
                                        textAlign: 'center', padding: '48px 20px',
                                        background: '#fff', borderRadius: 16, border: '1px solid #e8ecf1',
                                    }}>
                                        <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>🔍</div>
                                        <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280' }}>
                                            ไม่พบเอกสารในตัวกรองนี้
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── ขวา: Drag Handle + PDF Preview ── */}
                            {selectedResult && (
                                <>
                                    {/* Drag Handle */}
                                    <div
                                        onMouseDown={onDragStart}
                                        style={{
                                            width: 8,
                                            cursor: 'col-resize',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            position: 'sticky',
                                            top: 28,
                                            alignSelf: 'stretch',
                                            minHeight: 400,
                                            zIndex: 2,
                                        }}
                                    >
                                        <div style={{
                                            width: 4,
                                            height: 40,
                                            borderRadius: 4,
                                            background: '#d1d5db',
                                            transition: 'background 0.15s, height 0.15s',
                                        }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.background = '#f97316'
                                                e.currentTarget.style.height = '60px'
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.background = '#d1d5db'
                                                e.currentTarget.style.height = '40px'
                                            }}
                                        />
                                    </div>

                                    {/* Preview Column */}
                                    <div style={{
                                        width: previewWidth,
                                        flexShrink: 0,
                                        position: 'sticky',
                                        top: 28,
                                    }}>
                                        <PdfPreview
                                            file={files.find(f => f.name === selectedResult.fileName)}
                                            pageNum={selectedResult.pageNum || 1}
                                            totalPages={selectedResult.rawPages?.length || 1}
                                        />
                                        {/* ปุ่มขนาดสำเร็จรูป + ปิด */}
                                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                            {[350, 500, 650].map(w => (
                                                <button
                                                    key={w}
                                                    onClick={(e) => { e.stopPropagation(); setPreviewWidth(w) }}
                                                    style={{
                                                        flex: 1,
                                                        padding: '6px',
                                                        border: `1.5px solid ${previewWidth === w ? '#f97316' : '#e8ecf1'}`,
                                                        borderRadius: 6,
                                                        background: previewWidth === w ? '#fff7ed' : '#fff',
                                                        color: previewWidth === w ? '#f97316' : '#8b8fa3',
                                                        fontSize: 11,
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        fontFamily: 'Inter, sans-serif',
                                                    }}
                                                >
                                                    {w === 350 ? 'S' : w === 500 ? 'M' : 'L'}
                                                </button>
                                            ))}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setSelectedResult(null) }}
                                                style={{
                                                    flex: 1,
                                                    padding: '6px',
                                                    border: '1px solid #e8ecf1',
                                                    borderRadius: 6,
                                                    background: '#fff',
                                                    color: '#8b8fa3',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    fontFamily: 'Inter, sans-serif',
                                                }}
                                            >✕ ปิด</button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* ══════ Empty State ══════ */}
                {files.length === 0 && results.length === 0 && (
                    <div className="animate-in" style={{ animationDelay: '.2s' }}>
                        <div style={{
                            textAlign: 'center', padding: '60px 20px',
                            background: '#fff', borderRadius: 16, border: '1px solid #e8ecf1',
                        }}>
                            <div style={{ fontSize: 56, marginBottom: 16, filter: 'grayscale(0.2)' }}>📖</div>
                            <div style={{ fontSize: 17, fontWeight: 700, color: '#2d2d3a', marginBottom: 6 }}>
                                เริ่มต้นใช้งาน ระบบอ่านไฟล์ A.K.F
                            </div>
                            <div style={{ fontSize: 14, color: '#8b8fa3', lineHeight: 1.6, maxWidth: 450, margin: '0 auto' }}>
                                ลากไฟล์ PDF ใบกำกับภาษีมาวาง หรือคลิก "เลือกไฟล์" ด้านบน
                                เพื่อเริ่มอ่านข้อมูลอัตโนมัติ
                            </div>
                            <div style={{
                                display: 'flex', justifyContent: 'center', gap: 24,
                                marginTop: 28, flexWrap: 'wrap',
                            }}>
                                {[
                                    { icon: '📄', title: 'รองรับ PDF', desc: 'อ่านไฟล์ .pdf ทุกรูปแบบ' },
                                    { icon: '🔍', title: 'ดึงข้อมูลอัตโนมัติ', desc: 'เลขที่เอกสาร, วันที่, VAT' },
                                    { icon: '📊', title: '11 ฟิลด์ข้อมูล', desc: 'ครอบคลุมใบกำกับภาษี' },
                                    { icon: '✏️', title: 'แก้ไขได้', desc: 'ตรวจสอบและแก้ไขข้อมูล' },
                                ].map(item => (
                                    <div key={item.title} style={{
                                        padding: '16px 20px', background: '#f8f9fb',
                                        borderRadius: 12, border: '1px solid #e8ecf1',
                                        width: 160, textAlign: 'center',
                                    }}>
                                        <div style={{ fontSize: 28, marginBottom: 8 }}>{item.icon}</div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 2 }}>{item.title}</div>
                                        <div style={{ fontSize: 11, color: '#8b8fa3' }}>{item.desc}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ══════ Export Excel Modal ══════ */}
                <ExportExcelModal
                    isOpen={showExportModal}
                    onClose={() => setShowExportModal(false)}
                    onConfirm={handleExportConfirm}
                    resultCount={results.length}
                />
            </main>
        </div>
    )
}
