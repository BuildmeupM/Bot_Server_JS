import { useState, useEffect } from 'react'
import Sidebar from '../../components/Sidebar'
import { getUsageSummary, deleteUsageLog } from '../../services/api'
import toast from 'react-hot-toast'

export default function DashboardPage() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')

    const loadData = async () => {
        setLoading(true)
        try {
            const params = {}
            if (dateFrom) params.date_from = dateFrom
            if (dateTo) params.date_to = dateTo
            const res = await getUsageSummary(params)
            setData(res.data)
        } catch (err) {
            console.error('Dashboard load error:', err)
        } finally { setLoading(false) }
    }

    useEffect(() => { loadData() }, [])

    const handleDeleteLog = async (id) => {
        if (!confirm('ยืนยันลบ log รายการนี้?')) return
        try {
            await deleteUsageLog(id)
            toast.success('ลบ log สำเร็จ')
            loadData()
        } catch (err) {
            toast.error('ไม่สามารถลบ log ได้')
        }
    }

    const formatDate = (str) => {
        if (!str) return '—'
        return new Date(str).toLocaleString('th-TH', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        })
    }

    const formatShortDate = (str) => {
        if (!str) return '—'
        return new Date(str).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
    }

    const maxTrend = data?.daily_trend ? Math.max(...data.daily_trend.map(d => d.count), 1) : 1

    return (
        <div className="layout">
            <Sidebar active="dashboard" />
            <main className="main-content" style={{ padding: 24, overflow: 'auto' }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 24
                }}>
                    <div>
                        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>
                            📊 Dashboard — สรุปการใช้งานระบบ
                        </h1>
                        <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>
                            ติดตามการเข้าใช้งานหน้าจัดการไฟล์และเอกสาร
                        </p>
                    </div>
                    <button onClick={loadData} disabled={loading}
                        style={{
                            padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
                            background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600
                        }}>
                        🔄 {loading ? 'กำลังโหลด...' : 'รีเฟรช'}
                    </button>
                </div>

                {/* Date Filter */}
                <div style={{
                    display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20,
                    padding: '12px 16px', background: '#f8fafc', borderRadius: 12,
                    border: '1px solid #e2e8f0'
                }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>📅 ช่วงวันที่:</span>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                        style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                        style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <button onClick={loadData}
                        style={{
                            padding: '6px 14px', borderRadius: 8, border: 'none',
                            background: 'linear-gradient(135deg, #f97316, #fb923c)', color: '#fff',
                            fontSize: 12, fontWeight: 600, cursor: 'pointer'
                        }}>
                        🔍 ค้นหา
                    </button>
                    {(dateFrom || dateTo) && (
                        <button onClick={() => { setDateFrom(''); setDateTo(''); setTimeout(loadData, 100) }}
                            style={{
                                padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                                background: '#fff', fontSize: 12, cursor: 'pointer'
                            }}>
                            ✕ ล้าง
                        </button>
                    )}
                </div>

                {loading && !data && (
                    <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
                        <div>กำลังโหลดข้อมูล...</div>
                    </div>
                )}

                {data && (
                    <>
                        {/* Stats Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                            {[
                                { icon: '📊', label: 'ใช้งานทั้งหมด', value: data.stats.total, color: '#3b82f6', bg: '#eff6ff' },
                                { icon: '📅', label: 'วันนี้', value: data.stats.today, color: '#f97316', bg: '#fff7ed' },
                                { icon: '🏢', label: 'บริษัทที่เข้าใช้', value: data.stats.unique_companies, color: '#22c55e', bg: '#f0fdf4' },
                                { icon: '👤', label: 'ผู้ใช้งาน', value: data.stats.unique_users, color: '#a855f7', bg: '#faf5ff' },
                            ].map((card, i) => (
                                <div key={i} style={{
                                    background: '#fff', borderRadius: 16, padding: '20px 24px',
                                    border: '1px solid #f1f5f9',
                                    boxShadow: '0 1px 3px rgba(0,0,0,.04)',
                                    display: 'flex', alignItems: 'center', gap: 16
                                }}>
                                    <div style={{
                                        width: 48, height: 48, borderRadius: 12, display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', fontSize: 22,
                                        background: card.bg
                                    }}>{card.icon}</div>
                                    <div>
                                        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{card.label}</div>
                                        <div style={{ fontSize: 28, fontWeight: 700, color: card.color, lineHeight: 1 }}>
                                            {card.value.toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Page Breakdown + Daily Trend */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 24 }}>
                            {/* Page breakdown */}
                            <div style={{
                                background: '#fff', borderRadius: 16, padding: 20,
                                border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.04)'
                            }}>
                                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#334155' }}>
                                    📋 แยกตามหน้า
                                </h3>
                                {data.by_page.map((p, i) => {
                                    const total = data.stats.total || 1
                                    const pct = Math.round((p.count / total) * 100)
                                    const pageLabel = p.page === 'manage' ? '📁 จัดการไฟล์' : '🔧 จัดการเอกสาร'
                                    const pageColor = p.page === 'manage' ? '#3b82f6' : '#f97316'
                                    return (
                                        <div key={i} style={{ marginBottom: 14 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                                                <span style={{ fontWeight: 600, color: '#475569' }}>{pageLabel}</span>
                                                <span style={{ color: '#94a3b8' }}>{p.count} ({pct}%)</span>
                                            </div>
                                            <div style={{
                                                height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden'
                                            }}>
                                                <div style={{
                                                    width: `${pct}%`, height: '100%', borderRadius: 4,
                                                    background: `linear-gradient(90deg, ${pageColor}, ${pageColor}88)`,
                                                    transition: 'width .5s ease'
                                                }} />
                                            </div>
                                        </div>
                                    )
                                })}
                                {data.by_page.length === 0 && (
                                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: 20, fontSize: 12 }}>ยังไม่มีข้อมูล</div>
                                )}
                            </div>

                            {/* Daily trend chart */}
                            <div style={{
                                background: '#fff', borderRadius: 16, padding: 20,
                                border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.04)'
                            }}>
                                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#334155' }}>
                                    📈 แนวโน้ม 14 วันล่าสุด
                                </h3>
                                <div style={{
                                    display: 'flex', alignItems: 'flex-end', gap: 6, height: 120,
                                    padding: '0 8px'
                                }}>
                                    {data.daily_trend.map((d, i) => (
                                        <div key={i} style={{
                                            flex: 1, display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', gap: 4
                                        }}>
                                            <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>{d.count}</span>
                                            <div style={{
                                                width: '100%', maxWidth: 32,
                                                height: `${Math.max((d.count / maxTrend) * 80, 4)}px`,
                                                background: 'linear-gradient(180deg, #f97316, #fb923c)',
                                                borderRadius: '4px 4px 0 0',
                                                transition: 'height .3s ease'
                                            }} />
                                            <span style={{ fontSize: 8, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                                {formatShortDate(d.date)}
                                            </span>
                                        </div>
                                    ))}
                                    {data.daily_trend.length === 0 && (
                                        <div style={{ flex: 1, textAlign: 'center', color: '#94a3b8', fontSize: 12, paddingBottom: 40 }}>
                                            ยังไม่มีข้อมูล
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Company Table */}
                        <div style={{
                            background: '#fff', borderRadius: 16, padding: 20,
                            border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.04)',
                            marginBottom: 24
                        }}>
                            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#334155' }}>
                                🏢 บริษัทที่เข้าใช้งาน ({data.by_company.length})
                            </h3>
                            {data.by_company.length > 0 ? (
                                <div style={{ overflow: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                                                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>#</th>
                                                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>รหัส</th>
                                                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>ชื่อบริษัท</th>
                                                <th style={{ textAlign: 'center', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>ใช้งานทั้งหมด</th>
                                                <th style={{ textAlign: 'center', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>📁 จัดการไฟล์</th>
                                                <th style={{ textAlign: 'center', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>🔧 จัดการเอกสาร</th>
                                                <th style={{ textAlign: 'center', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>ผู้ใช้</th>
                                                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>เข้าล่าสุด</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.by_company.map((c, i) => (
                                                <tr key={i} style={{
                                                    borderBottom: '1px solid #f8fafc',
                                                    transition: 'background .15s'
                                                }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#fafbfd'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{i + 1}</td>
                                                    <td style={{ padding: '10px 12px' }}>
                                                        <span style={{
                                                            padding: '2px 8px', borderRadius: 6,
                                                            background: '#eff6ff', color: '#3b82f6',
                                                            fontSize: 11, fontWeight: 600
                                                        }}>{c.company_code}</span>
                                                    </td>
                                                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>{c.company_name}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#f97316' }}>
                                                        {c.total_visits}
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#3b82f6' }}>{c.manage_count}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#f97316' }}>{c.tools_count}</td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#a855f7' }}>{c.unique_users}</td>
                                                    <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: 11 }}>{formatDate(c.last_visit)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32, fontSize: 13 }}>
                                    <div style={{ fontSize: 32, marginBottom: 8 }}>🏢</div>
                                    ยังไม่มีข้อมูลบริษัทที่เข้าใช้งาน
                                </div>
                            )}
                        </div>

                        {/* Recent Logs */}
                        <div style={{
                            background: '#fff', borderRadius: 16, padding: 20,
                            border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,.04)'
                        }}>
                            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#334155' }}>
                                🕐 Log ล่าสุด (30 รายการ)
                            </h3>
                            {data.recent_logs.length > 0 ? (
                                <div style={{ overflow: 'auto', maxHeight: 400 }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff' }}>
                                                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#64748b', fontWeight: 600 }}>เวลา</th>
                                                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#64748b', fontWeight: 600 }}>ผู้ใช้</th>
                                                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#64748b', fontWeight: 600 }}>หน้า</th>
                                                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#64748b', fontWeight: 600 }}>การกระทำ</th>
                                                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#64748b', fontWeight: 600 }}>บริษัท</th>
                                                <th style={{ textAlign: 'left', padding: '8px 10px', color: '#64748b', fontWeight: 600 }}>Path</th>
                                                <th style={{ textAlign: 'center', padding: '8px 10px', color: '#64748b', fontWeight: 600, width: 40 }}>ลบ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.recent_logs.map((log) => {
                                                const actionLabels = {
                                                    browse: '👁️ เปิดโฟลเดอร์',
                                                    rename: '✏️ เปลี่ยนชื่อ',
                                                    batch_rename: '📦 เปลี่ยนชื่อชุด',
                                                    split_pdf: '✂️ แยก PDF',
                                                    unlock_pdf: '🔓 ปลดล็อค PDF',
                                                    convert_heic: '🖼️ แปลง HEIC',
                                                    convert_heic_batch: '🖼️ แปลง HEIC ชุด',
                                                    merge_pdf: '📎 รวม PDF',
                                                    pdf_to_image: '🖼️ PDF เป็นภาพ',
                                                    create_zip: '📁 รวมไฟล์ ZIP',
                                                    unlock_excel: '🔓 ปลดล็อค Excel',
                                                    extract_archive: '📂 แตกไฟล์',
                                                }
                                                const actionColors = {
                                                    browse: '#64748b',
                                                    rename: '#22c55e',
                                                    batch_rename: '#a855f7',
                                                    split_pdf: '#ef4444',
                                                    unlock_pdf: '#f59e0b',
                                                    convert_heic: '#06b6d4',
                                                    convert_heic_batch: '#06b6d4',
                                                    merge_pdf: '#3b82f6',
                                                    pdf_to_image: '#8b5cf6',
                                                    create_zip: '#f97316',
                                                    unlock_excel: '#10b981',
                                                    extract_archive: '#ec4899',
                                                }
                                                return (
                                                    <tr key={log.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                                                        <td style={{ padding: '8px 10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                                            {formatDate(log.created_at)}
                                                        </td>
                                                        <td style={{ padding: '8px 10px', fontWeight: 600, color: '#334155' }}>
                                                            {log.username || '—'}
                                                        </td>
                                                        <td style={{ padding: '8px 10px' }}>
                                                            <span style={{
                                                                padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                                                background: log.page === 'manage' ? '#eff6ff' : '#fff7ed',
                                                                color: log.page === 'manage' ? '#3b82f6' : '#f97316'
                                                            }}>
                                                                {log.page === 'manage' ? '📁 ไฟล์' : '🔧 เอกสาร'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '8px 10px', color: actionColors[log.action] || '#64748b' }}>
                                                            {actionLabels[log.action] || log.action}
                                                        </td>
                                                        <td style={{ padding: '8px 10px', fontWeight: 500, color: '#1e293b' }}>
                                                            {log.company_name || '—'}
                                                        </td>
                                                        <td style={{
                                                            padding: '8px 10px', color: '#94a3b8', maxWidth: 200,
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                        }} title={log.path_used}>
                                                            {log.path_used || '—'}
                                                        </td>
                                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                            <button onClick={() => handleDeleteLog(log.id)}
                                                                style={{
                                                                    width: 24, height: 24, borderRadius: 6,
                                                                    border: '1px solid #fecaca', background: '#fef2f2',
                                                                    color: '#ef4444', cursor: 'pointer', fontSize: 11,
                                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                                    transition: 'all .15s'
                                                                }}
                                                                onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff' }}
                                                                onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#ef4444' }}
                                                                title="ลบรายการนี้"
                                                            >✕</button>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32, fontSize: 13 }}>
                                    <div style={{ fontSize: 32, marginBottom: 8 }}>🕐</div>
                                    ยังไม่มี log การใช้งาน
                                </div>
                            )}
                        </div>
                    </>
                )}
            </main>
        </div>
    )
}
