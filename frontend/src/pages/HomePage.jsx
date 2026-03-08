import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'

export default function HomePage() {
    const navigate = useNavigate()
    const user = JSON.parse(localStorage.getItem('user') || '{}')

    const [lanStatus, setLanStatus] = useState({ enabled: false, ips: [], urls: [] })
    const [lanLoading, setLanLoading] = useState(false)

    useEffect(() => {
        fetchLanStatus()
    }, [])

    async function fetchLanStatus() {
        try {
            const res = await fetch('/api/lan')
            const data = await res.json()
            setLanStatus(data)
        } catch (err) {
            console.error('Failed to fetch LAN status:', err)
        }
    }

    async function toggleLan() {
        setLanLoading(true)
        try {
            const res = await fetch('/api/lan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: !lanStatus.enabled })
            })
            const data = await res.json()
            setLanStatus(data)
        } catch (err) {
            console.error('Failed to toggle LAN:', err)
        } finally {
            setLanLoading(false)
        }
    }

    return (
        <div className="app-layout">
            <Sidebar active="home" />
            <main className="main-content">
                <div className="page-header animate-in">
                    <div className="breadcrumb">หน้าแรก</div>
                    <h1>🏠 ยินดีต้อนรับ, {user.display_name || user.username}</h1>
                    <p>เลือกระบบที่ต้องการใช้งาน</p>
                </div>

                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>📦 ระบบงาน</h3>
                <div className="modules-grid animate-in" style={{ animationDelay: '.2s' }}>
                    <div className="module-card" onClick={() => navigate('/manage')}>
                        <div className="mod-icon" style={{ background: '#fff7ed', color: '#f97316' }}>📋</div>
                        <h3>คัดแยกเอกสาร</h3>
                        <p>จัดการ พรีวิว เปลี่ยนชื่อ ย้ายไฟล์ แยก PDF ปลดล็อค PDF</p>
                    </div>
                    <div className="module-card" onClick={() => navigate('/bot-automation')}>
                        <div className="mod-icon" style={{ background: '#fff7ed', color: '#f97316' }}>🤖</div>
                        <h3>ระบบบอทอัตโนมัติ</h3>
                        <p>สั่งรันระบบอัตโนมัติบนเว็บ ระบบ OCR อ่านเอกสาร</p>
                    </div>

                    <div className="module-card" onClick={() => navigate('/akm-reader')}>
                        <div className="mod-icon" style={{ background: '#fff7ed', color: '#f97316' }}>📖</div>
                        <h3>ระบบอ่านไฟล์ A.K.F</h3>
                        <p>อ่านไฟล์ PDF ใบกำกับภาษี ดึงข้อมูลสำคัญอัตโนมัติ ตรวจสอบและแก้ไข</p>
                    </div>
                    <div className="module-card disabled">
                        <div className="mod-icon" style={{ background: '#f0fdf4' }}>📊</div>
                        <h3>ระบบรายงาน</h3>
                        <p>รายงานสรุปการดำเนินงาน (เร็วๆ นี้)</p>
                    </div>
                    <div className="module-card disabled">
                        <div className="mod-icon" style={{ background: '#eff6ff' }}>⚙️</div>
                        <h3>ตั้งค่าระบบ</h3>
                        <p>จัดการผู้ใช้งาน สิทธิ์ ค่าต่างๆ (เร็วๆ นี้)</p>
                    </div>
                </div>

                {/* LAN Access Toggle */}
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>🌐 ตั้งค่าเครือข่าย</h3>
                <div className="lan-card animate-in" style={{ animationDelay: '.4s' }}>
                    <div className="lan-card-header">
                        <div className="lan-icon-wrap">
                            <div className={`lan-icon ${lanStatus.enabled ? 'active' : ''}`}>
                                {lanStatus.enabled ? '🟢' : '🔴'}
                            </div>
                        </div>
                        <div className="lan-info">
                            <h4>การเข้าถึงผ่าน LAN</h4>
                            <p className="lan-desc">
                                {lanStatus.enabled
                                    ? 'เปิดให้คนภายนอกเข้าถึงระบบผ่านเครือข่ายท้องถิ่น'
                                    : 'ปิดการเข้าถึงจากภายนอก — เฉพาะเครื่องนี้เท่านั้น'
                                }
                            </p>
                        </div>
                        <button
                            className={`toggle-switch ${lanStatus.enabled ? 'on' : ''}`}
                            onClick={toggleLan}
                            disabled={lanLoading}
                            title={lanStatus.enabled ? 'ปิด LAN Access' : 'เปิด LAN Access'}
                        >
                            <span className="toggle-knob" />
                        </button>
                    </div>

                    {lanStatus.enabled && lanStatus.ips && lanStatus.ips.length > 0 && (
                        <div className="lan-urls">
                            <div className="lan-urls-label">📡 เข้าถึงได้จากเครื่องอื่นที่</div>
                            {lanStatus.ips.map((ip, i) => (
                                <div key={i} className="lan-url-item">
                                    <span className="lan-url-badge">{ip.name}</span>
                                    <code className="lan-url-text">
                                        http://{ip.address}:{lanStatus.port}
                                    </code>
                                    <button
                                        className="lan-copy-btn"
                                        onClick={() => {
                                            navigator.clipboard.writeText(`http://${ip.address}:${lanStatus.port}`)
                                        }}
                                        title="คัดลอก URL"
                                    >
                                        📋
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}

