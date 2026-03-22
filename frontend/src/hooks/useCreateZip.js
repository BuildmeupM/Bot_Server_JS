import { useState } from 'react'
import { createZip, logUsage } from '../services/api'
import toast from 'react-hot-toast'

export default function useCreateZip(currentPath, loadFiles) {
    const [selectedFiles, setSelectedFiles] = useState([])
    const [outputDir, setOutputDir] = useState(currentPath || '')
    const [outputName, setOutputName] = useState('archive')
    const [zipping, setZipping] = useState(false)

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
    const handleCreateZip = async () => {
        if (selectedFiles.length === 0) return
        setZipping(true)
        try {
            const res = await createZip({ filePaths: selectedFiles.map(f => f.path), outputDir, outputName })
            toast.success(res.data.message)
            logUsage({ page: 'tools', path_used: currentPath, action: 'create_zip' })
            setSelectedFiles([])
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        } finally { setZipping(false) }
    }

    return { selectedFiles, setSelectedFiles, outputDir, setOutputDir, outputName, setOutputName, zipping, toggleFile, selectAll, handleCreateZip }
}
