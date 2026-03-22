import { CHUNK_COLORS, formatSize } from './constants'
import PdfPageThumb from '../../../components/tools/PdfPageThumb'

export default function SplitTab({ files, loading, currentPath, split }) {
    const {
        splitFile, splitInfo, selectedPages, splitMode, setSplitMode,
        pageRange, setPageRange, splitPattern, setSplitPattern,
        outputDir, setOutputDir, splitting, createSubfolder, setCreateSubfolder,
        pageChunkMap, activeChunkIdx, setActiveChunkIdx, chunkCount,
        pdfDoc, thumbsPerPage, setThumbsPerPage, thumbPage, setThumbPage,
        handleSelectSplitFile, togglePage, selectAllPages,
        togglePageChunk, addChunkSlot, removeChunkSlot,
        buildChunksFromMap, getChunkPageCount, getOutputCount,
        handleSplit, isSplitDisabled, setPreviewPage,
    } = split

    return (
        <div className="animate-in">
            {currentPath && (
                <div className="card" style={{ marginBottom: 20 }}>
                    <div className="card-header"><h3>📄 เลือกไฟล์ PDF ที่จะแยก</h3></div>
                    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {files.map(f => (
                            <div key={f.path}
                                className={`file-list-item ${splitFile?.path === f.path ? 'selected' : ''}`}
                                onClick={() => handleSelectSplitFile(f)}>
                                <div className="file-icon">📄</div>
                                <div className="file-info">
                                    <div className="file-name">{f.name}</div>
                                    <div className="file-meta">{formatSize(f.size)}</div>
                                </div>
                            </div>
                        ))}
                        {files.length === 0 && !loading && <p style={{ padding: 20, textAlign: 'center', color: '#999' }}>ไม่พบไฟล์ PDF</p>}
                    </div>
                </div>
            )}

            {splitFile && splitInfo && (
                <>
                    <div className="card" style={{ marginBottom: 20 }}>
                        <div className="card-header">
                            <h3>🖼️ พรีวิว: {splitFile.name}</h3>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                {splitInfo.pageCount} หน้า · {formatSize(splitInfo.size)}
                            </span>
                        </div>
                        {splitMode === 'selected' && (
                            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                    เลือกแล้ว {selectedPages.length} / {splitInfo.pageCount} หน้า
                                </span>
                                <button className="btn-sm" onClick={selectAllPages} style={{ fontSize: 11 }}>
                                    {selectedPages.length === splitInfo.pageCount ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                                </button>
                            </div>
                        )}
                        {splitMode === 'chunks' && (
                            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginRight: 4 }}>คลิกหน้าเพื่อจัดเข้า:</span>
                                    {Array.from({ length: chunkCount }, (_, ci) => (
                                        <button key={ci}
                                            className={`chunk-tab ${activeChunkIdx === ci ? 'active' : ''}`}
                                            style={{ '--chunk-color': CHUNK_COLORS[ci % CHUNK_COLORS.length] }}
                                            onClick={() => setActiveChunkIdx(ci)}>
                                            ชุด {ci + 1} ({getChunkPageCount(ci)})
                                        </button>
                                    ))}
                                    <button className="chunk-tab" onClick={addChunkSlot}
                                        style={{ '--chunk-color': '#6b7280', fontWeight: 700, fontSize: 13 }} title="เพิ่มชุด">＋ เพิ่มชุด</button>
                                    {chunkCount > 2 && <button className="chunk-tab" onClick={removeChunkSlot}
                                        style={{ '--chunk-color': '#ef4444', fontSize: 12 }} title="ลบชุดท้าย">✕ ลบชุดท้าย</button>}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>คลิกที่รูปหน้า PDF ด้านล่างเพื่อจัดเข้าชุดที่เลือก · คลิกซ้ำเพื่อยกเลิก</div>
                            </div>
                        )}
                        {pdfDoc && splitInfo && (() => {
                            const allPages = Array.from({ length: splitInfo.pageCount }, (_, i) => i + 1)
                            const useAll = thumbsPerPage === 0
                            const totalThumbPages = useAll ? 1 : Math.ceil(allPages.length / thumbsPerPage)
                            const safePage = Math.min(thumbPage, totalThumbPages - 1)
                            const visiblePages = useAll ? allPages : allPages.slice(safePage * thumbsPerPage, (safePage + 1) * thumbsPerPage)
                            const gridCols = useAll ? 'repeat(auto-fill, minmax(140px, 1fr))' : visiblePages.length <= 5 ? `repeat(${Math.min(visiblePages.length, 5)}, 1fr)` : 'repeat(auto-fill, minmax(140px, 1fr))'
                            return (
                                <>
                                    <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>แสดง:</span>
                                            {[5, 10, 20, 50, 0].map(n => (
                                                <button key={n}
                                                    className={`btn-sm ${thumbsPerPage === n ? '' : 'btn-ghost'}`}
                                                    style={{
                                                        fontSize: 11, padding: '3px 10px', minWidth: 36, fontWeight: thumbsPerPage === n ? 700 : 400,
                                                        background: thumbsPerPage === n ? 'var(--accent)' : undefined,
                                                        color: thumbsPerPage === n ? '#fff' : undefined,
                                                        borderColor: thumbsPerPage === n ? 'var(--accent)' : undefined
                                                    }}
                                                    onClick={() => { setThumbsPerPage(n); setThumbPage(0) }}>
                                                    {n === 0 ? 'ทั้งหมด' : n}
                                                </button>
                                            ))}
                                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>หน้า/รอบ</span>
                                        </div>
                                        {!useAll && totalThumbPages > 1 && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <button className="btn-sm" disabled={safePage <= 0} onClick={() => setThumbPage(p => p - 1)} style={{ fontSize: 11, padding: '3px 8px' }}>◀ ก่อนหน้า</button>
                                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                                    {safePage + 1} / {totalThumbPages}
                                                </span>
                                                <button className="btn-sm" disabled={safePage >= totalThumbPages - 1} onClick={() => setThumbPage(p => p + 1)} style={{ fontSize: 11, padding: '3px 8px' }}>ถัดไป ▶</button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="pdf-thumbs-grid" style={{ gridTemplateColumns: gridCols }}>
                                        {visiblePages.map(num => (
                                            <PdfPageThumb
                                                key={num}
                                                pdfDoc={pdfDoc}
                                                pageNum={num}
                                                isSelected={splitMode === 'selected' ? selectedPages.includes(num) : splitMode === 'all'}
                                                chunkIdx={splitMode === 'chunks' ? pageChunkMap[num] : undefined}
                                                onToggle={() => {
                                                    if (splitMode === 'selected') togglePage(num)
                                                    if (splitMode === 'chunks') togglePageChunk(num)
                                                }}
                                                onPreview={() => setPreviewPage(num)}
                                            />
                                        ))}
                                    </div>
                                </>
                            )
                        })()}
                        {!pdfDoc && (
                            <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
                                <span className="loading-spinner"></span> กำลังโหลดพรีวิว...
                            </div>
                        )}
                        {splitMode === 'chunks' && Object.keys(pageChunkMap).length > 0 && (
                            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                                {Array.from({ length: chunkCount }, (_, ci) => {
                                    const pgs = Object.entries(pageChunkMap).filter(([, v]) => v === ci).map(([k]) => parseInt(k)).sort((a, b) => a - b)
                                    if (pgs.length === 0) return null
                                    return (
                                        <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                            <div style={{ width: 10, height: 10, borderRadius: 3, background: CHUNK_COLORS[ci % CHUNK_COLORS.length], flexShrink: 0 }}></div>
                                            <span style={{ fontSize: 12, fontWeight: 600 }}>ชุด {ci + 1}:</span>
                                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>หน้า {pgs.join(', ')}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    <div className="card">
                        <div className="card-header"><h3>⚙️ ตั้งค่าการแยก</h3></div>
                        <div className="card-body">
                            <div className="form-group">
                                <label>โหมดการแยก</label>
                                <div className="split-modes-grid">
                                    <div className={`radio-option ${splitMode === 'all' ? 'active' : ''}`} onClick={() => setSplitMode('all')}>
                                        <div className="radio-dot"></div>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>📄 แยกทุกหน้า</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>แยกทุกหน้าเป็นไฟล์แยกอัตโนมัติ</div>
                                        </div>
                                    </div>
                                    <div className={`radio-option ${splitMode === 'chunks' ? 'active' : ''}`} onClick={() => setSplitMode('chunks')}>
                                        <div className="radio-dot"></div>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>📦 แยกเป็นชุด</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>จัดกลุ่มหน้าเป็นชุดๆ</div>
                                        </div>
                                    </div>
                                    <div className={`radio-option ${splitMode === 'selected' ? 'active' : ''}`} onClick={() => setSplitMode('selected')}>
                                        <div className="radio-dot"></div>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>✅ เลือกหน้า</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>คลิกเลือกหน้าจากพรีวิว</div>
                                        </div>
                                    </div>
                                    <div className={`radio-option ${splitMode === 'range' ? 'active' : ''}`} onClick={() => setSplitMode('range')}>
                                        <div className="radio-dot"></div>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>📝 กำหนดช่วง</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>พิมพ์ช่วงหน้าเอง เช่น 1-3, 5</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {splitMode === 'all' && (
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
                                        onClick={() => setCreateSubfolder(v => !v)}>
                                        <div style={{
                                            width: 20, height: 20, borderRadius: 5,
                                            border: `2px solid ${createSubfolder ? 'var(--accent)' : '#d1d5db'}`,
                                            background: createSubfolder ? 'var(--accent)' : '#fff',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'all .15s ease', flexShrink: 0
                                        }}>
                                            {createSubfolder && <span style={{ color: '#fff', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>✓</span>}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: 13 }}>📁 สร้างโฟลเดอร์คุม</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
                                                สร้างโฟลเดอร์ชื่อเดียวกับไฟล์ PDF เพื่อเก็บไฟล์ที่แยก
                                            </div>
                                        </div>
                                    </label>
                                    {createSubfolder && splitFile && (
                                        <div style={{
                                            marginTop: 8, padding: '8px 12px', borderRadius: 8,
                                            background: '#f0fdf4', border: '1px solid #bbf7d0',
                                            fontSize: 12, color: '#15803d', display: 'flex', alignItems: 'center', gap: 6
                                        }}>
                                            📂 <span style={{ fontWeight: 600 }}>{splitFile.name.replace('.pdf', '')}</span>
                                            <span style={{ color: '#6b7280' }}>/ (โฟลเดอร์ใหม่)</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {splitMode === 'range' && (
                                <div className="form-group">
                                    <label>ช่วงหน้า (เช่น 1-3, 5, 7-10)</label>
                                    <input className="form-input" value={pageRange} onChange={e => setPageRange(e.target.value)}
                                        placeholder="1-3, 5, 7-10" style={{ fontSize: 13 }} />
                                </div>
                            )}

                            {splitMode !== 'chunks' && (
                                <div className="form-group">
                                    <label>รูปแบบชื่อไฟล์</label>
                                    <input className="form-input" value={splitPattern} onChange={e => setSplitPattern(e.target.value)}
                                        style={{ fontSize: 13 }} />
                                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>ใช้ {'{page}'} แทนเลขหน้า</span>
                                </div>
                            )}

                            <div className="form-group">
                                <label>โฟลเดอร์ผลลัพธ์</label>
                                <input className="form-input" value={outputDir} onChange={e => setOutputDir(e.target.value)}
                                    style={{ fontSize: 13 }} />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--accent-light)', borderRadius: 10, marginBottom: 18 }}>
                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>จำนวนไฟล์ที่จะได้</span>
                                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>
                                    {getOutputCount()} ไฟล์
                                </span>
                            </div>

                            <button className="btn-accent" style={{ width: '100%', justifyContent: 'center' }}
                                onClick={handleSplit} disabled={isSplitDisabled}>
                                {splitting ? <><span className="loading-spinner"></span> กำลังแยก...</> : '✂️ แยกไฟล์ทันที'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
