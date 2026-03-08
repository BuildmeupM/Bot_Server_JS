// ── Export Excel Modal ──
// Modal สำหรับกรอกข้อมูล ลูกค้า + รับชำระโดย ก่อนส่งออก Excel
import { useState, useEffect, useRef } from 'react'

const S = {
    overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        animation: 'fadeIn 0.2s ease',
    },
    modal: {
        background: '#fff',
        borderRadius: 20,
        width: '100%',
        maxWidth: 480,
        boxShadow: '0 25px 60px rgba(0,0,0,0.15), 0 8px 20px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        animation: 'slideUp 0.3s ease',
    },
    header: {
        padding: '24px 28px 16px',
        borderBottom: '1px solid #f0f2f5',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
    },
    iconWrap: {
        width: 48,
        height: 48,
        borderRadius: 14,
        background: 'linear-gradient(135deg, #f97316, #fb923c)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        flexShrink: 0,
    },
    title: {
        fontSize: 18,
        fontWeight: 800,
        color: '#1a1a2e',
        fontFamily: 'Inter, sans-serif',
        margin: 0,
    },
    subtitle: {
        fontSize: 13,
        color: '#8b8fa3',
        marginTop: 2,
        fontFamily: 'Inter, sans-serif',
    },
    body: {
        padding: '20px 28px 24px',
    },
    fieldGroup: {
        marginBottom: 18,
    },
    label: {
        display: 'block',
        fontSize: 13,
        fontWeight: 700,
        color: '#374151',
        marginBottom: 6,
        fontFamily: 'Inter, sans-serif',
    },
    labelHint: {
        fontSize: 11,
        fontWeight: 500,
        color: '#9ca3af',
        marginLeft: 6,
    },
    input: {
        width: '100%',
        padding: '12px 16px',
        border: '2px solid #e8ecf1',
        borderRadius: 12,
        fontSize: 14,
        fontWeight: 500,
        fontFamily: 'Inter, sans-serif',
        color: '#1a1a2e',
        outline: 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxSizing: 'border-box',
        background: '#fafbfc',
    },
    inputFocus: {
        borderColor: '#f97316',
        boxShadow: '0 0 0 3px rgba(249,115,22,0.1)',
        background: '#fff',
    },
    infoBox: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 16px',
        background: '#eff6ff',
        borderRadius: 12,
        border: '1px solid #bfdbfe',
        marginBottom: 4,
    },
    infoText: {
        fontSize: 12,
        color: '#1e40af',
        lineHeight: 1.5,
        fontFamily: 'Inter, sans-serif',
    },
    footer: {
        padding: '16px 28px 24px',
        display: 'flex',
        gap: 10,
        justifyContent: 'flex-end',
    },
    btnCancel: {
        padding: '11px 24px',
        border: '2px solid #e8ecf1',
        borderRadius: 12,
        background: '#fff',
        color: '#6b7280',
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
        transition: 'all 0.15s',
    },
    btnConfirm: {
        padding: '11px 28px',
        border: 'none',
        borderRadius: 12,
        background: 'linear-gradient(135deg, #f97316, #fb923c)',
        color: '#fff',
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        transition: 'all 0.15s',
        boxShadow: '0 4px 12px rgba(249,115,22,0.3)',
    },
    btnConfirmDisabled: {
        opacity: 0.5,
        cursor: 'not-allowed',
        boxShadow: 'none',
    },
}

