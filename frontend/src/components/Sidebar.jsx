import { useNavigate, useLocation } from 'react-router-dom'

export default function Sidebar({ active }) {
    const navigate = useNavigate()
    const location = useLocation()
    const user = JSON.parse(localStorage.getItem('user') || '{"display_name": "Admin", "role": "admin"}')
    const isDocSort = ['/manage', '/tools', '/companies', '/dashboard', '/manual'].includes(location.pathname)
    const isBotPage = ['/bot-automation', '/ocr-dashboard', '/bot-database', '/bot-dashboard'].includes(location.pathname)
    const isAkmPage = ['/akm-reader'].includes(location.pathname)
    const isTaxPage = ['/tax-certificate'].includes(location.pathname)


    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="logo-row">
                    <div className="logo-box">📄</div>
                    <div>
                        <h2>DocSort Pro</h2>
                        <span>{isDocSort ? 'คัดแยกเอกสาร' : isBotPage ? 'ระบบบอทอัตโนมัติ' : isAkmPage ? 'เครื่องมือ' : isTaxPage ? 'ระบบภาษี' : 'Management Platform'}</span>
                    </div>
                </div>
            </div>

            <nav className="sidebar-nav">
                {isBotPage ? (
                    <>
                        <div className="nav-section">
                            <div className="nav-section-title">นำทาง</div>
                            <button className="nav-item" onClick={() => navigate('/home')}>
                                <span className="icon">🏠</span> กลับหน้าหลัก
                            </button>
                        </div>
                        <div className="nav-section">
                            <div className="nav-section-title">บอทอัตโนมัติ</div>
                            <button className={`nav-item ${location.pathname === '/bot-automation' ? 'active' : ''}`}
                                onClick={() => navigate('/bot-automation')}>
                                <span className="icon">🤖</span> ระบบบอทอัตโนมัติ
                            </button>
                            <button className={`nav-item ${location.pathname === '/ocr-dashboard' ? 'active' : ''}`}
                                onClick={() => navigate('/ocr-dashboard')}>
                                <span className="icon">📊</span> OCR Dashboard
                            </button>
                            <button className={`nav-item ${location.pathname === '/bot-dashboard' ? 'active' : ''}`}
                                onClick={() => navigate('/bot-dashboard')}>
                                <span className="icon">📡</span> Bot Dashboard
                            </button>
                            <button className={`nav-item ${location.pathname === '/bot-database' ? 'active' : ''}`}
                                onClick={() => navigate('/bot-database')}>
                                <span className="icon">🔐</span> ฐานข้อมูลบอท
                            </button>
                        </div>

                    </>
                ) : isAkmPage ? (
                    <>
                        <div className="nav-section">
                            <div className="nav-section-title">นำทาง</div>
                            <button className="nav-item" onClick={() => navigate('/home')}>
                                <span className="icon">🏠</span> กลับหน้าหลัก
                            </button>
                        </div>
                        <div className="nav-section">
                            <div className="nav-section-title">เครื่องมือ</div>
                            <button className={`nav-item ${location.pathname === '/akm-reader' ? 'active' : ''}`}
                                onClick={() => navigate('/akm-reader')}>
                                <span className="icon">📖</span> ระบบอ่านไฟล์ A.K.F
                            </button>
                        </div>

                    </>
                ) : isDocSort ? (
                    <>
                        <div className="nav-section">
                            <div className="nav-section-title">นำทาง</div>
                            <button className="nav-item" onClick={() => navigate('/home')}>
                                <span className="icon">🏠</span> กลับหน้าหลัก
                            </button>
                        </div>
                        <div className="nav-section">
                            <div className="nav-section-title">เครื่องมือ</div>
                            <button className={`nav-item ${active === 'manage' ? 'active' : ''}`}
                                onClick={() => navigate('/manage')}>
                                <span className="icon">📁</span> จัดการไฟล์
                            </button>
                            <button className={`nav-item ${active === 'tools' ? 'active' : ''}`}
                                onClick={() => navigate('/tools')}>
                                <span className="icon">🔧</span> การจัดการเอกสาร
                            </button>
                            <button className={`nav-item ${active === 'companies' ? 'active' : ''}`}
                                onClick={() => navigate('/companies')}>
                                <span className="icon">🏢</span> ข้อมูลบริษัท
                            </button>
                            <button className={`nav-item ${active === 'dashboard' ? 'active' : ''}`}
                                onClick={() => navigate('/dashboard')}>
                                <span className="icon">📊</span> Dashboard
                            </button>
                            <button className={`nav-item ${active === 'manual' ? 'active' : ''}`}
                                onClick={() => navigate('/manual')}>
                                <span className="icon">📖</span> คู่มือการใช้งาน
                            </button>
                        </div>
                    </>
                ) : isTaxPage ? (
                    <>
                        <div className="nav-section">
                            <div className="nav-section-title">นำทาง</div>
                            <button className="nav-item" onClick={() => navigate('/home')}>
                                <span className="icon">🏠</span> กลับหน้าหลัก
                            </button>
                        </div>
                        <div className="nav-section">
                            <div className="nav-section-title">ระบบภาษี</div>
                            <button className={`nav-item ${location.pathname === '/tax-certificate' ? 'active' : ''}`}
                                onClick={() => navigate('/tax-certificate')}>
                                <span className="icon">📝</span> ออกใบ 50 ทวิ
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="nav-section">
                            <div className="nav-section-title">เมนูหลัก</div>
                            <button className={`nav-item ${active === 'home' ? 'active' : ''}`}
                                onClick={() => navigate('/home')}>
                                <span className="icon">🏠</span> หน้าหลัก
                            </button>
                        </div>
                        <div className="nav-section">
                            <div className="nav-section-title">ระบบงาน</div>
                            <button className="nav-item" onClick={() => navigate('/manage')}>
                                <span className="icon">📋</span> คัดแยกเอกสาร
                            </button>
                            <button className={`nav-item ${isBotPage ? 'active' : ''}`}
                                onClick={() => navigate('/bot-automation')}>
                                <span className="icon">🤖</span> ระบบบอทอัตโนมัติ
                            </button>
                            <button className={`nav-item ${isTaxPage ? 'active' : ''}`}
                                onClick={() => navigate('/tax-certificate')}>
                                <span className="icon">📝</span> ออกใบ 50 ทวิ
                            </button>
                            <button className="nav-item disabled">
                                <span className="icon">📊</span> รายงาน (เร็วๆ นี้)
                            </button>
                            <button className="nav-item disabled">
                                <span className="icon">⚙️</span> ตั้งค่า (เร็วๆ นี้)
                            </button>
                        </div>
                    </>
                )}
            </nav>

            <div className="sidebar-user">
                <div className="user-avatar">{(user.display_name || 'U').substring(0, 2).toUpperCase()}</div>
                <div className="user-info">
                    <div className="name">{user.display_name || user.username}</div>
                    <div className="role">{user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งาน'}</div>
                </div>
            </div>
        </aside>
    )
}
