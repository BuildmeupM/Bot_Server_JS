import { useState, useCallback } from 'react'
import { getPdfInfo, splitPdf, getPreviewUrl, logUsage } from '../services/api'
import { pdfjsLib, CHUNK_COLORS } from '../pages/docsort/tools/constants'
import toast from 'react-hot-toast'

export default function useSplitPdf(currentPath, loadFiles) {
    const [splitFile, setSplitFile] = useState(null)
    const [splitInfo, setSplitInfo] = useState(null)
    const [selectedPages, setSelectedPages] = useState([])
    const [splitMode, setSplitMode] = useState('all')
    const [pageRange, setPageRange] = useState('')
    const [splitPattern, setSplitPattern] = useState('')
    const [outputDir, setOutputDir] = useState('')
    const [splitting, setSplitting] = useState(false)
    const [createSubfolder, setCreateSubfolder] = useState(true)
    const [pageChunkMap, setPageChunkMap] = useState({})
    const [activeChunkIdx, setActiveChunkIdx] = useState(0)
    const [chunkCount, setChunkCount] = useState(2)
    const [pdfDoc, setPdfDoc] = useState(null)
    const [previewPage, setPreviewPage] = useState(null)
    const [thumbsPerPage, setThumbsPerPage] = useState(10)
    const [thumbPage, setThumbPage] = useState(0)

    // Sync outputDir with currentPath
    if (currentPath && !outputDir) setOutputDir(currentPath)

    const handleSelectSplitFile = useCallback(async (file) => {
        setSplitFile(file)
        setSplitPattern(file.name.replace('.pdf', '') + '_page{page}')
        setSelectedPages([])
        setPdfDoc(null)
        try {
            const res = await getPdfInfo(file.path)
            setSplitInfo(res.data)
            const url = getPreviewUrl(file.path)
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
        if (selectedPages.length === splitInfo.pageCount) setSelectedPages([])
        else setSelectedPages(Array.from({ length: splitInfo.pageCount }, (_, i) => i + 1))
    }

    const togglePageChunk = (pageNum) => {
        setPageChunkMap(prev => {
            const copy = { ...prev }
            if (copy[pageNum] === activeChunkIdx) delete copy[pageNum]
            else copy[pageNum] = activeChunkIdx
            return copy
        })
    }

    const addChunkSlot = () => setChunkCount(c => Math.min(c + 1, CHUNK_COLORS.length))
    const removeChunkSlot = () => {
        if (chunkCount <= 2) return
        setPageChunkMap(prev => {
            const copy = { ...prev }
            Object.keys(copy).forEach(k => { if (copy[k] === chunkCount - 1) delete copy[k] })
            return copy
        })
        if (activeChunkIdx >= chunkCount - 1) setActiveChunkIdx(chunkCount - 2)
        setChunkCount(c => c - 1)
    }

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
                splitMode,
                createSubfolder: splitMode === 'all' ? createSubfolder : false
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

    const isSplitDisabled = splitting ||
        (splitMode === 'chunks' && buildChunksFromMap().length === 0) ||
        (splitMode === 'selected' && selectedPages.length === 0) ||
        (splitMode === 'range' && !pageRange.trim())

    return {
        splitFile, splitInfo, selectedPages, splitMode, setSplitMode,
        pageRange, setPageRange, splitPattern, setSplitPattern,
        outputDir, setOutputDir, splitting, createSubfolder, setCreateSubfolder,
        pageChunkMap, activeChunkIdx, setActiveChunkIdx, chunkCount,
        pdfDoc, previewPage, setPreviewPage, thumbsPerPage, setThumbsPerPage,
        thumbPage, setThumbPage,
        handleSelectSplitFile, togglePage, selectAllPages,
        togglePageChunk, addChunkSlot, removeChunkSlot,
        buildChunksFromMap, getChunkPageCount, getOutputCount,
        handleSplit, isSplitDisabled,
    }
}
