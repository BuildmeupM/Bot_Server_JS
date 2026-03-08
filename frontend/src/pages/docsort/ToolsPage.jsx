import { useState, useEffect, useRef, useCallback } from 'react'
import Sidebar from '../../components/Sidebar'
import { browseDirectory, splitPdf, unlockPdf, getPdfInfo, convertHeic, convertHeicBatch, extractArchive, mergePdf, pdfToImage, createZip, unlockExcel, imageToPdf, logUsage } from '../../services/api'
import toast from 'react-hot-toast'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

function formatSize(bytes) {
    if (!bytes) return '—'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif']

const TAB_FILTERS = {
    split: f => !f.isDirectory && f.isPdf,
    unlock: f => !f.isDirectory && f.isPdf,
    merge: f => !f.isDirectory && f.isPdf,
    pdfimg: f => !f.isDirectory && f.isPdf,
    imgpdf: f => !f.isDirectory && IMAGE_EXTENSIONS.includes(f.name.toLowerCase().slice(f.name.lastIndexOf('.'))),
    heic: f => !f.isDirectory && ['.heic', '.heif'].includes(f.name.toLowerCase().slice(f.name.lastIndexOf('.'))),
    rar: f => !f.isDirectory && ['.rar', '.zip', '.7z'].includes(f.name.toLowerCase().slice(f.name.lastIndexOf('.'))),
    zip: f => !f.isDirectory,
    excel: f => !f.isDirectory && f.name.toLowerCase().endsWith('.xlsx'),
}

const CHUNK_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#14b8a6', '#f59e0b', '#ec4899', '#6366f1', '#06b6d4']

// ── PDF Page Thumbnail Component ──
function PdfPageThumb({ pdfDoc, pageNum, isSelected, onToggle, onPreview, chunkIdx }) {
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

// ── PDF Page Lightbox with Zoom ──
function PageLightbox({ pdfDoc, pageNum, totalPages, onClose, onPrev, onNext }) {
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

    // Drag-to-pan handlers
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

// ── File Preview Panel with zoom + drag-to-pan ──
function FilePreviewPanel({ file, onClose }) {
    const [zoom, setZoom] = useState(100)
    const [dragging, setDragging] = useState(false)
    const dragStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })
    const wrapRef = useRef(null)

    const ext = file.name.split('.').pop().toLowerCase()
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)
    const token = 'bypass';
    // Support objectUrl for drag-and-drop files that don't have server path
    const fileUrl = file.objectUrl || `/api/tools/serve-file?filePath=${encodeURIComponent(file.fullPath)}&token=${encodeURIComponent(token)}`


    // Reset zoom when file changes
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

export default function ToolsPage() {
    const [activeTab, setActiveTab] = useState('split')
    const [pathInput, setPathInput] = useState('')
    const [currentPath, setCurrentPath] = useState('')
    const [allFiles, setAllFiles] = useState([])
    const [loading, setLoading] = useState(false)

    // Split state
    const [splitFile, setSplitFile] = useState(null)
    const [splitInfo, setSplitInfo] = useState(null)
    const [selectedPages, setSelectedPages] = useState([])
    const [splitMode, setSplitMode] = useState('all')
    const [pageRange, setPageRange] = useState('')
    const [splitPattern, setSplitPattern] = useState('')
    const [outputDir, setOutputDir] = useState('')
    const [splitting, setSplitting] = useState(false)

    // Chunk builder state
    const [pageChunkMap, setPageChunkMap] = useState({})  // { pageNum: chunkIndex }
    const [activeChunkIdx, setActiveChunkIdx] = useState(0)
    const [chunkCount, setChunkCount] = useState(2)

    // PDF preview state
    const [pdfDoc, setPdfDoc] = useState(null)
    const [previewPage, setPreviewPage] = useState(null)

    // Thumbnail pagination
    const [thumbsPerPage, setThumbsPerPage] = useState(10)
    const [thumbPage, setThumbPage] = useState(0)

    // Unlock state
    const [unlockFile, setUnlockFile] = useState(null)
    const [password, setPassword] = useState('')
    const [unlockOutputDir, setUnlockOutputDir] = useState('')
    const [unlocking, setUnlocking] = useState(false)

    // HEIC state
    const [heicSelectedFiles, setHeicSelectedFiles] = useState([])
    const [heicOutputDir, setHeicOutputDir] = useState('')
    const [heicFormat, setHeicFormat] = useState('jpg')
    const [heicQuality, setHeicQuality] = useState(90)
    const [heicConverting, setHeicConverting] = useState(false)

    // RAR state
    const [rarFile, setRarFile] = useState(null)
    const [rarOutputDir, setRarOutputDir] = useState('')
    const [rarExtracting, setRarExtracting] = useState(false)
    const [rarResult, setRarResult] = useState(null)
    const [rarPreviewFile, setRarPreviewFile] = useState(null)  // { name, fullPath }

    // Merge PDF state
    const [mergeSelectedFiles, setMergeSelectedFiles] = useState([])
    const [mergeOutputDir, setMergeOutputDir] = useState('')
    const [mergeOutputName, setMergeOutputName] = useState('merged')
    const [merging, setMerging] = useState(false)

    // PDF to Image state
    const [pdfImgFile, setPdfImgFile] = useState(null)
    const [pdfImgOutputDir, setPdfImgOutputDir] = useState('')
    const [pdfImgFormat, setPdfImgFormat] = useState('jpg')
    const [pdfImgQuality, setPdfImgQuality] = useState(90)
    const [pdfImgDpi, setPdfImgDpi] = useState(150)
    const [pdfImgConverting, setPdfImgConverting] = useState(false)
    const [pdfImgResult, setPdfImgResult] = useState(null)
    const [pdfImgOutputName, setPdfImgOutputName] = useState('')  // ชื่อไฟล์ output ที่ผู้ใช้ตั้งเอง
    const [pdfImgPreviewFile, setPdfImgPreviewFile] = useState(null)  // { name, fullPath }

    // ZIP state
    const [zipSelectedFiles, setZipSelectedFiles] = useState([])
    const [zipOutputDir, setZipOutputDir] = useState('')
    const [zipOutputName, setZipOutputName] = useState('archive')
    const [zipping, setZipping] = useState(false)

    // Excel unlock state
    const [excelFile, setExcelFile] = useState(null)
    const [excelPassword, setExcelPassword] = useState('')
    const [excelOutputDir, setExcelOutputDir] = useState('')
    const [excelUnlocking, setExcelUnlocking] = useState(false)

    // Image to PDF state
    const [imgPdfFiles, setImgPdfFiles] = useState([])  // array of { name, path, size, fromDrop }
    const [imgPdfOutputDir, setImgPdfOutputDir] = useState('')
    const [imgPdfOutputName, setImgPdfOutputName] = useState('images')
    const [imgPdfPageSize, setImgPdfPageSize] = useState('A4')
    const [imgPdfConverting, setImgPdfConverting] = useState(false)
    const [imgPdfResult, setImgPdfResult] = useState(null)
    const [imgPdfDragOver, setImgPdfDragOver] = useState(false)
    const imgPdfDropRef = useRef(null)
    const [imgPdfPreviewFile, setImgPdfPreviewFile] = useState(null)  // { name, fullPath }

    useEffect(() => {
        const saved = localStorage.getItem('lastPath')
        if (saved) { setPathInput(saved); loadFiles(saved) }
    }, [])

    const loadFiles = async (dirPath) => {
        setLoading(true)
        try {
            const res = await browseDirectory(dirPath)
            setCurrentPath(res.data.currentPath)
            setAllFiles(res.data.items)
            setOutputDir(res.data.currentPath)
            setUnlockOutputDir(res.data.currentPath)
            setHeicOutputDir(res.data.currentPath)
            setRarOutputDir(res.data.currentPath)
            setMergeOutputDir(res.data.currentPath)
            setPdfImgOutputDir(res.data.currentPath)
            setZipOutputDir(res.data.currentPath)
            setExcelOutputDir(res.data.currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'ไม่สามารถเปิดโฟลเดอร์ได้')
        } finally { setLoading(false) }
    }

    const files = allFiles.filter(TAB_FILTERS[activeTab] || (() => false))
    const handleBrowse = () => { if (pathInput.trim()) loadFiles(pathInput.trim()) }

    // ── Split handlers ──
    const handleSelectSplitFile = useCallback(async (file) => {
        setSplitFile(file)
        setSplitPattern(file.name.replace('.pdf', '') + '_page{page}')
        setSelectedPages([])
        setPdfDoc(null)
        try {
            const res = await getPdfInfo(file.path)
            setSplitInfo(res.data)
            // Load PDF for thumbnails
            const token = 'bypass';
            const url = `/api/files/preview?path=${encodeURIComponent(file.path)}&token=${token}`
            const loadingTask = pdfjsLib.getDocument(url)
            const doc = await loadingTask.promise
            setPdfDoc(doc)
        } catch {
            setSplitInfo(null)
            setPdfDoc(null)
        }
    }, [])

    const togglePage = (pageNum) => {
        setSelectedPages(prev =>
            prev.includes(pageNum) ? prev.filter(p => p !== pageNum) : [...prev, pageNum].sort((a, b) => a - b)
        )
    }

    const selectAllPages = () => {
        if (!splitInfo) return
        if (selectedPages.length === splitInfo.pageCount) {
            setSelectedPages([])
        } else {
            setSelectedPages(Array.from({ length: splitInfo.pageCount }, (_, i) => i + 1))
        }
    }

    // Chunk builder helpers
    const togglePageChunk = (pageNum) => {
        setPageChunkMap(prev => {
            const copy = { ...prev }
            if (copy[pageNum] === activeChunkIdx) {
                delete copy[pageNum]  // un-assign
            } else {
                copy[pageNum] = activeChunkIdx  // assign to active chunk
            }
            return copy
        })
    }

    const addChunkSlot = () => setChunkCount(c => Math.min(c + 1, CHUNK_COLORS.length))
    const removeChunkSlot = () => {
        if (chunkCount <= 2) return
        // remove pages assigned to last chunk
        setPageChunkMap(prev => {
            const copy = { ...prev }
            Object.keys(copy).forEach(k => { if (copy[k] === chunkCount - 1) delete copy[k] })
            return copy
        })
        if (activeChunkIdx >= chunkCount - 1) setActiveChunkIdx(chunkCount - 2)
        setChunkCount(c => c - 1)
    }

    // Build chunks array from pageChunkMap for API
    const buildChunksFromMap = () => {
        const result = []
        for (let ci = 0; ci < chunkCount; ci++) {
            const pages = Object.entries(pageChunkMap)
                .filter(([, idx]) => idx === ci)
                .map(([p]) => parseInt(p))
                .sort((a, b) => a - b)
            if (pages.length > 0) result.push(pages.join(','))
        }
        return result
    }

    const getChunkPageCount = (ci) => Object.values(pageChunkMap).filter(v => v === ci).length

    // Compute output file count
    const getOutputCount = () => {
        if (!splitInfo) return 0
        if (splitMode === 'all') return splitInfo.pageCount
        if (splitMode === 'chunks') return buildChunksFromMap().length
        if (splitMode === 'selected') return selectedPages.length
        if (splitMode === 'range' && pageRange) return '—'
        return 0
    }

    const handleSplit = async () => {
        if (!splitFile) return
        setSplitting(true)
        try {
            const payload = {
                filePath: splitFile.path,
                outputDir,
                filenamePattern: splitPattern,
                splitMode
            }
            if (splitMode === 'selected') payload.pages = selectedPages
            if (splitMode === 'range') payload.pages = pageRange
            if (splitMode === 'chunks') payload.chunks = buildChunksFromMap()
            const res = await splitPdf(payload)
            toast.success(res.data.message)
            logUsage({ page: 'tools', path_used: currentPath, action: 'split_pdf' })
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        } finally { setSplitting(false) }
    }

    // ── Unlock handlers ──
    const handleUnlock = async () => {
        if (!unlockFile || !password) return
        setUnlocking(true)
        try {
            const res = await unlockPdf({ filePath: unlockFile.path, password, outputDir: unlockOutputDir })
            toast.success(res.data.message)
            logUsage({ page: 'tools', path_used: currentPath, action: 'unlock_pdf' })
            setPassword('')
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        } finally { setUnlocking(false) }
    }

    // ── HEIC handlers ──
    const toggleHeicFile = (file) => {
        setHeicSelectedFiles(prev => {
            const exists = prev.find(f => f.path === file.path)
            if (exists) return prev.filter(f => f.path !== file.path)
            return [...prev, file]
        })
    }
    const selectAllHeic = () => {
        if (heicSelectedFiles.length === files.length) setHeicSelectedFiles([])
        else setHeicSelectedFiles([...files])
    }
    const handleHeicConvert = async () => {
        if (heicSelectedFiles.length === 0) return
        setHeicConverting(true)
        try {
            if (heicSelectedFiles.length === 1) {
                const res = await convertHeic({ filePath: heicSelectedFiles[0].path, outputDir: heicOutputDir, outputFormat: heicFormat, quality: heicQuality })
                toast.success(res.data.message)
                logUsage({ page: 'tools', path_used: currentPath, action: 'convert_heic' })
            } else {
                const res = await convertHeicBatch({ filePaths: heicSelectedFiles.map(f => f.path), outputDir: heicOutputDir, outputFormat: heicFormat, quality: heicQuality })
                toast.success(res.data.message)
                logUsage({ page: 'tools', path_used: currentPath, action: 'convert_heic_batch' })
                if (res.data.errors?.length > 0) res.data.errors.forEach(e => toast.error(`${e.file}: ${e.error}`))
            }
            setHeicSelectedFiles([])
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาดในการแปลง')
        } finally { setHeicConverting(false) }
    }

    // ── Merge PDF handlers ──
    const toggleMergeFile = (file) => {
        setMergeSelectedFiles(prev => {
            const exists = prev.find(f => f.path === file.path)
            if (exists) return prev.filter(f => f.path !== file.path)
            return [...prev, file]
        })
    }
    const selectAllMerge = () => {
        if (mergeSelectedFiles.length === files.length) setMergeSelectedFiles([])
        else setMergeSelectedFiles([...files])
    }
    const moveMergeFile = (idx, dir) => {
        setMergeSelectedFiles(prev => {
            const arr = [...prev]
            const newIdx = idx + dir
            if (newIdx < 0 || newIdx >= arr.length) return arr
                ;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
            return arr
        })
    }
    const handleMergePdf = async () => {
        if (mergeSelectedFiles.length < 2) return
        setMerging(true)
        try {
            const res = await mergePdf({ filePaths: mergeSelectedFiles.map(f => f.path), outputDir: mergeOutputDir, outputName: mergeOutputName })
            toast.success(res.data.message)
            logUsage({ page: 'tools', path_used: currentPath, action: 'merge_pdf' })
            setMergeSelectedFiles([])
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        } finally { setMerging(false) }
    }

    // ── PDF to Image handlers ──
    const handlePdfToImage = async () => {
        if (!pdfImgFile) return
        setPdfImgConverting(true)
        setPdfImgResult(null)
        try {
            const res = await pdfToImage({ filePath: pdfImgFile.path, outputDir: pdfImgOutputDir, outputFormat: pdfImgFormat, quality: pdfImgQuality, dpi: pdfImgDpi, outputBaseName: pdfImgOutputName || undefined })
            toast.success(res.data.message)
            logUsage({ page: 'tools', path_used: currentPath, action: 'pdf_to_image' })
            setPdfImgResult(res.data)
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        } finally { setPdfImgConverting(false) }
    }

    // ── ZIP handlers ──
    const toggleZipFile = (file) => {
        setZipSelectedFiles(prev => {
            const exists = prev.find(f => f.path === file.path)
            if (exists) return prev.filter(f => f.path !== file.path)
            return [...prev, file]
        })
    }
    const selectAllZip = () => {
        if (zipSelectedFiles.length === files.length) setZipSelectedFiles([])
        else setZipSelectedFiles([...files])
    }
    const handleCreateZip = async () => {
        if (zipSelectedFiles.length === 0) return
        setZipping(true)
        try {
            const res = await createZip({ filePaths: zipSelectedFiles.map(f => f.path), outputDir: zipOutputDir, outputName: zipOutputName })
            toast.success(res.data.message)
            logUsage({ page: 'tools', path_used: currentPath, action: 'create_zip' })
            setZipSelectedFiles([])
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        } finally { setZipping(false) }
    }

    // ── Excel unlock handlers ──
    const handleUnlockExcel = async () => {
        if (!excelFile || !excelPassword) return
        setExcelUnlocking(true)
        try {
            const res = await unlockExcel({ filePath: excelFile.path, password: excelPassword, outputDir: excelOutputDir })
            toast.success(res.data.message)
            logUsage({ page: 'tools', path_used: currentPath, action: 'unlock_excel' })
            setExcelPassword('')
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        } finally { setExcelUnlocking(false) }
    }

    // ── RAR handlers ──
    const handleExtract = async () => {
        if (!rarFile) return
        setRarExtracting(true)
        setRarResult(null)
        try {
            const res = await extractArchive({ filePath: rarFile.path, outputDir: rarOutputDir })
            toast.success(res.data.message)
            logUsage({ page: 'tools', path_used: currentPath, action: 'extract_archive' })
            setRarResult(res.data)
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาดในการแตกไฟล์')
        } finally { setRarExtracting(false) }
    }

    // ── Image to PDF handlers ──
    const toggleImgPdfFile = (file) => {
        setImgPdfFiles(prev => {
            const exists = prev.find(f => f.path === file.path)
            if (exists) return prev.filter(f => f.path !== file.path)
            return [...prev, file]
        })
    }
    const selectAllImgPdf = () => {
        if (imgPdfFiles.length === files.length) setImgPdfFiles([])
        else setImgPdfFiles([...files])
    }
    const moveImgPdfFile = (idx, dir) => {
        setImgPdfFiles(prev => {
            const arr = [...prev]
            const newIdx = idx + dir
            if (newIdx < 0 || newIdx >= arr.length) return arr
            ;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
            return arr
        })
    }
    // Handle drag & drop files from OS
    const handleImgPdfDrop = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setImgPdfDragOver(false)
        const droppedFiles = Array.from(e.dataTransfer.files)
        const imageFiles = droppedFiles.filter(f => {
            const ext = '.' + f.name.split('.').pop().toLowerCase()
            return IMAGE_EXTENSIONS.includes(ext)
        })
        if (imageFiles.length === 0) {
            toast.error('ไม่พบไฟล์รูปภาพ — รองรับ JPG, PNG, GIF, WebP, BMP, TIFF')
            return
        }
        const newFiles = imageFiles.map(f => ({
            name: f.name,
            path: f.path,  // Electron/NW.js provides full path on File object
            size: f.size,
            fromDrop: true,
            fileObj: f,    // Keep original File object for preview via objectURL
        }))
        // Merge with existing, avoid duplicates
        setImgPdfFiles(prev => {
            const existingPaths = new Set(prev.map(p => p.path))
            const unique = newFiles.filter(f => !existingPaths.has(f.path))
            return [...prev, ...unique]
        })
        toast.success(`เพิ่ม ${imageFiles.length} รูปภาพ`)
    }
    const handleImgPdfDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setImgPdfDragOver(true) }
    const handleImgPdfDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setImgPdfDragOver(false) }

    const handleImageToPdf = async () => {
        if (imgPdfFiles.length === 0) return
        setImgPdfConverting(true)
        setImgPdfResult(null)
        try {
            const res = await imageToPdf({
                filePaths: imgPdfFiles.map(f => f.path),
                outputDir: imgPdfOutputDir || currentPath,
                outputName: imgPdfOutputName || 'images',
                pageSize: imgPdfPageSize,
            })
            toast.success(res.data.message)
            logUsage({ page: 'tools', path_used: currentPath, action: 'image_to_pdf' })
            setImgPdfResult(res.data)
            if (res.data.errors?.length > 0) {
                res.data.errors.forEach(e => toast.error(`${e.file}: ${e.error}`))
            }
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาดในการแปลงรูปเป็น PDF')
        } finally { setImgPdfConverting(false) }
    }

    // split disabled logic
    const isSplitDisabled = splitting ||
        (splitMode === 'chunks' && buildChunksFromMap().length === 0) ||
        (splitMode === 'selected' && selectedPages.length === 0) ||
        (splitMode === 'range' && !pageRange.trim())

    return (
        <div className="app-layout">
            <Sidebar active="tools" />
            <main className="main-content">
                <div className="page-header animate-in">
                    <div className="breadcrumb">หน้าหลัก / คัดแยกเอกสาร / การจัดการเอกสาร</div>
                    <h1>🔧 เครื่องมือจัดการเอกสาร</h1>
                    <p>แยก/รวม PDF, ปลดล็อค PDF/Excel, แปลง PDF เป็นรูป, แปลง HEIC, แตกไฟล์/รวมไฟล์ ZIP</p>
                </div>

                <div className="animate-in" style={{ animationDelay: '.05s' }}>
                    {/* จัดการไฟล์ PDF */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap' }}>📄 จัดการไฟล์ PDF</span>
                        <div style={{ flex: 1, height: 1, background: '#e5e7eb' }}></div>
                    </div>
                    <div className="page-tabs" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
                        <button className={`page-tab ${activeTab === 'split' ? 'active' : ''}`} onClick={() => setActiveTab('split')}>✂️ แยก PDF</button>
                        <button className={`page-tab ${activeTab === 'merge' ? 'active' : ''}`} onClick={() => setActiveTab('merge')}>📑 รวม PDF</button>
                        <button className={`page-tab ${activeTab === 'unlock' ? 'active' : ''}`} onClick={() => setActiveTab('unlock')}>🔓 ปลดล็อค PDF</button>
                        <button className={`page-tab ${activeTab === 'pdfimg' ? 'active' : ''}`} onClick={() => setActiveTab('pdfimg')}>🖼️ PDF เป็นภาพ</button>
                        <button className={`page-tab ${activeTab === 'imgpdf' ? 'active' : ''}`} onClick={() => setActiveTab('imgpdf')}>📸 ภาพเป็น PDF</button>
                    </div>
                    {/* จัดการไฟล์ ZIP */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap' }}>📦 จัดการไฟล์ ZIP</span>
                        <div style={{ flex: 1, height: 1, background: '#e5e7eb' }}></div>
                    </div>
                    <div className="page-tabs" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
                        <button className={`page-tab ${activeTab === 'rar' ? 'active' : ''}`} onClick={() => setActiveTab('rar')}>📦 แตกไฟล์ RAR</button>
                        <button className={`page-tab ${activeTab === 'zip' ? 'active' : ''}`} onClick={() => setActiveTab('zip')}>🗜️ รวมไฟล์ ZIP</button>
                    </div>
                    {/* อื่น ๆ */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap' }}>🔧 อื่น ๆ</span>
                        <div style={{ flex: 1, height: 1, background: '#e5e7eb' }}></div>
                    </div>
                    <div className="page-tabs" style={{ marginBottom: 6, flexWrap: 'wrap' }}>
                        <button className={`page-tab ${activeTab === 'heic' ? 'active' : ''}`} onClick={() => setActiveTab('heic')}>🖼️ แปลง HEIC</button>
                        <button className={`page-tab ${activeTab === 'excel' ? 'active' : ''}`} onClick={() => setActiveTab('excel')}>📊 ปลดล็อค Excel</button>
                    </div>
                </div>

                {/* Folder Picker */}
                <div className="folder-picker animate-in" style={{ animationDelay: '.08s' }}>
                    <div className="picker-row">
                        <span className="picker-label">📂 ที่อยู่โฟลเดอร์ทำงาน</span>
                        <button className="browse-btn" onClick={handleBrowse}>📂 เปิดโฟลเดอร์</button>
                    </div>
                    <input className="form-input" value={pathInput} onChange={e => setPathInput(e.target.value)}
                        placeholder="เช่น C:\Documents\PDF" onKeyDown={e => e.key === 'Enter' && handleBrowse()}
                        style={{ fontSize: 13 }} />
                </div>

                {/* ═══════ SPLIT TAB ═══════ */}
                {activeTab === 'split' && (
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
                                {/* PDF Page Thumbnails */}
                                <div className="card" style={{ marginBottom: 20 }}>
                                    <div className="card-header">
                                        <h3>🖼️ พรีวิว: {splitFile.name}</h3>
                                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                            {splitInfo.pageCount} หน้า · {formatSize(splitInfo.size)}
                                        </span>
                                    </div>
                                    {/* Mode-specific toolbar */}
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
                                    {/* Pagination toolbar */}
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
                                    {/* Chunk summary */}
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

                                {/* Split Settings */}
                                <div className="card">
                                    <div className="card-header"><h3>⚙️ ตั้งค่าการแยก</h3></div>
                                    <div className="card-body">
                                        <div className="form-group">
                                            <label>โหมดการแยก</label>
                                            <div className="split-modes-grid">
                                                <div className={`radio-option ${splitMode === 'all' ? 'active' : ''}`}
                                                    onClick={() => setSplitMode('all')}>
                                                    <div className="radio-dot"></div>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>📄 แยกทุกหน้า</div>
                                                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>แยกทุกหน้าเป็นไฟล์แยกอัตโนมัติ</div>
                                                    </div>
                                                </div>
                                                <div className={`radio-option ${splitMode === 'chunks' ? 'active' : ''}`}
                                                    onClick={() => setSplitMode('chunks')}>
                                                    <div className="radio-dot"></div>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>📦 แยกเป็นชุด</div>
                                                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>จัดกลุ่มหน้าเป็นชุดๆ</div>
                                                    </div>
                                                </div>
                                                <div className={`radio-option ${splitMode === 'selected' ? 'active' : ''}`}
                                                    onClick={() => setSplitMode('selected')}>
                                                    <div className="radio-dot"></div>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>✅ เลือกหน้า</div>
                                                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>คลิกเลือกหน้าจากพรีวิว</div>
                                                    </div>
                                                </div>
                                                <div className={`radio-option ${splitMode === 'range' ? 'active' : ''}`}
                                                    onClick={() => setSplitMode('range')}>
                                                    <div className="radio-dot"></div>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>📝 กำหนดช่วง</div>
                                                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>พิมพ์ช่วงหน้าเอง เช่น 1-3, 5</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>



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
                )}

                {/* ═══════ UNLOCK TAB ═══════ */}
                {activeTab === 'unlock' && (
                    <div className="animate-in" style={{ maxWidth: 600 }}>
                        {currentPath && (
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
                        )}
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
                                        <input className="form-input" value={unlockOutputDir}
                                            onChange={e => setUnlockOutputDir(e.target.value)} style={{ fontSize: 13 }} />
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
                )}

                {/* ═══════ HEIC TAB ═══════ */}
                {activeTab === 'heic' && (
                    <div className="animate-in" style={{ maxWidth: 700 }}>
                        {currentPath && (
                            <div className="card" style={{ marginBottom: 20 }}>
                                <div className="card-header">
                                    <h3>🖼️ เลือกไฟล์ HEIC ที่จะแปลง</h3>
                                    {files.length > 0 && (
                                        <button className="btn-sm" onClick={selectAllHeic} style={{ fontSize: 11 }}>
                                            {heicSelectedFiles.length === files.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                                        </button>
                                    )}
                                </div>
                                <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                                    {files.map(f => {
                                        const isSelected = heicSelectedFiles.find(s => s.path === f.path)
                                        return (
                                            <div key={f.path}
                                                className={`file-list-item ${isSelected ? 'selected' : ''}`}
                                                onClick={() => toggleHeicFile(f)}>
                                                <div className="file-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>🖼️</div>
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
                                    {files.length === 0 && !loading && <p style={{ padding: 20, textAlign: 'center', color: '#999' }}>ไม่พบไฟล์ HEIC / HEIF ในโฟลเดอร์นี้</p>}
                                </div>
                            </div>
                        )}
                        {heicSelectedFiles.length > 0 && (
                            <div className="card">
                                <div className="card-header"><h3>⚙️ ตั้งค่าการแปลง</h3></div>
                                <div className="card-body">
                                    <div className="form-group">
                                        <label>รูปแบบผลลัพธ์</label>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <div className={`radio-option ${heicFormat === 'jpg' ? 'active' : ''}`}
                                                onClick={() => setHeicFormat('jpg')} style={{ flex: 1 }}>
                                                <div className="radio-dot"></div> JPG
                                            </div>
                                            <div className={`radio-option ${heicFormat === 'png' ? 'active' : ''}`}
                                                onClick={() => setHeicFormat('png')} style={{ flex: 1 }}>
                                                <div className="radio-dot"></div> PNG
                                            </div>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>คุณภาพ: {heicQuality}%</label>
                                        <input type="range" min="10" max="100" step="5" value={heicQuality}
                                            onChange={e => setHeicQuality(Number(e.target.value))}
                                            style={{ width: '100%', accentColor: 'var(--accent)' }} />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)' }}>
                                            <span>ไฟล์เล็ก</span><span>คุณภาพสูง</span>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>โฟลเดอร์ผลลัพธ์</label>
                                        <input className="form-input" value={heicOutputDir}
                                            onChange={e => setHeicOutputDir(e.target.value)} style={{ fontSize: 13 }} />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--accent-light)', borderRadius: 10, marginBottom: 18 }}>
                                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>ไฟล์ที่เลือก</span>
                                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{heicSelectedFiles.length} ไฟล์</span>
                                    </div>
                                    <button className="btn-accent" style={{ width: '100%', justifyContent: 'center' }}
                                        onClick={handleHeicConvert} disabled={heicConverting}>
                                        {heicConverting ? <><span className="loading-spinner"></span> กำลังแปลง...</> : `🖼️ แปลงเป็น ${heicFormat.toUpperCase()} ทันที`}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════ RAR TAB ═══════ */}
                {activeTab === 'rar' && (
                    <div className="animate-in" style={{ display: 'grid', gridTemplateColumns: rarPreviewFile ? '1fr 1fr' : '1fr', gap: 20, alignItems: 'start' }}>
                        {/* Left: file selection + result list */}
                        <div style={{ maxWidth: rarPreviewFile ? 'none' : 600 }}>
                            {currentPath && (
                                <div className="card" style={{ marginBottom: 20 }}>
                                    <div className="card-header"><h3>📦 เลือกไฟล์ RAR / ZIP ที่จะแตก</h3></div>
                                    <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                                        {files.map(f => {
                                            const ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'))
                                            const icon = ext === '.zip' ? '🗜️' : '📦'
                                            return (
                                                <div key={f.path}
                                                    className={`file-list-item ${rarFile?.path === f.path ? 'selected' : ''}`}
                                                    onClick={() => { setRarFile(f); setRarResult(null); setRarPreviewFile(null) }}>
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
                            )}
                            {rarFile && (
                                <div className="card">
                                    <div className="card-header"><h3>📦 แตกไฟล์: {rarFile.name}</h3></div>
                                    <div className="card-body">
                                        <div className="form-group">
                                            <label>โฟลเดอร์ผลลัพธ์</label>
                                            <input className="form-input" value={rarOutputDir}
                                                onChange={e => setRarOutputDir(e.target.value)} style={{ fontSize: 13 }} />
                                        </div>
                                        <button className="btn-accent" style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }}
                                            onClick={handleExtract} disabled={rarExtracting}>
                                            {rarExtracting ? <><span className="loading-spinner"></span> กำลังแตกไฟล์...</> : '📦 แตกไฟล์ทันที'}
                                        </button>
                                        {rarResult && (
                                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 14 }}>
                                                <div style={{ fontWeight: 600, marginBottom: 8, color: '#16a34a', fontSize: 13 }}>✅ {rarResult.message}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>📂 {rarResult.outputDir}</div>
                                                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 8 }}>👆 คลิกที่ไฟล์เพื่อพรีวิวด้านขวา</div>
                                                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                                    {rarResult.files?.map((f, i) => {
                                                        const ext = f.split('.').pop().toLowerCase()
                                                        const isPreviewable = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'pdf'].includes(ext)
                                                        const icon = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext) ? '🖼️' : ext === 'pdf' ? '📄' : '📎'
                                                        const fileName = f.split(/[\\/]/).pop()
                                                        const isActive = rarPreviewFile?.name === fileName
                                                        return (
                                                            <div key={i}
                                                                onClick={() => isPreviewable && setRarPreviewFile({ name: fileName, fullPath: (rarResult.outputDir + '\\' + f).replace(/\//g, '\\') })}
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
                                            <button className="btn-sm" onClick={() => { setRarFile(null); setRarResult(null); setRarPreviewFile(null) }}>ยกเลิก</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right: inline preview panel */}
                        {rarPreviewFile && (
                            <FilePreviewPanel file={rarPreviewFile} onClose={() => setRarPreviewFile(null)} />
                        )}
                    </div>
                )}

                {/* ═══════ MERGE PDF TAB ═══════ */}
                {activeTab === 'merge' && (
                    <div className="animate-in" style={{ maxWidth: 700 }}>
                        {currentPath && (
                            <div className="card" style={{ marginBottom: 20 }}>
                                <div className="card-header">
                                    <h3>📑 เลือกไฟล์ PDF ที่จะรวม</h3>
                                    {files.length > 0 && (
                                        <button className="btn-sm" onClick={selectAllMerge} style={{ fontSize: 11 }}>
                                            {mergeSelectedFiles.length === files.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                                        </button>
                                    )}
                                </div>
                                <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                                    {files.map(f => {
                                        const isSelected = mergeSelectedFiles.find(s => s.path === f.path)
                                        return (
                                            <div key={f.path}
                                                className={`file-list-item ${isSelected ? 'selected' : ''}`}
                                                onClick={() => toggleMergeFile(f)}>
                                                <div className="file-icon">📄</div>
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
                                    {files.length === 0 && !loading && <p style={{ padding: 20, textAlign: 'center', color: '#999' }}>ไม่พบไฟล์ PDF</p>}
                                </div>
                            </div>
                        )}
                        {mergeSelectedFiles.length > 0 && (
                            <div className="card">
                                <div className="card-header"><h3>📋 ลำดับการรวมไฟล์ ({mergeSelectedFiles.length} ไฟล์)</h3></div>
                                <div style={{ padding: '12px 16px' }}>
                                    {mergeSelectedFiles.map((f, idx) => (
                                        <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: idx % 2 === 0 ? '#f9fafb' : '#fff', borderRadius: 6, marginBottom: 4 }}>
                                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', minWidth: 24 }}>{idx + 1}.</span>
                                            <span style={{ fontSize: 12, flex: 1 }}>{f.name}</span>
                                            <button className="btn-sm btn-ghost" onClick={() => moveMergeFile(idx, -1)} disabled={idx === 0} style={{ fontSize: 10, padding: '2px 6px' }}>▲</button>
                                            <button className="btn-sm btn-ghost" onClick={() => moveMergeFile(idx, 1)} disabled={idx === mergeSelectedFiles.length - 1} style={{ fontSize: 10, padding: '2px 6px' }}>▼</button>
                                            <button className="btn-sm btn-ghost" onClick={() => setMergeSelectedFiles(prev => prev.filter(x => x.path !== f.path))} style={{ fontSize: 10, padding: '2px 6px', color: '#ef4444' }}>✕</button>
                                        </div>
                                    ))}
                                </div>
                                <div className="card-body">
                                    <div className="form-group">
                                        <label>ชื่อไฟล์ผลลัพธ์</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <input className="form-input" value={mergeOutputName} onChange={e => setMergeOutputName(e.target.value)} style={{ fontSize: 13 }} />
                                            <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>.pdf</span>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>โฟลเดอร์ผลลัพธ์</label>
                                        <input className="form-input" value={mergeOutputDir} onChange={e => setMergeOutputDir(e.target.value)} style={{ fontSize: 13 }} />
                                    </div>
                                    <button className="btn-accent" style={{ width: '100%', justifyContent: 'center' }}
                                        onClick={handleMergePdf} disabled={merging || mergeSelectedFiles.length < 2}>
                                        {merging ? <><span className="loading-spinner"></span> กำลังรวม...</> : `📑 รวม ${mergeSelectedFiles.length} ไฟล์ทันที`}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════ PDF TO IMAGE TAB ═══════ */}
                {activeTab === 'pdfimg' && (
                    <div className="animate-in" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                        {/* ── Left column: file list + settings ── */}
                        <div style={{ flex: 1, minWidth: 0, maxWidth: pdfImgPreviewFile ? '55%' : 700 }}>
                            {currentPath && (
                                <div className="card" style={{ marginBottom: 20 }}>
                                    <div className="card-header"><h3>📄 เลือกไฟล์ PDF ที่จะแปลงเป็นรูป</h3></div>
                                    <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                                        {files.map(f => (
                                            <div key={f.path}
                                                className={`file-list-item ${pdfImgFile?.path === f.path ? 'selected' : ''}`}
                                                onClick={() => { setPdfImgFile(f); setPdfImgResult(null); setPdfImgPreviewFile({ name: f.name, fullPath: f.path }); setPdfImgOutputName(f.name.replace(/\.pdf$/i, '')) }}>
                                                <div className="file-icon">📄</div>
                                                <div className="file-info">
                                                    <div className="file-name">{f.name}</div>
                                                    <div className="file-meta">{formatSize(f.size)}</div>
                                                </div>
                                                <button className="btn-sm btn-ghost" title="พรีวิว" onClick={e => { e.stopPropagation(); setPdfImgPreviewFile({ name: f.name, fullPath: f.path }) }} style={{ fontSize: 12, padding: '2px 6px', flexShrink: 0, background: pdfImgPreviewFile?.fullPath === f.path ? 'var(--accent)' : undefined, color: pdfImgPreviewFile?.fullPath === f.path ? '#fff' : undefined, borderRadius: 4 }}>🔍</button>
                                            </div>
                                        ))}
                                        {files.length === 0 && !loading && <p style={{ padding: 20, textAlign: 'center', color: '#999' }}>ไม่พบไฟล์ PDF</p>}
                                    </div>
                                </div>
                            )}
                            {pdfImgFile && (
                                <div className="card">
                                    <div className="card-header"><h3>🖼️ แปลง: {pdfImgFile.name}</h3></div>
                                    <div className="card-body">
                                        <div className="form-group">
                                            <label>รูปแบบผลลัพธ์</label>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <div className={`radio-option ${pdfImgFormat === 'jpg' ? 'active' : ''}`}
                                                    onClick={() => setPdfImgFormat('jpg')} style={{ flex: 1 }}>
                                                    <div className="radio-dot"></div> JPG
                                                </div>
                                                <div className={`radio-option ${pdfImgFormat === 'png' ? 'active' : ''}`}
                                                    onClick={() => setPdfImgFormat('png')} style={{ flex: 1 }}>
                                                    <div className="radio-dot"></div> PNG
                                                </div>
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label>คุณภาพ: {pdfImgQuality}%</label>
                                            <input type="range" min="10" max="100" step="5" value={pdfImgQuality}
                                                onChange={e => setPdfImgQuality(Number(e.target.value))}
                                                style={{ width: '100%', accentColor: 'var(--accent)' }} />
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)' }}>
                                                <span>ไฟล์เล็ก</span><span>คุณภาพสูง</span>
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label>ความละเอียด (DPI): {pdfImgDpi}</label>
                                            <input type="range" min="72" max="300" step="1" value={pdfImgDpi}
                                                onChange={e => setPdfImgDpi(Number(e.target.value))}
                                                style={{ width: '100%', accentColor: 'var(--accent)' }} />
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary)' }}>
                                                <span>72 (เร็ว)</span><span>150 (ปกติ)</span><span>300 (คมชัด)</span>
                                            </div>
                                        </div>

                                        {/* ── ตารางสรุปคำแนะนำ ── */}
                                        <div style={{
                                            background: 'linear-gradient(135deg, #fff7ed, #fef3c7)',
                                            border: '1px solid #fed7aa',
                                            borderRadius: 10,
                                            padding: '12px 14px',
                                            marginBottom: 12
                                        }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: '#ea580c', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                💡 คำแนะนำการตั้งค่า
                                            </div>
                                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '1px solid #fed7aa' }}>
                                                        <th style={{ textAlign: 'left', padding: '4px 6px', color: '#9a3412', fontWeight: 600 }}>การใช้งาน</th>
                                                        <th style={{ textAlign: 'center', padding: '4px 6px', color: '#9a3412', fontWeight: 600 }}>คุณภาพ</th>
                                                        <th style={{ textAlign: 'center', padding: '4px 6px', color: '#9a3412', fontWeight: 600 }}>DPI</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr>
                                                        <td style={{ padding: '3px 6px', color: '#78350f' }}>📱 ดูบนจอ / ส่งไลน์</td>
                                                        <td style={{ padding: '3px 6px', textAlign: 'center', color: '#78350f' }}>85-90%</td>
                                                        <td style={{ padding: '3px 6px', textAlign: 'center', color: '#78350f' }}>150</td>
                                                    </tr>
                                                    <tr style={{ background: 'rgba(255,255,255,0.5)' }}>
                                                        <td style={{ padding: '3px 6px', color: '#78350f' }}>📄 เอกสารทั่วไป</td>
                                                        <td style={{ padding: '3px 6px', textAlign: 'center', color: '#78350f' }}>90%</td>
                                                        <td style={{ padding: '3px 6px', textAlign: 'center', color: '#78350f' }}>150-200</td>
                                                    </tr>
                                                    <tr>
                                                        <td style={{ padding: '3px 6px', color: '#78350f' }}>🖨️ งานพิมพ์ / OCR</td>
                                                        <td style={{ padding: '3px 6px', textAlign: 'center', color: '#78350f' }}>95-100%</td>
                                                        <td style={{ padding: '3px 6px', textAlign: 'center', color: '#78350f' }}>300</td>
                                                    </tr>
                                                    <tr style={{ background: 'rgba(255,255,255,0.5)' }}>
                                                        <td style={{ padding: '3px 6px', color: '#78350f' }}>💎 เก็บถาวรคุณภาพสูง</td>
                                                        <td style={{ padding: '3px 6px', textAlign: 'center', color: '#78350f' }}>100%</td>
                                                        <td style={{ padding: '3px 6px', textAlign: 'center', color: '#78350f' }}>300</td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                            <div style={{ fontSize: 10, color: '#b45309', marginTop: 6, fontStyle: 'italic' }}>
                                                ⚠️ DPI สูง = ภาพคมชัดขึ้น แต่ไฟล์ใหญ่ขึ้นและใช้เวลาแปลงนานขึ้น
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label>ชื่อไฟล์ผลลัพธ์</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <input className="form-input" value={pdfImgOutputName}
                                                    onChange={e => setPdfImgOutputName(e.target.value)}
                                                    placeholder={pdfImgFile ? pdfImgFile.name.replace(/\.pdf$/i, '') : 'ชื่อไฟล์'}
                                                    style={{ fontSize: 13 }} />
                                                <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>_page1.{pdfImgFormat}</span>
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                                                ตัวอย่าง: {pdfImgOutputName || 'filename'}_page1.{pdfImgFormat}, {pdfImgOutputName || 'filename'}_page2.{pdfImgFormat}, ...
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label>โฟลเดอร์ผลลัพธ์</label>
                                            <input className="form-input" value={pdfImgOutputDir}
                                                onChange={e => setPdfImgOutputDir(e.target.value)} style={{ fontSize: 13 }} />
                                        </div>
                                        <button className="btn-accent" style={{ width: '100%', justifyContent: 'center' }}
                                            onClick={handlePdfToImage} disabled={pdfImgConverting}>
                                            {pdfImgConverting ? <><span className="loading-spinner"></span> กำลังแปลง...</> : `🖼️ แปลงเป็น ${pdfImgFormat.toUpperCase()} ทันที`}
                                        </button>
                                        {pdfImgResult && (
                                            <div style={{ marginTop: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 14 }}>
                                                <div style={{ fontWeight: 600, marginBottom: 8, color: '#16a34a', fontSize: 13 }}>✅ {pdfImgResult.message}</div>
                                                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                                    {pdfImgResult.outputFiles?.map((f, i) => (
                                                        <div key={i} style={{ padding: '4px 8px', fontSize: 12, color: '#374151' }}>
                                                            🖼️ {f.name}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Right column: PDF Preview Panel ── */}
                        {pdfImgPreviewFile && (
                            <div style={{ width: '45%', flexShrink: 0 }}>
                                <FilePreviewPanel file={pdfImgPreviewFile} onClose={() => setPdfImgPreviewFile(null)} />
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════ ZIP TAB ═══════ */}
                {activeTab === 'zip' && (
                    <div className="animate-in" style={{ maxWidth: 700 }}>
                        {currentPath && (
                            <div className="card" style={{ marginBottom: 20 }}>
                                <div className="card-header">
                                    <h3>🗜️ เลือกไฟล์ที่จะรวมเป็น ZIP</h3>
                                    {files.length > 0 && (
                                        <button className="btn-sm" onClick={selectAllZip} style={{ fontSize: 11 }}>
                                            {zipSelectedFiles.length === files.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                                        </button>
                                    )}
                                </div>
                                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                    {files.map(f => {
                                        const isSelected = zipSelectedFiles.find(s => s.path === f.path)
                                        const ext = f.name.split('.').pop().toLowerCase()
                                        const icon = ext === 'pdf' ? '📄' : ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? '🖼️' : ext === 'xlsx' ? '📊' : '📎'
                                        return (
                                            <div key={f.path}
                                                className={`file-list-item ${isSelected ? 'selected' : ''}`}
                                                onClick={() => toggleZipFile(f)}>
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
                        )}
                        {zipSelectedFiles.length > 0 && (
                            <div className="card">
                                <div className="card-header"><h3>🗜️ สร้างไฟล์ ZIP ({zipSelectedFiles.length} ไฟล์)</h3></div>
                                <div className="card-body">
                                    <div className="form-group">
                                        <label>ชื่อไฟล์ ZIP</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <input className="form-input" value={zipOutputName} onChange={e => setZipOutputName(e.target.value)} style={{ fontSize: 13 }} />
                                            <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>.zip</span>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>โฟลเดอร์ผลลัพธ์</label>
                                        <input className="form-input" value={zipOutputDir} onChange={e => setZipOutputDir(e.target.value)} style={{ fontSize: 13 }} />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--accent-light)', borderRadius: 10, marginBottom: 18 }}>
                                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>ไฟล์ที่เลือก</span>
                                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{zipSelectedFiles.length} ไฟล์</span>
                                    </div>
                                    <button className="btn-accent" style={{ width: '100%', justifyContent: 'center' }}
                                        onClick={handleCreateZip} disabled={zipping}>
                                        {zipping ? <><span className="loading-spinner"></span> กำลังสร้าง ZIP...</> : `🗜️ สร้างไฟล์ ZIP ทันที`}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════ EXCEL UNLOCK TAB ═══════ */}
                {activeTab === 'excel' && (
                    <div className="animate-in" style={{ maxWidth: 600 }}>
                        {currentPath && (
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
                        )}
                        {excelFile && (
                            <div className="card">
                                <div className="card-header"><h3>🔓 ปลดล็อค: {excelFile.name}</h3></div>
                                <div className="card-body">
                                    <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fed7aa', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#92400e' }}>
                                        ⚠️ รองรับเฉพาะไฟล์ <b>.xlsx</b> เท่านั้น — กรอกรหัสผ่านที่ถูกต้องเพียงครั้งเดียว ระบบจะบันทึกไฟล์ใหม่โดยไม่มีรหัสผ่าน
                                    </div>
                                    <div className="form-group">
                                        <label>🔑 รหัสผ่านเอกสาร</label>
                                        <input type="password" className="form-input" value={excelPassword}
                                            onChange={e => setExcelPassword(e.target.value)} placeholder="กรอกรหัสผ่าน Excel" />
                                    </div>
                                    <div className="form-group">
                                        <label>โฟลเดอร์ผลลัพธ์</label>
                                        <input className="form-input" value={excelOutputDir}
                                            onChange={e => setExcelOutputDir(e.target.value)} style={{ fontSize: 13 }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: 10 }}>
                                        <button className="btn-accent" style={{ flex: 1, justifyContent: 'center' }}
                                            onClick={handleUnlockExcel} disabled={excelUnlocking || !excelPassword}>
                                            {excelUnlocking ? <><span className="loading-spinner"></span> กำลังปลดล็อค...</> : '🔓 ปลดล็อค Excel'}
                                        </button>
                                        <button className="btn-sm" onClick={() => { setExcelFile(null); setExcelPassword('') }}>ยกเลิก</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════ IMAGE TO PDF TAB ═══════ */}
                {activeTab === 'imgpdf' && (
                    <div className="animate-in" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                        {/* ── Left column: files + settings ── */}
                        <div style={{ flex: 1, minWidth: 0, maxWidth: imgPdfPreviewFile ? '55%' : 800 }}>
                            {/* File selection from folder browser */}
                            {currentPath && files.length > 0 && (
                                <div className="card" style={{ marginBottom: 20 }}>
                                    <div className="card-header">
                                        <h3>🖼️ หรือเลือกรูปภาพจากโฟลเดอร์</h3>
                                        {files.length > 0 && (
                                            <button className="btn-sm" onClick={selectAllImgPdf} style={{ fontSize: 11 }}>
                                                {imgPdfFiles.filter(f => !f.fromDrop).length === files.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                                            </button>
                                        )}
                                    </div>
                                    <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                                        {files.map(f => {
                                            const isSelected = imgPdfFiles.find(s => s.path === f.path)
                                            return (
                                                <div key={f.path}
                                                    className={`file-list-item ${isSelected ? 'selected' : ''}`}
                                                    onClick={() => { toggleImgPdfFile(f); setImgPdfPreviewFile({ name: f.name, fullPath: f.path }) }}>
                                                    <div className="file-icon" style={{ background: '#fef3c7', color: '#d97706' }}>🖼️</div>
                                                    <div className="file-info">
                                                        <div className="file-name">{f.name}</div>
                                                        <div className="file-meta">{formatSize(f.size)}</div>
                                                    </div>
                                                    <button className="btn-sm btn-ghost" title="พรีวิว" onClick={e => { e.stopPropagation(); setImgPdfPreviewFile({ name: f.name, fullPath: f.path }) }} style={{ fontSize: 12, padding: '2px 6px', flexShrink: 0 }}>🔍</button>
                                                    <div style={{ width: 22, height: 22, borderRadius: 6, border: isSelected ? '2px solid var(--accent)' : '2px solid #ddd', background: isSelected ? 'var(--accent)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                                                        {isSelected ? '✓' : ''}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                        {files.length === 0 && !loading && <p style={{ padding: 20, textAlign: 'center', color: '#999' }}>ไม่พบไฟล์รูปภาพในโฟลเดอร์นี้</p>}
                                    </div>
                                </div>
                            )}

                            {/* Selected files queue + settings */}
                            {imgPdfFiles.length > 0 && (
                                <div className="card">
                                    <div className="card-header">
                                        <h3>📋 ลำดับรูปภาพ ({imgPdfFiles.length} ไฟล์)</h3>
                                        <button className="btn-sm" onClick={() => { setImgPdfFiles([]); setImgPdfResult(null); setImgPdfPreviewFile(null) }} style={{ fontSize: 11, color: '#ef4444' }}>🗑️ ล้างทั้งหมด</button>
                                    </div>
                                    <div style={{ padding: '12px 16px', maxHeight: 250, overflowY: 'auto' }}>
                                        {imgPdfFiles.map((f, idx) => (
                                            <div key={f.path + idx} onClick={() => { const previewObj = { name: f.name, fullPath: f.path }; if (f.fromDrop && f.fileObj && !f.path) previewObj.objectUrl = URL.createObjectURL(f.fileObj); setImgPdfPreviewFile(previewObj) }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: imgPdfPreviewFile?.fullPath === f.path ? '#fff7ed' : idx % 2 === 0 ? '#f9fafb' : '#fff', borderRadius: 6, marginBottom: 4, border: imgPdfPreviewFile?.fullPath === f.path ? '1px solid var(--accent)' : '1px solid transparent', transition: 'all .15s ease', cursor: 'pointer' }}>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', minWidth: 24 }}>{idx + 1}.</span>
                                                <span style={{ fontSize: 14, marginRight: 4 }}>🖼️</span>
                                                <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                                <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>{formatSize(f.size)}</span>
                                                {f.fromDrop && <span style={{ fontSize: 9, background: '#dbeafe', color: '#2563eb', padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>ลาก</span>}
                                                <button className="btn-sm btn-ghost" title="พรีวิว" onClick={() => { const previewObj = { name: f.name, fullPath: f.path }; if (f.fromDrop && f.fileObj && !f.path) previewObj.objectUrl = URL.createObjectURL(f.fileObj); setImgPdfPreviewFile(previewObj) }} style={{ fontSize: 12, padding: '2px 6px', flexShrink: 0, background: imgPdfPreviewFile?.fullPath === f.path && imgPdfPreviewFile?.name === f.name ? 'var(--accent)' : undefined, color: imgPdfPreviewFile?.fullPath === f.path && imgPdfPreviewFile?.name === f.name ? '#fff' : undefined, borderRadius: 4 }}>🔍</button>
                                                <button className="btn-sm btn-ghost" onClick={() => moveImgPdfFile(idx, -1)} disabled={idx === 0} style={{ fontSize: 10, padding: '2px 6px' }}>▲</button>
                                                <button className="btn-sm btn-ghost" onClick={() => moveImgPdfFile(idx, 1)} disabled={idx === imgPdfFiles.length - 1} style={{ fontSize: 10, padding: '2px 6px' }}>▼</button>
                                                <button className="btn-sm btn-ghost" onClick={() => { setImgPdfFiles(prev => prev.filter((_, i) => i !== idx)); if (imgPdfPreviewFile?.fullPath === f.path) setImgPdfPreviewFile(null) }} style={{ fontSize: 10, padding: '2px 6px', color: '#ef4444' }}>✕</button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="card-body">
                                        <div className="form-group">
                                            <label>ขนาดหน้า PDF</label>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                {['A4', 'Letter', 'Original'].map(sz => (
                                                    <div key={sz}
                                                        className={`radio-option ${imgPdfPageSize === sz ? 'active' : ''}`}
                                                        onClick={() => setImgPdfPageSize(sz)} style={{ flex: 1 }}>
                                                        <div className="radio-dot"></div>
                                                        <div>
                                                            <div style={{ fontWeight: 600 }}>{sz}</div>
                                                            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>
                                                                {sz === 'A4' ? '210 × 297 mm' : sz === 'Letter' ? '8.5 × 11 in' : 'ขนาดรูปจริง'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label>ชื่อไฟล์ PDF</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <input className="form-input" value={imgPdfOutputName} onChange={e => setImgPdfOutputName(e.target.value)} style={{ fontSize: 13 }} />
                                                <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>.pdf</span>
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label>โฟลเดอร์ผลลัพธ์</label>
                                            <input className="form-input" value={imgPdfOutputDir || currentPath}
                                                onChange={e => setImgPdfOutputDir(e.target.value)} style={{ fontSize: 13 }} />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--accent-light)', borderRadius: 10, marginBottom: 18 }}>
                                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>รูปภาพที่เลือก</span>
                                            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{imgPdfFiles.length} ไฟล์</span>
                                        </div>
                                        <button className="btn-accent" style={{ width: '100%', justifyContent: 'center' }}
                                            onClick={handleImageToPdf} disabled={imgPdfConverting || imgPdfFiles.length === 0}>
                                            {imgPdfConverting ? <><span className="loading-spinner"></span> กำลังสร้าง PDF...</> : `📸 สร้าง PDF จาก ${imgPdfFiles.length} รูป`}
                                        </button>
                                        {imgPdfResult && (
                                            <div style={{ marginTop: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 14 }}>
                                                <div style={{ fontWeight: 600, marginBottom: 4, color: '#16a34a', fontSize: 13 }}>✅ {imgPdfResult.message}</div>
                                                <div style={{ fontSize: 11, color: '#374151' }}>📄 {imgPdfResult.outputName} · {imgPdfResult.pageCount} หน้า</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Right column: Image Preview Panel ── */}
                        {imgPdfPreviewFile && (
                            <div style={{ width: '45%', flexShrink: 0 }}>
                                <FilePreviewPanel file={imgPdfPreviewFile} onClose={() => setImgPdfPreviewFile(null)} />
                            </div>
                        )}
                    </div>
                )}

                {/* PDF Page Lightbox */}
                {previewPage && pdfDoc && (
                    <PageLightbox
                        pdfDoc={pdfDoc}
                        pageNum={previewPage}
                        totalPages={splitInfo?.pageCount || 1}
                        onClose={() => setPreviewPage(null)}
                        onPrev={() => setPreviewPage(p => Math.max(1, p - 1))}
                        onNext={() => setPreviewPage(p => Math.min(splitInfo?.pageCount || 1, p + 1))}
                    />
                )}
            </main>
        </div>
    )
}
