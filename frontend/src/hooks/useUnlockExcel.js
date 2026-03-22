import { useState } from 'react'
import { unlockExcel, logUsage } from '../services/api'
import toast from 'react-hot-toast'

export default function useUnlockExcel(currentPath, loadFiles) {
    const [file, setFile] = useState(null)
    const [password, setPassword] = useState('')
    const [outputDir, setOutputDir] = useState(currentPath || '')
    const [unlocking, setUnlocking] = useState(false)

    const handleUnlock = async () => {
        if (!file || !password) return
        setUnlocking(true)
        try {
            const res = await unlockExcel({ filePath: file.path, password, outputDir })
            toast.success(res.data.message)
            logUsage({ page: 'tools', path_used: currentPath, action: 'unlock_excel' })
            setPassword('')
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        } finally { setUnlocking(false) }
    }

    return { file, setFile, password, setPassword, outputDir, setOutputDir, unlocking, handleUnlock }
}
