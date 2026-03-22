import { useState, useEffect, useRef, useCallback } from 'react'
import { getPreviewUrl } from '../../services/api'

export default function FilePreviewPanel({ file, onClose }) {
    const [zoom, setZoom] = useState(100)
    const [dragging, setDragging] = useState(false)
    const dragStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })
    const wrapRef = useRef(null)

    const ext = file.name.split('.').pop().toLowerCase()
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)
    const fileUrl = file.objectUrl || getPreviewUrl(file.fullPath)

    useEffect(() => { setZoom(100) }, [file.fullPath])

    const handleWheel = useCallback((e) => {
        if (!e.ctrlKey && !e.metaKey) return
        e.preventDefault()
        setZoom(z => Math.max(10, Math.min(500, z + (e.deltaY < 0 ? 10 : -10))))
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
        <div className="card" style={{ position: 'sticky', top: 20 }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    {isImage ? '🖼️' : '📄'} <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                </h3>
                {isImage && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <button className="lightbox-nav" onClick={() => setZoom(z => Math.max(10, z - 10))} style={{ width: 26, height: 26, fontSize: 14 }}>－</button>
                        <span style={{ fontSize: 11, minWidth: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>{zoom}%</span>
                        <button className="lightbox-nav" onClick={() => setZoom(z => Math.min(500, z + 10))} style={{ width: 26, height: 26, fontSize: 14 }}>＋</button>
                        <button className="lightbox-nav" onClick={() => setZoom(100)} style={{ width: 40, height: 26, fontSize: 10 }}>รีเซ็ต</button>
                    </div>
                )}
                <button className="lightbox-close" onClick={onClose} style={{ width: 28, height: 28, fontSize: 13, flexShrink: 0 }}>✕</button>
            </div>
            <div ref={wrapRef}
                onWheel={handleWheel}
                onDoubleClick={() => isImage && setZoom(z => z === 100 ? 200 : 100)}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{
                    background: '#f4f5f7', overflow: 'auto', padding: 12, minHeight: 300, maxHeight: 'calc(85vh - 100px)',
                    cursor: isImage && zoom > 100 ? (dragging ? 'grabbing' : 'grab') : 'default',
                    ...(zoom <= 100 ? { display: 'flex', alignItems: 'center', justifyContent: 'center' } : {})
                }}>
                {isImage ? (
                    <img src={fileUrl} alt={file.name}
                        draggable={false}
                        style={zoom <= 100
                            ? { maxWidth: `${zoom}%`, maxHeight: `calc(${zoom / 100} * (85vh - 140px))`, display: 'block', objectFit: 'contain', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,.12)', transition: dragging ? 'none' : 'all .15s ease' }
                            : { width: `${zoom}%`, display: 'block', objectFit: 'contain', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,.12)', transition: dragging ? 'none' : 'width .15s ease', flexShrink: 0 }
                        } />
                ) : (
                    <iframe src={fileUrl} title={file.name}
                        style={{ width: '100%', height: 'calc(80vh - 120px)', border: 'none', borderRadius: 8 }} />
                )}
            </div>
        </div>
    )
}
