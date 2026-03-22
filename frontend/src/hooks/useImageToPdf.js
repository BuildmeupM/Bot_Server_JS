import { useState, useRef } from 'react'
import { imageToPdf, logUsage } from '../services/api'
import { IMAGE_EXTENSIONS } from '../pages/docsort/tools/constants'
import toast from 'react-hot-toast'

export default function useImageToPdf(currentPath, loadFiles) {
    const [files, setFiles] = useState([])
    const [outputDir, setOutputDir] = useState(currentPath || '')
    const [outputName, setOutputName] = useState('images')
    const [pageSize, setPageSize] = useState('A4')
    const [converting, setConverting] = useState(false)
    const [result, setResult] = useState(null)
    const [dragOver, setDragOver] = useState(false)
    const dropRef = useRef(null)
    const [previewFile, setPreviewFile] = useState(null)

    const toggleFile = (file) => {
        setFiles(prev => {
            const exists = prev.find(f => f.path === file.path)
            if (exists) return prev.filter(f => f.path !== file.path)
            return [...prev, file]
        })
    }
    const selectAll = (allFiles) => {
        if (files.length === allFiles.length) setFiles([])
        else setFiles([...allFiles])
    }
    const moveFile = (idx, dir) => {
        setFiles(prev => {
            const arr = [...prev]
            const newIdx = idx + dir
            if (newIdx < 0 || newIdx >= arr.length) return arr
            ;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
            return arr
        })
    }
    const handleDrop = (e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)
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
            path: f.path,
            size: f.size,
            fromDrop: true,
            fileObj: f,
        }))
        setFiles(prev => {
            const existingPaths = new Set(prev.map(p => p.path))
            const unique = newFiles.filter(f => !existingPaths.has(f.path))
            return [...prev, ...unique]
        })
        toast.success(`เพิ่ม ${imageFiles.length} รูปภาพ`)
    }
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false) }

    const handleConvert = async () => {
        if (files.length === 0) return
        setConverting(true)
        setResult(null)
        try {
            const res = await imageToPdf({
                filePaths: files.map(f => f.path),
                outputDir: outputDir || currentPath,
                outputName: outputName || 'images',
                pageSize,
            })
            toast.success(res.data.message)
            logUsage({ page: 'tools', path_used: currentPath, action: 'image_to_pdf' })
            setResult(res.data)
            if (res.data.errors?.length > 0) {
                res.data.errors.forEach(e => toast.error(`${e.file}: ${e.error}`))
            }
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาดในการแปลงรูปเป็น PDF')
        } finally { setConverting(false) }
    }

    return {
        files, setFiles, outputDir, setOutputDir, outputName, setOutputName,
        pageSize, setPageSize, converting, result, setResult,
        dragOver, dropRef, previewFile, setPreviewFile,
        toggleFile, selectAll, moveFile,
        handleDrop, handleDragOver, handleDragLeave, handleConvert,
    }
}
