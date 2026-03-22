import { useState } from 'react'
import { mergePdf, logUsage } from '../services/api'
import toast from 'react-hot-toast'

export default function useMergePdf(currentPath, loadFiles) {
    const [selectedFiles, setSelectedFiles] = useState([])
    const [outputDir, setOutputDir] = useState(currentPath || '')
    const [outputName, setOutputName] = useState('merged')
    const [merging, setMerging] = useState(false)

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
    const moveFile = (idx, dir) => {
        setSelectedFiles(prev => {
            const arr = [...prev]
            const newIdx = idx + dir
            if (newIdx < 0 || newIdx >= arr.length) return arr
            ;[arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]]
            return arr
        })
    }
    const handleMerge = async () => {
        if (selectedFiles.length < 2) return
        setMerging(true)
        try {
            const res = await mergePdf({ filePaths: selectedFiles.map(f => f.path), outputDir, outputName })
            toast.success(res.data.message)
            logUsage({ page: 'tools', path_used: currentPath, action: 'merge_pdf' })
            setSelectedFiles([])
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        } finally { setMerging(false) }
    }

    return { selectedFiles, setSelectedFiles, outputDir, setOutputDir, outputName, setOutputName, merging, toggleFile, selectAll, moveFile, handleMerge }
}
