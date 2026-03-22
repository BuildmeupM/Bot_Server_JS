import { useState, useEffect } from 'react'
import { CHUNK_COLORS } from '../../pages/docsort/tools/constants'

export default function PdfPageThumb({ pdfDoc, pageNum, isSelected, onToggle, onPreview, chunkIdx }) {
    const [imgSrc, setImgSrc] = useState(null)

    useEffect(() => {
        let cancelled = false
        const render = async () => {
            if (!pdfDoc) return
            try {
                const page = await pdfDoc.getPage(pageNum)
                const viewport = page.getViewport({ scale: 0.6 })
                const canvas = document.createElement('canvas')
                canvas.width = viewport.width
                canvas.height = viewport.height
                const ctx = canvas.getContext('2d')
                await page.render({ canvasContext: ctx, viewport }).promise
                if (!cancelled) setImgSrc(canvas.toDataURL('image/jpeg', 0.85))
            } catch (e) { console.warn('Render page error:', e) }
        }
        render()
        return () => { cancelled = true }
    }, [pdfDoc, pageNum])

    const hasChunk = chunkIdx !== undefined && chunkIdx !== null
    const chunkColor = hasChunk ? CHUNK_COLORS[chunkIdx % CHUNK_COLORS.length] : null

    return (
        <div className={`pdf-thumb-card ${isSelected ? 'selected' : ''}`}
            onClick={onToggle}
            style={hasChunk ? { borderColor: chunkColor, boxShadow: `0 0 0 2px ${chunkColor}33` } : undefined}>
            <div className="pdf-thumb-canvas-wrap">
                {imgSrc ? (
                    <img src={imgSrc} alt={`หน้า ${pageNum}`} draggable={false}
                        style={{ width: '100%', height: 'auto', display: 'block' }} />
                ) : (
                    <div className="pdf-thumb-loading"><span className="loading-spinner" style={{ borderColor: 'rgba(249,115,22,0.2)', borderTopColor: 'var(--accent)', width: 24, height: 24 }}></span></div>
                )}
                {hasChunk && (
                    <div className="chunk-badge" style={{ background: chunkColor }}>
                        ชุด {chunkIdx + 1}
                    </div>
                )}
                <button className="pdf-thumb-zoom" title="ดูขยาย" onClick={e => { e.stopPropagation(); onPreview() }}>🔍</button>
            </div>
            <div className="pdf-thumb-footer">
                <div className="pdf-thumb-check" style={hasChunk ? { background: chunkColor, borderColor: chunkColor, color: '#fff' } : undefined}>
                    {isSelected || hasChunk ? '✓' : ''}
                </div>
                <span>หน้า {pageNum}</span>
            </div>
        </div>
    )
}
