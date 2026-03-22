import { formatSize } from './constants'

export default function UnlockTab({ files, loading, unlock }) {
    const { unlockFile, setUnlockFile, password, setPassword, outputDir, setOutputDir, unlocking, handleUnlock } = unlock

    return (
        <div className="animate-in" style={{ maxWidth: 600 }}>
            {files.length > 0 || loading ? (
                <div className="card" style={{ marginBottom: 20 }}>
                    <div className="card-header"><h3>🔒 เลือกไฟล์ PDF ที่จะปลดล็อค</h3></div>
                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {files.map(f => (
                            <div key={f.path}
                                className={`file-list-item ${unlockFile?.path === f.path ? 'selected' : ''}`}
                                onClick={() => setUnlockFile(f)}>
                                <div className="file-icon" style={{ background: '#fef9c3', color: '#ca8a04' }}>🔒</div>
                                <div className="file-info">
                                    <div className="file-name">{f.name}</div>
                                    <div className="file-meta">{formatSize(f.size)}</div>
                                </div>
                            </div>
                        ))}
                        {files.length === 0 && !loading && <p style={{ padding: 20, textAlign: 'center', color: '#999' }}>ไม่พบไฟล์ PDF</p>}
                    </div>
                </div>
            ) : null}
            {unlockFile && (
                <div className="card">
                    <div className="card-header"><h3>🔓 ปลดล็อค: {unlockFile.name}</h3></div>
                    <div className="card-body">
                        <div className="form-group">
                            <label>🔑 รหัสผ่านเอกสาร</label>
                            <input type="password" className="form-input" value={password}
                                onChange={e => setPassword(e.target.value)} placeholder="กรอกรหัสผ่าน PDF" />
                        </div>
                        <div className="form-group">
                            <label>โฟลเดอร์ผลลัพธ์</label>
                            <input className="form-input" value={outputDir}
                                onChange={e => setOutputDir(e.target.value)} style={{ fontSize: 13 }} />
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button className="btn-accent" style={{ flex: 1, justifyContent: 'center' }}
                                onClick={handleUnlock} disabled={unlocking || !password}>
                                {unlocking ? <><span className="loading-spinner"></span> กำลังปลดล็อค...</> : '🔓 ปลดล็อคไฟล์'}
                            </button>
                            <button className="btn-sm" onClick={() => { setUnlockFile(null); setPassword('') }}>ยกเลิก</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
