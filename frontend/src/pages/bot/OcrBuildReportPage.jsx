import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Sidebar from '../../components/Sidebar'

const fmtNum = (n) => n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export default function OcrBuildReportPage() {
    const { code } = useParams()
    const navigate = useNavigate()
    const [report, setReport] = useState(null)
    const [loading, setLoading] = useState(true)
    const [selectedFile, setSelectedFile] = useState(null)
    const [confirmDelete, setConfirmDelete] = useState(null)
    const [exportLoading, setExportLoading] = useState(false)

    // ── Export Filter Modal state ──
    const [showExportModal, setShowExportModal] = useState(false)
    const [exportDateFrom, setExportDateFrom] = useState('')
    const [exportDateTo, setExportDateTo] = useState('')
    const [exportDocTypes, setExportDocTypes] = useState([])

    const applyDatePreset = (preset) => {
        const now = new Date()
        if (preset === 'all') {
            setExportDateFrom(''); setExportDateTo('')
        } else if (preset === 'thisMonth') {
            const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0')
            setExportDateFrom(`${y}-${m}-01`)
            setExportDateTo(`${y}-${m}-${new Date(y, now.getMonth() + 1, 0).getDate()}`)
        } else if (preset === 'lastMonth') {
            const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
            const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0')
            setExportDateFrom(`${y}-${m}-01`)
            setExportDateTo(`${y}-${m}-${new Date(y, d.getMonth() + 1, 0).getDate()}`)
        }
    }

    const toggleDocType = (type) => {
        setExportDocTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
    }

    const openExportModal = () => {
        setShowExportModal(true)
        setExportDateFrom(''); setExportDateTo(''); setExportDocTypes([])
    }

    useEffect(() => { fetchReport() }, [code])

    const fetchReport = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/ocr/build-report/${encodeURIComponent(code)}`)
            const data = await res.json()
            setReport(data)
        } catch (err) {
            console.error('Failed to fetch build report:', err)
        } finally { setLoading(false) }
    }

    const handleDelete = async (id) => {
        try {
            const res = await fetch(`/api/ocr/history/${id}`, { method: 'DELETE' })
            const data = await res.json()
            if (data.success) {
                setSelectedFile(null)
                setConfirmDelete(null)
                fetchReport()
            } else {
                alert('ลบไม่สำเร็จ: ' + (data.error || 'Unknown error'))
            }
        } catch (err) {
            console.error('Delete error:', err)
            alert('เกิดข้อผิดพลาดในการลบ')
        }
    }

    const handleExportExcel = async () => {
        setExportLoading(true)
        try {
            const params = new URLSearchParams()
            if (exportDateFrom) params.set('dateFrom', exportDateFrom)
            if (exportDateTo) params.set('dateTo', exportDateTo)
            if (exportDocTypes.length > 0) params.set('docType', exportDocTypes.join(','))
            const qs = params.toString() ? `?${params.toString()}` : ''
            const res = await fetch(`/api/ocr/export-excel/${encodeURIComponent(code)}${qs}`)
            if (!res.ok) {
                const err = await res.json()
                alert('ส่งออกไม่สำเร็จ: ' + (err.error || 'Unknown error'))
                return
            }
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const cd = res.headers.get('Content-Disposition')
            const match = cd && cd.match(/filename="?([^"]+)"?/)
            a.download = match ? decodeURIComponent(match[1]) : `OCR_Export_${code}_${new Date().toISOString().slice(0,10)}.xlsx`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
            setShowExportModal(false)
        } catch (err) {
            console.error('Export error:', err)
            alert('เกิดข้อผิดพลาดในการส่งออก')
        } finally { setExportLoading(false) }
    }

    const s = report?.summary || {}
    const successRate = s.totalFiles > 0 ? ((s.successCount / s.totalFiles) * 100).toFixed(1) : 0

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#f8f9fb' }}>
            <Sidebar />
            <main className="main-content" style={{ overflowY: 'auto' }}>

                {/* ══════ HEADER ══════ */}
                <div style={{
                    background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
                    borderRadius: 16, padding: '28px 32px', marginBottom: 28, color: '#fff',
                    position: 'relative', overflow: 'hidden'
                }}>
                    <div style={{
                        position: 'absolute', top: -60, right: -60, width: 200, height: 200,
                        borderRadius: '50%', background: 'rgba(255,255,255,0.06)'
                    }} />
                    <div style={{
                        position: 'absolute', bottom: -40, left: '50%', width: 120, height: 120,
                        borderRadius: '50%', background: 'rgba(255,255,255,0.04)'
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, position: 'relative' }}>
                        <button onClick={() => navigate('/ocr-dashboard')} style={{
                            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
                            padding: '8px 16px', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                            transition: 'background .15s', backdropFilter: 'blur(4px)'
                        }}
                            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.25)'}
                            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                        >← กลับ Dashboard</button>
                        <span style={{
                            fontSize: 13, fontWeight: 800,
                            background: 'rgba(255,255,255,0.2)', padding: '5px 16px', borderRadius: 8,
                            fontFamily: "'JetBrains Mono', monospace", backdropFilter: 'blur(4px)'
                        }}>{code}</span>
                        <button onClick={openExportModal} disabled={exportLoading} style={{
                            background: exportLoading ? 'rgba(255,255,255,0.1)' : 'rgba(34,197,94,0.9)',
                            border: 'none', borderRadius: 8,
                            padding: '8px 18px', color: '#fff', cursor: exportLoading ? 'wait' : 'pointer',
                            fontSize: 13, fontWeight: 700, transition: 'all .15s',
                            backdropFilter: 'blur(4px)', marginLeft: 'auto'
                        }}
                            onMouseOver={e => { if (!exportLoading) e.currentTarget.style.background = 'rgba(34,197,94,1)' }}
                            onMouseOut={e => { if (!exportLoading) e.currentTarget.style.background = 'rgba(34,197,94,0.9)' }}
                        >{exportLoading ? '⏳ กำลังสร้าง...' : '📥 ส่งออก Excel'}</button>
                    </div>
                    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, position: 'relative' }}>
                        📊 รายงานสรุป — {s.buildName || code}
                    </h1>
                    <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.8, position: 'relative' }}>
                        ข้อมูลการใช้ระบบ OCR ของบริษัทภายใน {s.buildName || code}
                    </p>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8', fontSize: 16 }}>⏳ กำลังโหลดรายงาน...</div>
                ) : !report ? (
                    <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8', fontSize: 16 }}>❌ ไม่พบข้อมูล</div>
                ) : (
                    <>
                        {/* ══════ STAT CARDS — 2 rows of 3 ══════ */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                            {[
                                { icon: '📄', label: 'ไฟล์ทั้งหมด', value: s.totalFiles, color: '#3b82f6', bg: '#eff6ff' },
                                { icon: '✅', label: 'อ่านสำเร็จ', value: s.successCount, color: '#22c55e', bg: '#f0fdf4' },
                                { icon: '❌', label: 'ผิดพลาด', value: s.errorCount, color: '#ef4444', bg: '#fef2f2' },
                                { icon: '📈', label: 'อัตราสำเร็จ', value: `${successRate}%`, color: '#8b5cf6', bg: '#f5f3ff' },
                                { icon: '⚡', label: 'เวลาเฉลี่ย', value: s.avgTimeMs ? `${(s.avgTimeMs / 1000).toFixed(1)}s` : '—', color: '#f59e0b', bg: '#fffbeb' },
                                { icon: '📅', label: 'วันที่ใช้งาน', value: `${s.activeDays} วัน`, color: '#06b6d4', bg: '#ecfeff' },
                            ].map((c, i) => (
                                <div key={i} style={{
                                    background: '#fff', borderRadius: 14, padding: '20px 24px',
                                    border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                                    display: 'flex', alignItems: 'center', gap: 16
                                }}>
                                    <div style={{
                                        width: 48, height: 48, borderRadius: 12, background: c.bg,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 22, flexShrink: 0
                                    }}>{c.icon}</div>
                                    <div>
                                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.label}</div>
                                        <div style={{ fontSize: 26, fontWeight: 800, color: c.color, fontFamily: "'JetBrains Mono', monospace" }}>{c.value}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ══════ ROW 2: OCR TYPES + DOC TYPES ══════ */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>

                            {/* OCR Types — ประเภทเอกสารที่ส่งรัน */}
                            {(() => {
                                const ocrTypes = report.ocrTypes || []
                                const totalOcr = ocrTypes.reduce((sum, t) => sum + t.count, 0)
                                const typeConfig = {
                                    'VAT': { icon: '🧾', color: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0', label: 'ใบกำกับภาษี (VAT)' },
                                    'WHT': { icon: '📑', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', label: 'หัก ณ ที่จ่าย (WHT)' },
                                    'None_vat': { icon: '📄', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', label: 'ไม่มี VAT (None_vat)' },
                                    'WHT&VAT': { icon: '📋', color: '#8b5cf6', bg: '#f5f3ff', border: '#c4b5fd', label: 'WHT & VAT รวม' },
                                    'อื่นๆ': { icon: '📁', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', label: 'อื่นๆ' }
                                }
                                return (
                                    <div style={{
                                        background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                                        borderRadius: 14, padding: '20px 24px', border: '1px solid #bfdbfe'
                                    }}>
                                        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e40af', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 18 }}>📂</span> ประเภทเอกสารที่ส่งรัน OCR
                                            <span style={{
                                                marginLeft: 'auto', fontSize: 11, background: '#fff',
                                                color: '#1e40af', padding: '3px 10px', borderRadius: 8, fontWeight: 700
                                            }}>{totalOcr} ไฟล์</span>
                                        </div>
                                        {ocrTypes.length === 0 ? (
                                            <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>ไม่มีข้อมูล</div>
                                        ) : ocrTypes.map((ot, i) => {
                                            const cfg = typeConfig[ot.type] || typeConfig['อื่นๆ']
                                            const pct = totalOcr > 0 ? ((ot.count / totalOcr) * 100).toFixed(0) : 0
                                            return (
                                                <div key={i} style={{ marginBottom: i < ocrTypes.length - 1 ? 12 : 0 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                        <span style={{ fontSize: 13, color: '#1e3a5f', fontWeight: 600 }}>
                                                            {cfg.icon} {cfg.label}
                                                        </span>
                                                        <span style={{
                                                            fontSize: 12, fontWeight: 700, color: cfg.color,
                                                            fontFamily: "'JetBrains Mono',monospace"
                                                        }}>{ot.count} ไฟล์ ({pct}%)</span>
                                                    </div>
                                                    <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.7)', overflow: 'hidden' }}>
                                                        <div style={{
                                                            height: '100%', borderRadius: 4,
                                                            background: cfg.color, width: `${pct}%`,
                                                            transition: 'width .5s ease'
                                                        }} />
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )
                            })()}

                            {/* Document Types */}
                            <div style={{
                                background: '#fff', borderRadius: 14, padding: '20px 24px',
                                border: '1px solid #e5e7eb'
                            }}>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 18 }}>📋</span> ประเภทเอกสารที่อ่าน
                                </div>
                                {(report.docTypes || []).length === 0 ? (
                                    <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>ไม่มีข้อมูลประเภทเอกสาร</div>
                                ) : report.docTypes.map((dt, i) => (
                                    <div key={i} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '10px 0', borderBottom: i < report.docTypes.length - 1 ? '1px solid #f1f5f9' : 'none'
                                    }}>
                                        <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>{dt.type}</span>
                                        <span style={{
                                            fontSize: 12, fontWeight: 700, color: '#3b82f6',
                                            background: '#eff6ff', padding: '4px 14px', borderRadius: 8,
                                            fontFamily: "'JetBrains Mono',monospace"
                                        }}>{dt.count} ไฟล์</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ══════ ROW 3: TOP SELLERS + TIMELINE ══════ */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>

                            {/* Top Sellers */}
                            <div style={{
                                background: '#fff', borderRadius: 14, padding: '20px 24px',
                                border: '1px solid #e5e7eb'
                            }}>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 18 }}>🏢</span> บริษัทผู้ขายที่พบ
                                    {s.uniqueSellers > 0 && (
                                        <span style={{
                                            fontSize: 11, background: '#f0fdf4', color: '#166534', padding: '3px 10px',
                                            borderRadius: 8, fontWeight: 600, marginLeft: 'auto'
                                        }}>{s.uniqueSellers} บริษัท</span>
                                    )}
                                </div>
                                {(report.topSellers || []).length === 0 ? (
                                    <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>ไม่มีข้อมูลบริษัทผู้ขาย</div>
                                ) : report.topSellers.map((ts, i) => (
                                    <div key={i} style={{
                                        padding: '10px 0',
                                        borderBottom: i < report.topSellers.length - 1 ? '1px solid #f1f5f9' : 'none',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 2 }}>{ts.name}</div>
                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{ts.count} เอกสาร</div>
                                        </div>
                                        <span style={{
                                            fontSize: 13, fontWeight: 700, color: '#ea580c',
                                            fontFamily: "'JetBrains Mono',monospace"
                                        }}>฿{fmtNum(ts.totalAmount)}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Timeline */}
                            <div style={{
                                background: '#fff', borderRadius: 14, padding: '20px 24px',
                                border: '1px solid #e5e7eb'
                            }}>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 18 }}>📈</span> ไทม์ไลน์การใช้งาน
                                </div>
                                {(report.byDate || []).length === 0 ? (
                                    <div style={{ color: '#94a3b8', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>ไม่มีข้อมูลไทม์ไลน์</div>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 80, padding: '0 4px' }}>
                                            {[...report.byDate].reverse().map((d, i) => {
                                                const maxCount = Math.max(...report.byDate.map(x => x.count))
                                                const h = maxCount > 0 ? (d.count / maxCount) * 60 + 12 : 12
                                                return (
                                                    <div key={i} title={`${fmtDate(d.date)}: ${d.count} ไฟล์ (สำเร็จ ${d.success}, ผิดพลาด ${d.errors})`}
                                                        style={{
                                                            flex: 1, minWidth: 12, height: h, borderRadius: 6,
                                                            background: d.errors > 0
                                                                ? 'linear-gradient(to top, #ef4444, #fca5a5)'
                                                                : 'linear-gradient(to top, #3b82f6, #93c5fd)',
                                                            cursor: 'default', transition: 'all .15s'
                                                        }}
                                                        onMouseOver={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.transform = 'scaleY(1.05)' }}
                                                        onMouseOut={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = '' }}
                                                    />
                                                )
                                            })}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginTop: 8, padding: '0 4px' }}>
                                            <span>{fmtDate(report.byDate[report.byDate.length - 1]?.date)}</span>
                                            <span>{fmtDate(report.byDate[0]?.date)}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* ══════ DATE RANGE INFO ══════ */}
                        <div style={{
                            background: '#fff', borderRadius: 14, padding: '16px 24px',
                            border: '1px solid #e5e7eb', marginBottom: 24,
                            display: 'flex', alignItems: 'center', gap: 24
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 14 }}>🕐</span>
                                <span style={{ fontSize: 12, color: '#64748b' }}>เริ่มใช้งาน:</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{fmtDate(s.firstUsed)}</span>
                            </div>
                            <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 14 }}>📅</span>
                                <span style={{ fontSize: 12, color: '#64748b' }}>ใช้ล่าสุด:</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{fmtDate(s.lastUsed)}</span>
                            </div>
                            <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 14 }}>🏢</span>
                                <span style={{ fontSize: 12, color: '#64748b' }}>บริษัทผู้ขายที่พบ:</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#8b5cf6' }}>{s.uniqueSellers || 0} บริษัท</span>
                            </div>
                        </div>

                        {/* ══════ FILES TABLE ══════ */}
                        <div style={{
                            background: '#fff', borderRadius: 14, padding: '20px 24px',
                            border: '1px solid #e5e7eb'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                <span style={{ fontSize: 18 }}>📁</span>
                                <span style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f' }}>รายการไฟล์ทั้งหมด</span>
                                <span style={{
                                    fontSize: 12, padding: '3px 12px', borderRadius: 8,
                                    background: '#eff6ff', color: '#3b82f6', fontWeight: 700,
                                    fontFamily: "'JetBrains Mono',monospace"
                                }}>{(report.files || []).length} ไฟล์</span>
                            </div>
                            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr>
                                            {['', 'ชื่อไฟล์', 'ประเภท', 'เลขเอกสาร', 'วันที่เอกสาร', 'บริษัทผู้ขาย', 'ยอดรวม', 'เวลา', 'วันที่อ่าน'].map((h, i) => (
                                                <th key={h + i} style={{
                                                    padding: '10px 8px', textAlign: i === 6 ? 'right' : 'left', fontSize: 11,
                                                    fontWeight: 700, color: '#fff', whiteSpace: 'nowrap',
                                                    background: 'linear-gradient(135deg, #1e3a5f, #2563eb)',
                                                    borderBottom: 'none',
                                                    ...(i === 0 ? { borderTopLeftRadius: 8 } : {}),
                                                    ...(i === 8 ? { borderTopRightRadius: 8 } : {})
                                                }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(report.files || []).map((f, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background .1s', cursor: 'pointer' }}
                                                onClick={() => setSelectedFile(f)}
                                                onMouseOver={e => e.currentTarget.style.background = '#f0f7ff'}
                                                onMouseOut={e => e.currentTarget.style.background = ''}>
                                                <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 14 }}>
                                                    {f.status === 'done' ? '✅' : '❌'}
                                                </td>
                                                <td style={{ padding: '10px 8px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: '#334155' }}
                                                    title={f.file_name}>{f.file_name}</td>
                                                <td style={{ padding: '10px 8px' }}>
                                                    {f.document_type ? (
                                                        <span style={{
                                                            fontSize: 10, background: '#eff6ff', color: '#3b82f6',
                                                            padding: '3px 10px', borderRadius: 6, fontWeight: 600
                                                        }}>{f.document_type}</span>
                                                    ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                                                </td>
                                                <td style={{ padding: '10px 8px', fontFamily: "'JetBrains Mono',monospace", color: '#3b82f6', fontWeight: 600 }}>
                                                    {f.document_number || <span style={{ color: '#cbd5e1' }}>—</span>}
                                                </td>
                                                <td style={{ padding: '10px 8px', color: '#64748b', fontSize: 11 }}>
                                                    {f.document_date || <span style={{ color: '#cbd5e1' }}>—</span>}
                                                </td>
                                                <td style={{ padding: '10px 8px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#334155' }}
                                                    title={f.seller_name}>{f.seller_name || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                                                <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700, color: '#ea580c', fontFamily: "'JetBrains Mono',monospace" }}>
                                                    {f.total ? `฿${fmtNum(f.total)}` : <span style={{ color: '#cbd5e1' }}>—</span>}
                                                </td>
                                                <td style={{ padding: '10px 8px', color: '#94a3b8', fontSize: 10 }}>
                                                    {f.processing_time_ms ? `${(f.processing_time_ms / 1000).toFixed(1)}s` : '—'}
                                                </td>
                                                <td style={{ padding: '10px 8px', color: '#94a3b8', fontSize: 10, whiteSpace: 'nowrap' }}>
                                                    {f.created_at ? new Date(f.created_at).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}

            </main>

            {/* ══════ FILE DETAIL MODAL ══════ */}
            {selectedFile && (() => {
                const f = selectedFile
                const DetailRow = ({ label, value, mono, color, bold }) => (
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        padding: '10px 0', borderBottom: '1px solid #f1f5f9'
                    }}>
                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500, minWidth: 120, flexShrink: 0 }}>{label}</span>
                        <span style={{
                            fontSize: 13, fontWeight: bold ? 700 : 500, color: color || '#334155',
                            textAlign: 'right', wordBreak: 'break-all',
                            ...(mono ? { fontFamily: "'JetBrains Mono',monospace" } : {})
                        }}>{value || <span style={{ color: '#cbd5e1' }}>—</span>}</span>
                    </div>
                )
                return (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        animation: 'fadeIn .2s ease'
                    }} onClick={() => setSelectedFile(null)}>
                        <div style={{
                            background: '#fff', borderRadius: 16, width: '90%', maxWidth: 640, maxHeight: '88vh',
                            overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                            animation: 'slideUp .25s ease'
                        }} onClick={e => e.stopPropagation()}>

                            {/* Header */}
                            <div style={{
                                background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
                                padding: '18px 24px', color: '#fff',
                                display: 'flex', alignItems: 'center', gap: 12
                            }}>
                                <span style={{ fontSize: 22 }}>{f.status === 'done' ? '✅' : '❌'}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                        title={f.file_name}>{f.file_name}</div>
                                    <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                                        {f.status === 'done' ? 'อ่านสำเร็จ' : 'เกิดข้อผิดพลาด'}
                                        {f.processing_time_ms ? ` • ${(f.processing_time_ms / 1000).toFixed(1)}s` : ''}
                                    </div>
                                </div>
                                <button onClick={() => setSelectedFile(null)} style={{
                                    background: 'rgba(255,255,255,0.15)', border: 'none',
                                    fontSize: 18, cursor: 'pointer', color: '#fff', padding: '4px 10px',
                                    borderRadius: 8, transition: 'background .15s'
                                }}
                                    onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                                    onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                                >✕</button>
                            </div>

                            {/* Body */}
                            <div style={{ padding: '20px 24px', overflowY: 'auto', maxHeight: 'calc(88vh - 80px)' }}>

                                {/* ข้อมูลเอกสาร */}
                                <div style={{ marginBottom: 20 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span>📋</span> ข้อมูลเอกสาร
                                    </div>
                                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '4px 16px', border: '1px solid #e5e7eb' }}>
                                        <DetailRow label="ประเภทเอกสาร" value={f.document_type} />
                                        <DetailRow label="เลขที่เอกสาร" value={f.document_number} mono color="#3b82f6" bold />
                                        <DetailRow label="วันที่เอกสาร" value={f.document_date} />
                                    </div>
                                </div>

                                {/* ผู้ขาย */}
                                <div style={{ marginBottom: 20 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span>🏢</span> ข้อมูลผู้ขาย
                                    </div>
                                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '4px 16px', border: '1px solid #e5e7eb' }}>
                                        <DetailRow label="ชื่อบริษัท" value={f.seller_name} bold />
                                        <DetailRow label="เลขประจำตัวผู้เสียภาษี" value={f.seller_tax_id} mono color="#8b5cf6" />
                                        <DetailRow label="ที่อยู่" value={f.seller_address} />
                                    </div>
                                </div>

                                {/* ผู้ซื้อ */}
                                <div style={{ marginBottom: 20 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span>🏭</span> ข้อมูลผู้ซื้อ
                                    </div>
                                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '4px 16px', border: '1px solid #e5e7eb' }}>
                                        <DetailRow label="ชื่อบริษัท" value={f.buyer_name} bold />
                                        <DetailRow label="เลขประจำตัวผู้เสียภาษี" value={f.buyer_tax_id} mono color="#8b5cf6" />
                                        <DetailRow label="ที่อยู่" value={f.buyer_address} />
                                    </div>
                                </div>

                                {/* ยอดเงิน */}
                                <div style={{ marginBottom: 20 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span>💰</span> ยอดเงิน
                                    </div>
                                    <div style={{
                                        background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
                                        borderRadius: 10, padding: '4px 16px', border: '1px solid #fde68a'
                                    }}>
                                        <DetailRow label="ยอดก่อน VAT" value={f.subtotal ? `฿${fmtNum(f.subtotal)}` : null} mono color="#92400e" />
                                        <DetailRow label="ภาษีมูลค่าเพิ่ม" value={f.vat ? `฿${fmtNum(f.vat)}` : null} mono color="#92400e" />
                                        <DetailRow label="ยอดรวมทั้งสิ้น" value={f.total ? `฿${fmtNum(f.total)}` : null} mono color="#ea580c" bold />
                                    </div>
                                </div>

                                {/* ข้อมูลระบบ */}
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span>⚙️</span> ข้อมูลระบบ
                                    </div>
                                    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '4px 16px', border: '1px solid #e5e7eb' }}>
                                        <DetailRow label="สถานะ" value={
                                            <span style={{
                                                fontSize: 11, padding: '3px 12px', borderRadius: 8, fontWeight: 600,
                                                background: f.status === 'done' ? '#f0fdf4' : '#fef2f2',
                                                color: f.status === 'done' ? '#22c55e' : '#ef4444',
                                                border: `1px solid ${f.status === 'done' ? '#bbf7d0' : '#fecaca'}`
                                            }}>{f.status === 'done' ? '✅ สำเร็จ' : '❌ ผิดพลาด'}</span>
                                        } />
                                        <DetailRow label="เวลาประมวลผล" value={f.processing_time_ms ? `${(f.processing_time_ms / 1000).toFixed(1)} วินาที` : null} />
                                        <DetailRow label="วันที่อ่าน" value={f.created_at ? new Date(f.created_at).toLocaleString('th-TH', {
                                            day: '2-digit', month: 'long', year: 'numeric',
                                            hour: '2-digit', minute: '2-digit', second: '2-digit'
                                        }) : null} />
                                        <DetailRow label="ที่อยู่ไฟล์" value={f.file_path} />
                                    </div>
                                </div>

                                {/* ปุ่มลบ */}
                                <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                                    {confirmDelete === f.id ? (
                                        <>
                                            <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, alignSelf: 'center' }}>
                                                ⚠️ ยืนยันการลบ?
                                            </span>
                                            <button onClick={() => setConfirmDelete(null)} style={{
                                                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8,
                                                padding: '8px 20px', fontSize: 12, fontWeight: 600, color: '#64748b',
                                                cursor: 'pointer', transition: 'background .15s'
                                            }}
                                                onMouseOver={e => e.currentTarget.style.background = '#e2e8f0'}
                                                onMouseOut={e => e.currentTarget.style.background = '#f1f5f9'}
                                            >ยกเลิก</button>
                                            <button onClick={() => handleDelete(f.id)} style={{
                                                background: '#ef4444', border: 'none', borderRadius: 8,
                                                padding: '8px 20px', fontSize: 12, fontWeight: 700, color: '#fff',
                                                cursor: 'pointer', transition: 'background .15s'
                                            }}
                                                onMouseOver={e => e.currentTarget.style.background = '#dc2626'}
                                                onMouseOut={e => e.currentTarget.style.background = '#ef4444'}
                                            >🗑️ ลบเลย</button>
                                        </>
                                    ) : (
                                        <button onClick={() => setConfirmDelete(f.id)} style={{
                                            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                                            padding: '8px 20px', fontSize: 12, fontWeight: 600, color: '#ef4444',
                                            cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 6
                                        }}
                                            onMouseOver={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.borderColor = '#fca5a5' }}
                                            onMouseOut={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fecaca' }}
                                        >🗑️ ลบรายการนี้</button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* ══════ EXPORT FILTER MODAL ══════ */}
            {showExportModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'fadeIn .2s ease'
                }} onClick={() => setShowExportModal(false)}>
                    <div style={{
                        background: '#fff', borderRadius: 20, width: '90%', maxWidth: 520,
                        overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                        animation: 'slideUp .25s ease'
                    }} onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div style={{
                            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                            padding: '18px 24px', color: '#fff',
                            display: 'flex', alignItems: 'center', gap: 10
                        }}>
                            <span style={{ fontSize: 22 }}>📥</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 16, fontWeight: 800 }}>ส่งออก Excel</div>
                                <div style={{ fontSize: 12, opacity: 0.85 }}>เลือกเงื่อนไขที่ต้องการส่งออก — {code}</div>
                            </div>
                            <button onClick={() => setShowExportModal(false)} style={{
                                background: 'rgba(255,255,255,0.15)', border: 'none',
                                fontSize: 18, cursor: 'pointer', color: '#fff', padding: '4px 10px',
                                borderRadius: 8
                            }}>✕</button>
                        </div>
                        {/* Body */}
                        <div style={{ padding: '20px 24px' }}>
                            {/* Quick Presets */}
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>⚡ ตัวเลือกด่วน</div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {[
                                        { id: 'all', label: '📋 ทั้งหมด', active: !exportDateFrom && !exportDateTo },
                                        { id: 'thisMonth', label: '📅 เดือนนี้', active: false },
                                        { id: 'lastMonth', label: '📅 เดือนที่แล้ว', active: false },
                                    ].map(p => (
                                        <button key={p.id} onClick={() => applyDatePreset(p.id)}
                                            style={{
                                                padding: '8px 16px', border: '1.5px solid',
                                                borderColor: p.active ? '#22c55e' : '#e2e8f0',
                                                borderRadius: 10, background: p.active ? '#f0fdf4' : '#fff',
                                                color: p.active ? '#16a34a' : '#64748b',
                                                fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s'
                                            }}>{p.label}</button>
                                    ))}
                                </div>
                            </div>
                            {/* Date Range */}
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>📅 ช่วงวันที่</div>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    <input type="date" value={exportDateFrom}
                                        onChange={e => setExportDateFrom(e.target.value)}
                                        style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none' }}
                                    />
                                    <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>ถึง</span>
                                    <input type="date" value={exportDateTo}
                                        onChange={e => setExportDateTo(e.target.value)}
                                        style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none' }}
                                    />
                                </div>
                                {!exportDateFrom && !exportDateTo && (
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>ไม่ระบุ = ส่งออกทั้งหมด</div>
                                )}
                            </div>
                            {/* Document Types */}
                            {report?.docTypes && report.docTypes.length > 0 && (
                                <div style={{ marginBottom: 20 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>📋 ประเภทเอกสาร</div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {report.docTypes.map((dt, i) => {
                                            const sel = exportDocTypes.includes(dt.type)
                                            return (
                                                <button key={i} onClick={() => toggleDocType(dt.type)}
                                                    style={{
                                                        padding: '6px 14px', border: '1.5px solid',
                                                        borderColor: sel ? '#3b82f6' : '#e2e8f0',
                                                        borderRadius: 10, background: sel ? '#eff6ff' : '#fff',
                                                        color: sel ? '#2563eb' : '#64748b',
                                                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                                        transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 4
                                                    }}>
                                                    {sel ? '✅' : '⬜'} {dt.type} ({dt.count})
                                                </button>
                                            )
                                        })}
                                    </div>
                                    {exportDocTypes.length === 0 && (
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>ไม่เลือก = ส่งออกทุกประเภท</div>
                                    )}
                                </div>
                            )}
                        </div>
                        {/* Footer */}
                        <div style={{
                            padding: '14px 24px', borderTop: '1px solid #e5e7eb',
                            display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#f8fafc'
                        }}>
                            <button onClick={() => setShowExportModal(false)} style={{
                                padding: '10px 20px', border: '1.5px solid #e2e8f0', borderRadius: 10,
                                background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                            }}>ยกเลิก</button>
                            <button onClick={handleExportExcel} disabled={exportLoading}
                                style={{
                                    padding: '10px 24px', border: 'none', borderRadius: 10,
                                    background: exportLoading ? '#94a3b8' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    color: '#fff', fontSize: 13, fontWeight: 700,
                                    cursor: exportLoading ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    boxShadow: '0 4px 12px rgba(34,197,94,0.3)'
                                }}>
                                {exportLoading ? '⏳ กำลังส่งออก...' : '📥 ส่งออก Excel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
                @keyframes slideUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
            `}</style>
        </div>
    )
}
