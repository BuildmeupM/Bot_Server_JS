import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../../components/Sidebar'

const fmtNum = (n) => n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'

export default function OcrDashboardPage() {
    const navigate = useNavigate()
    const [dashStats, setDashStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [deletingId, setDeletingId] = useState(null)
    const [exporting, setExporting] = useState(null)
    const [exportingAll, setExportingAll] = useState(false)
    const [expandedDocTypes, setExpandedDocTypes] = useState({})
    const [bcSearch, setBcSearch] = useState('')
    const [bcSortField, setBcSortField] = useState('totalFiles')
    const [bcSortDir, setBcSortDir] = useState('desc')
    const [bcPage, setBcPage] = useState(1)
    const BC_PER_PAGE = 10


    // ── Export Filter Modal state ──
    const [exportModal, setExportModal] = useState(null) // { buildCode, docTypes }
    const [exportDateFrom, setExportDateFrom] = useState('')
    const [exportDateTo, setExportDateTo] = useState('')
    const [exportDocTypes, setExportDocTypes] = useState([]) // selected doc types
    const [exportFolderPath, setExportFolderPath] = useState('')
    const [exportFolderScan, setExportFolderScan] = useState(null) // scan result for modal
    const [scanningExportFolder, setScanningExportFolder] = useState(false)

    const openExportModal = (buildCode, docTypes, e) => {
        if (e) e.stopPropagation()
        setExportModal({ buildCode, docTypes: docTypes || [] })
        setExportDateFrom('')
        setExportDateTo('')
        setExportDocTypes([])
        setExportFolderPath('')
        setExportFolderScan(null)
    }

    // ── สแกน folder สำหรับ modal export ──
    const handleScanExportFolder = async () => {
        if (!exportFolderPath.trim()) return
        setScanningExportFolder(true)
        setExportFolderScan(null)
        try {
            const res = await fetch('/api/ocr/list-folder-files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderPath: exportFolderPath.trim() })
            })
            const data = await res.json()
            if (!res.ok) {
                alert(data.error || 'เกิดข้อผิดพลาด')
                return
            }
            setExportFolderScan(data)
        } catch (err) {
            alert('ไม่สามารถเชื่อมต่อ server ได้')
        } finally {
            setScanningExportFolder(false)
        }
    }

    const applyDatePreset = (preset) => {
        const now = new Date()
        if (preset === 'all') {
            setExportDateFrom('')
            setExportDateTo('')
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

    // ── ดาวน์โหลด Excel จาก backend API (with filters) ──
    const handleExportExcel = async () => {
        if (!exportModal) return
        const buildCode = exportModal.buildCode
        setExporting(buildCode)
        try {
            const params = new URLSearchParams()
            if (exportDateFrom) params.set('dateFrom', exportDateFrom)
            if (exportDateTo) params.set('dateTo', exportDateTo)
            if (exportDocTypes.length > 0) params.set('docType', exportDocTypes.join(','))
            if (exportFolderPath.trim()) params.set('folderPath', exportFolderPath.trim())
            const qs = params.toString() ? `?${params.toString()}` : ''
            const res = await fetch(`/api/ocr/export-excel/${encodeURIComponent(buildCode)}${qs}`)
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                alert(err.error || 'เกิดข้อผิดพลาดในการส่งออก Excel')
                return
            }
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const cd = res.headers.get('Content-Disposition')
            const match = cd && cd.match(/filename="?([^"]+)"?/)
            a.download = match ? decodeURIComponent(match[1]) : `OCR_Export_${buildCode}.xlsx`
            document.body.appendChild(a)
            a.click()
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
            setExportModal(null)
        } catch (err) {
            console.error('Export error:', err)
            alert('เกิดข้อผิดพลาดในการส่งออก Excel')
        } finally {
            setExporting(null)
        }
    }

    // ── ดาวน์โหลด Excel ทุก record (ไม่จำกัด build code) ──
    const handleExportAll = async () => {
        setExportingAll(true)
        try {
            const res = await fetch('/api/ocr/export-excel-all')
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                alert(err.error || 'เกิดข้อผิดพลาดในการส่งออก Excel')
                return
            }
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const cd = res.headers.get('Content-Disposition')
            const match = cd && cd.match(/filename="?([^"]+)"?/)
            a.download = match ? decodeURIComponent(match[1]) : `OCR_Export_All.xlsx`
            document.body.appendChild(a)
            a.click()
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
        } catch (err) {
            console.error('Export all error:', err)
            alert('เกิดข้อผิดพลาดในการส่งออก Excel')
        } finally {
            setExportingAll(false)
        }
    }


    useEffect(() => { fetchStats() }, [])

    const fetchStats = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/ocr/dashboard-stats')
            const data = await res.json()
            setDashStats(data)
        } catch (err) {
            console.error('Failed to fetch dashboard stats:', err)
            setDashStats({
                summary: { totalFiles: 0, successCount: 0, errorCount: 0, avgTimeMs: 0, successRate: 0, uniqueSellers: 0, uniqueBuyers: 0, activeDays: 0, todayCount: 0, todaySuccess: 0, todayErrors: 0, avgTimeSec: '0' },
                financials: { totalSubtotal: 0, totalVat: 0, totalAmount: 0 },
                byDocType: [], byDate: [], topSellers: [], recentFiles: []
            })
        } finally { setLoading(false) }
    }

    const handleDeleteFile = async (id) => {
        try {
            const res = await fetch(`/api/ocr/history/${id}`, { method: 'DELETE' })
            const data = await res.json()
            if (data.success) {
                setDeletingId(null)
                fetchStats()
            } else {
                alert('ลบไม่สำเร็จ: ' + (data.error || 'Unknown error'))
            }
        } catch (err) {
            console.error('Delete error:', err)
            alert('เกิดข้อผิดพลาดในการลบ')
        }
    }

    const s = dashStats?.summary || {}

    return (
        <div className="app-layout">
            <Sidebar active="ocr-dashboard" />
            <main className="main-content">

                {/* ══════ HERO ══════ */}
                <div className="bot-hero animate-in" style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 50%, #fdba74 100%)' }}>
                    <div className="bot-hero-content">
                        <div className="bot-hero-badge" style={{ background: 'rgba(234,88,12,0.12)', color: '#ea580c' }}>📊 OCR Analytics</div>
                        <h1 className="bot-hero-title">OCR Dashboard</h1>
                        <p className="bot-hero-desc">
                            สรุปผลการอ่านเอกสาร OCR ทั้งหมด — ยอดเงิน, ประเภทเอกสาร, บริษัท, และประวัติล่าสุด
                        </p>
                        <div className="bot-hero-actions">
                            <button className="bot-hero-btn primary" onClick={fetchStats}>
                                <span>🔄</span> รีเฟรชข้อมูล
                            </button>
                            <button className="bot-hero-btn secondary" onClick={() => navigate('/bot-automation')}>
                                <span>🤖</span> กลับหน้าบอท
                            </button>
                        </div>
                    </div>
                    <div className="bot-hero-visual">
                        <div style={{ fontSize: 100, lineHeight: 1, opacity: 0.3 }}>📊</div>
                    </div>
                    <div className="bot-hero-circle c1"></div>
                    <div className="bot-hero-circle c2"></div>
                    <div className="bot-hero-circle c3"></div>
                </div>

                {/* ══════ STAT CARDS ══════ */}
                <div className="bot-stats-grid animate-in" style={{ animationDelay: '.15s' }}>
                    {[
                        { icon: '📄', bg: '#fff7ed', color: '#f97316', value: loading ? '...' : (s.totalFiles || 0).toLocaleString(), label: 'เอกสารที่อ่านทั้งหมด' },
                        { icon: '✅', bg: '#f0fdf4', color: '#22c55e', value: loading ? '...' : `${s.successRate || 0}%`, label: 'อัตราอ่านสำเร็จ' },
                        { icon: '📅', bg: '#eff6ff', color: '#3b82f6', value: loading ? '...' : (s.todayCount || 0), label: 'อ่านวันนี้' },
                        { icon: '⚡', bg: '#fdf4ff', color: '#a855f7', value: loading ? '...' : `${s.avgTimeSec || 0}s`, label: 'เวลาอ่านเฉลี่ย' },
                        { icon: '🏢', bg: '#fefce8', color: '#eab308', value: loading ? '...' : (s.uniqueSellers || 0), label: 'บริษัทผู้ขาย' },
                        { icon: '❌', bg: '#fef2f2', color: '#ef4444', value: loading ? '...' : (s.errorCount || 0), label: 'อ่านไม่สำเร็จ' },
                    ].map((c, i) => (
                        <div key={i} className="bot-stat-card">
                            <div className="bot-stat-icon" style={{ background: c.bg, color: c.color }}>{c.icon}</div>
                            <div className="bot-stat-info">
                                <div className="bot-stat-value">{c.value}</div>
                                <div className="bot-stat-label">{c.label}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ══════ BUILD CODE SECTION — BAR CHART ══════ */}
                {dashStats && (dashStats.byBuildCode || []).length > 0 && (() => {
                    const q = bcSearch.trim().toLowerCase()
                    const filtered = dashStats.byBuildCode.filter(bc =>
                        !q || (bc.code || '').toLowerCase().includes(q) || (bc.name || '').toLowerCase().includes(q)
                    )
                    const sorted = [...filtered].sort((a, b) => {
                        let va, vb
                        if (bcSortField === 'lastUsed') {
                            va = new Date(a.lastUsed || 0).getTime(); vb = new Date(b.lastUsed || 0).getTime()
                        } else {
                            va = a[bcSortField] || 0; vb = b[bcSortField] || 0
                        }
                        return bcSortDir === 'desc' ? vb - va : va - vb
                    })
                    const totalPages = Math.max(1, Math.ceil(sorted.length / BC_PER_PAGE))
                    const safePage = Math.min(bcPage, totalPages)
                    const paged = sorted.slice((safePage - 1) * BC_PER_PAGE, safePage * BC_PER_PAGE)
                    const maxFiles = Math.max(...paged.map(bc => bc.totalFiles || 0), 1)

                    const sortBtnStyle = (field) => ({
                        padding: '4px 10px', border: '1px solid', borderRadius: 6,
                        fontSize: 10, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                        display: 'flex', alignItems: 'center', gap: 3,
                        background: bcSortField === field ? '#f0fdfa' : '#fff',
                        color: bcSortField === field ? '#0d9488' : '#64748b',
                        borderColor: bcSortField === field ? '#99f6e4' : '#e5e7eb'
                    })

                    return (
                    <div className="animate-in" style={{ animationDelay: '.18s' }}>
                        <div style={{
                            background: '#fff',
                            borderRadius: 16, padding: '20px 24px', marginBottom: 20,
                            border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
                        }}>
                            {/* Section Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: 'linear-gradient(135deg, #0d9488, #059669)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 18, boxShadow: '0 2px 8px rgba(5,150,105,0.25)'
                                }}>🏗️</div>
                                <div>
                                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>บริษัทภายในที่ใช้ระบบ OCR</div>
                                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>เปรียบเทียบจำนวนเอกสารแยกตามบริษัท</div>
                                </div>
                                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, color: '#64748b', fontWeight: 600 }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'linear-gradient(135deg, #10b981, #059669)' }} />
                                            สำเร็จ
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'linear-gradient(135deg, #ef4444, #dc2626)' }} />
                                            ผิดพลาด
                                        </span>
                                    </div>
                                    <span style={{
                                        fontSize: 12, padding: '5px 14px', borderRadius: 20,
                                        background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', color: '#059669',
                                        fontWeight: 700, border: '1px solid #a7f3d0'
                                    }}>{filtered.length}/{dashStats.byBuildCode.length} บริษัท</span>
                                </div>
                            </div>

                            {/* Search + Sort Controls */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                                {/* Search */}
                                <div style={{ position: 'relative', flex: '0 1 260px' }}>
                                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
                                    <input
                                        type="text" placeholder="ค้นหา Build Code / ชื่อบริษัท..."
                                        value={bcSearch}
                                        onChange={e => { setBcSearch(e.target.value); setBcPage(1) }}
                                        style={{
                                            width: '100%', padding: '7px 12px 7px 32px', border: '1px solid #e5e7eb',
                                            borderRadius: 8, fontSize: 12, outline: 'none', color: '#334155',
                                            background: '#f8fafc', transition: 'border-color 0.15s'
                                        }}
                                        onFocus={e => e.currentTarget.style.borderColor = '#0d9488'}
                                        onBlur={e => e.currentTarget.style.borderColor = '#e5e7eb'}
                                    />
                                </div>

                                {/* Sort Buttons */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                                    <span>เรียงตาม:</span>
                                    {[
                                        { field: 'totalFiles', label: 'ทั้งหมด' },
                                        { field: 'successCount', label: 'สำเร็จ' },
                                        { field: 'errorCount', label: 'ผิดพลาด' },
                                        { field: 'lastUsed', label: 'ล่าสุด' },
                                    ].map(s => (
                                        <button key={s.field} style={sortBtnStyle(s.field)}
                                            onClick={() => {
                                                if (bcSortField === s.field) {
                                                    setBcSortDir(d => d === 'desc' ? 'asc' : 'desc')
                                                } else {
                                                    setBcSortField(s.field); setBcSortDir('desc')
                                                }
                                                setBcPage(1)
                                            }}
                                        >
                                            {s.label}
                                            {bcSortField === s.field && (
                                                <span style={{ fontSize: 11 }}>{bcSortDir === 'desc' ? '↓' : '↑'}</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Bar Chart Rows */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {paged.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 13 }}>ไม่พบบริษัทที่ตรงกับการค้นหา</div>
                                )}
                                {paged.map((bc, i) => {
                                    const successPct = (bc.successCount / maxFiles) * 100
                                    const errorPct = (bc.errorCount / maxFiles) * 100
                                    const successRate = bc.totalFiles > 0 ? Math.round((bc.successCount / bc.totalFiles) * 100) : 0
                                    const globalIdx = (safePage - 1) * BC_PER_PAGE + i

                                    return (
                                        <div key={bc.code} style={{
                                            display: 'flex', alignItems: 'center', gap: 0,
                                            padding: '8px 0',
                                            borderRadius: 10,
                                            cursor: 'pointer',
                                            transition: 'background 0.15s',
                                            animation: `ocr-card-enter 0.35s ease-out ${i * 0.04}s both`
                                        }}
                                            onClick={() => navigate(`/ocr-report/${encodeURIComponent(bc.code)}`)}
                                            onMouseOver={e => e.currentTarget.style.background = '#f8fafb'}
                                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            {/* Rank */}
                                            <div style={{
                                                width: 28, textAlign: 'center', flexShrink: 0,
                                                fontSize: 12, fontWeight: 800,
                                                color: globalIdx < 3 ? '#0d9488' : '#cbd5e1'
                                            }}>{globalIdx + 1}</div>

                                            {/* Company Info */}
                                            <div style={{ width: 200, flexShrink: 0, paddingRight: 12, minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: 12, fontWeight: 800, color: '#0d9488',
                                                    fontFamily: "'JetBrains Mono', monospace",
                                                    lineHeight: 1.3
                                                }}>{bc.code}</div>
                                                <div style={{
                                                    fontSize: 11, fontWeight: 600, color: '#475569',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    lineHeight: 1.3
                                                }}>{bc.name || '—'}</div>
                                            </div>

                                            {/* Stacked Bar */}
                                            <div style={{
                                                flex: 1, height: 28, display: 'flex', alignItems: 'center',
                                                background: '#f8fafc', borderRadius: 6, overflow: 'hidden',
                                                position: 'relative', minWidth: 0
                                            }}>
                                                <div style={{
                                                    height: '100%', width: `${successPct}%`,
                                                    background: 'linear-gradient(90deg, #10b981, #059669)',
                                                    borderRadius: errorPct > 0 ? '6px 0 0 6px' : '6px',
                                                    transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
                                                    minWidth: successPct > 0 ? 2 : 0,
                                                    position: 'relative'
                                                }}>
                                                    {successPct > 12 && (
                                                        <span style={{
                                                            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                                                            fontSize: 10, fontWeight: 700, color: '#fff',
                                                            textShadow: '0 1px 2px rgba(0,0,0,0.15)'
                                                        }}>{bc.successCount}</span>
                                                    )}
                                                </div>
                                                {bc.errorCount > 0 && (
                                                    <div style={{
                                                        height: '100%', width: `${errorPct}%`,
                                                        background: 'linear-gradient(90deg, #ef4444, #dc2626)',
                                                        borderRadius: successPct > 0 ? '0 6px 6px 0' : '6px',
                                                        transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
                                                        minWidth: 2,
                                                        position: 'relative'
                                                    }}>
                                                        {errorPct > 8 && (
                                                            <span style={{
                                                                position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                                                                fontSize: 10, fontWeight: 700, color: '#fff',
                                                                textShadow: '0 1px 2px rgba(0,0,0,0.15)'
                                                            }}>{bc.errorCount}</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Total & Rate */}
                                            <div style={{ width: 70, textAlign: 'right', flexShrink: 0, paddingLeft: 10 }}>
                                                <div style={{
                                                    fontSize: 16, fontWeight: 800, color: '#0f172a',
                                                    letterSpacing: '-0.02em', lineHeight: 1.2
                                                }}>{bc.totalFiles}</div>
                                                <div style={{
                                                    fontSize: 9, fontWeight: 700, lineHeight: 1.2,
                                                    color: successRate >= 90 ? '#059669' : successRate >= 70 ? '#d97706' : '#dc2626'
                                                }}>{successRate}% สำเร็จ</div>
                                            </div>

                                            {/* Actions */}
                                            <div style={{
                                                width: 100, flexShrink: 0, display: 'flex', alignItems: 'center',
                                                justifyContent: 'flex-end', gap: 6, paddingLeft: 8
                                            }}>
                                                <button
                                                    onClick={(e) => openExportModal(bc.code, bc.docTypes, e)}
                                                    style={{
                                                        padding: '4px 10px', border: 'none', borderRadius: 6,
                                                        background: 'linear-gradient(135deg, #10b981, #059669)',
                                                        color: '#fff', cursor: 'pointer',
                                                        fontSize: 9, fontWeight: 700,
                                                        display: 'flex', alignItems: 'center', gap: 3,
                                                        boxShadow: '0 1px 4px rgba(16,185,129,0.2)',
                                                        transition: 'all 0.15s'
                                                    }}
                                                    onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                                                    onMouseOut={e => e.currentTarget.style.transform = 'none'}
                                                >📥 Excel</button>
                                                <span style={{
                                                    fontSize: 10, color: '#0d9488', fontWeight: 700,
                                                    whiteSpace: 'nowrap'
                                                }}>→</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    gap: 6, marginTop: 14, paddingTop: 14,
                                    borderTop: '1px solid #f1f5f9'
                                }}>
                                    <button
                                        disabled={safePage <= 1}
                                        onClick={() => setBcPage(p => Math.max(1, p - 1))}
                                        style={{
                                            padding: '5px 12px', border: '1px solid #e5e7eb', borderRadius: 6,
                                            background: safePage <= 1 ? '#f8fafc' : '#fff',
                                            color: safePage <= 1 ? '#cbd5e1' : '#334155',
                                            cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
                                            fontSize: 11, fontWeight: 700, transition: 'all 0.15s'
                                        }}
                                    >← ก่อนหน้า</button>

                                    {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                                        .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                                        .reduce((acc, p, i, arr) => {
                                            if (i > 0 && p - arr[i - 1] > 1) acc.push('...')
                                            acc.push(p)
                                            return acc
                                        }, [])
                                        .map((p, idx) => p === '...' ? (
                                            <span key={`dots-${idx}`} style={{ fontSize: 11, color: '#94a3b8', padding: '0 2px' }}>…</span>
                                        ) : (
                                            <button key={p} onClick={() => setBcPage(p)}
                                                style={{
                                                    width: 30, height: 30, border: '1px solid',
                                                    borderRadius: 6, fontSize: 11, fontWeight: 700,
                                                    cursor: 'pointer', transition: 'all 0.15s',
                                                    background: p === safePage ? 'linear-gradient(135deg, #0d9488, #059669)' : '#fff',
                                                    color: p === safePage ? '#fff' : '#64748b',
                                                    borderColor: p === safePage ? '#0d9488' : '#e5e7eb'
                                                }}
                                            >{p}</button>
                                        ))
                                    }

                                    <button
                                        disabled={safePage >= totalPages}
                                        onClick={() => setBcPage(p => Math.min(totalPages, p + 1))}
                                        style={{
                                            padding: '5px 12px', border: '1px solid #e5e7eb', borderRadius: 6,
                                            background: safePage >= totalPages ? '#f8fafc' : '#fff',
                                            color: safePage >= totalPages ? '#cbd5e1' : '#334155',
                                            cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
                                            fontSize: 11, fontWeight: 700, transition: 'all 0.15s'
                                        }}
                                    >ถัดไป →</button>

                                    <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginLeft: 8 }}>
                                        หน้า {safePage}/{totalPages} ({sorted.length} บริษัท)
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                    )
                })()}

                {/* ══════ DOC TYPES + TOP SELLERS + RECENT FILES ══════ */}
                {dashStats && (
                    <div className="animate-in" style={{ animationDelay: '.2s' }}>

                        {/* ══════ DOC TYPES + TOP SELLERS ══════ */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                            {/* Document Types */}
                            <div style={{
                                background: '#fff', borderRadius: 14, padding: '16px 20px',
                                border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                            }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#2d2d3a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span>📋</span> ประเภทเอกสาร
                                </div>
                                {(dashStats.byDocType || []).length === 0 ?
                                    <div style={{ fontSize: 12, color: '#a1a5b3', textAlign: 'center', padding: 20 }}>ยังไม่มีข้อมูล</div>
                                    : (dashStats.byDocType || []).map((dt, i) => (
                                        <div key={i} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '8px 0', borderBottom: i < dashStats.byDocType.length - 1 ? '1px solid #f5f5f5' : 'none'
                                        }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{dt.type || 'ไม่ระบุ'}</span>
                                            <span style={{
                                                fontSize: 11, fontWeight: 700, background: '#fff7ed', color: '#ea580c',
                                                padding: '2px 10px', borderRadius: 10
                                            }}>{dt.count} ไฟล์</span>
                                        </div>
                                    ))}
                            </div>

                            {/* Top Sellers */}
                            <div style={{
                                background: '#fff', borderRadius: 14, padding: '16px 20px',
                                border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                            }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#2d2d3a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span>🏢</span> บริษัทที่พบมากที่สุด
                                </div>
                                {(dashStats.topSellers || []).length === 0 ?
                                    <div style={{ fontSize: 12, color: '#a1a5b3', textAlign: 'center', padding: 20 }}>ยังไม่มีข้อมูล</div>
                                    : (dashStats.topSellers || []).map((seller, i) => (
                                        <div key={i} style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '8px 0', borderBottom: i < dashStats.topSellers.length - 1 ? '1px solid #f5f5f5' : 'none'
                                        }}>
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seller.name}</div>
                                                <div style={{ fontSize: 10, color: '#94a3b8' }}>{seller.count} เอกสาร · ฿{fmtNum(seller.totalAmount)}</div>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>

                        {/* ══════ RECENT FILES ══════ */}
                        <div style={{
                            background: '#fff', borderRadius: 14, padding: '16px 20px', marginBottom: 20,
                            border: '1px solid #f0f0f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                        }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#2d2d3a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>🕐</span> เอกสารที่อ่านล่าสุด
                                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <button
                                        onClick={handleExportAll}
                                        disabled={exportingAll}
                                        style={{
                                            padding: '5px 14px', border: 'none', borderRadius: 8,
                                            background: exportingAll ? '#94a3b8' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                                            color: '#fff', cursor: exportingAll ? 'not-allowed' : 'pointer',
                                            fontSize: 11, fontWeight: 700,
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            boxShadow: '0 2px 6px rgba(34,197,94,0.25)',
                                            transition: 'all 0.15s'
                                        }}
                                        onMouseOver={e => { if (!exportingAll) e.currentTarget.style.transform = 'translateY(-1px)' }}
                                        onMouseOut={e => e.currentTarget.style.transform = 'none'}
                                    >
                                        {exportingAll ? '⏳ กำลังส่งออก...' : '📥 ส่งออก Excel'}
                                    </button>
                                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{dashStats.recentFiles?.length || 0} รายการ</span>
                                </span>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid #f97316' }}>
                                            {['สถานะ', 'ชื่อไฟล์', 'ประเภท', 'เลขเอกสาร', 'บริษัท', 'ยอดรวม', 'เวลา', 'วันที่', ''].map(h => (
                                                <th key={h} style={{
                                                    padding: '8px 6px', textAlign: 'left', fontSize: 10,
                                                    fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap',
                                                    background: 'linear-gradient(135deg, #fff7ed, #ffedd5)'
                                                }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(dashStats.recentFiles || []).map((f, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f8fafc' }}
                                                onMouseOver={e => e.currentTarget.style.background = '#fffbf5'}
                                                onMouseOut={e => e.currentTarget.style.background = ''}>
                                                <td style={{ padding: '6px', textAlign: 'center' }}>
                                                    {f.status === 'done' ? '✅' : '❌'}
                                                </td>
                                                <td style={{ padding: '6px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: '#334155' }}>
                                                    {f.file_name}
                                                </td>
                                                <td style={{ padding: '6px', color: '#64748b' }}>{f.document_type || '—'}</td>
                                                <td style={{ padding: '6px', fontFamily: "'JetBrains Mono',monospace", color: '#3b82f6', fontWeight: 600 }}>
                                                    {f.document_number || '—'}
                                                </td>
                                                <td style={{ padding: '6px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#334155' }}>
                                                    {f.seller_name || '—'}
                                                </td>
                                                <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700, color: '#ea580c', fontFamily: "'JetBrains Mono',monospace" }}>
                                                    {f.total ? `฿${fmtNum(f.total)}` : '—'}
                                                </td>
                                                <td style={{ padding: '6px', color: '#94a3b8', fontSize: 10 }}>
                                                    {f.processing_time_ms ? `${(f.processing_time_ms / 1000).toFixed(1)}s` : '—'}
                                                </td>
                                                <td style={{ padding: '6px', color: '#94a3b8', fontSize: 10, whiteSpace: 'nowrap' }}>
                                                    {f.created_at ? new Date(f.created_at).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                </td>
                                                <td style={{ padding: '6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                    {deletingId === f.id ? (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(f.id) }} style={{
                                                                background: '#ef4444', border: 'none', borderRadius: 6,
                                                                padding: '3px 10px', fontSize: 10, fontWeight: 700, color: '#fff',
                                                                cursor: 'pointer'
                                                            }}>ลบ</button>
                                                            <button onClick={(e) => { e.stopPropagation(); setDeletingId(null) }} style={{
                                                                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6,
                                                                padding: '3px 8px', fontSize: 10, fontWeight: 600, color: '#64748b',
                                                                cursor: 'pointer'
                                                            }}>ยกเลิก</button>
                                                        </span>
                                                    ) : (
                                                        <button onClick={(e) => { e.stopPropagation(); setDeletingId(f.id) }} style={{
                                                            background: 'none', border: '1px solid #fecaca', borderRadius: 6,
                                                            padding: '3px 10px', fontSize: 10, fontWeight: 600, color: '#ef4444',
                                                            cursor: 'pointer', transition: 'all .15s'
                                                        }}
                                                            onMouseOver={e => { e.currentTarget.style.background = '#fef2f2' }}
                                                            onMouseOut={e => { e.currentTarget.style.background = 'none' }}
                                                        >🗑️</button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

            </main>

            {/* ══════ EXPORT FILTER MODAL ══════ */}
            {exportModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'fadeIn .2s ease'
                }} onClick={() => setExportModal(null)}>
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
                                <div style={{ fontSize: 12, opacity: 0.85 }}>เลือกเงื่อนไขที่ต้องการส่งออก — {exportModal.buildCode}</div>
                            </div>
                            <button onClick={() => setExportModal(null)} style={{
                                background: 'rgba(255,255,255,0.15)', border: 'none',
                                fontSize: 18, cursor: 'pointer', color: '#fff', padding: '4px 10px',
                                borderRadius: 8, transition: 'background .15s'
                            }}
                                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                                onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                            >✕</button>
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
                                                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                transition: 'all .15s'
                                            }}
                                            onMouseOver={e => { if (!p.active) e.currentTarget.style.borderColor = '#22c55e' }}
                                            onMouseOut={e => { if (!p.active) e.currentTarget.style.borderColor = '#e2e8f0' }}
                                        >{p.label}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Date Range */}
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>📅 ช่วงวันที่</div>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    <input type="date" value={exportDateFrom}
                                        onChange={e => setExportDateFrom(e.target.value)}
                                        style={{
                                            flex: 1, padding: '10px 14px', borderRadius: 10,
                                            border: '1.5px solid #e2e8f0', fontSize: 13,
                                            fontFamily: "'Inter',sans-serif", outline: 'none',
                                            transition: 'border-color .15s'
                                        }}
                                        onFocus={e => e.target.style.borderColor = '#22c55e'}
                                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                    />
                                    <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>ถึง</span>
                                    <input type="date" value={exportDateTo}
                                        onChange={e => setExportDateTo(e.target.value)}
                                        style={{
                                            flex: 1, padding: '10px 14px', borderRadius: 10,
                                            border: '1.5px solid #e2e8f0', fontSize: 13,
                                            fontFamily: "'Inter',sans-serif", outline: 'none',
                                            transition: 'border-color .15s'
                                        }}
                                        onFocus={e => e.target.style.borderColor = '#22c55e'}
                                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                    />
                                </div>
                                {!exportDateFrom && !exportDateTo && (
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>ไม่ระบุ = ส่งออกทั้งหมด</div>
                                )}
                            </div>

                            {/* Document Type Filter */}
                            {exportModal.docTypes && exportModal.docTypes.length > 0 && (
                                <div style={{ marginBottom: 20 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>📋 ประเภทเอกสาร</div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {exportModal.docTypes.map((dt, i) => {
                                            const isSelected = exportDocTypes.includes(dt.type)
                                            return (
                                                <button key={i} onClick={() => toggleDocType(dt.type)}
                                                    style={{
                                                        padding: '6px 14px', border: '1.5px solid',
                                                        borderColor: isSelected ? '#3b82f6' : '#e2e8f0',
                                                        borderRadius: 10, background: isSelected ? '#eff6ff' : '#fff',
                                                        color: isSelected ? '#2563eb' : '#64748b',
                                                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                                        transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 4
                                                    }}>
                                                    {isSelected ? '✅' : '⬜'} {dt.type} ({dt.count})
                                                </button>
                                            )
                                        })}
                                    </div>
                                    {exportDocTypes.length === 0 && (
                                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>ไม่เลือก = ส่งออกทุกประเภท</div>
                                    )}
                                </div>
                            )}

                            {/* Folder Path Filter */}
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>📁 กรองจาก Folder Path <span style={{ fontWeight: 500, color: '#94a3b8' }}>(เฉพาะไฟล์ใน folder)</span></div>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        value={exportFolderPath}
                                        onChange={e => setExportFolderPath(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && exportFolderPath.trim()) handleScanExportFolder() }}
                                        placeholder='วาง path โฟลเดอร์ที่มีไฟล์ PDF...'
                                        style={{
                                            flex: 1, padding: '8px 12px', borderRadius: 8,
                                            border: '1.5px solid #e2e8f0', fontSize: 12,
                                            fontFamily: "'JetBrains Mono', monospace", outline: 'none',
                                            transition: 'border-color .15s'
                                        }}
                                        onFocus={e => e.target.style.borderColor = '#22c55e'}
                                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                    />
                                    <button
                                        onClick={handleScanExportFolder}
                                        disabled={scanningExportFolder || !exportFolderPath.trim()}
                                        style={{
                                            padding: '8px 14px', border: 'none', borderRadius: 8,
                                            background: scanningExportFolder ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                                            color: '#fff', cursor: scanningExportFolder ? 'not-allowed' : 'pointer',
                                            fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        {scanningExportFolder ? '⏳' : '🔍 สแกน'}
                                    </button>
                                </div>
                                {!exportFolderPath && (
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>ไม่ระบุ = ส่งออกทั้งหมดตามเงื่อนไขอื่น</div>
                                )}
                                {exportFolderScan && (
                                    <div style={{
                                        marginTop: 8, padding: '8px 12px', borderRadius: 8,
                                        background: '#f0fdf4', border: '1px solid #d1fae5',
                                        display: 'flex', gap: 12, fontSize: 11
                                    }}>
                                        <span>📄 PDF: <b>{exportFolderScan.totalInFolder}</b></span>
                                        <span>✅ พบ: <b style={{ color: '#22c55e' }}>{exportFolderScan.matched}</b></span>
                                        <span>❌ ไม่พบ: <b style={{ color: exportFolderScan.unmatched > 0 ? '#ef4444' : '#94a3b8' }}>{exportFolderScan.unmatched}</b></span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '14px 24px', borderTop: '1px solid #e5e7eb',
                            display: 'flex', justifyContent: 'flex-end', gap: 10,
                            background: '#f8fafc'
                        }}>
                            <button onClick={() => setExportModal(null)} style={{
                                padding: '10px 20px', border: '1.5px solid #e2e8f0', borderRadius: 10,
                                background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 600,
                                cursor: 'pointer', transition: 'all .15s'
                            }}
                                onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                onMouseOut={e => e.currentTarget.style.background = '#fff'}
                            >ยกเลิก</button>
                            <button onClick={handleExportExcel}
                                disabled={exporting === exportModal.buildCode}
                                style={{
                                    padding: '10px 24px', border: 'none', borderRadius: 10,
                                    background: exporting === exportModal.buildCode
                                        ? '#94a3b8' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    color: '#fff', fontSize: 13, fontWeight: 700,
                                    cursor: exporting === exportModal.buildCode ? 'not-allowed' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    boxShadow: '0 4px 12px rgba(34,197,94,0.3)',
                                    transition: 'all .15s'
                                }}>
                                {exporting === exportModal.buildCode ? '⏳ กำลังส่งออก...' : '📥 ส่งออก Excel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
                @keyframes slideUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
                @keyframes ocr-card-enter { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
            `}</style>

        </div>
    )
}
