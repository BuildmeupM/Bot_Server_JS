// ── File Upload Zone Component ──
// Drag & Drop zone + เลือกไฟล์ PDF สำหรับอ่านเอกสาร
import { useState, useRef } from 'react'

const S = {
    zone: (isDragging) => ({
        border: `2.5px dashed ${isDragging ? '#f97316' : '#d1d5db'}`,
        borderRadius: 16,
        padding: '48px 32px',
        textAlign: 'center',
        background: isDragging
            ? 'linear-gradient(135deg, rgba(249,115,22,0.06), rgba(251,146,60,0.06))'
            : '#fafbfc',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
        marginBottom: 24,
    }),
    icon: {
        fontSize: 56,
        marginBottom: 16,
        filter: 'drop-shadow(0 4px 8px rgba(249,115,22,0.2))',
    },
    title: {
        fontSize: 17,
        fontWeight: 700,
        color: '#1a1a2e',
        marginBottom: 6,
    },
    subtitle: {
        fontSize: 13,
        color: '#8b8fa3',
        marginBottom: 20,
        lineHeight: 1.6,
    },
    browseBtn: {
        padding: '10px 24px',
        background: 'linear-gradient(135deg, #f97316, #fb923c)',
        border: 'none',
        borderRadius: 10,
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
        boxShadow: '0 4px 12px rgba(249,115,22,0.3)',
        transition: 'all 0.2s',
    },
    fileList: {
        marginTop: 16,
    },
    fileItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: '#fff',
        border: '1px solid #e8ecf1',
        borderRadius: 12,
        marginBottom: 8,
        transition: 'all 0.2s',
    },
    fileIcon: {
        width: 40,
        height: 40,
        background: '#fff7ed',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        flexShrink: 0,
    },
    fileInfo: {
        flex: 1,
        minWidth: 0,
    },
    fileName: {
        fontSize: 13,
        fontWeight: 600,
        color: '#1a1a2e',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    fileMeta: {
        fontSize: 11,
        color: '#8b8fa3',
        marginTop: 2,
    },
    removeBtn: {
        width: 30,
        height: 30,
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: 8,
        color: '#ef4444',
        cursor: 'pointer',
        fontSize: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s',
        flexShrink: 0,
    },
    summary: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
        padding: '10px 16px',
        background: '#fff7ed',
        borderRadius: 10,
        border: '1px solid #fed7aa',
    },
    summaryText: {
        fontSize: 13,
        fontWeight: 600,
        color: '#f97316',
    },
    clearBtn: {
        padding: '6px 14px',
        background: 'transparent',
        border: '1.5px solid #fecaca',
        borderRadius: 8,
        color: '#ef4444',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
        transition: 'all 0.15s',
    },
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
}

export default function FileUploadZone({ files = [], onFilesChange }) {
    const [isDragging, setIsDragging] = useState(false)
    const inputRef = useRef(null)

    // จัดการ Drag events
    const handleDragOver = (e) => {
        e.preventDefault()
        setIsDragging(true)
    }
    const handleDragLeave = () => setIsDragging(false)

    const handleDrop = (e) => {
        e.preventDefault()
        setIsDragging(false)
        const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.pdf'))
        if (dropped.length > 0) {
            onFilesChange([...files, ...dropped])
        }
    }

    // เลือกไฟล์จาก input
    const handleSelect = (e) => {
        const selected = Array.from(e.target.files)
        if (selected.length > 0) {
            onFilesChange([...files, ...selected])
        }
        e.target.value = '' // รีเซ็ตเพื่อให้เลือกไฟล์ซ้ำได้
    }

    // ลบไฟล์
    const removeFile = (index) => {
        onFilesChange(files.filter((_, i) => i !== index))
    }

    // ลบทั้งหมด
    const clearAll = () => onFilesChange([])

    return (
        <div>
            {/* Drop Zone */}
            <div
                style={S.zone(isDragging)}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
            >
                <div style={S.icon}>📄</div>
                <div style={S.title}>
                    {isDragging ? '📥 วางไฟล์ตรงนี้เลย!' : 'ลากไฟล์ PDF มาวาง หรือคลิกเลือก'}
                </div>
                <div style={S.subtitle}>
                    รองรับไฟล์ .pdf หลายไฟล์พร้อมกัน — ระบบจะอ่านข้อมูลจากใบกำกับภาษีอัตโนมัติ
                </div>
                <button style={S.browseBtn} onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}>
                    📂 เลือกไฟล์
                </button>
                <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleSelect}
                />
            </div>

            {/* รายการไฟล์ที่เลือก */}
            {files.length > 0 && (
                <div style={S.fileList}>
                    {files.map((file, i) => (
                        <div key={`${file.name}-${i}`} style={S.fileItem}>
                            <div style={S.fileIcon}>📄</div>
                            <div style={S.fileInfo}>
                                <div style={S.fileName}>{file.name}</div>
                                <div style={S.fileMeta}>{formatSize(file.size)}</div>
                            </div>
                            <button
                                style={S.removeBtn}
                                onClick={() => removeFile(i)}
                                title="ลบไฟล์"
                            >
                                ✕
                            </button>
                        </div>
                    ))}

                    {/* สรุป */}
                    <div style={S.summary}>
                        <span style={S.summaryText}>
                            📋 เลือกแล้ว {files.length} ไฟล์ ({formatSize(files.reduce((s, f) => s + f.size, 0))})
                        </span>
                        <button style={S.clearBtn} onClick={clearAll}>
                            🗑️ ลบทั้งหมด
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
