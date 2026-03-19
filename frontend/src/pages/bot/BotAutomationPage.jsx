import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../../components/Sidebar'
import OcrBatchPanel from '../docsort/OcrBatchPage'

// ── Lion Robot SVG Component ──
function RobotSVG({ size = 200 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 220 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="bot-robot-svg">
            {/* ══ MANE ══ */}
            <ellipse cx="110" cy="78" rx="90" ry="80" fill="#f97316" opacity="0.12" className="bot-mane-outer" />
            {[...Array(14)].map((_, i) => {
                const angle = (i * 360 / 14 - 90) * Math.PI / 180;
                const cx = 110 + Math.cos(angle) * 68;
                const cy = 78 + Math.sin(angle) * 62;
                const rotation = (i * 360 / 14);
                return (
                    <ellipse key={`mane-${i}`} cx={cx} cy={cy} rx="18" ry="10"
                        fill={i % 2 === 0 ? '#f97316' : '#fb923c'}
                        opacity={i % 2 === 0 ? 0.35 : 0.25}
                        transform={`rotate(${rotation}, ${cx}, ${cy})`}
                        className="bot-mane-tuft" />
                );
            })}
            <ellipse cx="110" cy="78" rx="72" ry="65" fill="#fdba74" opacity="0.2" />
            {/* ══ EARS ══ */}
            <polygon points="48,35 62,12 76,45" fill="#fb923c" stroke="#f97316" strokeWidth="2" />
            <polygon points="55,33 63,18 71,40" fill="#fff7ed" />
            <polygon points="144,45 158,12 172,35" fill="#fb923c" stroke="#f97316" strokeWidth="2" />
            <polygon points="149,40 157,18 165,33" fill="#fff7ed" />
            {/* ══ HEAD ══ */}
            <rect x="55" y="40" width="110" height="80" rx="24" fill="white" stroke="#f97316" strokeWidth="3" />
            <rect x="85" y="44" width="50" height="8" rx="4" fill="#fff7ed" stroke="#fdba74" strokeWidth="1" />
            {/* ══ EYES ══ */}
            <path d="M72 68 L88 60 L96 68 L88 76 Z" fill="#fff7ed" stroke="#f97316" strokeWidth="2" />
            <path d="M148 68 L132 60 L124 68 L132 76 Z" fill="#fff7ed" stroke="#f97316" strokeWidth="2" />
            <circle cx="84" cy="68" r="5" fill="#f97316" className="bot-eye" />
            <circle cx="136" cy="68" r="5" fill="#f97316" className="bot-eye" />
            <circle cx="82" cy="66" r="2" fill="white" />
            <circle cx="134" cy="66" r="2" fill="white" />
            <line x1="72" y1="57" x2="93" y2="54" stroke="#ea580c" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="148" y1="57" x2="127" y2="54" stroke="#ea580c" strokeWidth="2.5" strokeLinecap="round" />
            {/* ══ NOSE & MOUTH ══ */}
            <polygon points="110,82 104,92 116,92" fill="#f97316" />
            <circle cx="110" cy="88" r="2.5" fill="#ea580c" />
            <path d="M98 96 Q104 102 110 96 Q116 102 122 96" stroke="#fb923c" strokeWidth="2" fill="none" strokeLinecap="round" />
            {/* ══ WHISKERS ══ */}
            <line x1="60" y1="85" x2="78" y2="88" stroke="#fdba74" strokeWidth="1.5" strokeLinecap="round" className="bot-whisker" />
            <line x1="58" y1="92" x2="78" y2="92" stroke="#fdba74" strokeWidth="1.5" strokeLinecap="round" className="bot-whisker" />
            <line x1="60" y1="99" x2="78" y2="96" stroke="#fdba74" strokeWidth="1.5" strokeLinecap="round" className="bot-whisker" />
            <line x1="160" y1="85" x2="142" y2="88" stroke="#fdba74" strokeWidth="1.5" strokeLinecap="round" className="bot-whisker" />
            <line x1="162" y1="92" x2="142" y2="92" stroke="#fdba74" strokeWidth="1.5" strokeLinecap="round" className="bot-whisker" />
            <line x1="160" y1="99" x2="142" y2="96" stroke="#fdba74" strokeWidth="1.5" strokeLinecap="round" className="bot-whisker" />
            {/* Chin & Neck */}
            <rect x="92" y="105" width="36" height="6" rx="3" fill="#fdba74" opacity="0.5" />
            <rect x="94" y="120" width="32" height="14" rx="5" fill="#fb923c" />
            <rect x="102" y="122" width="16" height="3" rx="1.5" fill="#fdba74" />
            <rect x="102" y="128" width="16" height="3" rx="1.5" fill="#fdba74" />
            {/* ══ BODY ══ */}
            <rect x="50" y="134" width="120" height="58" rx="18" fill="white" stroke="#f97316" strokeWidth="3" />
            <rect x="80" y="144" width="60" height="20" rx="8" fill="#fff7ed" stroke="#fdba74" strokeWidth="1.5" />
            <circle cx="100" cy="154" r="4" fill="#f97316" opacity="0.6" className="bot-chest-light" />
            <circle cx="110" cy="154" r="4" fill="#22c55e" opacity="0.6" className="bot-chest-light" />
            <circle cx="120" cy="154" r="4" fill="#3b82f6" opacity="0.6" className="bot-chest-light" />
            <rect x="90" y="170" width="40" height="3" rx="1.5" fill="#fdba74" opacity="0.4" />
            <rect x="95" y="176" width="30" height="3" rx="1.5" fill="#fdba74" opacity="0.3" />
            {/* ══ ARMS ══ */}
            <rect x="28" y="142" width="22" height="40" rx="10" fill="#fb923c" opacity="0.8" />
            <circle cx="39" cy="186" r="8" fill="#fb923c" stroke="#f97316" strokeWidth="2" />
            <rect x="170" y="142" width="22" height="40" rx="10" fill="#fb923c" opacity="0.8" />
            <circle cx="181" cy="186" r="8" fill="#fb923c" stroke="#f97316" strokeWidth="2" />
            {/* ══ LEGS ══ */}
            <rect x="72" y="192" width="24" height="28" rx="10" fill="#fb923c" opacity="0.8" />
            <rect x="68" y="216" width="32" height="12" rx="6" fill="#f97316" />
            <rect x="124" y="192" width="24" height="28" rx="10" fill="#fb923c" opacity="0.8" />
            <rect x="120" y="216" width="32" height="12" rx="6" fill="#f97316" />
            {/* ══ TAIL ══ */}
            <path d="M50 170 Q30 160 25 140 Q20 125 30 118" stroke="#fb923c" strokeWidth="4" fill="none" strokeLinecap="round" className="bot-tail" />
            <circle cx="30" cy="116" r="6" fill="#f97316" />
        </svg>
    )
}

