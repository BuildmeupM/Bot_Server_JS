import { formatSize } from './constants'
import FilePreviewPanel from '../../../components/tools/FilePreviewPanel'

export default function PdfToImageTab({ files, loading, currentPath, setPathInput, loadFiles, pdfImg }) {
    const { file: pdfImgFile, setFile: setPdfImgFile, outputDir, setOutputDir, format, setFormat, quality, setQuality, dpi, setDpi, converting, result, setResult, outputName, setOutputName, previewFile, setPreviewFile, handleConvert } = pdfImg

    return (
        <div className="animate-in" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0, maxWidth: previewFile ? '55%' : 700 }}>
                {files.length > 0 || loading ? (
                    <div className="card" style={{ marginBottom: 20 }}>
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>📄 เลือกไฟล์ PDF ที่จะแปลงเป็นรูป</h3>
                            <button className="btn-sm btn-ghost" title="กลับโฟลเดอร์ก่อนหน้า"
                                onClick={() => {
                                    const parentPath = currentPath.substring(0, Math.max(currentPath.lastIndexOf('\\'), currentPath.lastIndexOf('/')));
                                    if (parentPath) { setPathInput(parentPath); loadFiles(parentPath); }
                                }}
                                style={{ fontSize: 12, padding: '4px 8px' }}>
                                ⬅️ กลับขึ้นไป
                            </button>
                        </div>
                        <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                            {files.map(f => (
                                <div key={f.path}
                                    className={`file-list-item ${pdfImgFile?.path === f.path ? 'selected' : ''}`}
                                    onClick={() => {
                                        if (f.isDirectory) { setPathInput(f.path); loadFiles(f.path); }
                                        else { setPdfImgFile(f); setResult(null); setPreviewFile({ name: f.name, fullPath: f.path }); setOutputName(f.name.replace(/\.pdf$/i, '')); }
                                    }}>
                                    <div className="file-icon" style={{ background: f.isDirectory ? '#fffbeb' : '#f1f5f9', color: f.isDirectory ? '#f59e0b' : '#64748b' }}>
                                        {f.isDirectory ? '📁' : '📄'}
                                    </div>
                                    <div className="file-info">
                                        <div className="file-name">{f.name}</div>
                                        <div className="file-meta">{f.isDirectory ? 'โฟลเดอร์' : formatSize(f.size)}</div>
                                    </div>
                                    {!f.isDirectory && (
                                        <button className="btn-sm btn-ghost" title="พรีวิว" onClick={e => { e.stopPropagation(); setPreviewFile({ name: f.name, fullPath: f.path }) }} style={{ fontSize: 12, padding: '2px 6px', flexShrink: 0, background: previewFile?.fullPath === f.path ? 'var(--accent)' : undefined, color: previewFile?.fullPath === f.path ? '#fff' : undefined, borderRadius: 4 }}>🔍</button>
                                    )}
                                </div>
                            ))}
                            {files.length === 0 && !loading && <p style={{ padding: 20, textAlign: 'center', color: '#999' }}>ไม่พบไฟล์ PDF หรือโฟลเดอร์</p>}
                        </div>
                    </div>
                ) : null}
                {pdfImgFile && (
                    <div className="card">
                        <div className="card-header"><h3>🖼️ แปลง: {pdfImgFile.name}</h3></div>
                        <div className="card-body">
                            <div className="form-group">
                                <label>รูปแบบผลลัพธ์</label>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <div className={`radio-option ${format === 'jpg' ? 'active' : ''}`}
                                        onClick={() => setFormat('jpg')} style={{ flex: 1 }}>
                                        <div className="radio-dot"></div> JPG
                                    </div>
                                    <div className={`radio-option ${format === 'png' ? 'active' : ''}`}
                                        onClick={() => setFormat('png')} style={{ flex: 1 }}>
                                        <div className="radio-dot"></div> PNG
                                    </div>
                                </div>
                            </div>
                            <div className="form-group">
                                <label>คุณภาพ: {quality}%</label>
                                <input type="range" min="10" max="100" step="5" value={quality}
                                    onChange={e => setQuality(Number(e.target.value))}
                                    style={{ width: '100%', accentColor: 'var(--accent)' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)' }}>
                                    <span>ไฟล์เล็ก</span><span>คุณภาพสูง</span>
                                </div>
                            </div>
                            <div className="form-group">
                                <label>ความละเอียด (DPI): {dpi}</label>
                                <input type="range" min="72" max="300" step="1" value={dpi}
                                    onChange={e => setDpi(Number(e.target.value))}
                                    style={{ width: '100%', accentColor: 'var(--accent)' }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)' }}>
                                    <span>72 (เร็ว)</span><span>150 (ปกติ)</span><span>300 (คมชัด)</span>
                                </div>
                            </div>
                            <div style={{ background: 'linear-gradient(135deg, #fff7ed, #fef3c7)', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#ea580c', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    💡 คำแนะนำการตั้งค่า
                                </div>
                                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid #fed7aa' }}>
                                            <th style={{ textAlign: 'left', padding: '4px 6px', color: '#9a3412', fontWeight: 600 }}>การใช้งาน</th>
                                            <th style={{ textAlign: 'center', padding: '4px 6px', color: '#9a3412', fontWeight: 600 }}>คุณภาพ</th>
                                            <th style={{ textAlign: 'center', padding: '4px 6px', color: '#9a3412', fontWeight: 600 }}>DPI</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td style={{ padding: '3px 6px', color: '#78350f' }}>📱 ดูบนจอ / ส่งไลน์</td>
                                            <td style={{ padding: '3px 6px', textAlign: 'center', color: '#78350f' }}>85-90%</td>
                                            <td style={{ padding: '3px 6px', textAlign: 'center', color: '#78350f' }}>150</td>
                                        </tr>
                                        <tr style={{ background: 'rgba(255,255,255,0.5)' }}>
                                            <td style={{ padding: '3px 6px', color: '#78350f' }}>📄 เอกสารทั่วไป</td>
                                            <td style={{ padding: '3px 6px', textAlign: 'center', color: '#78350f' }}>90%</td>
                                            <td style={{ padding: '3px 6px', textAlign: 'center', color: '#78350f' }}>150-200</td>
                                        </tr>
                                        <tr>
                                            <td style={{ padding: '3px 6px', color: '#78350f' }}>🖨️ งานพิมพ์ / OCR</td>
                                            <td style={{ padding: '3px 6px', textAlign: 'center', color: '#78350f' }}>95-100%</td>
                                            <td style={{ padding: '3px 6px', textAlign: 'center', color: '#78350f' }}>300</td>
                                        </tr>
                                        <tr style={{ background: 'rgba(255,255,255,0.5)' }}>
                                            <td style={{ padding: '3px 6px', color: '#78350f' }}>💎 เก็บถาวรคุณภาพสูง</td>
                                            <td style={{ padding: '3px 6px', textAlign: 'center', color: '#78350f' }}>100%</td>
                                            <td style={{ padding: '3px 6px', textAlign: 'center', color: '#78350f' }}>300</td>
                                        </tr>
                                    </tbody>
                                </table>
                                <div style={{ fontSize: 10, color: '#b45309', marginTop: 6, fontStyle: 'italic' }}>
                                    ⚠️ DPI สูง = ภาพคมชัดขึ้น แต่ไฟล์ใหญ่ขึ้นและใช้เวลาแปลงนานขึ้น
                                </div>
                            </div>
                            <div className="form-group">
                                <label>ชื่อไฟล์ผลลัพธ์</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <input className="form-input" value={outputName}
                                        onChange={e => setOutputName(e.target.value)}
                                        placeholder={pdfImgFile ? pdfImgFile.name.replace(/\.pdf$/i, '') : 'ชื่อไฟล์'}
                                        style={{ fontSize: 13 }} />
                                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>_page1.{format}</span>
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                                    ตัวอย่าง: {outputName || 'filename'}_page1.{format}, {outputName || 'filename'}_page2.{format}, ...
                                </div>
                            </div>
                            <div className="form-group">
                                <label>โฟลเดอร์ผลลัพธ์</label>
                                <input className="form-input" value={outputDir}
                                    onChange={e => setOutputDir(e.target.value)} style={{ fontSize: 13 }} />
                            </div>
                            <button className="btn-accent" style={{ width: '100%', justifyContent: 'center' }}
                                onClick={handleConvert} disabled={converting}>
                                {converting ? <><span className="loading-spinner"></span> กำลังแปลง...</> : `🖼️ แปลงเป็น ${format.toUpperCase()} ทันที`}
                            </button>
                            {result && (
                                <div style={{ marginTop: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 14 }}>
                                    <div style={{ fontWeight: 600, marginBottom: 8, color: '#16a34a', fontSize: 13 }}>✅ {result.message}</div>
                                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                        {result.outputFiles?.map((f, i) => (
                                            <div key={i} style={{ padding: '4px 8px', fontSize: 12, color: '#374151' }}>
                                                🖼️ {f.name}
                                            </div>
                                        ))}
                                    </div>
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
