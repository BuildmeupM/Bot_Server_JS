import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../../services/api'
import toast from 'react-hot-toast'

export default function LoginPage() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const navigate = useNavigate()

    const handleLogin = async (e) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        try {
            const res = await login(username, password)
            localStorage.setItem('token', res.data.token)
            localStorage.setItem('user', JSON.stringify(res.data.user))
            toast.success('เข้าสู่ระบบสำเร็จ')
            navigate('/home')
        } catch (err) {
            setError(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="login-wrapper">
            <div className="login-left">
                <div className="login-brand">
                    <div className="brand-icon">📄</div>
                    <h1>DocSort Pro</h1>
                    <p>ระบบจัดการเอกสาร PDF อัจฉริยะ<br />คัดแยก ปลดล็อค พรีวิว เปลี่ยนชื่อ ย้ายไฟล์</p>
                </div>
            </div>
            <div className="login-right">
                <form className="login-card animate-in" onSubmit={handleLogin}>
                    <h2>เข้าสู่ระบบ</h2>
                    <p className="subtitle">กรอกข้อมูลเพื่อเข้าใช้งาน</p>

                    {error && <div className="error-msg">{error}</div>}

                    <div className="form-group">
                        <label>ชื่อผู้ใช้</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>รหัสผ่าน</label>
                        <input
                            type="password"
                            className="form-input"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div className="remember-row">
                        <label><input type="checkbox" /> จดจำฉัน</label>
                    </div>
                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? <><span className="loading-spinner"></span> กำลังเข้าสู่ระบบ...</> : 'เข้าสู่ระบบ'}
                    </button>
                </form>
            </div>
        </div>
    )
}
