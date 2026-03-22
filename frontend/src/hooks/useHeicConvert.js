import { useState } from 'react'
import { convertHeic, convertHeicBatch, logUsage } from '../services/api'
import toast from 'react-hot-toast'

export default function useHeicConvert(currentPath, loadFiles) {
    const [selectedFiles, setSelectedFiles] = useState([])
    const [outputDir, setOutputDir] = useState(currentPath || '')
    const [format, setFormat] = useState('jpg')
    const [quality, setQuality] = useState(90)
    const [converting, setConverting] = useState(false)

    const toggleFile = (file) => {
        setSelectedFiles(prev => {
            const exists = prev.find(f => f.path === file.path)
            if (exists) return prev.filter(f => f.path !== file.path)
            return [...prev, file]
        })
    }
    const selectAll = (files) => {
        if (selectedFiles.length === files.length) setSelectedFiles([])
        else setSelectedFiles([...files])
    }
    const handleConvert = async () => {
        if (selectedFiles.length === 0) return
        setConverting(true)
        try {
            if (selectedFiles.length === 1) {
                const res = await convertHeic({ filePath: selectedFiles[0].path, outputDir, outputFormat: format, quality })
                toast.success(res.data.message)
                logUsage({ page: 'tools', path_used: currentPath, action: 'convert_heic' })
            } else {
                const res = await convertHeicBatch({ filePaths: selectedFiles.map(f => f.path), outputDir, outputFormat: format, quality })
                toast.success(res.data.message)
                logUsage({ page: 'tools', path_used: currentPath, action: 'convert_heic_batch' })
                if (res.data.errors?.length > 0) res.data.errors.forEach(e => toast.error(`${e.file}: ${e.error}`))
            }
            setSelectedFiles([])
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาดในการแปลง')
        } finally { setConverting(false) }
    }

    return { selectedFiles, setSelectedFiles, outputDir, setOutputDir, format, setFormat, quality, setQuality, converting, toggleFile, selectAll, handleConvert }
}
