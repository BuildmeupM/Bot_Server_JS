import { formatSize, IMAGE_EXTENSIONS } from './constants'

export default function MergeTab({ files, loading, currentPath, setPathInput, loadFiles, merge }) {
    const { selectedFiles, setSelectedFiles, outputDir, setOutputDir, outputName, setOutputName, merging, toggleFile, selectAll, moveFile, handleMerge } = merge
    const nonDirFiles = files.filter(f => !f.isDirectory)

    return (
        <div className="animate-in" style={{ maxWidth: 700 }}>
            {files.length > 0 || loading ? (
                <div className="card" style={{ marginBottom: 20 }}>
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <h3 style={{ margin: 0 }}>📑 เลือกไฟล์ PDF และรูปภาพที่จะรวม</h3>
                            {nonDirFiles.length > 0 && (
                                <button className="btn-sm" onClick={() => selectAll(nonDirFiles)} style={{ fontSize: 11 }}>
                                    {selectedFiles.length === nonDirFiles.length && nonDirFiles.length > 0 ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                                </button>
                            )}
                        </div>
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
                        {files.map(f => {
                            const isSelected = selectedFiles.find(s => s.path === f.path)
                            const isImage = !f.isDirectory && IMAGE_EXTENSIONS.includes(f.name.toLowerCase().slice(f.name.lastIndexOf('.')))
                            return (
                                <div key={f.path}
                                    className={`file-list-item ${isSelected ? 'selected' : ''}`}
                                    onClick={() => {
                                        if (f.isDirectory) { setPathInput(f.path); loadFiles(f.path); }
                                        else toggleFile(f);
                                    }}>
                                    <div className="file-icon" style={{ background: f.isDirectory ? '#fffbeb' : isImage ? '#f0fdf4' : '#f1f5f9', color: f.isDirectory ? '#f59e0b' : isImage ? '#16a34a' : '#64748b' }}>
                                        {f.isDirectory ? '📁' : isImage ? '🖼️' : '📄'}
                                    </div>
                                    <div className="file-info">
                                        <div className="file-name">{f.name}</div>
                                        <div className="file-meta">{f.isDirectory ? 'โฟลเดอร์' : formatSize(f.size)}</div>
                                    </div>
                                    {!f.isDirectory && (
                                        <div style={{ marginLeft: 'auto', width: 22, height: 22, borderRadius: 6, border: isSelected ? '2px solid var(--accent)' : '2px solid #ddd', background: isSelected ? 'var(--accent)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                                            {isSelected ? '✓' : ''}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                        {files.length === 0 && !loading && <p style={{ padding: 20, textAlign: 'center', color: '#999' }}>ไม่พบไฟล์หรือโฟลเดอร์</p>}
                    </div>
                </div>
            ) : null}
            {selectedFiles.length > 0 && (
                <div className="card">
                    <div className="card-header"><h3>📋 ลำดับการรวมไฟล์ ({selectedFiles.length} ไฟล์)</h3></div>
                    <div style={{ padding: '12px 16px' }}>
                        {selectedFiles.map((f, idx) => (
                            <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: idx % 2 === 0 ? '#f9fafb' : '#fff', borderRadius: 6, marginBottom: 4 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', minWidth: 24 }}>{idx + 1}.</span>
                                <span style={{ fontSize: 12, flex: 1 }}>{f.name}</span>
                                <button className="btn-sm btn-ghost" onClick={() => moveFile(idx, -1)} disabled={idx === 0} style={{ fontSize: 10, padding: '2px 6px' }}>▲</button>
                                <button className="btn-sm btn-ghost" onClick={() => moveFile(idx, 1)} disabled={idx === selectedFiles.length - 1} style={{ fontSize: 10, padding: '2px 6px' }}>▼</button>
                                <button className="btn-sm btn-ghost" onClick={() => setSelectedFiles(prev => prev.filter(x => x.path !== f.path))} style={{ fontSize: 10, padding: '2px 6px', color: '#ef4444' }}>✕</button>
                            </div>
                        ))}
                    </div>
                    <div className="card-body">
                        <div className="form-group">
                            <label>ชื่อไฟล์ผลลัพธ์</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input className="form-input" value={outputName} onChange={e => setOutputName(e.target.value)} style={{ fontSize: 13 }} />
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>.pdf</span>
                            </div>
                        </div>
                        <div className="form-group">
                            <label>โฟลเดอร์ผลลัพธ์</label>
                            <input className="form-input" value={outputDir} onChange={e => setOutputDir(e.target.value)} style={{ fontSize: 13 }} />
                        </div>
                        <button className="btn-accent" style={{ width: '100%', justifyContent: 'center' }}
                            onClick={handleMerge} disabled={merging || selectedFiles.length < 2}>
                            {merging ? <><span className="loading-spinner"></span> กำลังรวม...</> : `📑 รวม ${selectedFiles.length} ไฟล์ทันที`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
