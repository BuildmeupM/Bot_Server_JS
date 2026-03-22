import { formatSize } from './constants'
import FilePreviewPanel from '../../../components/tools/FilePreviewPanel'

export default function ImageToPdfTab({ files, loading, currentPath, imgPdf }) {
    const { files: imgPdfFiles, setFiles: setImgPdfFiles, outputDir, setOutputDir, outputName, setOutputName, pageSize, setPageSize, converting, result, setResult, dragOver, dropRef, previewFile, setPreviewFile, toggleFile, selectAll, moveFile, handleDrop, handleDragOver, handleDragLeave, handleConvert } = imgPdf

    return (
        <div className="animate-in" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0, maxWidth: previewFile ? '55%' : 800 }}>
                {/* Drag & Drop Zone */}
                <div ref={dropRef}
                    onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
                    style={{ border: `2px dashed ${dragOver ? 'var(--accent)' : '#d1d5db'}`, borderRadius: 12, padding: '32px 20px', textAlign: 'center', marginBottom: 20, background: dragOver ? 'var(--accent-light)' : '#fafafa', transition: 'all .2s ease', cursor: 'pointer' }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📸</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 4 }}>ลากรูปภาพมาวางที่นี่</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>รองรับ JPG, PNG, GIF, WebP, BMP, TIFF</div>
                </div>

                {files.length > 0 && (
                    <div className="card" style={{ marginBottom: 20 }}>
                        <div className="card-header">
                            <h3>🖼️ หรือเลือกรูปภาพจากโฟลเดอร์</h3>
                            {files.length > 0 && (
                                <button className="btn-sm" onClick={() => selectAll(files)} style={{ fontSize: 11 }}>
                                    {imgPdfFiles.filter(f => !f.fromDrop).length === files.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                                </button>
                            )}
                        </div>
                        <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                            {files.map(f => {
                                const isSelected = imgPdfFiles.find(s => s.path === f.path)
                                return (
                                    <div key={f.path}
                                        className={`file-list-item ${isSelected ? 'selected' : ''}`}
                                        onClick={() => { toggleFile(f); setPreviewFile({ name: f.name, fullPath: f.path }) }}>
                                        <div className="file-icon" style={{ background: '#fef3c7', color: '#d97706' }}>🖼️</div>
                                        <div className="file-info">
                                            <div className="file-name">{f.name}</div>
                                            <div className="file-meta">{formatSize(f.size)}</div>
                                        </div>
                                        <button className="btn-sm btn-ghost" title="พรีวิว" onClick={e => { e.stopPropagation(); setPreviewFile({ name: f.name, fullPath: f.path }) }} style={{ fontSize: 12, padding: '2px 6px', flexShrink: 0 }}>🔍</button>
                                        <div style={{ width: 22, height: 22, borderRadius: 6, border: isSelected ? '2px solid var(--accent)' : '2px solid #ddd', background: isSelected ? 'var(--accent)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                                            {isSelected ? '✓' : ''}
                                        </div>
                                    </div>
                                )
                            })}
                            {files.length === 0 && !loading && <p style={{ padding: 20, textAlign: 'center', color: '#999' }}>ไม่พบไฟล์รูปภาพในโฟลเดอร์นี้</p>}
                        </div>
                    </div>
                )}
                {imgPdfFiles.length > 0 && (
                    <div className="card">
                        <div className="card-header">
                            <h3>📋 ลำดับรูปภาพ ({imgPdfFiles.length} ไฟล์)</h3>
                            <button className="btn-sm" onClick={() => { setImgPdfFiles([]); setResult(null); setPreviewFile(null) }} style={{ fontSize: 11, color: '#ef4444' }}>🗑️ ล้างทั้งหมด</button>
                        </div>
                        <div style={{ padding: '12px 16px', maxHeight: 250, overflowY: 'auto' }}>
                            {imgPdfFiles.map((f, idx) => (
                                <div key={f.path + idx} onClick={() => { const previewObj = { name: f.name, fullPath: f.path }; if (f.fromDrop && f.fileObj && !f.path) previewObj.objectUrl = URL.createObjectURL(f.fileObj); setPreviewFile(previewObj) }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: previewFile?.fullPath === f.path ? '#fff7ed' : idx % 2 === 0 ? '#f9fafb' : '#fff', borderRadius: 6, marginBottom: 4, border: previewFile?.fullPath === f.path ? '1px solid var(--accent)' : '1px solid transparent', transition: 'all .15s ease', cursor: 'pointer' }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', minWidth: 24 }}>{idx + 1}.</span>
                                    <span style={{ fontSize: 14, marginRight: 4 }}>🖼️</span>
                                    <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>{formatSize(f.size)}</span>
                                    {f.fromDrop && <span style={{ fontSize: 9, background: '#dbeafe', color: '#2563eb', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>ลาก</span>}
                                    <button className="btn-sm btn-ghost" title="พรีวิว" onClick={() => { const previewObj = { name: f.name, fullPath: f.path }; if (f.fromDrop && f.fileObj && !f.path) previewObj.objectUrl = URL.createObjectURL(f.fileObj); setPreviewFile(previewObj) }} style={{ fontSize: 12, padding: '2px 6px', flexShrink: 0, background: previewFile?.fullPath === f.path && previewFile?.name === f.name ? 'var(--accent)' : undefined, color: previewFile?.fullPath === f.path && previewFile?.name === f.name ? '#fff' : undefined, borderRadius: 4 }}>🔍</button>
                                    <button className="btn-sm btn-ghost" onClick={() => moveFile(idx, -1)} disabled={idx === 0} style={{ fontSize: 10, padding: '2px 6px' }}>▲</button>
                                    <button className="btn-sm btn-ghost" onClick={() => moveFile(idx, 1)} disabled={idx === imgPdfFiles.length - 1} style={{ fontSize: 10, padding: '2px 6px' }}>▼</button>
                                    <button className="btn-sm btn-ghost" onClick={() => { setImgPdfFiles(prev => prev.filter((_, i) => i !== idx)); if (previewFile?.fullPath === f.path) setPreviewFile(null) }} style={{ fontSize: 10, padding: '2px 6px', color: '#ef4444' }}>✕</button>
                                </div>
                            ))}
                        </div>
                        <div className="card-body">
                            <div className="form-group">
                                <label>ขนาดหน้า PDF</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    {['A4', 'Letter', 'Original'].map(sz => (
                                        <div key={sz}
                                            className={`radio-option ${pageSize === sz ? 'active' : ''}`}
                                            onClick={() => setPageSize(sz)} style={{ flex: 1 }}>
                                            <div className="radio-dot"></div>
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{sz}</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>
                                                    {sz === 'A4' ? '210 × 297 mm' : sz === 'Letter' ? '8.5 × 11 in' : 'ขนาดรูปจริง'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="form-group">
                                <label>ชื่อไฟล์ PDF</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <input className="form-input" value={outputName} onChange={e => setOutputName(e.target.value)} style={{ fontSize: 13 }} />
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>.pdf</span>
                                </div>
                            </div>
                            <div className="form-group">
                                <label>โฟลเดอร์ผลลัพธ์</label>
                                <input className="form-input" value={outputDir || currentPath}
                                    onChange={e => setOutputDir(e.target.value)} style={{ fontSize: 13 }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--accent-light)', borderRadius: 10, marginBottom: 18 }}>
                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>รูปภาพที่เลือก</span>
                                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{imgPdfFiles.length} ไฟล์</span>
                            </div>
                            <button className="btn-accent" style={{ width: '100%', justifyContent: 'center' }}
                                onClick={handleConvert} disabled={converting || imgPdfFiles.length === 0}>
                                {converting ? <><span className="loading-spinner"></span> กำลังสร้าง PDF...</> : `📸 สร้าง PDF จาก ${imgPdfFiles.length} รูป`}
                            </button>
                            {result && (
                                <div style={{ marginTop: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 14 }}>
                                    <div style={{ fontWeight: 600, marginBottom: 4, color: '#16a34a', fontSize: 13 }}>✅ {result.message}</div>
                                    <div style={{ fontSize: 11, color: '#374151' }}>📄 {result.outputName} · {result.pageCount} หน้า</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            {previewFile && (
                <div style={{ width: '45%', flexShrink: 0 }}>
                    <FilePreviewPanel file={previewFile} onClose={() => setPreviewFile(null)} />
                </div>
            )}
        </div>
    )
}