export default function ExportExcelModal({ isOpen, onClose, onConfirm, resultCount }) {
    const [customerName, setCustomerName] = useState('')
    const [paymentMethod, setPaymentMethod] = useState('')
    const [focusField, setFocusField] = useState(null)
    const customerRef = useRef(null)

    // Auto-focus ช่อง ลูกค้า เมื่อ modal เปิด
    useEffect(() => {
        if (isOpen && customerRef.current) {
            setTimeout(() => customerRef.current?.focus(), 200)
        }
        if (!isOpen) {
            setCustomerName('')
            setPaymentMethod('')
        }
    }, [isOpen])

    if (!isOpen) return null

    const canConfirm = customerName.trim().length > 0 && paymentMethod.trim().length > 0

    const handleConfirm = () => {
        if (!canConfirm) return
        onConfirm(customerName.trim(), paymentMethod.trim())
    }

    // ป้องกันคลิก overlay ปิด modal
    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) onClose()
    }

    // กด Enter เพื่อยืนยัน
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && canConfirm) handleConfirm()
        if (e.key === 'Escape') onClose()
    }

    return (
        <div style={S.overlay} onClick={handleOverlayClick} onKeyDown={handleKeyDown}>
            <div style={S.modal}>
                {/* Header */}
                <div style={S.header}>
                    <div style={S.iconWrap}>📊</div>
                    <div>
                        <h3 style={S.title}>ส่งออก Excel</h3>
                        <div style={S.subtitle}>
                            PEAK_ImportExpense — {resultCount} รายการ
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div style={S.body}>
                    {/* Info Box */}
                    <div style={S.infoBox}>
                        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>ℹ️</span>
                        <div style={S.infoText}>
                            กรุณากรอกข้อมูลด้านล่าง ค่าที่กรอกจะถูกใส่เหมือนกันทุกรายการในไฟล์ Excel
                        </div>
                    </div>

                    <div style={{ height: 16 }} />

                    {/* ลูกค้า */}
                    <div style={S.fieldGroup}>
                        <label style={S.label}>
                            ลูกค้า <span style={{ color: '#ef4444' }}>*</span>
                            <span style={S.labelHint}>(ใส่เหมือนกันทุกรายการ)</span>
                        </label>
                        <input
                            ref={customerRef}
                            style={{
                                ...S.input,
                                ...(focusField === 'customer' ? S.inputFocus : {}),
                            }}
                            value={customerName}
                            onChange={e => setCustomerName(e.target.value)}
                            onFocus={() => setFocusField('customer')}
                            onBlur={() => setFocusField(null)}
                            placeholder="กรอกชื่อลูกค้า..."
                        />
                    </div>

                    {/* รับชำระโดย */}
                    <div style={S.fieldGroup}>
                        <label style={S.label}>
                            รับชำระโดย <span style={{ color: '#ef4444' }}>*</span>
                            <span style={S.labelHint}>(ใส่เหมือนกันทุกรายการ)</span>
                        </label>
                        <input
                            style={{
                                ...S.input,
                                ...(focusField === 'payment' ? S.inputFocus : {}),
                            }}
                            value={paymentMethod}
                            onChange={e => setPaymentMethod(e.target.value)}
                            onFocus={() => setFocusField('payment')}
                            onBlur={() => setFocusField(null)}
                            placeholder="กรอกวิธีรับชำระ..."
                        />
                    </div>
                </div>

                {/* Footer */}
                <div style={S.footer}>
                    <button
                        style={S.btnCancel}
                        onClick={onClose}
                        onMouseEnter={e => {
                            e.currentTarget.style.background = '#f3f4f6'
                            e.currentTarget.style.borderColor = '#d1d5db'
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.background = '#fff'
                            e.currentTarget.style.borderColor = '#e8ecf1'
                        }}
                    >
                        ยกเลิก
                    </button>
                    <button
                        style={{
                            ...S.btnConfirm,
                            ...(!canConfirm ? S.btnConfirmDisabled : {}),
                        }}
                        disabled={!canConfirm}
                        onClick={handleConfirm}
                        onMouseEnter={e => {
                            if (canConfirm) e.currentTarget.style.transform = 'translateY(-1px)'
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)'
                        }}
                    >
                        📥 ดาวน์โหลด Excel
                    </button>
                </div>
            </div>

            {/* Animations */}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(30px) scale(0.96); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    )
}
