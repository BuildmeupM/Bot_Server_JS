import { formatSize } from './constants'

export default function ZipTab({ files, loading, zip }) {
    const { selectedFiles, outputDir, setOutputDir, outputName, setOutputName, zipping, toggleFile, selectAll, handleCreateZip } = zip

    return (
        <div className="animate-in" style={{ maxWidth: 700 }}>
            {files.length > 0 || loading ? (
                <div className="card" style={{ marginBottom: 20 }}>
                    <div className="card-header">
                        <h3>🗜️ เลือกไฟล์ที่จะรวมเป็น ZIP</h3>
                        {files.length > 0 && (
                            <button className="btn-sm" onClick={() => selectAll(files)} style={{ fontSize: 11 }}>
                                {selectedFiles.length === files.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                            </button>
                        )}
                    </div>
                    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                        {files.map(f => {
                            const isSelected = selectedFiles.find(s => s.path === f.path)
                            const ext = f.name.split('.').pop().toLowerCase()
                            const icon = ext === 'pdf' ? '📄' : ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? '🖼️' : ext === 'xlsx' ? '📊' : '📎'
                            return (
                                <div key={f.path}
                                    className={`file-list-item ${isSelected ? 'selected' : ''}`}
                                    onClick={() => toggleFile(f)}>
                                    <div className="file-icon">{icon}</div>
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
                        {files.length === 0 && !loading && <p style={{ padding: 20, textAlign: 'center', color: '#999' }}>ไม่พบไฟล์ในโฟลเดอร์นี้</p>}
                    </div>
                </div>
            ) : null}
            {selectedFiles.length > 0 && (
                <div className="card">
                    <div className="card-header"><h3>🗜️ สร้างไฟล์ ZIP ({selectedFiles.length} ไฟล์)</h3></div>
                    <div className="card-body">
                        <div className="form-group">
                            <label>ชื่อไฟล์ ZIP</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input className="form-input" value={outputName} onChange={e => setOutputName(e.target.value)} style={{ fontSize: 13 }} />
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>.zip</span>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>โฟลเดอร์ผลลัพธ์</label>
                            <input className="form-input" value={outputDir} onChange={e => setOutputDir(e.target.value)} style={{ fontSize: 13 }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--accent-light)', borderRadius: 10, marginBottom: 18 }}>
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>ไฟล์ที่เลือก</span>
                            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{selectedFiles.length} ไฟล์</span>
                        </div>
                        <button className="btn-accent" style={{ width: '100%', justifyContent: 'center' }}
                            onClick={handleCreateZip} disabled={zipping}>
                            {zipping ? <><span className="loading-spinner"></span> กำลังสร้าง ZIP...</> : `🗜️ สร้างไฟล์ ZIP ทันที`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