// ── Mini Robot for cards ──
function MiniRobot({ color = '#f97316' }) {
    return (
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect x="6" y="8" width="20" height="14" rx="4" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5" />
            <circle cx="12" cy="14" r="2" fill={color} />
            <circle cx="20" cy="14" r="2" fill={color} />
            <rect x="11" y="18" width="10" height="2" rx="1" fill={color} opacity="0.4" />
            <rect x="14" y="4" width="4" height="4" rx="2" fill={color} opacity="0.6" />
            <rect x="9" y="22" width="6" height="4" rx="2" fill={color} opacity="0.3" />
            <rect x="17" y="22" width="6" height="4" rx="2" fill={color} opacity="0.3" />
        </svg>
    )
}

// ── Mock Data for bot cards ──
const MOCK_BOTS = [
    {
        id: 1, name: 'บอทรัน PDF',
        description: 'รันระบบอัตโนมัติจัดการไฟล์ PDF — แยก, รวม, แปลง, อ่าน และประมวลผลเอกสาร PDF',
        icon: '📕', status: 'active', enabled: true, lastRun: '5 นาทีที่แล้ว',
        totalRuns: 1247, successRate: 98.5, category: 'pdf'
    },
    {
        id: 2, name: 'บอทรัน OCR และ Excel',
        description: 'อ่านเอกสารด้วย OCR แปลงเป็นข้อความ และส่งออกข้อมูลเป็นไฟล์ Excel อัตโนมัติ',
        icon: '📊', status: 'active', enabled: true, lastRun: '12 นาทีที่แล้ว',
        totalRuns: 856, successRate: 96.2, category: 'ocr'
    }
]

