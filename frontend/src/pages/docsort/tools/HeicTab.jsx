import { formatSize } from './constants'

export default function HeicTab({ files, loading, heic }) {
    const { selectedFiles, outputDir, setOutputDir, format, setFormat, quality, setQuality, converting, toggleFile, selectAll, handleConvert } = heic

    return (
        <div className="animate-in" style={{ maxWidth: 700 }}>
            {files.length > 0 || loading ? (
                <div className="card" style={{ marginBottom: 20 }}>
                    <div className="card-header">
                        <h3>🖼️ เลือกไฟล์ HEIC ที่จะแปลง</h3>
                        {files.length > 0 && (
                            <button className="btn-sm" onClick={() => selectAll(files)} style={{ fontSize: 11 }}>
                                {selectedFiles.length === files.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                            </button>
                        )}
                    </div>
                    <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                        {files.map(f => {
                            const isSelected = selectedFiles.find(s => s.path === f.path)
                            return (
                                <div key={f.path}
                                    className={`file-list-item ${isSelected ? 'selected' : ''}`}
                                    onClick={() => toggleFile(f)}>
                                    <div className="file-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>🖼️</div>
                                    <div className="file-info">
                                        <div className="file-name">{f.name}</div>
                                        <div className="file-meta">{formatSize(f.size)}</div>
                                    </div>
                                    <div style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: 6, border: isSelected ? '2px solid var(--accent)' : '2px solid #ddd', background: isSelected ? 'var(--accent)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                                        {isSelected ? '✓' : ''}
                                    </div>
                                </div>
                            )
                        })}
                        {files.length === 0 && !loading && <p style={{ padding: 20, textAlign: 'center', color: '#999' }}>ไม่พบไฟล์ HEIC / HEIF ในโฟลเดอร์นี้</p>}
                    </div>
                </div>
            ) : null}
            {selectedFiles.length > 0 && (
                <div className="card">
                    <div className="card-header"><h3>⚙️ ตั้งค่าการแปลง</h3></div>
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
                            <label>โฟลเดอร์ผลลัพธ์</label>
                            <input className="form-input" value={outputDir}
                                onChange={e => setOutputDir(e.target.value)} style={{ fontSize: 13 }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--accent-light)', borderRadius: 10, marginBottom: 18 }}>
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>ไฟล์ที่เลือก</span>
                            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{selectedFiles.length} ไฟล์</span>
                        </div>
                        <button className="btn-accent" style={{ width: '100%', justifyContent: 'center' }}
                            onClick={handleConvert} disabled={converting}>
                            {converting ? <><span className="loading-spinner"></span> กำลังแปลง...</> : `🖼️ แปลงเป็น ${format.toUpperCase()} ทันที`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
