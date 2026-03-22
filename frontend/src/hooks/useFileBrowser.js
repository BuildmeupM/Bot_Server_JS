import { useState, useEffect } from 'react'
import { browseDirectory } from '../services/api'
import toast from 'react-hot-toast'
import { TAB_FILTERS } from '../pages/docsort/tools/constants'

export default function useFileBrowser(activeTab) {
    const [pathInput, setPathInput] = useState('')
    const [currentPath, setCurrentPath] = useState('')
    const [allFiles, setAllFiles] = useState([])
    const [loading, setLoading] = useState(false)

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
        } catch (err) {
            toast.error(err.response?.data?.error || 'ไม่สามารถเปิดโฟลเดอร์ได้')
        } finally { setLoading(false) }
    }

    const files = allFiles.filter(TAB_FILTERS[activeTab] || (() => false))
    const handleBrowse = () => { if (pathInput.trim()) loadFiles(pathInput.trim()) }

    return { pathInput, setPathInput, currentPath, allFiles, files, loading, loadFiles, handleBrowse }
}
