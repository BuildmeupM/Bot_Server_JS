import { useState } from 'react'
import { unlockPdf, logUsage } from '../services/api'
import toast from 'react-hot-toast'

export default function useUnlockPdf(currentPath, loadFiles) {
    const [unlockFile, setUnlockFile] = useState(null)
    const [password, setPassword] = useState('')
    const [outputDir, setOutputDir] = useState(currentPath || '')
    const [unlocking, setUnlocking] = useState(false)

    const handleUnlock = async () => {
        if (!unlockFile || !password) return
        setUnlocking(true)
        try {
            const res = await unlockPdf({ filePath: unlockFile.path, password, outputDir })
            toast.success(res.data.message)
            logUsage({ page: 'tools', path_used: currentPath, action: 'unlock_pdf' })
            setPassword('')
            loadFiles(currentPath)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        } finally { setUnlocking(false) }
    }

    return { unlockFile, setUnlockFile, password, setPassword, outputDir, setOutputDir, unlocking, handleUnlock }
}
