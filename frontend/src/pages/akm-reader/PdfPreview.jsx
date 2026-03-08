// ── PDF Preview Component ──
// แสดงพรีวิวเอกสาร PDF ด้านข้างรายการข้อมูล
// รองรับ: ซูมเข้า/ออก, เปลี่ยนหน้า, ขยายเต็มจอ
import { useState, useEffect, useRef, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export default function PdfPreview({ file, pageNum = 1, totalPages = 1 }) {
    const canvasRef = useRef(null)
    const wrapRef = useRef(null)
    const [pdfDoc, setPdfDoc] = useState(null)
    const [currentPage, setCurrentPage] = useState(pageNum)
    const [scale, setScale] = useState(1.0)
    const [rendering, setRendering] = useState(false)
    const [loadedFileName, setLoadedFileName] = useState(null)
    const [expanded, setExpanded] = useState(false) // ขยายเต็มจอ

    // โหลด PDF เมื่อ file เปลี่ยน
    useEffect(() => {
        if (!file) return
        if (loadedFileName === file.name) return

        let cancelled = false
        const loadPdf = async () => {
            try {
                const arrayBuffer = await file.arrayBuffer()
                const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
                if (!cancelled) {
                    setPdfDoc(doc)
                    setLoadedFileName(file.name)
                    setScale(1.0)
                }
            } catch (err) {
                console.error('❌ โหลด PDF preview ล้มเหลว:', err)
            }
        }
        loadPdf()
        return () => { cancelled = true }
    }, [file, loadedFileName])

    // เปลี่ยนหน้าเมื่อ prop เปลี่ยน
    useEffect(() => {
        if (pageNum && pageNum !== currentPage) setCurrentPage(pageNum)
    }, [pageNum])

    // Render หน้า PDF — ใช้ scale สูงเพื่อให้ภาพคม แสดงผลด้วย CSS scale
    const renderPage = useCallback(async () => {
        if (!pdfDoc || !canvasRef.current || rendering) return
        setRendering(true)

        try {
            const page = await pdfDoc.getPage(currentPage)
            // render ที่ DPI สูง (2x) เพื่อความคมชัด
            const renderScale = 2.0
            const viewport = page.getViewport({ scale: renderScale })
            const canvas = canvasRef.current
            const ctx = canvas.getContext('2d')

            canvas.width = viewport.width
            canvas.height = viewport.height

            await page.render({ canvasContext: ctx, viewport }).promise
        } catch (err) {
            console.error('❌ render PDF page ล้มเหลว:', err)
        }
        setRendering(false)
    }, [pdfDoc, currentPage, rendering])

    useEffect(() => {
        renderPage()
    }, [pdfDoc, currentPage])

    // ปุ่มซูม
    const zoomIn = () => setScale(s => Math.min(3, +(s + 0.25).toFixed(2)))
    const zoomOut = () => setScale(s => Math.max(0.25, +(s - 0.25).toFixed(2)))
    const zoomFit = () => setScale(1.0)

    // Keyboard shortcuts ใน fullscreen
    useEffect(() => {
        if (!expanded) return
        const onKey = (e) => {
            if (e.key === 'Escape') setExpanded(false)
            if (e.key === 'ArrowLeft') setCurrentPage(p => Math.max(1, p - 1))
            if (e.key === 'ArrowRight') setCurrentPage(p => Math.min(maxPage, p + 1))
            if (e.key === '+' || e.key === '=') zoomIn()
            if (e.key === '-') zoomOut()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [expanded, pdfDoc])

    const maxPage = pdfDoc ? pdfDoc.numPages : totalPages

    // ════════════════════════════
    // Empty state
    // ════════════════════════════
    if (!file) {
        return (
            <div style={styles.container(false)}>
                <div style={styles.empty}>
                    <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>📄</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#8b8fa3' }}>
                        คลิกเอกสารเพื่อดูพรีวิว
                    </div>
                    <div style={{ fontSize: 12, color: '#b0b4c0', marginTop: 4 }}>
                        เลือกรายการด้านซ้ายเพื่อแสดง PDF
                    </div>
                </div>
            </div>
        )
    }

    // ════════════════════════════
    // Overlay เต็มจอ
    // ════════════════════════════
    if (expanded) {
        return (
            <div style={styles.overlay} onClick={() => setExpanded(false)}>
                <div style={styles.overlayInner} onClick={e => e.stopPropagation()}>
                    {/* Toolbar */}
                    <div style={styles.overlayToolbar}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 14 }}>📄</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                                {file.name}
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {/* Navigation */}
                            <button style={styles.overlayBtn(currentPage <= 1)}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage <= 1}>◀</button>
                            <span style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 600, minWidth: 80, textAlign: 'center' }}>
                                หน้า {currentPage} / {maxPage}
                            </span>
                            <button style={styles.overlayBtn(currentPage >= maxPage)}
                                onClick={() => setCurrentPage(p => Math.min(maxPage, p + 1))}
                                disabled={currentPage >= maxPage}>▶</button>

                            <div style={{ width: 1, height: 20, background: '#475569', margin: '0 8px' }} />

                            {/* Zoom */}
                            <button style={styles.overlayBtn(false)} onClick={zoomOut}>−</button>
                            <span style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 600, minWidth: 45, textAlign: 'center' }}>
                                {Math.round(scale * 100)}%
                            </span>
                            <button style={styles.overlayBtn(false)} onClick={zoomIn}>+</button>
                            <button style={styles.overlayBtn(false)} onClick={zoomFit}
                                title="พอดีหน้าจอ">⊡</button>

                            <div style={{ width: 1, height: 20, background: '#475569', margin: '0 8px' }} />

                            {/* Close */}
                            <button style={{ ...styles.overlayBtn(false), background: '#ef4444', color: '#fff' }}
                                onClick={() => setExpanded(false)}
                                title="ปิด (Esc)">✕</button>
                        </div>
                    </div>

                    {/* Canvas area */}
                    <div style={styles.overlayCanvas}>
                        <canvas
                            ref={canvasRef}
                            style={{
                                width: `${scale * 100}%`,
                                maxWidth: 'none',
                                borderRadius: 4,
                                boxShadow: '0 4px 30px rgba(0,0,0,0.4)',
                                transition: 'width 0.15s ease',
                            }}
                        />
                    </div>
                </div>
            </div>
        )
    }

    // ════════════════════════════
    // Panel ปกติ (side panel)
    // ════════════════════════════
    return (
        <div style={styles.container(false)}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerTitle}>
                    <span>📄</span>
                    <span>พรีวิว PDF</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button style={styles.navBtn(currentPage <= 1)}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}>◀</button>
                    <span style={styles.pageInfo}>
                        {currentPage} / {maxPage}
                    </span>
                    <button style={styles.navBtn(currentPage >= maxPage)}
                        onClick={() => setCurrentPage(p => Math.min(maxPage, p + 1))}
                        disabled={currentPage >= maxPage}>▶</button>
                </div>
            </div>

            {/* Canvas */}
            <div ref={wrapRef} style={styles.canvasWrap}>
                <canvas
                    ref={canvasRef}
                    style={{
                        width: `${scale * 100}%`,
                        maxWidth: 'none',
                        borderRadius: 4,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                        transition: 'width 0.15s ease',
                    }}
                />
            </div>

            {/* Zoom bar */}
            <div style={styles.zoomBar}>
                <button style={styles.zoomBtn} onClick={zoomOut} title="ซูมออก">−</button>
                <span style={styles.zoomText}>{Math.round(scale * 100)}%</span>
                <button style={styles.zoomBtn} onClick={zoomIn} title="ซูมเข้า">+</button>
                <button style={styles.zoomBtn} onClick={zoomFit} title="พอดีหน้าจอ">⊡</button>
                <span style={{ margin: '0 4px', color: '#e8ecf1' }}>|</span>
                <button
                    style={{ ...styles.zoomBtn, background: '#f97316', color: '#fff', border: 'none', padding: '0 10px', width: 'auto' }}
                    onClick={() => setExpanded(true)}
                    title="ขยายเต็มจอ"
                >
                    ⛶ ขยาย
                </button>
            </div>

            {/* File name */}
            <div style={{
                padding: '6px 16px', borderTop: '1px solid #f0f2f5',
                fontSize: 11, color: '#8b8fa3',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
                📁 {file.name}
            </div>
        </div>
    )
}