export default function BotAutomationPage() {
    const navigate = useNavigate()
    const [bots, setBots] = useState(MOCK_BOTS)
    const [filter, setFilter] = useState('all')
    const [apiHealth, setApiHealth] = useState(null)
    const [checkingApi, setCheckingApi] = useState(false)
    const [activeSection, setActiveSection] = useState(null)

    const checkApiHealth = async () => {
        setCheckingApi(true)
        try {
            const res = await fetch('/api/ocr/health')
            const data = await res.json()
            setApiHealth(data)
        } catch (err) {
            setApiHealth({ overall: 'error', overallText: '❌ ไม่สามารถเชื่อมต่อ Backend ได้', keys: [] })
        } finally {
            setCheckingApi(false)
        }
    }

    const toggleBot = (id) => {
        setBots(prev => prev.map(b => b.id === id ? { ...b, enabled: !b.enabled, status: !b.enabled ? 'active' : 'idle' } : b))
    }

    const filteredBots = filter === 'all' ? bots : bots.filter(b => b.category === filter)

    return (
        <div className="app-layout">
            <Sidebar active="bot-automation" />
            <main className="main-content">
                {/* ══════ HERO SECTION ══════ */}
                <div className="bot-hero animate-in">
                    <div className="bot-hero-content">
                        <div className="bot-hero-badge">🤖 Automated System</div>
                        <h1 className="bot-hero-title">ระบบบอทอัตโนมัติ</h1>
                        <p className="bot-hero-desc">
                            ควบคุมบอทอัตโนมัติทั้งหมดจากที่เดียว — รันงานบนเว็บ,
                            อ่านเอกสารด้วย OCR, และประมวลผลข้อมูลอัตโนมัติ
                        </p>
                        <div className="bot-hero-actions">
                            <button className="bot-hero-btn primary">
                                <span>▶</span> เริ่มรันบอททั้งหมด
                            </button>
                            <button className="bot-hero-btn secondary" onClick={checkApiHealth} disabled={checkingApi}>
                                <span>🔌</span> {checkingApi ? 'กำลังตรวจสอบ...' : 'ตรวจสอบ API'}
                            </button>
                        </div>
                    </div>
                    <div className="bot-hero-visual">
                        <div className="bot-hero-robot-wrap">
                            <RobotSVG size={180} />
                            <div className="bot-hero-glow"></div>
                        </div>
                    </div>
                    <div className="bot-hero-circle c1"></div>
                    <div className="bot-hero-circle c2"></div>
                    <div className="bot-hero-circle c3"></div>
                </div>

                {/* ══════ QUICK STATS ══════ */}
                <div className="bot-stats-grid animate-in" style={{ animationDelay: '.15s' }}>
                    <div className="bot-stat-card">
                        <div className="bot-stat-icon" style={{ background: '#fff7ed', color: '#f97316' }}>🤖</div>
                        <div className="bot-stat-info">
                            <div className="bot-stat-value">{bots.length}</div>
                            <div className="bot-stat-label">บอททั้งหมด</div>
                        </div>
                    </div>
                    <div className="bot-stat-card">
                        <div className="bot-stat-icon" style={{ background: '#f0fdf4', color: '#22c55e' }}>✅</div>
                        <div className="bot-stat-info">
                            <div className="bot-stat-value">{bots.filter(b => b.enabled).length}</div>
                            <div className="bot-stat-label">กำลังทำงาน</div>
                        </div>
                    </div>
                    <div className="bot-stat-card">
                        <div className="bot-stat-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}>🔄</div>
                        <div className="bot-stat-info">
                            <div className="bot-stat-value">{bots.reduce((sum, b) => sum + b.totalRuns, 0).toLocaleString()}</div>
                            <div className="bot-stat-label">รันทั้งหมด</div>
                        </div>
                    </div>
                    <div className="bot-stat-card" style={{ cursor: 'pointer', transition: 'transform .15s' }}
                        onClick={() => navigate('/ocr-dashboard')}
                        onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseOut={e => e.currentTarget.style.transform = ''}>
                        <div className="bot-stat-icon" style={{ background: '#fdf4ff', color: '#a855f7' }}>📊</div>
                        <div className="bot-stat-info">
                            <div className="bot-stat-value" style={{ fontSize: 14, color: '#a855f7' }}>ดูรายงาน →</div>
                            <div className="bot-stat-label">OCR Dashboard</div>
                        </div>
                    </div>
                </div>

                {/* ══════ API STATUS ══════ */}
                {apiHealth && (
                    <div className="bot-api-status-section animate-in" style={{ animationDelay: '.2s' }}>
                        <div className="bot-api-status-header">
                            <h2 className="bot-section-title">🔌 สถานะ AksornOCR API</h2>
                            <span className={`bot-api-overall ${apiHealth.overall}`}>
                                {apiHealth.overallText}
                            </span>
                        </div>
                        <div className="bot-api-keys-grid">
                            {apiHealth.keys && apiHealth.keys.map(k => (
                                <div key={k.id} className={`bot-api-key-card ${k.ok ? 'ok' : 'fail'}`}>
                                    <div className="bot-api-key-icon">{k.icon}</div>
                                    <div className="bot-api-key-info">
                                        <div className="bot-api-key-name">{k.name}</div>
                                        <div className="bot-api-key-preview">{k.keyPreview}</div>
                                        <div className="bot-api-key-status">{k.status}</div>
                                    </div>
                                    <div className={`bot-api-key-badge ${k.ok ? 'ok' : 'fail'}`}>
                                        {k.ok ? 'ACTIVE' : 'ERROR'}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {apiHealth.checkedAt && (
                            <div className="bot-api-checked-at">
                                ตรวจสอบเมื่อ: {new Date(apiHealth.checkedAt).toLocaleString('th-TH')}
                            </div>
                        )}
                    </div>
                )}

                {/* ══════ MAIN WORKSPACE (2-Column) ══════ */}
                <div className="bot-workspace">
                    
                    {/* LEFT COLUMN: Bot List */}
                    <div className="bot-workspace-sidebar animate-in" style={{ animationDelay: '.25s' }}>
                        <div className="bot-section-header">
                            <div>
                                <h2 className="bot-section-title">
                                    <MiniRobot /> บอททั้งหมด
                                </h2>
                                <p className="bot-section-subtitle" style={{ fontSize: 13, marginBottom: 12 }}>จัดการและควบคุมบอทอัตโนมัติ</p>
                            </div>
                            <div className="bot-filter-tabs">
                                <button className={`bot-filter-tab ${filter === 'all' ? 'active' : ''}`}
                                    onClick={() => setFilter('all')}>ทั้งหมด</button>
                                <button className={`bot-filter-tab ${filter === 'pdf' ? 'active' : ''}`}
                                    onClick={() => setFilter('pdf')}>📕 PDF</button>
                                <button className={`bot-filter-tab ${filter === 'ocr' ? 'active' : ''}`}
                                    onClick={() => setFilter('ocr')}>📊 OCR</button>
                            </div>
                        </div>

                        <div className="bot-cards-vertical">
                            {filteredBots.map((bot, idx) => (
                                <div key={bot.id} className={`bot-card ${bot.status} ${activeSection === bot.category ? 'selected' : ''}`} style={{ animationDelay: `${0.05 * idx}s` }}>
                                    <div className="bot-card-header">
                                        <div className="bot-card-icon">{bot.icon}</div>
                                        <label className="bot-toggle">
                                            <input type="checkbox" checked={bot.enabled} onChange={() => toggleBot(bot.id)} />
                                            <span className="bot-toggle-slider"></span>
                                        </label>
                                    </div>
                                    <h3 className="bot-card-name" style={{ fontSize: 15, marginBottom: 4 }}>{bot.name}</h3>
                                    <p className="bot-card-desc" style={{ fontSize: 12, marginBottom: 16 }}>{bot.description}</p>
                                    <div className="bot-card-footer" style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
                                        <div className="bot-card-meta">
                                            <span className={`bot-status-dot ${bot.status}`}></span>
                                            <span className="bot-card-status" style={{ fontSize: 11 }}>
                                                {bot.status === 'active' ? 'กำลังทำงาน' :
                                                    bot.status === 'error' ? 'เกิดข้อผิดพลาด' : 'หยุดพัก'}
                                            </span>
                                        </div>
                                        <div className="bot-card-stats" style={{ fontSize: 11 }}>
                                            <span title="จำนวนรัน">🔄 {bot.totalRuns}</span>
                                            <span title="อัตราสำเร็จ">✅ {bot.successRate}%</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div className="bot-card-lastrun" style={{ margin: 0, fontSize: 11 }}>
                                            ⏰ ล่าสุด: {bot.lastRun}
                                        </div>
                                        <div className="bot-card-actions" style={{ gap: 6 }}>
                                            {/* Action buttons */}
                                            <button className="bot-action-btn settings" title="ตั้งค่า" style={{ width: 28, height: 28, fontSize: 12 }}>⚙️</button>
                                            <button className="bot-action-btn run" title="รันทันที"
                                                style={{ padding: '6px 12px', fontSize: 12 }}
                                                onClick={() => bot.category === 'ocr' ? setActiveSection('ocr') : null}>
                                                ▶ รัน
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Tool View */}
                    <div className="bot-workspace-content animate-in" style={{ animationDelay: '.35s' }}>
                        {activeSection === 'ocr' ? (
                            <div className="bot-ocr-section" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: '#f97316', marginBottom: 4, letterSpacing: '0.05em' }}>OCR BATCH AUTOMATION</div>
                                        <h2 className="bot-section-title" style={{ margin: 0, fontSize: 18 }}>🔍 อ่านเอกสาร — เลือกไฟล์และเริ่มประมวลผล</h2>
                                    </div>
                                    <button className="btn btn-outline" onClick={() => setActiveSection(null)}
                                        style={{ fontSize: 13, padding: '6px 14px', borderRadius: '10px' }}>
                                        ✖️ ปิด
                                    </button>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', marginRight: -8, paddingRight: 8 }}>
                                    <OcrBatchPanel />
                                </div>
                            </div>
                        ) : (
                            <div className="bot-empty-state">
                                <div className="bot-empty-icon">🤖</div>
                                <h3>ยังไม่ได้เลือกระบบบอท</h3>
                                <p>กรุณาคลิก <b>"▶ รัน"</b> ที่การ์ดบอทด้านซ้ายเพื่อเริ่มต้นการทำงาน</p>
                            </div>
                        )}
                    </div>
                </div>

            </main>
        </div>
    )
}
