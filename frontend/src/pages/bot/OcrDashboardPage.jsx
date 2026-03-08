import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../../components/Sidebar'

const fmtNum = (n) => n != null ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'

export default function OcrDashboardPage() {
    const navigate = useNavigate()
    const [dashStats, setDashStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [deletingId, setDeletingId] = useState(null)
    const [exporting, setExporting] = useState(null) // buildCode currently exporting

    // ── ดาวน์โหลด Excel จาก backend API ──
    const handleExportExcel = async (buildCode, e) => {
        if (e) e.stopPropagation()
        setExporting(buildCode)
        try {
            const res = await fetch(`http://localhost:4000/api/ocr/export-excel/${encodeURIComponent(buildCode)}`)
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                alert(err.error || 'เกิดข้อผิดพลาดในการส่งออก Excel')
                return
            }
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            // ดึงชื่อไฟล์จาก Content-Disposition header
            const cd = res.headers.get('Content-Disposition')
            const match = cd && cd.match(/filename="?([^"]+)"?/)
            a.download = match ? decodeURIComponent(match[1]) : `OCR_Export_${buildCode}.xlsx`
            document.body.appendChild(a)
            a.click()
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
        } catch (err) {
            console.error('Export error:', err)
            alert('เกิดข้อผิดพลาดในการส่งออก Excel')
        } finally {
            setExporting(null)
        }
    }

    useEffect(() => { fetchStats() }, [])

    const fetchStats = async () => {
        setLoading(true)
        try {
            const res = await fetch('http://localhost:4000/api/ocr/dashboard-stats')
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
            const res = await fetch(`http://localhost:4000/api/ocr/history/${id}`, { method: 'DELETE' })
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

                {/* ══════ BUILD CODE SECTION ══════ */}
                {dashStats && (dashStats.byBuildCode || []).length > 0 && (
                    <div className="animate-in" style={{ animationDelay: '.18s' }}>
                        <div style={{
                            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                            borderRadius: 16, padding: '20px 24px', marginBottom: 20,
                            border: '1px solid #bfdbfe'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                <span style={{ fontSize: 18 }}>🏗️</span>
                                <span style={{ fontSize: 15, fontWeight: 700, color: '#1e3a5f' }}>บริษัทภายในที่ใช้ระบบ OCR</span>
                                <span style={{
                                    marginLeft: 'auto', fontSize: 11, padding: '3px 10px', borderRadius: 8,
                                    background: '#fff', color: '#3b82f6', fontWeight: 600, border: '1px solid #93c5fd'
                                }}>{dashStats.byBuildCode.length} บริษัท</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                                {dashStats.byBuildCode.map((bc, i) => (
                                    <div key={i} style={{
                                        background: '#fff', borderRadius: 12, padding: '14px 16px',
                                        border: '1px solid #e0e7ff', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                        transition: 'transform .15s, box-shadow .15s', cursor: 'pointer'
                                    }}
                                        onClick={() => navigate(`/ocr-report/${encodeURIComponent(bc.code)}`)}
                                        onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(59,130,246,0.12)' }}
                                        onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                            <span style={{
                                                fontSize: 13, fontWeight: 800, color: '#1e40af',
                                                background: '#eff6ff', padding: '4px 12px', borderRadius: 8,
                                                fontFamily: "'JetBrains Mono', monospace"
                                            }}>🏗️ {bc.code}</span>
                                            {bc.name && (
                                                <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>{bc.name}</span>
                                            )}
                                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <button
                                                    onClick={(e) => handleExportExcel(bc.code, e)}
                                                    disabled={exporting === bc.code}
                                                    style={{
                                                        padding: '4px 12px', border: 'none', borderRadius: 8,
                                                        background: exporting === bc.code
                                                            ? '#94a3b8' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                                                        color: '#fff', cursor: exporting === bc.code ? 'not-allowed' : 'pointer',
                                                        fontSize: 10, fontWeight: 700,
                                                        display: 'flex', alignItems: 'center', gap: 4,
                                                        boxShadow: '0 2px 6px rgba(34,197,94,0.25)',
                                                        transition: 'all 0.15s'
                                                    }}
                                                    onMouseOver={e => { if (exporting !== bc.code) e.currentTarget.style.transform = 'translateY(-1px)' }}
                                                    onMouseOut={e => e.currentTarget.style.transform = 'none'}
                                                >
                                                    {exporting === bc.code ? '⏳' : '📥'} {exporting === bc.code ? 'กำลังส่งออก...' : 'Excel'}
                                                </button>
                                                <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>ดูรายงาน →</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                            <div>
                                                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>📄 ไฟล์ทั้งหมด</div>
                                                <div style={{ fontSize: 18, fontWeight: 800, color: '#334155' }}>{bc.totalFiles}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>✅ สำเร็จ</div>
                                                <div style={{ fontSize: 18, fontWeight: 800, color: '#22c55e' }}>{bc.successCount}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>❌ ผิดพลาด</div>
                                                <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444' }}>{bc.errorCount}</div>
                                            </div>
                                        </div>
                                        {/* Doc type badges */}
                                        {(bc.docTypes || []).length > 0 && (
                                            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                {bc.docTypes.map((dt, j) => (
                                                    <span key={j} style={{
                                                        fontSize: 9, padding: '2px 8px', borderRadius: 6,
                                                        background: '#f0fdf4', color: '#166534', fontWeight: 600,
                                                        border: '1px solid #bbf7d0'
                                                    }}>📋 {dt.type} ({dt.count})</span>
                                                ))}
                                            </div>
                                        )}
                                        <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8', display: 'flex', gap: 12 }}>
                                            <span>🕐 ใช้ครั้งแรก: {bc.firstUsed ? new Date(bc.firstUsed).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                                            <span>📅 ล่าสุด: {bc.lastUsed ? new Date(bc.lastUsed).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

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
                                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{dashStats.recentFiles?.length || 0} รายการ</span>
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

        </div>
    )
}