// ══════════════════════════════════════
// Styles
// ══════════════════════════════════════
const styles = {
    container: () => ({
        position: 'sticky',
        top: 28,
        background: '#fff',
        border: '1px solid #e8ecf1',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
    }),
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: '1px solid #e8ecf1',
        background: '#fafbfc',
    },
    headerTitle: {
        fontSize: 13,
        fontWeight: 700,
        color: '#1a1a2e',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
    },
    navBtn: (disabled) => ({
        width: 26,
        height: 26,
        border: '1px solid #e8ecf1',
        borderRadius: 6,
        background: disabled ? '#f5f5f5' : '#fff',
        color: disabled ? '#ccc' : '#6b7280',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontFamily: 'Inter, sans-serif',
    }),
    pageInfo: {
        fontSize: 12,
        fontWeight: 600,
        color: '#6b7280',
        minWidth: 50,
        textAlign: 'center',
    },
    canvasWrap: {
        padding: 8,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        minHeight: 300,
        maxHeight: 'calc(100vh - 220px)',
        overflow: 'auto',
        background: '#e9ecef',
    },
    zoomBar: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '6px 12px',
        borderTop: '1px solid #e8ecf1',
        background: '#fafbfc',
    },
    zoomBtn: {
        width: 28,
        height: 28,
        border: '1px solid #e8ecf1',
        borderRadius: 6,
        background: '#fff',
        color: '#6b7280',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        fontWeight: 600,
        fontFamily: 'Inter, sans-serif',
        transition: 'all 0.1s',
    },
    zoomText: {
        fontSize: 11,
        fontWeight: 700,
        color: '#6b7280',
        minWidth: 40,
        textAlign: 'center',
    },
    empty: {
        padding: '60px 20px',
        textAlign: 'center',
        background: '#f8f9fb',
        minHeight: 400,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
    },
    // ── Fullscreen overlay ──
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        flexDirection: 'column',
    },
    overlayInner: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
    },
    overlayToolbar: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        flexShrink: 0,
    },
    overlayBtn: (disabled) => ({
        width: 32,
        height: 32,
        border: '1px solid #475569',
        borderRadius: 6,
        background: disabled ? '#1e293b' : '#334155',
        color: disabled ? '#475569' : '#e2e8f0',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        fontWeight: 600,
        fontFamily: 'Inter, sans-serif',
        transition: 'all 0.1s',
    }),
    overlayCanvas: {
        flex: 1,
        overflow: 'auto',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '20px',
    },
}
