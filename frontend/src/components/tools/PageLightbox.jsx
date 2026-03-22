import { useEffect, useRef, useState, useCallback } from 'react'

export default function PageLightbox({ pdfDoc, pageNum, totalPages, onClose, onPrev, onNext }) {
    const canvasRef = useRef(null)
    const wrapRef = useRef(null)
    const [zoom, setZoom] = useState(100)
    const [dragging, setDragging] = useState(false)
    const dragStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })

    useEffect(() => {
        const render = async () => {
            if (!pdfDoc || !canvasRef.current) return
            try {
                const page = await pdfDoc.getPage(pageNum)
                const viewport = page.getViewport({ scale: 2.0 })
                const canvas = canvasRef.current
                canvas.width = viewport.width
                canvas.height = viewport.height
                const ctx = canvas.getContext('2d')
                await page.render({ canvasContext: ctx, viewport }).promise
            } catch (e) { console.warn('Lightbox render error:', e) }
        }
        render()
    }, [pdfDoc, pageNum])

    useEffect(() => { setZoom(100) }, [pageNum])

    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowLeft' && pageNum > 1) onPrev()
            if (e.key === 'ArrowRight' && pageNum < totalPages) onNext()
            if (e.key === '+' || e.key === '=') setZoom(z => Math.min(500, z + 10))
            if (e.key === '-') setZoom(z => Math.max(10, z - 10))
            if (e.key === '0') setZoom(100)
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [pageNum, totalPages, onClose, onPrev, onNext])

    const handleWheel = useCallback((e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            setZoom(z => Math.max(10, Math.min(500, z + (e.deltaY > 0 ? -10 : 10))))
        }
    }, [])

    const handleMouseDown = (e) => {
        if (zoom <= 100) return
        const wrap = wrapRef.current
        if (!wrap) return
        setDragging(true)
        dragStart.current = { x: e.clientX, y: e.clientY, scrollLeft: wrap.scrollLeft, scrollTop: wrap.scrollTop }
    }
    const handleMouseMove = (e) => {
        if (!dragging) return
        const wrap = wrapRef.current
        if (!wrap) return
        e.preventDefault()
        wrap.scrollLeft = dragStart.current.scrollLeft - (e.clientX - dragStart.current.x)
        wrap.scrollTop = dragStart.current.scrollTop - (e.clientY - dragStart.current.y)
    }
    const handleMouseUp = () => setDragging(false)

    return (
        <div className="lightbox-overlay" onClick={onClose}>
            <div className="lightbox-content" onClick={e => e.stopPropagation()}>
                <div className="lightbox-header">
                    <span>หน้า {pageNum} / {totalPages}</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button className="lightbox-nav" onClick={() => setZoom(z => Math.max(10, z - 10))} title="ซูมออก">−</button>
                        <span style={{ fontSize: 12, minWidth: 42, textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }}
                            onClick={() => setZoom(100)} title="รีเซ็ต">{zoom}%</span>
                        <button className="lightbox-nav" onClick={() => setZoom(z => Math.min(500, z + 10))} title="ซูมเข้า">+</button>
                        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }}></div>
                        <button className="lightbox-nav" disabled={pageNum <= 1} onClick={onPrev}>◀</button>
                        <button className="lightbox-nav" disabled={pageNum >= totalPages} onClick={onNext}>▶</button>
                        <button className="lightbox-close" onClick={onClose}>✕</button>
                    </div>
                </div>
                <div className="lightbox-canvas-wrap" ref={wrapRef}
                    onWheel={handleWheel}
                    onDoubleClick={() => setZoom(z => z === 100 ? 200 : 100)}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    style={{ cursor: zoom > 100 ? (dragging ? 'grabbing' : 'grab') : 'default' }}>
                    <canvas ref={canvasRef}
                        style={{ maxWidth: zoom <= 100 ? '100%' : 'none', maxHeight: zoom <= 100 ? 'calc(90vh - 70px)' : 'none', display: 'block', margin: '0 auto', transform: `scale(${zoom / 100})`, transformOrigin: 'top left', transition: dragging ? 'none' : 'transform .15s ease' }} />
                </div>
            </div>
        </div>
    )
}
