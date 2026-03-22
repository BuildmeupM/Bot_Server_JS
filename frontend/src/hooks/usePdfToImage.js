import { useState } from 'react'
import { pdfToImage, logUsage } from '../services/api'
import toast from 'react-hot-toast'

export default function usePdfToImage(currentPath, loadFiles) {
    const [file, setFile] = useState(null)
    const [outputDir, setOutputDir] = useState(currentPath || '')
    const [format, setFormat] = useState('jpg')
    const [quality, setQuality] = useState(90)
    const [dpi, setDpi] = useState(150)
    const [converting, setConverting] = useState(false)
    const [result, setResult] = useState(null)
    const [outputName, setOutputName] = useState('')
    const [previewFile, setPreviewFile] = useState(null)

    const handleConvert = async () => {
        if (!file) return
        setConverting(true)
        setResult(null)
        try {
            const res = await pdfToImage({ filePath: file.path, outputDir, outputFormat: format, quality, dpi, outputBaseName: outputName || undefined })
            toast.success(res.data.message)
            logUsage({ page: 'tools', path_used: currentPath, action: 'pdf_to_image' })
            setResult(res.data)
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        } finally { setConverting(false) }
    }

    return { file, setFile, outputDir, setOutputDir, format, setFormat, quality, setQuality, dpi, setDpi, converting, result, setResult, outputName, setOutputName, previewFile, setPreviewFile, handleConvert }
}
