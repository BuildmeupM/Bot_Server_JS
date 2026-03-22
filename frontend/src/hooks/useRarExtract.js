import { useState } from 'react'
import { extractArchive, logUsage } from '../services/api'
import toast from 'react-hot-toast'

export default function useRarExtract(currentPath, loadFiles) {
    const [file, setFile] = useState(null)
    const [outputDir, setOutputDir] = useState(currentPath || '')
    const [extracting, setExtracting] = useState(false)
    const [result, setResult] = useState(null)
    const [previewFile, setPreviewFile] = useState(null)

    const handleExtract = async () => {
        if (!file) return
        setExtracting(true)
        setResult(null)
        try {
            const res = await extractArchive({ filePath: file.path, outputDir })
            toast.success(res.data.message)
            logUsage({ page: 'tools', path_used: currentPath, action: 'extract_archive' })
            setResult(res.data)
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาดในการแตกไฟล์')
        } finally { setExtracting(false) }
    }

    return { file, setFile, outputDir, setOutputDir, extracting, result, setResult, previewFile, setPreviewFile, handleExtract }
}
