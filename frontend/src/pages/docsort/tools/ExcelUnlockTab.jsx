import { formatSize } from './constants'

export default function ExcelUnlockTab({ files, loading, excel }) {
    const { file: excelFile, setFile: setExcelFile, password, setPassword, outputDir, setOutputDir, unlocking, handleUnlock } = excel

    return (
        <div className="animate-in" style={{ maxWidth: 600 }}>
            {files.length > 0 || loading ? (
                <div className="card" style={{ marginBottom: 20 }}>
                    <div className="card-header"><h3>📊 เลือกไฟล์ Excel ที่จะปลดล็อค</h3></div>
                    <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                        {files.map(f => (
                            <div key={f.path}
                                className={`file-list-item ${excelFile?.path === f.path ? 'selected' : ''}`}
                                onClick={() => setExcelFile(f)}>
                                <div className="file-icon" style={{ background: '#ecfdf5', color: '#059669' }}>📊</div>
                                <div className="file-info">
                                    <div className="file-name">{f.name}</div>
                                    <div className="file-meta">{formatSize(f.size)}</div>
                                </div>
                            </div>
                        ))}
                        {files.length === 0 && !loading && <p style={{ padding: 20, textAlign: 'center', color: '#999' }}>ไม่พบไฟล์ .xlsx ในโฟลเดอร์นี้</p>}
                    </div>
                </div>
            ) : null}
            {excelFile && (
                <div className="card">
                    <div className="card-header"><h3>🔓 ปลดล็อค: {excelFile.name}</h3></div>
                    <div className="card-body">
                        <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fed7aa', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#92400e' }}>
                            ⚠️ รองรับเฉพาะไฟล์ <b>.xlsx</b> เท่านั้น — กรอกรหัสผ่านที่ถูกต้องเพียงครั้งเดียว ระบบจะบันทึกไฟล์ใหม่โดยไม่มีรหัสผ่าน
                        </div>
                        <div className="form-group">
                            <label>🔑 รหัสผ่านเอกสาร</label>
                            <input type="password" className="form-input" value={password}
                                onChange={e => setPassword(e.target.value)} placeholder="กรอกรหัสผ่าน Excel" />
                        </div>
                        <div className="form-group">
                            <label>โฟลเดอร์ผลลัพธ์</label>
                            <input className="form-input" value={outputDir}
                                onChange={e => setOutputDir(e.target.value)} style={{ fontSize: 13 }} />
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button className="btn-accent" style={{ flex: 1, justifyContent: 'center' }}
                                onClick={handleUnlock} disabled={unlocking || !password}>
                                {unlocking ? <><span className="loading-spinner"></span> กำลังปลดล็อค...</> : '🔓 ปลดล็อค Excel'}
                            </button>
                            <button className="btn-sm" onClick={() => { setExcelFile(null); setPassword('') }}>ยกเลิก</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
