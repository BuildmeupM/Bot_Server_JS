import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import Sidebar from '../../components/Sidebar'
import { getCompanies, createCompany, updateCompany, deleteCompany } from '../../services/api'

// Extract group code from path: V:\A.xxx\Build000 ทดสอบ\... → "Build000"
function extractGroupCode(input) {
    if (!input) return ''
    const normalized = input.replace(/\\/g, '/')
    const parts = normalized.split('/')
    for (const part of parts) {
        const match = part.match(/^([A-Za-z]+\d+)/)
        if (match) return match[1]
    }
    return ''
}

export default function CompanyPage() {
    // Group code input
    const [groupInput, setGroupInput] = useState('')
    const [groupCode, setGroupCode] = useState('')

    // Companies state
    const [companies, setCompanies] = useState([])
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState('')
    const [showModal, setShowModal] = useState(false)
    const [editId, setEditId] = useState(null)
    const [form, setForm] = useState({ company_name: '', account_codes: [{ code: '', description: '' }], payment_codes: [{ code: '', description: '' }] })
    const [saving, setSaving] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState(null)
    const [expandedRow, setExpandedRow] = useState(null)

    // Handle group code input — accept raw code or path
    const applyGroupCode = () => {
        const input = groupInput.trim()
        if (!input) return toast.error('กรุณาระบุรหัสภายในหรือ path')
        // Check if it looks like a path (has slash or backslash)
        const extracted = input.includes('/') || input.includes('\\') ? extractGroupCode(input) : input
        if (!extracted) return toast.error('ไม่พบรหัสภายในจาก path ที่ระบุ')
        setGroupCode(extracted)
        setGroupInput(extracted)
    }

    // Load companies for the active group code
    const loadCompanies = useCallback(async () => {
        if (!groupCode) return
        setLoading(true)
        try {
            const res = await getCompanies(search, groupCode)
            setCompanies(res.data)
        } catch (err) {
            toast.error('ไม่สามารถโหลดข้อมูลบริษัทได้')
        } finally { setLoading(false) }
    }, [search, groupCode])

    useEffect(() => {
        const timer = setTimeout(() => loadCompanies(), 300)
        return () => clearTimeout(timer)
    }, [loadCompanies])

    const openCreate = () => {
        setEditId(null)
        setForm({ company_name: '', account_codes: [{ code: '', description: '' }], payment_codes: [{ code: '', description: '' }] })
        setShowModal(true)
    }

    const openEdit = (company) => {
        setEditId(company.id)
        setForm({
            company_name: company.company_name,
            account_codes: company.account_codes?.length > 0
                ? company.account_codes.map(c => ({ code: c.code, description: c.description || '' }))
                : [{ code: '', description: '' }],
            payment_codes: company.payment_codes?.length > 0
                ? company.payment_codes.map(c => ({ code: c.code, description: c.description || '' }))
                : [{ code: '', description: '' }],
        })
        setShowModal(true)
    }

    const handleSave = async () => {
        if (!form.company_name.trim()) return toast.error('กรุณาระบุชื่อบริษัท')
        const hasCode = form.account_codes.some(c => c.code.trim()) || form.payment_codes.some(c => c.code.trim())
        if (!hasCode) return toast.error('กรุณาระบุอย่างน้อย 1 โค้ด')
        setSaving(true)
        try {
            const payload = { ...form, group_code: groupCode }
            if (editId) {
                await updateCompany(editId, payload)
                toast.success('อัพเดทบริษัทสำเร็จ')
            } else {
                await createCompany(payload)
                toast.success('สร้างบริษัทสำเร็จ')
            }
            setShowModal(false)
            loadCompanies()
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        } finally { setSaving(false) }
    }

    const handleDelete = async (id) => {
        try {
            await deleteCompany(id)
            toast.success('ลบบริษัทสำเร็จ')
            setDeleteConfirm(null)
            loadCompanies()
        } catch (err) {
            toast.error('ไม่สามารถลบได้')
        }
    }

    const addCode = (type) => {
        setForm(prev => ({ ...prev, [type]: [...prev[type], { code: '', description: '' }] }))
    }
    const removeCode = (type, idx) => {
        setForm(prev => ({ ...prev, [type]: prev[type].filter((_, i) => i !== idx) }))
    }
    const updateCode = (type, idx, field, value) => {
        setForm(prev => ({
            ...prev,
            [type]: prev[type].map((item, i) => i === idx ? { ...item, [field]: value } : item)
        }))
    }

    return (
        <div className="app-layout">
            <Sidebar active="companies" />
            <main className="main-content">
                <div className="content-wrapper" style={{ maxWidth: 1200 }}>
                    {/* Header */}
                    <div className="page-header animate-in">
                        <div>
                            <h1>🏢 ข้อมูลบริษัท</h1>
                            <p>จัดการข้อมูลบริษัท โค้ดบันทึกบัญชี และโค้ดตัดชำระเงิน</p>
                        </div>
                    </div>

                    {/* Group Code Input */}
                    <div className="animate-in" style={{ animationDelay: '.05s', background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>📂 รหัสภายใน:</span>
                            <div style={{ flex: 1, minWidth: 200, display: 'flex', gap: 8 }}>
                                <input
                                    type="text"
                                    value={groupInput}
                                    onChange={e => setGroupInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && applyGroupCode()}
                                    placeholder="พิมพ์รหัส เช่น Build000 หรือวาง path..."
                                    style={{ flex: 1, padding: '9px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', transition: 'border-color .2s' }}
                                    onFocus={e => e.target.style.borderColor = '#6366f1'}
                                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                />
                                <button onClick={applyGroupCode}
                                    style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(99,102,241,.3)' }}>
                                    🔍 ค้นหา
                                </button>
                            </div>
                            {groupCode && (
                                <span style={{ padding: '6px 14px', borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 700, fontSize: 15, letterSpacing: '.5px' }}>
                                    {groupCode}
                                </span>
                            )}
                        </div>
                        {!groupCode && (
                            <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
                                💡 ตัวอย่าง: พิมพ์ <strong>Build000</strong> หรือวาง path เช่น <strong>V:\A.โฟร์เดอร์หลัก\Build000 ทดสอบระบบ</strong>
                            </div>
                        )}
                    </div>

                    {/* Only show CRUD UI when groupCode is selected */}
                    {groupCode ? (
                        <>
                            {/* Toolbar */}
                            <div className="animate-in" style={{ animationDelay: '.1s', display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 200 }}>
                                    <input
                                        type="text"
                                        placeholder="🔍 ค้นหาชื่อบริษัท..."
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, background: '#fff', outline: 'none', transition: 'border-color .2s' }}
                                        onFocus={e => e.target.style.borderColor = '#6366f1'}
                                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                    />
                                </div>
                                <button onClick={openCreate}
                                    style={{ padding: '10px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(99,102,241,.3)' }}>
                                    ➕ เพิ่มบริษัท
                                </button>
                                <div style={{ color: '#94a3b8', fontSize: 13 }}>
                                    ทั้งหมด {companies.length} บริษัท
                                </div>
                            </div>

                            {/* Table */}
                            <div className="animate-in" style={{ animationDelay: '.15s', background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                                {loading ? (
                                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                        <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
                                        กำลังโหลด...
                                    </div>
                                ) : companies.length === 0 ? (
                                    <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
                                        <div style={{ fontSize: 48, marginBottom: 12 }}>🏢</div>
                                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>ยังไม่มีข้อมูลบริษัทใน {groupCode}</div>
                                        <div style={{ fontSize: 13 }}>คลิก "เพิ่มบริษัท" เพื่อเริ่มต้น</div>
                                    </div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                <th style={thStyle}>#</th>
                                                <th style={{ ...thStyle, textAlign: 'left' }}>ชื่อบริษัท</th>
                                                <th style={thStyle}>โค้ดบันทึกบัญชี</th>
                                                <th style={thStyle}>โค้ดตัดชำระ</th>
                                                <th style={{ ...thStyle, width: 100 }}>จัดการ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {companies.map((c, i) => (
                                                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background .15s' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#fafbff'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    <td style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', fontWeight: 600, width: 50 }}>{i + 1}</td>
                                                    <td style={{ ...tdStyle, fontWeight: 600, color: '#1e293b' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                                                                {c.company_name.substring(0, 2)}
                                                            </span>
                                                            {c.company_name}
                                                        </div>
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        {c.account_codes?.length > 0 ? (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                                                                {c.account_codes.map((ac, j) => (
                                                                    <span key={j} title={ac.description || ''} style={{ padding: '2px 8px', borderRadius: 6, background: '#eef2ff', color: '#4338ca', fontSize: 12, fontWeight: 600, cursor: ac.description ? 'help' : 'default' }}>
                                                                        {ac.code}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>}
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        {c.payment_codes?.length > 0 ? (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                                                                {c.payment_codes.map((pc, j) => (
                                                                    <span key={j} title={pc.description || ''} style={{ padding: '2px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 600, cursor: pc.description ? 'help' : 'default' }}>
                                                                        {pc.code}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>}
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                                            <button onClick={() => setExpandedRow(expandedRow === c.id ? null : c.id)}
                                                                style={iconBtnStyle} title="ดูรายละเอียด">👁️</button>
                                                            <button onClick={() => openEdit(c)}
                                                                style={iconBtnStyle} title="แก้ไข">✏️</button>
                                                            <button onClick={() => setDeleteConfirm(c.id)}
                                                                style={{ ...iconBtnStyle, background: '#fef2f2' }} title="ลบ">🗑️</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {/* Expanded Detail */}
                            {expandedRow && (() => {
                                const c = companies.find(x => x.id === expandedRow)
                                if (!c) return null
                                return (
                                    <div className="animate-in" style={{ marginTop: 16, background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                            <h3 style={{ margin: 0, fontSize: 16, color: '#1e293b' }}>📋 รายละเอียด: {c.company_name}</h3>
                                            <button onClick={() => setExpandedRow(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                            <div>
                                                <h4 style={detailTitleStyle}>📘 โค้ดบันทึกบัญชี ({c.account_codes?.length || 0})</h4>
                                                {c.account_codes?.length > 0 ? c.account_codes.map((ac, i) => (
                                                    <div key={i} style={detailCardStyle}>
                                                        <div style={{ fontWeight: 700, color: '#4338ca', fontSize: 14 }}>{ac.code}</div>
                                                        <div style={{ color: '#64748b', fontSize: 13 }}>{ac.description || '—'}</div>
                                                    </div>
                                                )) : <div style={{ color: '#94a3b8', fontSize: 13 }}>ไม่มี</div>}
                                            </div>
                                            <div>
                                                <h4 style={detailTitleStyle}>💳 โค้ดตัดชำระเงิน ({c.payment_codes?.length || 0})</h4>
                                                {c.payment_codes?.length > 0 ? c.payment_codes.map((pc, i) => (
                                                    <div key={i} style={detailCardStyle}>
                                                        <div style={{ fontWeight: 700, color: '#92400e', fontSize: 14 }}>{pc.code}</div>
                                                        <div style={{ color: '#64748b', fontSize: 13 }}>{pc.description || '—'}</div>
                                                    </div>
                                                )) : <div style={{ color: '#94a3b8', fontSize: 13 }}>ไม่มี</div>}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })()}
                        </>
                    ) : (
                        <div className="animate-in" style={{ animationDelay: '.1s', background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 60, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                            <div style={{ fontSize: 56, marginBottom: 16 }}>📂</div>
                            <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#1e293b' }}>เลือกโฟลเดอร์เพื่อเริ่มต้น</h3>
                            <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
                                กรุณาเลือกโฟลเดอร์เพื่อระบุรหัสภายใน (เช่น Build000)<br />
                                ระบบจะแสดงบริษัทที่อยู่ภายใต้รหัสที่เลือก
                            </p>
                        </div>
                    )}

                    {/* Modal */}
                    {showModal && (
                        <div style={overlayStyle} onClick={() => setShowModal(false)}>
                            <div style={modalStyle} onClick={e => e.stopPropagation()}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                    <h2 style={{ margin: 0, fontSize: 18, color: '#1e293b' }}>
                                        {editId ? '✏️ แก้ไขบริษัท' : '➕ เพิ่มบริษัทใหม่'}
                                        <span style={{ display: 'inline-block', marginLeft: 10, padding: '3px 10px', borderRadius: 6, background: '#eef2ff', color: '#4338ca', fontSize: 12, fontWeight: 700 }}>
                                            {groupCode}
                                        </span>
                                    </h2>
                                    <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                                </div>

                                {/* Company Name */}
                                <div style={{ marginBottom: 20 }}>
                                    <label style={labelStyle}>ชื่อบริษัท *</label>
                                    <input
                                        type="text"
                                        value={form.company_name}
                                        onChange={e => setForm(prev => ({ ...prev, company_name: e.target.value }))}
                                        placeholder="ระบุชื่อบริษัท"
                                        style={inputStyle}
                                        autoFocus
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                    {/* Account Codes */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <label style={labelStyle}>📘 โค้ดบันทึกบัญชี</label>
                                            <button onClick={() => addCode('account_codes')} style={addBtnStyle}>+ เพิ่ม</button>
                                        </div>
                                        {form.account_codes.map((ac, i) => (
                                            <div key={i} style={codeRowStyle}>
                                                <input type="text" placeholder="โค้ด" value={ac.code}
                                                    onChange={e => updateCode('account_codes', i, 'code', e.target.value)}
                                                    style={{ ...inputStyle, marginBottom: 0, flex: '0 0 120px' }} />
                                                <input type="text" placeholder="คำอธิบาย" value={ac.description}
                                                    onChange={e => updateCode('account_codes', i, 'description', e.target.value)}
                                                    style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
                                                {form.account_codes.length > 1 && (
                                                    <button onClick={() => removeCode('account_codes', i)} style={removeBtnStyle}>✕</button>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Payment Codes */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <label style={labelStyle}>💳 โค้ดตัดชำระเงิน</label>
                                            <button onClick={() => addCode('payment_codes')} style={addBtnStyle}>+ เพิ่ม</button>
                                        </div>
                                        {form.payment_codes.map((pc, i) => (
                                            <div key={i} style={codeRowStyle}>
                                                <input type="text" placeholder="โค้ด" value={pc.code}
                                                    onChange={e => updateCode('payment_codes', i, 'code', e.target.value)}
                                                    style={{ ...inputStyle, marginBottom: 0, flex: '0 0 120px' }} />
                                                <input type="text" placeholder="คำอธิบาย" value={pc.description}
                                                    onChange={e => updateCode('payment_codes', i, 'description', e.target.value)}
                                                    style={{ ...inputStyle, marginBottom: 0, flex: 1 }} />
                                                {form.payment_codes.length > 1 && (
                                                    <button onClick={() => removeCode('payment_codes', i)} style={removeBtnStyle}>✕</button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                                    <button onClick={() => setShowModal(false)}
                                        style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14, cursor: 'pointer', color: '#64748b' }}>
                                        ยกเลิก
                                    </button>
                                    <button onClick={handleSave} disabled={saving}
                                        style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? .7 : 1 }}>
                                        {saving ? '⏳ กำลังบันทึก...' : editId ? '💾 บันทึก' : '✅ สร้าง'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Delete Confirm */}
                    {deleteConfirm && (
                        <div style={overlayStyle} onClick={() => setDeleteConfirm(null)}>
                            <div style={{ ...modalStyle, maxWidth: 400, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                                <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#1e293b' }}>ยืนยันการลบ</h3>
                                <p style={{ color: '#64748b', fontSize: 14, marginBottom: 20 }}>ต้องการลบบริษัทนี้หรือไม่? ข้อมูลทั้งหมดจะถูกลบ</p>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                    <button onClick={() => setDeleteConfirm(null)}
                                        style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>
                                        ยกเลิก
                                    </button>
                                    <button onClick={() => handleDelete(deleteConfirm)}
                                        style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                                        🗑️ ลบ
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}

// ── Styles ──
const thStyle = { padding: '12px 14px', fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'center', whiteSpace: 'nowrap' }
const tdStyle = { padding: '12px 14px', fontSize: 14, color: '#334155' }
const iconBtnStyle = { width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fafbff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14 }
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }
const modalStyle = { background: '#fff', borderRadius: 16, padding: 28, width: '90%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,.15)' }
const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }
const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }
const codeRowStyle = { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }
const addBtnStyle = { padding: '3px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 12, cursor: 'pointer', color: '#6366f1', fontWeight: 600 }
const removeBtnStyle = { width: 28, height: 28, borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 12, flexShrink: 0 }
const detailTitleStyle = { fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 10, marginTop: 0 }
const detailCardStyle = { padding: '8px 12px', borderRadius: 8, background: '#f8fafc', marginBottom: 6, border: '1px solid #f1f5f9' }
