// ── Result Card Component ──
// การ์ดแสดงผลลัพธ์การอ่านเอกสารแต่ละใบ
import { useState } from 'react'
import ConfidenceBadge from './ConfidenceBadge'

const S = {
    card: (confidence) => ({
        background: '#fff',
        border: `1.5px solid ${confidence >= 100 ? '#bbf7d0' : confidence >= 60 ? '#fde68a' : '#fecaca'}`,
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        transition: 'all 0.3s',
        marginBottom: 16,
    }),
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 20px',
        borderBottom: '1px solid #f0f2f5',
        background: '#fafbfc',
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
    },
    docNum: {
        fontSize: 15,
        fontWeight: 700,
        color: '#1a1a2e',
    },
    mergedBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: 14,
        fontSize: 11,
        fontWeight: 600,
        color: '#3b82f6',
    },
    body: {
        padding: '16px 20px',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 12,
    },
    fieldBox: (editable) => ({
        background: editable ? '#fffbeb' : '#f8f9fb',
        border: `1px solid ${editable ? '#fde68a' : '#e8ecf1'}`,
        borderRadius: 10,
        padding: '10px 14px',
    }),
    fieldLabel: {
        fontSize: 11,
        fontWeight: 700,
        color: '#8b8fa3',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 4,
    },
    fieldValue: {
        fontSize: 14,
        fontWeight: 600,
        color: '#1a1a2e',
        wordBreak: 'break-all',
    },
    fieldInput: {
        width: '100%',
        padding: '6px 10px',
        border: '1.5px solid #fed7aa',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'Inter, sans-serif',
        color: '#1a1a2e',
        background: '#fff',
        outline: 'none',
        transition: 'border-color 0.2s',
    },
    emptyValue: {
        fontSize: 13,
        fontWeight: 500,
        color: '#d1d5db',
        fontStyle: 'italic',
    },
    footer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        borderTop: '1px solid #f0f2f5',
        background: '#fafbfc',
    },
    actionBtn: (primary) => ({
        padding: '7px 16px',
        background: primary ? 'linear-gradient(135deg, #f97316, #fb923c)' : 'transparent',
        border: primary ? 'none' : '1.5px solid #e8ecf1',
        borderRadius: 8,
        color: primary ? '#fff' : '#6b7280',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        transition: 'all 0.15s',
    }),
    warningBar: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 20px',
        background: '#fffbeb',
        borderBottom: '1px solid #fde68a',
        fontSize: 13,
        color: '#d97706',
        fontWeight: 500,
    },
}

// ฟิลด์ทั้ง 11 ตามเอกสาร
const FIELDS = [
    { key: 'docNumber', label: 'เลขที่เอกสาร', critical: true },
    { key: 'orderNumber', label: 'เลขที่คำสั่งซื้อ' },
    { key: 'date', label: 'วันที่', critical: true },
    { key: 'preVat', label: 'ยอดก่อน VAT', critical: true },
    { key: 'vat', label: 'VAT 7%', critical: true },
    { key: 'grandTotal', label: 'ยอดรวมทั้งสิ้น', critical: true },
    { key: 'subTotal', label: 'Sub Total' },
    { key: 'discount', label: 'ส่วนลด' },
    { key: 'issuer', label: 'ผู้ออกเอกสาร' },
    { key: 'taxId', label: 'เลขประจำตัวผู้เสียภาษี' },
    { key: 'customer', label: 'ชื่อลูกค้า' },
]

export default function ResultCard({ data, onUpdate }) {
    const [isEditing, setIsEditing] = useState(false)
    const [editData, setEditData] = useState({ ...data })

    const confidence = data.confidence || 0
    const canEdit = confidence < 100
    const mergedPages = data.mergedPages || 0

    // เริ่มแก้ไข
    const startEdit = () => {
        setEditData({ ...data })
        setIsEditing(true)
    }

    // บันทึกข้อมูลที่แก้ไข
    const saveEdit = () => {
        onUpdate?.(editData)
        setIsEditing(false)
    }

    // ยกเลิกการแก้ไข
    const cancelEdit = () => {
        setEditData({ ...data })
        setIsEditing(false)
    }

    // อัพเดทค่า field
    const updateField = (key, value) => {
        setEditData(prev => ({ ...prev, [key]: value }))
    }

    return (
        <div style={S.card(confidence)}>
            {/* Header */}
            <div style={S.header}>
                <div style={S.headerLeft}>
                    <span style={{ fontSize: 20 }}>📄</span>
                    <span style={S.docNum}>{data.docNumber || 'ไม่พบเลขที่เอกสาร'}</span>
                    {mergedPages > 0 && (
                        <div style={S.mergedBadge}>📁 รวม {mergedPages} หน้า</div>
                    )}
                </div>
                <ConfidenceBadge score={confidence} />
            </div>

            {/* Warning bar สำหรับ confidence ต่ำ */}
            {canEdit && !isEditing && (
                <div style={S.warningBar}>
                    <span>⚠️</span>
                    ข้อมูลบางส่วนอ่านไม่ได้ — กรุณาตรวจสอบและแก้ไขข้อมูลที่ขาดหายไป
                </div>
            )}

            {/* Body — แสดงข้อมูล 11 ฟิลด์ */}
            <div style={S.body}>
                <div style={S.grid}>
                    {FIELDS.map(field => {
                        const value = isEditing ? editData[field.key] : data[field.key]
                        const isEmpty = !value || value === '-'
                        const editable = isEditing && (canEdit || true)

                        return (
                            <div key={field.key} style={S.fieldBox(isEmpty && !isEditing)}>
                                <div style={S.fieldLabel}>
                                    {field.label}
                                    {field.critical && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
                                </div>
                                {editable ? (
                                    <input
                                        style={S.fieldInput}
                                        value={value || ''}
                                        onChange={e => updateField(field.key, e.target.value)}
                                        placeholder={`กรอก${field.label}`}
                                    />
                                ) : (
                                    <div style={isEmpty ? S.emptyValue : S.fieldValue}>
                                        {isEmpty ? 'ไม่พบข้อมูล' : value}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Footer — ปุ่ม actions */}
            <div style={S.footer}>
                <div style={{ fontSize: 11, color: '#8b8fa3' }}>
                    {data.fileName && `📁 ${data.fileName}`}
                    {data.pages && ` • หน้า ${data.pages}`}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {isEditing ? (
                        <>
                            <button style={S.actionBtn(false)} onClick={cancelEdit}>
                                ✕ ยกเลิก
                            </button>
                            <button style={S.actionBtn(true)} onClick={saveEdit}>
                                💾 บันทึก
                            </button>
                        </>
                    ) : (
                        canEdit && (
                            <button style={S.actionBtn(true)} onClick={startEdit}>
                                ✏️ แก้ไข
                            </button>
                        )
                    )}
                </div>
            </div>
        </div>
    )
}
