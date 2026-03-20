import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../../components/Sidebar'
import { getBotJobs, getBotLogs, getBatchJobs, stopBotJob } from '../../services/api'

const STATUS_CONFIG = {
    queued:    { label: 'รอคิว',       icon: '⏳', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
    running:   { label: 'กำลังทำงาน', icon: '⚡', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
    logged_in: { label: 'Login แล้ว', icon: '🔐', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
    working:   { label: 'กรอกข้อมูล', icon: '⚙️', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
    done:      { label: 'เสร็จสิ้น',   icon: '✅', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
    finished:  { label: 'เสร็จสิ้น',   icon: '✅', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
    error:     { label: 'ผิดพลาด',    icon: '❌', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    stopped:   { label: 'หยุดแล้ว',   icon: '⏹️', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
}

const translateMsg = (msg) => {
    const m = (msg || '').replace(/^[❌⚠️✅🔐📋🔑⚙️📝▶️✕■⏹️🤖⏳🐛🚀🌐🔧🔗📧🔒🖱️📁]+\s*/g, '').trim()
    const patterns = [
        [/page\.goto.*Target page.*closed/i, 'หน้าเว็บถูกปิดไปก่อนที่บอทจะเปิดหน้าใหม่'],
        [/page\.waitForTimeout.*closed/i, 'หน้าเว็บถูกปิดขณะบอทกำลังรอการโหลด'],
        [/page\.waitForSelector.*closed/i, 'หน้าเว็บถูกปิดขณะรอหาปุ่มหรือช่องกรอกข้อมูล'],
        [/page\.click.*closed/i, 'หน้าเว็บถูกปิดขณะบอทกำลังกดปุ่ม'],
        [/Target page.*context.*closed/i, 'เบราว์เซอร์ถูกปิดกลางคัน'],
        [/browser has been closed/i, 'เบราว์เซอร์ถูกปิดไปแล้ว'],
        [/context.*closed/i, 'เบราว์เซอร์ถูกปิดกลางคัน'],
        [/timeout.*exceeded/i, 'หน้าเว็บโหลดนานเกินไป'],
        [/TimeoutError/i, 'หน้าเว็บโหลดนานเกินไป'],
        [/net::ERR_/i, 'ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้'],
        [/Navigation failed/i, 'เปิดหน้าเว็บไม่สำเร็จ'],
        [/Page ถูกปิดจากภายนอก/i, 'หน้าเว็บถูกปิดจากภายนอก'],
        [/selector.*is not visible/i, 'บอทหาปุ่มหรือช่องกรอกข้อมูลไม่เจอ'],
        [/Cannot read prop/i, 'เกิดข้อผิดพลาดในระบบ'],
        [/ECONNREFUSED/i, 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'],
        [/ENOTFOUND/i, 'หาเซิร์ฟเวอร์ปลายทางไม่เจอ'],
    ]
    for (const [pattern, translation] of patterns) {
        if (pattern.test(m)) return translation
    }
    if (/[\u0E00-\u0E7F]/.test(m)) return m
    return m
}

export default function BotDashboardPage() {
    const navigate = useNavigate()
    const [jobs, setJobs] = useState([])
    const [queueInfo, setQueueInfo] = useState({ runningCount: 0, queuedCount: 0, maxConcurrent: 3 })
    const [selectedJobId, setSelectedJobId] = useState(null)
    const [jobLogs, setJobLogs] = useState([])
    const [loadingLogs, setLoadingLogs] = useState(false)
    const [lastUpdate, setLastUpdate] = useState(null)
    const [ocrJobs, setOcrJobs] = useState([])
    const [expandedBills, setExpandedBills] = useState(new Set()) // tracks OPENED bills
    const pausePolling = useRef(false)

    const fetchJobs = useCallback(async () => {
        if (pausePolling.current) return
        try {
            const [botRes, ocrRes] = await Promise.all([getBotJobs(), getBatchJobs().catch(() => ({ data: { jobs: [] } }))])
            setJobs(botRes.data.jobs || [])
            setQueueInfo({
                runningCount: botRes.data.runningCount || 0,
                queuedCount: botRes.data.queuedCount || 0,
                maxConcurrent: botRes.data.maxConcurrent || 3,
            })
            setOcrJobs(ocrRes.data.jobs || [])
            setLastUpdate(new Date())
        } catch (err) {
            console.error('Failed to fetch jobs:', err)
        }
    }, [])

    const fetchLogs = useCallback(async (jobId) => {
        if (!jobId) return
        setLoadingLogs(true)
        try {
            const { data } = await getBotLogs(jobId)
            setJobLogs(data.logs || [])
        } catch (err) {
            console.error('Failed to fetch logs:', err)
        } finally {
            setLoadingLogs(false)
        }
    }, [])

    useEffect(() => {
        fetchJobs()
        const interval = setInterval(fetchJobs, 3000)
        return () => clearInterval(interval)
    }, [fetchJobs])

    useEffect(() => {
        if (selectedJobId) {
            fetchLogs(selectedJobId)
            const interval = setInterval(() => fetchLogs(selectedJobId), 3000)
            return () => clearInterval(interval)
        }
    }, [selectedJobId, fetchLogs])

    const activeJobs = jobs.filter(j => ['running', 'logged_in', 'working'].includes(j.status))
    const queuedJobs = jobs.filter(j => j.status === 'queued')
    const completedJobs = jobs.filter(j => ['done', 'finished', 'error', 'stopped'].includes(j.status))
    const errorLogs = jobLogs.filter(l => l.level === 'error')
    const warnLogs = jobLogs.filter(l => l.level === 'warn')
    const selectedJob = jobs.find(j => j.id === selectedJobId)

    // OCR queue summary
    const ocrProcessing = ocrJobs.filter(j => j.status === 'processing')
    const ocrQueued = ocrJobs.filter(j => j.status === 'queued' || j.status === 'pending')
    const ocrCompleted = ocrJobs.filter(j => j.status === 'completed')
    const ocrFailed = ocrJobs.filter(j => j.status === 'failed' || j.status === 'error')

    return (
        <div className="app-layout">
            <Sidebar active="bot-dashboard" />
            <main className="main-content" style={{ background: '#f8fafc', padding: '28px 32px' }}>

                {/* ── Header ── */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 24
                }}>
                    <div>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4
                        }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: 12,
                                background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                                border: '1px solid #bfdbfe',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 20
                            }}>📡</div>
                            <h1 style={{
                                fontSize: 22, fontWeight: 800, color: '#1e293b', margin: 0
                            }}>Bot Dashboard</h1>
                        </div>
                        <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, paddingLeft: 52 }}>
                            ติดตามสถานะบอทแบบ Realtime
                            {lastUpdate && (
                                <span style={{ marginLeft: 12, fontSize: 11, color: '#cbd5e1' }}>
                                    อัปเดทล่าสุด: {lastUpdate.toLocaleTimeString('th-TH')}
                                </span>
                            )}
                        </p>
                    </div>
                    <button onClick={() => navigate('/bot-automation')} style={{
                        padding: '8px 20px', borderRadius: 10,
                        border: '1px solid #e2e8f0', background: '#fff',
                        color: '#64748b', fontSize: 13, fontWeight: 600,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                    }}>
                        🤖 ไปหน้าสั่งบอท
                    </button>
                </div>

                {/* ── Summary Cards ── */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14,
                    marginBottom: 24
                }}>
                    {[
                        {
                            label: 'กำลังทำงาน', value: activeJobs.length,
                            icon: '⚡', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe',
                            pulse: activeJobs.length > 0
                        },
                        {
                            label: 'รอคิว', value: queuedJobs.length,
                            icon: '⏳', color: '#d97706', bg: '#fffbeb', border: '#fde68a'
                        },
                        {
                            label: 'เสร็จแล้ว', value: completedJobs.filter(j => j.status === 'done' || j.status === 'finished').length,
                            icon: '✅', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0'
                        },
                        {
                            label: 'ผิดพลาด', value: completedJobs.filter(j => j.status === 'error').length,
                            icon: '❌', color: '#dc2626', bg: '#fef2f2', border: '#fecaca'
                        },
                    ].map((card, i) => (
                        <div key={i} style={{
                            background: '#fff', borderRadius: 14, padding: '18px 20px',
                            border: `1px solid ${card.border}`,
                            boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                            display: 'flex', alignItems: 'center', gap: 14
                        }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: 12,
                                background: card.bg, display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                fontSize: 20, position: 'relative'
                            }}>
                                {card.icon}
                                {card.pulse && (
                                    <span style={{
                                        position: 'absolute', top: -2, right: -2,
                                        width: 10, height: 10, borderRadius: '50%',
                                        background: card.color,
                                        boxShadow: `0 0 8px ${card.color}60`,
                                        animation: 'dbPulse 1.5s ease-in-out infinite'
                                    }} />
                                )}
                            </div>
                            <div>
                                <div style={{
                                    fontSize: 24, fontWeight: 800, color: card.color,
                                    fontFamily: "'JetBrains Mono',monospace", lineHeight: 1
                                }}>{card.value}</div>
                                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                                    {card.label}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Capacity Bar ── */}
                <div style={{
                    background: '#fff', borderRadius: 12, padding: '14px 20px',
                    border: '1px solid #e2e8f0', marginBottom: 24,
                    display: 'flex', alignItems: 'center', gap: 16
                }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                        CAPACITY
                    </span>
                    <div style={{
                        flex: 1, height: 10, background: '#f1f5f9', borderRadius: 6,
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${(queueInfo.runningCount / queueInfo.maxConcurrent) * 100}%`,
                            height: '100%', borderRadius: 6,
                            background: queueInfo.runningCount >= queueInfo.maxConcurrent
                                ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                                : 'linear-gradient(90deg, #3b82f6, #2563eb)',
                            transition: 'width 0.5s ease'
                        }} />
                    </div>
                    <span style={{
                        fontSize: 14, fontWeight: 800, color: '#2563eb',
                        fontFamily: "'JetBrains Mono',monospace"
                    }}>
                        {queueInfo.runningCount}/{queueInfo.maxConcurrent}
                    </span>
                </div>

                {/* ── OCR Queue Summary ── */}
                <div style={{
                    background: '#fff', borderRadius: 14, padding: '18px 22px',
                    border: '1px solid #e2e8f0', marginBottom: 24,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14
                    }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: 'linear-gradient(135deg, #fdf4ff, #f3e8ff)',
                            border: '1px solid #e9d5ff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 16
                        }}>🔍</div>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>
                            คิว OCR
                        </span>
                        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
                            ทั้งหมด {ocrJobs.length} รายการ
                        </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                        {[
                            { label: 'กำลังประมวลผล', value: ocrProcessing.length, color: '#8b5cf6', bg: '#f5f3ff', icon: '⚡' },
                            { label: 'รอคิว', value: ocrQueued.length, color: '#d97706', bg: '#fffbeb', icon: '⏳' },
                            { label: 'เสร็จแล้ว', value: ocrCompleted.length, color: '#16a34a', bg: '#f0fdf4', icon: '✅' },
                            { label: 'ผิดพลาด', value: ocrFailed.length, color: '#dc2626', bg: '#fef2f2', icon: '❌' },
                        ].map((item, i) => (
                            <div key={i} style={{
                                padding: '10px 14px', borderRadius: 10,
                                background: item.bg, textAlign: 'center'
                            }}>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                                    {item.icon} {item.label}
                                </div>
                                <div style={{
                                    fontSize: 22, fontWeight: 800, color: item.color,
                                    fontFamily: "'JetBrains Mono',monospace"
                                }}>{item.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* OCR job list with company names */}
                    {ocrJobs.length > 0 && (
                        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {ocrJobs.map(job => {
                                const isActive = job.status === 'processing'
                                const isDone = job.status === 'completed'
                                const isFailed = job.status === 'failed' || job.status === 'error'
                                const statusStyle = isActive
                                    ? { color: '#8b5cf6', bg: '#f5f3ff', border: '#e9d5ff', label: 'กำลังอ่าน' }
                                    : isDone
                                    ? { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', label: 'เสร็จแล้ว' }
                                    : isFailed
                                    ? { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'ผิดพลาด' }
                                    : { color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'รอคิว' }

                                return (
                                    <div key={job.jobId} style={{
                                        padding: '10px 14px', borderRadius: 10,
                                        background: statusStyle.bg, border: `1px solid ${statusStyle.border}`,
                                        display: 'flex', alignItems: 'center', gap: 10
                                    }}>
                                        {/* Pulse dot for active */}
                                        {isActive ? (
                                            <span style={{
                                                width: 8, height: 8, borderRadius: '50%',
                                                background: '#8b5cf6',
                                                animation: 'dbPulse 1.5s ease-in-out infinite',
                                                flexShrink: 0
                                            }} />
                                        ) : (
                                            <span style={{ fontSize: 12, flexShrink: 0 }}>
                                                {isDone ? '✅' : isFailed ? '❌' : '⏳'}
                                            </span>
                                        )}

                                        {/* Job Name */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: 12, fontWeight: 700, color: '#1e293b',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                            }}>
                                                {job.jobName || 'OCR Job'}
                                            </div>
                                            {/* Progress bar for active */}
                                            {isActive && (
                                                <div style={{
                                                    height: 5, background: '#e9d5ff', borderRadius: 3,
                                                    overflow: 'hidden', marginTop: 4
                                                }}>
                                                    <div style={{
                                                        width: `${job.percent || 0}%`, height: '100%',
                                                        background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
                                                        borderRadius: 3, transition: 'width 0.5s ease'
                                                    }} />
                                                </div>
                                            )}
                                        </div>

                                        {/* Status badge */}
                                        <span style={{
                                            padding: '2px 10px', borderRadius: 6,
                                            background: '#fff', border: `1px solid ${statusStyle.border}`,
                                            fontSize: 10, fontWeight: 700, color: statusStyle.color,
                                            flexShrink: 0
                                        }}>
                                            {statusStyle.label}
                                        </span>

                                        {/* File count */}
                                        <span style={{
                                            fontSize: 10, color: '#94a3b8', flexShrink: 0,
                                            fontFamily: "'JetBrains Mono',monospace"
                                        }}>
                                            {job.completed}/{job.totalFiles}
                                        </span>

                                        {/* Percent for active */}
                                        {isActive && (
                                            <span style={{
                                                fontSize: 11, fontWeight: 800, color: '#8b5cf6',
                                                fontFamily: "'JetBrains Mono',monospace",
                                                flexShrink: 0
                                            }}>
                                                {job.percent || 0}%
                                            </span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* ── Main Content: 2 columns ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

                    {/* LEFT: Job List */}
                    <div style={{
                        background: '#fff', borderRadius: 16, padding: '20px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{
                            fontSize: 15, fontWeight: 800, color: '#1e293b',
                            marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8
                        }}>
                            <span>🤖</span> รายการบอททั้งหมด
                            <span style={{
                                marginLeft: 'auto', fontSize: 11, color: '#94a3b8',
                                fontWeight: 500
                            }}>
                                {jobs.length} รายการ
                            </span>
                        </div>

                        {jobs.length === 0 ? (
                            <div style={{
                                textAlign: 'center', padding: '40px 20px', color: '#94a3b8'
                            }}>
                                <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.4 }}>🤖</div>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>ยังไม่มีบอททำงาน</div>
                                <div style={{ fontSize: 11, marginTop: 4, color: '#cbd5e1' }}>
                                    ไปที่หน้าสั่งบอทเพื่อเริ่มงาน
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {jobs.map((job, idx) => {
                                    const s = STATUS_CONFIG[job.status] || STATUS_CONFIG.queued
                                    const isActive = ['running', 'logged_in', 'working'].includes(job.status)
                                    const isSelected = selectedJobId === job.id

                                    return (
                                        <div key={job.id}
                                            onClick={() => setSelectedJobId(isSelected ? null : job.id)}
                                            style={{
                                                padding: '14px 16px', borderRadius: 12,
                                                border: `1.5px solid ${isSelected ? s.color : isActive ? s.border : '#e2e8f0'}`,
                                                background: isSelected
                                                    ? `linear-gradient(135deg, ${s.bg}, #fff)`
                                                    : isActive ? s.bg : '#fafbfc',
                                                cursor: 'pointer',
                                                boxShadow: isSelected ? `0 4px 16px ${s.color}15` : 'none',
                                                transition: 'all 0.2s ease'
                                            }}>
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: 10
                                            }}>
                                                {/* Bot indicator */}
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: 10,
                                                    background: s.bg, border: `1px solid ${s.border}`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 16, flexShrink: 0, position: 'relative'
                                                }}>
                                                    🤖
                                                    {isActive && (
                                                        <span style={{
                                                            position: 'absolute', bottom: -2, right: -2,
                                                            width: 10, height: 10, borderRadius: '50%',
                                                            background: s.color, border: '2px solid #fff',
                                                            boxShadow: `0 0 6px ${s.color}60`,
                                                            animation: 'dbPulse 1.5s ease-in-out infinite'
                                                        }} />
                                                    )}
                                                </div>

                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{
                                                        fontSize: 13, fontWeight: 700, color: '#1e293b',
                                                        display: 'flex', alignItems: 'center', gap: 6
                                                    }}>
                                                        <span style={{
                                                            color: s.color, fontWeight: 800,
                                                            fontFamily: "'JetBrains Mono',monospace",
                                                            fontSize: 11
                                                        }}>BOT {idx + 1}</span>
                                                        <span style={{ color: '#cbd5e1' }}>›</span>
                                                        <span style={{
                                                            overflow: 'hidden', textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}>{job.profileName}</span>
                                                    </div>
                                                    {/* Excel filename */}
                                                    {job.excelPath && (
                                                        <div style={{
                                                            fontSize: 10, color: '#94a3b8', marginTop: 2,
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                        }}>
                                                            📄 {job.excelPath.split(/[/\\]/).pop()}
                                                        </div>
                                                    )}
                                                    <div style={{
                                                        fontSize: 10, color: '#94a3b8', marginTop: 2,
                                                        fontFamily: "'JetBrains Mono',monospace",
                                                        display: 'flex', alignItems: 'center', gap: 6
                                                    }}>
                                                        📋 {job.logCount} logs
                                                        {job.startedAt && (
                                                            <span>
                                                                🕐 {new Date(job.startedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        )}
                                                        {isActive && job.progressTotal > 0 && (
                                                            <span style={{
                                                                padding: '1px 8px', borderRadius: 4,
                                                                background: '#dbeafe', border: '1px solid #bfdbfe',
                                                                color: '#2563eb', fontWeight: 700, fontSize: 10
                                                            }}>
                                                                📦 {job.progressCurrent}/{job.progressTotal} บิล
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Status badge */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                                    <div style={{
                                                        padding: '4px 12px', borderRadius: 20,
                                                        background: s.bg, border: `1px solid ${s.border}`,
                                                        fontSize: 11, fontWeight: 700, color: s.color,
                                                        display: 'flex', alignItems: 'center', gap: 5
                                                    }}>
                                                        {isActive && (
                                                            <span style={{
                                                                width: 6, height: 6, borderRadius: '50%',
                                                                background: s.color,
                                                                animation: 'dbBlink 1.5s ease-in-out infinite'
                                                            }} />
                                                        )}
                                                        {s.icon} {s.label}
                                                    </div>
                                                    {isActive && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.preventDefault()
                                                                e.stopPropagation()
                                                                pausePolling.current = true
                                                                const confirmed = window.confirm(`หยุดบอท "${job.profileName}" ?`)
                                                                pausePolling.current = false
                                                                if (confirmed) {
                                                                    stopBotJob(job.id)
                                                                        .then(() => fetchJobs())
                                                                        .catch(err => alert('หยุดบอทไม่สำเร็จ: ' + (err?.message || 'ไม่ทราบสาเหตุ')))
                                                                }
                                                            }}
                                                            style={{
                                                                padding: '4px 10px', borderRadius: 8,
                                                                background: '#fef2f2', border: '1px solid #fecaca',
                                                                fontSize: 10, fontWeight: 700, color: '#dc2626',
                                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                                                transition: 'all 0.15s'
                                                            }}
                                                            onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.borderColor = '#f87171' }}
                                                            onMouseLeave={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fecaca' }}
                                                        >
                                                            ⏹ หยุด
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* RIGHT: Log Viewer + Error Report */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                        {/* Error/Warning Report — Grouped by Bill */}
                        {selectedJobId && (errorLogs.length > 0 || warnLogs.length > 0) && (() => {
                            // Group errors/warnings by bill number
                            const issuesByBill = new Map()
                            const billMeta = new Map() // store filename + doc number per bill
                            const allIssues = [
                                ...errorLogs.map(l => ({ ...l, type: 'error' })),
                                ...warnLogs.map(l => ({ ...l, type: 'warn' }))
                            ]

                            // Pre-scan logs to build bill metadata (original filename, doc number)
                            let currentBill = null
                            for (const log of jobLogs) {
                                const bm = log.message?.match(/บิลที่\s*(\d+)\s*\/\s*(\d+)/)
                                if (bm) {
                                    currentBill = `บิลที่ ${bm[1]}/${bm[2]}`
                                    if (!billMeta.has(currentBill)) billMeta.set(currentBill, {})
                                }
                                if (currentBill) {
                                    const docMatch = log.message?.match(/เลขที่เอกสาร:\s*(.+)/)
                                    if (docMatch) billMeta.get(currentBill).docNo = docMatch[1].trim()
                                    const fileMatch = log.message?.match(/ต้นฉบับ:\s*(.+)/)
                                    if (fileMatch) billMeta.get(currentBill).oldFile = fileMatch[1].trim()
                                }
                            }

                            // Find the bill context for each issue by scanning backwards in logs
                            for (const issue of allIssues) {
                                const issueIdx = jobLogs.findIndex(l => l === issue || (l.time === issue.time && l.message === issue.message))
                                let billLabel = 'ทั่วไป'
                                for (let i = issueIdx; i >= 0; i--) {
                                    const bm = jobLogs[i].message?.match(/บิลที่\s*(\d+)\s*\/\s*(\d+)/)
                                    if (bm) {
                                        billLabel = `บิลที่ ${bm[1]}/${bm[2]}`
                                        break
                                    }
                                }
                                if (!issuesByBill.has(billLabel)) issuesByBill.set(billLabel, [])
                                issuesByBill.get(billLabel).push(issue)
                            }

                            return (
                                <div style={{
                                    background: errorLogs.length > 0
                                        ? 'linear-gradient(135deg, #fef2f2, #fff5f5)'
                                        : 'linear-gradient(135deg, #fffbeb, #fefce8)',
                                    borderRadius: 16, padding: '18px 20px',
                                    border: `1px solid ${errorLogs.length > 0 ? '#fecaca' : '#fde68a'}`
                                }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12
                                    }}>
                                        <span style={{ fontSize: 18 }}>📋</span>
                                        <span style={{
                                            fontSize: 14, fontWeight: 800,
                                            color: errorLogs.length > 0 ? '#b91c1c' : '#92400e'
                                        }}>
                                            รายงานสรุปปัญหา
                                        </span>
                                        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                                            {errorLogs.length > 0 && (
                                                <span style={{
                                                    padding: '3px 10px', borderRadius: 6,
                                                    background: '#fee2e2', border: '1px solid #fecaca',
                                                    fontSize: 11, fontWeight: 700, color: '#dc2626'
                                                }}>❌ {errorLogs.length} ผิดพลาด</span>
                                            )}
                                            {warnLogs.length > 0 && (
                                                <span style={{
                                                    padding: '3px 10px', borderRadius: 6,
                                                    background: '#fef3c7', border: '1px solid #fde68a',
                                                    fontSize: 11, fontWeight: 700, color: '#b45309'
                                                }}>⚠️ {warnLogs.length} คำเตือน</span>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 400, overflowY: 'auto' }}>
                                        {[...issuesByBill.entries()].map(([billLabel, issues]) => {
                                            const billErrors = issues.filter(i => i.type === 'error')
                                            const billWarns = issues.filter(i => i.type === 'warn')
                                            const meta = billMeta.get(billLabel) || {}
                                            // Default all bills to COLLAPSED — user opens them manually
                                            const isOpen = expandedBills.has(billLabel)
                                            const toggleBill = () => {
                                                setExpandedBills(prev => {
                                                    const next = new Set(prev)
                                                    if (next.has(billLabel)) next.delete(billLabel)
                                                    else next.add(billLabel)
                                                    return next
                                                })
                                            }
                                            return (
                                                <div key={billLabel} style={{
                                                    borderRadius: 10, overflow: 'hidden',
                                                    border: `1px solid ${billErrors.length > 0 ? '#fecaca' : '#fde68a'}`
                                                }}>
                                                    {/* Bill header — clickable */}
                                                    <div
                                                        onClick={toggleBill}
                                                        style={{
                                                            padding: '8px 12px',
                                                            background: billErrors.length > 0 ? '#fee2e2' : '#fef3c7',
                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                            fontSize: 12, fontWeight: 700,
                                                            color: billErrors.length > 0 ? '#991b1b' : '#92400e',
                                                            cursor: 'pointer', userSelect: 'none'
                                                        }}>
                                                        <span style={{
                                                            fontSize: 10, transition: 'transform 0.2s',
                                                            transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                                                            flexShrink: 0
                                                        }}>▾</span>
                                                        <span style={{ flexShrink: 0 }}>📦 {billLabel}</span>
                                                        {meta.oldFile && (
                                                            <span style={{
                                                                fontSize: 10, fontWeight: 600, color: '#64748b',
                                                                wordBreak: 'break-all'
                                                            }}>
                                                                — 📄 {meta.oldFile}
                                                            </span>
                                                        )}
                                                        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: '#94a3b8', flexShrink: 0 }}>
                                                            {billErrors.length > 0 && `${billErrors.length} ผิดพลาด`}
                                                            {billErrors.length > 0 && billWarns.length > 0 && ' · '}
                                                            {billWarns.length > 0 && `${billWarns.length} คำเตือน`}
                                                        </span>
                                                    </div>
                                                    {/* Bill issues — collapsible */}
                                                    <div style={{
                                                        background: '#fff',
                                                        maxHeight: isOpen ? 500 : 0,
                                                        overflow: 'hidden',
                                                        transition: 'max-height 0.3s ease'
                                                    }}>
                                                        {issues.map((issue, i) => (
                                                            <div key={i} style={{
                                                                padding: '6px 12px',
                                                                borderTop: i > 0 ? '1px solid #f1f5f9' : 'none',
                                                                display: 'flex', alignItems: 'center', gap: 8
                                                            }}>
                                                                <span style={{
                                                                    fontSize: 9, color: '#fff', fontWeight: 700,
                                                                    background: issue.type === 'error' ? '#ef4444' : '#f59e0b',
                                                                    padding: '1px 6px', borderRadius: 3,
                                                                    flexShrink: 0
                                                                }}>{issue.type === 'error' ? 'ผิดพลาด' : 'คำเตือน'}</span>
                                                                <div style={{
                                                                    fontSize: 11, fontWeight: 600, flex: 1,
                                                                    color: issue.type === 'error' ? '#991b1b' : '#92400e'
                                                                }}>
                                                                    {translateMsg(issue.message)}
                                                                </div>
                                                                <span style={{ fontSize: 9, color: '#cbd5e1', flexShrink: 0 }}>{issue.time}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })()}

                        {/* Log Viewer */}
                        <div style={{
                            background: '#fff', borderRadius: 16,
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                            overflow: 'hidden'
                        }}>
                            {!selectedJobId ? (
                                <div style={{
                                    textAlign: 'center', padding: '60px 20px', color: '#94a3b8'
                                }}>
                                    <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.3 }}>📋</div>
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>เลือกบอทเพื่อดู Log</div>
                                    <div style={{ fontSize: 11, marginTop: 4, color: '#cbd5e1' }}>
                                        คลิกที่รายการบอทด้านซ้ายเพื่อดูรายละเอียดการทำงาน
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Terminal Header */}
                                    <div style={{
                                        padding: '10px 18px',
                                        background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                                        display: 'flex', alignItems: 'center', gap: 10
                                    }}>
                                        <span style={{ fontSize: 14 }}>📋</span>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                                            Log — {selectedJob?.profileName}
                                        </span>
                                        <span style={{
                                            marginLeft: 'auto', fontSize: 11, color: '#94a3b8',
                                            fontFamily: "'JetBrains Mono',monospace"
                                        }}>
                                            {jobLogs.length} entries
                                        </span>
                                    </div>

                                    {/* Terminal Body (dark) */}
                                    <div style={{
                                        background: '#0f172a', padding: '14px 18px',
                                        maxHeight: 420, overflowY: 'auto',
                                        fontFamily: "'JetBrains Mono','Fira Code',monospace",
                                        fontSize: 12, lineHeight: 1.8
                                    }}>
                                        {loadingLogs && jobLogs.length === 0 ? (
                                            <div style={{ color: '#475569' }}>
                                                <span style={{ color: '#3b82f6' }}>$</span> กำลังโหลด...
                                                <span style={{
                                                    display: 'inline-block', width: 7, height: 14,
                                                    background: '#3b82f6', marginLeft: 2,
                                                    animation: 'dbBlink 1s step-end infinite',
                                                    verticalAlign: 'text-bottom'
                                                }} />
                                            </div>
                                        ) : jobLogs.length === 0 ? (
                                            <div style={{ color: '#475569' }}>ยังไม่มี log</div>
                                        ) : (
                                            jobLogs.map((log, i) => {
                                                const colors = {
                                                    info: '#94a3b8', success: '#4ade80',
                                                    warn: '#fbbf24', error: '#f87171'
                                                }
                                                return (
                                                    <div key={i} style={{
                                                        color: colors[log.level] || '#94a3b8',
                                                        borderLeft: log.level === 'error' ? '2px solid #ef4444'
                                                            : log.level === 'warn' ? '2px solid #f59e0b'
                                                            : log.level === 'success' ? '2px solid #10b981'
                                                            : '2px solid transparent',
                                                        paddingLeft: 10, marginBottom: 1
                                                    }}>
                                                        <span style={{ color: '#475569', fontSize: 10 }}>[{log.time}]</span>{' '}
                                                        {log.message}
                                                    </div>
                                                )
                                            })
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Animations */}
                <style>{`
                    @keyframes dbPulse {
                        0%, 100% { opacity: 1; transform: scale(1); }
                        50% { opacity: 0.4; transform: scale(1.2); }
                    }
                    @keyframes dbBlink {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.2; }
                    }
                `}</style>
            </main>
        </div>
    )
}
