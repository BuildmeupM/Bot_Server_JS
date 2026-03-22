import { formatSize } from './constants'
import FilePreviewPanel from '../../../components/tools/FilePreviewPanel'

export default function RarTab({ files, loading, rar }) {
    const { file: rarFile, setFile: setRarFile, outputDir, setOutputDir, extracting, result, setResult, previewFile, setPreviewFile, handleExtract } = rar

    return (
        <div className="animate-in" style={{ display: 'grid', gridTemplateColumns: previewFile ? '1fr 1fr' : '1fr', gap: 20, alignItems: 'start' }}>
            <div style={{ maxWidth: previewFile ? 'none' : 600 }}>
                {files.length > 0 || loading ? (
                    <div className="card" style={{ marginBottom: 20 }}>
                        <div className="card-header"><h3>📦 เลือกไฟล์ RAR / ZIP ที่จะแตก</h3></div>
                        <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                            {files.map(f => {
                                const ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'))
                                const icon = ext === '.zip' ? '🗜️' : '📦'
                                return (
                                    <div key={f.path}
                                        className={`file-list-item ${rarFile?.path === f.path ? 'selected' : ''}`}
                                        onClick={() => { setRarFile(f); setResult(null); setPreviewFile(null) }}>
                                        <div className="file-icon" style={{ background: '#fef3c7', color: '#d97706' }}>{icon}</div>
                                        <div className="file-info">
                                            <div className="file-name">{f.name}</div>
                                            <div className="file-meta">{formatSize(f.size)}</div>
                                        </div>
                                    </div>
                                )
                            })}
                            {files.length === 0 && !loading && <p style={{ padding: 20, textAlign: 'center', color: '#999' }}>ไม่พบไฟล์ RAR / ZIP ในโฟลเดอร์นี้</p>}
                        </div>
                    </div>
                ) : null}
                {rarFile && (
                    <div className="card">
                        <div className="card-header"><h3>📦 แตกไฟล์: {rarFile.name}</h3></div>
                        <div className="card-body">
                            <div className="form-group">
                                <label>โฟลเดอร์ผลลัพธ์</label>
                                <input className="form-input" value={outputDir}
                                    onChange={e => setOutputDir(e.target.value)} style={{ fontSize: 13 }} />
                            </div>
                            <button className="btn-accent" style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }}
                                onClick={handleExtract} disabled={extracting}>
                                {extracting ? <><span className="loading-spinner"></span> กำลังแตกไฟล์...</> : '📦 แตกไฟล์ทันที'}
                            </button>
                            {result && (
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 14 }}>
                                    <div style={{ fontWeight: 600, marginBottom: 8, color: '#16a34a', fontSize: 13 }}>✅ {result.message}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>📂 {result.outputDir}</div>
                                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 8 }}>👆 คลิกที่ไฟล์เพื่อพรีวิวด้านขวา</div>
                                    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                        {result.files?.map((f, i) => {
                                            const ext = f.split('.').pop().toLowerCase()
                                            const isPreviewable = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'pdf'].includes(ext)
                                            const icon = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext) ? '🖼️' : ext === 'pdf' ? '📄' : '📎'
                                            const fileName = f.split(/[\\/]/).pop()
                                            const isActive = previewFile?.name === fileName
                                            return (
                                                <div key={i}
                                                    onClick={() => isPreviewable && setPreviewFile({ name: fileName, fullPath: (result.outputDir + '\\' + f).replace(/\//g, '\\') })}
                                                    style={{
                                                        padding: '6px 10px', fontSize: 12, color: '#374151', borderRadius: 6,
                                                        cursor: isPreviewable ? 'pointer' : 'default',
                                                        transition: 'all .15s',
                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                        background: isActive ? '#dcfce7' : 'transparent',
                                                        borderLeft: isActive ? '3px solid #16a34a' : '3px solid transparent'
                                                    }}
                                                    onMouseEnter={e => isPreviewable && !isActive && (e.currentTarget.style.background = '#f0fdf4')}
                                                    onMouseLeave={e => !isActive && (e.currentTarget.style.background = 'transparent')}>
                                                    <span>{icon}</span>
                                                    <span style={{ flex: 1, fontWeight: isActive ? 600 : 400 }}>{f}</span>
                                                    {isPreviewable && <span style={{ fontSize: 10, color: '#16a34a' }}>🔍</span>}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                            <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
                                <button className="btn-sm" onClick={() => { setRarFile(null); setResult(null); setPreviewFile(null) }}>ยกเลิก</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {previewFile && (
                <FilePreviewPanel file={previewFile} onClose={() => setPreviewFile(null)} />
            )}
        </div>
    )
}
