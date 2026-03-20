import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { browseDirectory, startBatchOcr, getBatchStatus, getBatchJobs, checkDuplicates, getBotProfiles, startBot, getBotJobs, getBotLogs, stopBotJob, getExcelFiles } from '../../services/api'
import toast from 'react-hot-toast'

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════
const FILE_ICONS = { pdf: '📄', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', webp: '🖼️', tiff: '🖼️', bmp: '🖼️' }
const OCR_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp']

// ═══════════════════════════════════════════
// Parse filename from ตัดแยกเอกสาร system
// Pattern: {docType}_{accountCodes} - {originalName} {paymentCodes}.pdf
// Examples:
//   VAT_12345 - TaxInvoice-กรรมการสำรองจ่าย-Jan_2026_ชุดที่1 C1001.pdf
//   WHT3% - 500 - SomeName C1001.pdf
//   WHT54-15% - 1000&VAT_ACC01 - OrigName PAY01.pdf
//   None_Vat_ACC01 - OriginalFile.pdf
// ═══════════════════════════════════════════
function parseDocFilename(filename) {
    if (!filename) return null
    // Remove extension
    const nameOnly = filename.replace(/\.[^.]+$/, '')

    // Match doc type prefix: VAT, WHT..., WHT54-..., None_Vat, WHT&VAT etc.
    const docTypeRegex = /^((?:WHT54-(?:PP36-)?\d+%|WHT\d*%?|None_Vat|VAT)(?:&VAT)?)/i
    const docMatch = nameOnly.match(docTypeRegex)
    if (!docMatch) return null // Not from ตัดแยก system

    const docType = docMatch[1]
    const rest = nameOnly.slice(docType.length)

    // After docType, there might be _accountCodes before the " - " separator
    // Pattern: _CODE1_CODE2 - originalName paymentCodes
    let accountCodes = []
    let originalName = ''
    let paymentCodes = []

    // Split by first " - " to separate codes from original name
    const dashIdx = rest.indexOf(' - ')
    if (dashIdx >= 0) {
        const beforeDash = rest.slice(0, dashIdx) // e.g. "_12345_67890"
        const afterDash = rest.slice(dashIdx + 3)  // e.g. "TaxInvoice-xxx C1001"

        // Parse account codes (separated by _)
        if (beforeDash.startsWith('_')) {
            accountCodes = beforeDash.slice(1).split('_').filter(Boolean)
        }

        // Parse payment codes (last space-separated tokens that look like codes)
        // Payment codes are usually alphanumeric like C1001, P001, or numeric like 456
        const tokens = afterDash.split(' ')
        const payTokens = []
        while (tokens.length > 1) {
            const last = tokens[tokens.length - 1]
            if (/^[A-Z0-9]+$/i.test(last) && last.length >= 1 && last.length <= 10) {
                payTokens.unshift(last)
                tokens.pop()
            } else break
        }
        paymentCodes = payTokens
        originalName = tokens.join(' ')
    } else {
        originalName = rest.replace(/^_/, '')
    }

    return {
        docType,
        accountCodes,
        originalName: originalName.trim(),
        paymentCodes,
        isParsed: true
    }
}

const DOC_BADGE_COLORS = {
    'VAT': { bg: '#dbeafe', color: '#2563eb', border: '#93c5fd' },
    'WHT': { bg: '#fef3c7', color: '#d97706', border: '#fcd34d' },
    'None_Vat': { bg: '#f3e8ff', color: '#9333ea', border: '#c4b5fd' },
    'default': { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
}
function getDocBadgeColor(docType) {
    if (!docType) return DOC_BADGE_COLORS.default
    if (docType.includes('WHT')) return DOC_BADGE_COLORS.WHT
    if (docType.includes('VAT')) return DOC_BADGE_COLORS.VAT
    if (docType.includes('None_Vat')) return DOC_BADGE_COLORS.None_Vat
    return DOC_BADGE_COLORS.default
}

const fmt = {
    size(b) { if (!b) return '—'; if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'; return (b / 1048576).toFixed(1) + ' MB' },
    ms(ms) { if (!ms) return '—'; if (ms < 1000) return ms + 'ms'; if (ms < 60000) return (ms / 1000).toFixed(1) + 's'; return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's' },
    ago(d) { if (!d) return '—'; const df = Date.now() - new Date(d).getTime(); if (df < 60000) return 'เมื่อครู่'; if (df < 3600000) return Math.floor(df / 60000) + ' นาที'; if (df < 86400000) return Math.floor(df / 3600000) + ' ชม.'; return Math.floor(df / 86400000) + ' วัน' }
}

// ═══════════════════════════════════════════
// CSS-in-JS Styles
// ═══════════════════════════════════════════
const S = {
    glass: { background: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255, 255, 255, 0.5)', boxShadow: '0 10px 40px rgba(0, 0, 0, 0.04)', borderRadius: '24px' },
    tabBar: { display: 'flex', gap: 8, padding: '8px', background: 'rgba(241, 245, 249, 0.7)', backdropFilter: 'blur(12px)', borderRadius: '20px', marginBottom: 28, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' },
    tabActive: { padding: '12px 24px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: "'Inter', sans-serif", background: '#ffffff', color: '#0f172a', borderRadius: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', transform: 'translateY(-1px)' },
    tabInactive: { padding: '12px 24px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: "'Inter', sans-serif", background: 'transparent', color: '#64748b', borderRadius: '14px', transition: 'all 0.3s' },
    badge: (color) => ({ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 24, height: 24, padding: '0 8px', borderRadius: '12px', fontSize: 12, fontWeight: 700, background: color, color: '#fff', marginLeft: 10, boxShadow: `0 4px 10px ${color}40`, fontFamily: "'Inter', sans-serif" }),
    empty: { padding: '80px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' },
    emptyIcon: { fontSize: 64, marginBottom: 20, filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.1))', transition: 'transform 0.3s' },
    emptyTitle: { fontSize: 20, fontWeight: 800, color: '#1e293b', marginBottom: 8, letterSpacing: '-0.02em', fontFamily: "'Inter', sans-serif" },
    emptySub: { fontSize: 14, color: '#64748b', lineHeight: 1.6, maxWidth: 400, fontFamily: "'Inter', sans-serif" },
    pathBar: { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: '#ffffff', borderBottom: '1px solid #f1f5f9' },
    pathInput: { flex: 1, padding: '10px 16px', background: '#f8fafc', borderRadius: '12px', border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: "'JetBrains Mono', Consolas, monospace", outline: 'none', transition: 'all 0.2s', color: '#334155', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.01)' },
    goBtn: { padding: '10px 18px', border: 'none', borderRadius: '12px', background: 'linear-gradient(135deg, #4f46e5, #3b82f6)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)' },
    upBtn: { padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: '12px', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#64748b', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 2px 4px rgba(0,0,0,0.02)' },
    actionBar: { display: 'flex', gap: 10, padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#fff', flexWrap: 'wrap', alignItems: 'center' },
    chipBtn: (active) => ({ padding: '8px 16px', border: active ? '1.5px solid #3b82f6' : '1.5px solid #e2e8f0', borderRadius: '20px', background: active ? '#eff6ff' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: active ? '#2563eb' : '#64748b', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6, boxShadow: active ? '0 4px 12px rgba(59, 130, 246, 0.15)' : 'none' }),
    startBtn: { padding: '10px 20px', border: 'none', borderRadius: '12px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6 },
    fileRow: (sel, alt) => ({ display: 'flex', alignItems: 'center', padding: '12px 20px', cursor: 'pointer', background: sel ? '#eff6ff' : alt ? '#f8fafc' : '#fff', borderBottom: '1px solid #f1f5f9', transition: 'all 0.15s', gap: 16, borderLeft: sel ? '4px solid #3b82f6' : '4px solid transparent' }),
    card: { borderRadius: '20px', border: '1px solid #e2e8f0', background: '#fff', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.04)', transition: 'all 0.3s' },
    jobCard: (sel) => ({ padding: 16, marginBottom: 12, borderRadius: '16px', cursor: 'pointer', border: '1.5px solid', borderColor: sel ? '#3b82f6' : '#e2e8f0', background: sel ? '#f0f9ff' : '#fff', transition: 'all 0.2s', boxShadow: sel ? '0 4px 16px rgba(59, 130, 246, 0.12)' : '0 2px 8px rgba(0,0,0,0.02)' }),
    progressTrack: { height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', marginTop: 8 },
    progressFill: (pct, done) => ({ height: '100%', borderRadius: 4, width: `${pct}%`, background: done ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #3b82f6, #60a5fa)', transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)', boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.3)' }),
    statBox: (color) => ({ padding: '12px 18px', background: color === 'accent' ? '#eff6ff' : '#f8fafc', borderRadius: '14px', textAlign: 'center', minWidth: 80, border: '1px solid ' + (color === 'accent' ? '#bfdbfe' : '#e2e8f0'), transition: 'all 0.2s' }),
    statVal: (color) => ({ fontSize: 24, fontWeight: 800, color: color === 'accent' ? '#2563eb' : '#1e293b', lineHeight: 1.2, marginBottom: 4, letterSpacing: '-0.03em' }),
    statLabel: { fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' },
    workerCard: (color) => ({ padding: 16, borderRadius: '16px', border: '1px solid #e2e8f0', borderLeft: `6px solid ${color}`, background: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }),
    bottomBar: { padding: '14px 20px', borderTop: '1px solid #bfdbfe', background: 'linear-gradient(135deg, #eff6ff, #e0f2fe)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
}

// ═══════════════════════════════════════════
// Status Badge Component
// ═══════════════════════════════════════════
const STATUS_MAP = {
    processing: { bg: 'rgba(59, 130, 246, 0.12)', color: '#2563eb', text: 'กำลังอ่าน', dot: '#3b82f6', glow: true },
    completed: { bg: 'rgba(16, 185, 129, 0.12)', color: '#059669', text: 'เสร็จแล้ว', dot: '#10b981' },
    failed: { bg: 'rgba(239, 68, 68, 0.12)', color: '#dc2626', text: 'ล้มเหลว', dot: '#ef4444' },
}

function Badge({ status }) {
    const s = STATUS_MAP[status] || STATUS_MAP.processing
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: '24px', fontSize: 12, fontWeight: 700, background: s.bg, color: s.color, letterSpacing: '0.02em', fontFamily: "'Inter', sans-serif" }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, animation: s.glow ? 'ocr-pulse 1.5s infinite' : 'none', boxShadow: s.glow ? `0 0 8px ${s.dot}` : 'none' }} />
            {s.text}
        </span>
    )
}

// ═══════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════
export default function OcrBatchPanel() {
    const [currentPath, setCurrentPath] = useState('')
    const [pathInput, setPathInput] = useState('')
    const [files, setFiles] = useState([])
    const [loading, setLoading] = useState(false)
    const [selectedFiles, setSelectedFiles] = useState([])
    const [jobs, setJobs] = useState([])
    const [selectedJobId, setSelectedJobId] = useState(null)
    const [jobDetail, setJobDetail] = useState(null)
    const [tab, setTab] = useState('queue')
    const [expandedResults, setExpandedResults] = useState({})
    const [showDupModal, setShowDupModal] = useState(false)
    const [dupData, setDupData] = useState(null)
    const [showExcelModal, setShowExcelModal] = useState(false)
    const [excelFilesList, setExcelFilesList] = useState([])
    const [exporting, setExporting] = useState(false)
    const [botExcelPath, setBotExcelPath] = useState('')
    const [botBuildCode, setBotBuildCode] = useState('')
    const [botBuildName, setBotBuildName] = useState('')
    const [botMatchedProfile, setBotMatchedProfile] = useState(null)
    const [botProfileLoading, setBotProfileLoading] = useState(false)

    // Auto-fetch bot profile when Build Code changes
    useEffect(() => {
        if (!botBuildCode) {
            setBotMatchedProfile(null)
            return
        }
        let cancelled = false
        const fetchProfile = async () => {
            setBotProfileLoading(true)
            try {
                const res = await getBotProfiles()
                const profiles = res.data || []
                // Match platform field containing the Build Code (e.g. "Build000 ทดสอบระบบ")
                const matched = profiles.find(p =>
                    p.platform && p.platform.toLowerCase().includes(botBuildCode.toLowerCase())
                )
                if (!cancelled) setBotMatchedProfile(matched || null)
            } catch (err) {
                console.error('Failed to fetch bot profiles:', err)
                if (!cancelled) setBotMatchedProfile(null)
            } finally {
                if (!cancelled) setBotProfileLoading(false)
            }
        }
        fetchProfile()
        return () => { cancelled = true }
    }, [botBuildCode])

    const [botStarting, setBotStarting] = useState(false)
    const [botJobsList, setBotJobsList] = useState([])
    const [botActiveLogId, setBotActiveLogId] = useState(null)
    const [botActiveLogs, setBotActiveLogs] = useState([])
    const [botQueueInfo, setBotQueueInfo] = useState({ runningCount: 0, queuedCount: 0, maxConcurrent: 5 })

    // Fetch bot jobs list
    const fetchBotJobs = async () => {
        try {
            const res = await getBotJobs()
            setBotJobsList(res.data.jobs || [])
            setBotQueueInfo({
                runningCount: res.data.runningCount || 0,
                queuedCount: res.data.queuedCount || 0,
                maxConcurrent: res.data.maxConcurrent || 5
            })
        } catch (e) {}
    }

    // Auto-refresh jobs when on bot-command tab
    useEffect(() => {
        if (tab !== 'bot-command') return
        fetchBotJobs()
        const interval = setInterval(fetchBotJobs, 3000)
        return () => clearInterval(interval)
    }, [tab])

    // Fetch logs for active job
    useEffect(() => {
        if (!botActiveLogId) { setBotActiveLogs([]); return }
        const fetchLogs = async () => {
            try {
                const res = await getBotLogs(botActiveLogId)
                setBotActiveLogs(res.data.logs || [])
            } catch (e) {}
        }
        fetchLogs()
        const interval = setInterval(fetchLogs, 2000)
        return () => clearInterval(interval)
    }, [botActiveLogId])

    const handleStartBot = async () => {
        if (!botMatchedProfile) return
        try {
            // Check if user exactly entered a file
            if (botExcelPath && (botExcelPath.toLowerCase().endsWith('.xlsx') || botExcelPath.toLowerCase().endsWith('.xls'))) {
                executeStartBot(botExcelPath)
                return
            }

            // Otherwise, get files from directory (extract directory if entered path looks like a filename but missing extension)
            let dirParam = botExcelPath;
            if (botExcelPath && /\.[a-z0-9]+$/i.test(botExcelPath)) {
                // Remove the filename part
                dirParam = botExcelPath.substring(0, Math.max(botExcelPath.lastIndexOf('\\'), botExcelPath.lastIndexOf('/')));
            }

            const res = await getExcelFiles(dirParam)
            const files = res.data.files || []
            if (files.length === 0) {
                toast.error('ไม่พบไฟล์ข้อมูล Excel ในพื้นที่ที่ระบุ')
                return
            }
            if (files.length === 1) {
                executeStartBot(files[0])
            } else {
                setExcelFilesList(files)
                setShowExcelModal(true)
            }
        } catch (error) {
            console.error('Error fetching excel files:', error)
            toast.error('ไม่สามารถดึงรายชื่อไฟล์ Excel ได้')
        }
    }

    const executeStartBot = async (selectedExcelPath) => {
        setBotStarting(true)
        try {
            const res = await startBot({
                profileId: botMatchedProfile.id,
                excelPath: selectedExcelPath || botExcelPath
            })
            const data = res.data
            if (data.success) {
                toast.success(`สร้างงานสำเร็จ: ${data.jobId}`)
                setBotActiveLogId(data.jobId)
                fetchBotJobs()
                setShowExcelModal(false)
            }
        } catch (err) {
            console.error('Bot start error:', err)
            toast.error(err.response?.data?.error || 'ไม่สามารถเริ่มบอทได้')
        } finally {
            setBotStarting(false)
        }
    }

    const handleStopJob = async (jobId) => {
        try {
            await stopBotJob(jobId)
            toast.success('หยุดบอทสำเร็จ')
            fetchBotJobs()
        } catch (e) {
            toast.error('ไม่สามารถหยุดบอทได้')
        }
    }

    // ── Export Excel via backend API (scoped to source folder) ──
    const handleExportExcel = async () => {
        if (!jobDetail?.results?.length) return
        setExporting(true)
        try {
            // ดึง buildCode จาก filePath ของไฟล์แรก
            const firstResult = jobDetail.results.find(r => r.filePath)
            const filePath = firstResult?.filePath || ''
            const buildMatch = filePath.match(/Build\d+/i)
            const buildCode = buildMatch ? buildMatch[0] : null
            if (!buildCode) {
                toast.error('ไม่พบ Build Code จากไฟล์ — ไม่สามารถส่งออก Excel ได้')
                return
            }

            // ย้อนกลับไปหา folder ต้นทางจาก filePath ของไฟล์ที่อ่าน
            const folderPath = filePath.substring(0, Math.max(
                filePath.lastIndexOf('\\'),
                filePath.lastIndexOf('/')
            ))

            const params = new URLSearchParams()
            if (folderPath) {
                params.set('folderPath', folderPath)
            }
            const qs = params.toString() ? `?${params.toString()}` : ''
            const res = await fetch(`/api/ocr/export-excel/${encodeURIComponent(buildCode)}${qs}`)
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                toast.error(err.error || 'เกิดข้อผิดพลาดในการส่งออก Excel')
                return
            }
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            const cd = res.headers.get('Content-Disposition')
            const match = cd && cd.match(/filename="?([^"]+)"?/)
            a.download = match ? decodeURIComponent(match[1]) : `OCR_Export_${buildCode}.xlsx`
            document.body.appendChild(a)
            a.click()
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
            toast.success(`ดาวน์โหลด Excel สำเร็จ (${buildCode})`)
        } catch (err) {
            console.error('Export error:', err)
            toast.error('เกิดข้อผิดพลาดในการส่งออก Excel')
        } finally {
            setExporting(false)
        }
    }

    // ── Polling ──
    useEffect(() => { fetchJobs(); const i = setInterval(fetchJobs, 3000); return () => clearInterval(i) }, [])
    const fetchJobs = async () => { try { setJobs((await getBatchJobs()).data?.jobs || []) } catch (e) { } }

    useEffect(() => {
        if (!selectedJobId) { setJobDetail(null); return }
        const fn = async () => { try { setJobDetail((await getBatchStatus(selectedJobId)).data) } catch (e) { setJobDetail(null) } }
        fn(); const i = setInterval(fn, 2000); return () => clearInterval(i)
    }, [selectedJobId])

    // ── File Browser ──
    const browseTo = async (dirPath) => {
        if (!dirPath?.trim()) return
        setLoading(true)
        try {
            const res = await browseDirectory(dirPath.trim())
            const resolved = res.data.currentPath || dirPath.trim()
            setCurrentPath(resolved); setPathInput(resolved); setFiles(res.data.items || [])
        } catch (e) { toast.error('ไม่สามารถเปิดโฟลเดอร์นี้ได้') }
        setLoading(false)
    }
    const handlePathSubmit = () => { if (pathInput.trim()) browseTo(pathInput.trim()) }
    const goUp = () => {
        if (!currentPath) return
        const p = currentPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
        if (p) browseTo(p); else { setCurrentPath(''); setPathInput(''); setFiles([]) }
    }
    const isOcrFile = (name) => OCR_EXTENSIONS.includes(name.toLowerCase().substring(name.lastIndexOf('.')))
    const toggleFile = (fp) => setSelectedFiles(prev => prev.includes(fp) ? prev.filter(f => f !== fp) : [...prev, fp])
    const selectAllOcr = () => {
        const ocrFiles = files.filter(f => !f.isDirectory && isOcrFile(f.name)).map(f => f.path)
        const all = ocrFiles.every(fp => selectedFiles.includes(fp))
        setSelectedFiles(prev => all ? prev.filter(fp => !ocrFiles.includes(fp)) : [...new Set([...prev, ...ocrFiles])])
    }

    // ── Start Batch (with duplicate check) ──
    const startBatch = async () => {
        if (selectedFiles.length === 0) return toast.error('กรุณาเลือกไฟล์ก่อน')
        try {
            const res = await checkDuplicates(selectedFiles)
            const data = res.data
            if (data.duplicateCount > 0) {
                setDupData(data)
                setShowDupModal(true)
            } else {
                // ไม่มีไฟล์ซ้ำ — เริ่ม OCR เลย
                await proceedBatch(selectedFiles, false)
            }
        } catch (err) {
            toast.error('เกิดข้อผิดพลาดในการตรวจสอบ')
            console.error(err)
        }
    }

    const proceedBatch = async (filesToProcess, forceReprocess) => {
        try {
            const res = await startBatchOcr(filesToProcess, undefined, forceReprocess)
            toast.success(res.data.message)
            setSelectedFiles([])
            setSelectedJobId(res.data.jobId)
            setTab('queue')
            fetchJobs()
            setShowDupModal(false)
            setDupData(null)
        } catch (err) {
            toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาด')
        }
    }

    const activeJobs = jobs.filter(j => j.status === 'processing').length
    const doneJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed')

    // ═══════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════
    return (
        <div style={{ fontFamily: 'Inter,-apple-system,sans-serif' }}>
            {/* Tab bar — pill style */}
            <div style={S.tabBar}>
                {[
                    { id: 'queue', label: 'คิวงานอ่าน OCR', icon: '📊', badgeCount: activeJobs, badgeColor: '#3b82f6' },
                    { id: 'browser', label: 'เลือกไฟล์ OCR', icon: '📁', badgeCount: selectedFiles.length, badgeColor: '#f97316' },
                    { id: 'results', label: 'อ่าน OCR เสร็จแล้ว', icon: '✅', badgeCount: doneJobs.length || null, badgeColor: '#22c55e' },
                    { id: 'bot-command', label: 'สั่งบอททำงาน', icon: '🤖', badgeCount: null, badgeColor: '#8b5cf6' },
                ].map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={tab === t.id ? S.tabActive : S.tabInactive}>
                        {t.icon} {t.label}
                        {t.badgeCount > 0 && <span style={S.badge(t.badgeColor)}>{t.badgeCount}</span>}
                    </button>
                ))}
            </div>

            {/* ═══════ QUEUE TAB ═══════ */}
            {tab === 'queue' && (
                jobs.length === 0 ? (
                    <div style={{ ...S.card, ...S.empty }}>
                        <div style={S.emptyIcon}>📭</div>
                        <div style={S.emptyTitle}>ยังไม่มีคิวงาน OCR</div>
                        <div style={S.emptySub}>กดแท็บ <strong>📁 เลือกไฟล์</strong> เพื่อเลือกเอกสารแล้วเริ่มอ่าน</div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 400 }}>
                        {!selectedJobId && (
                            /* MASTER VIEW: Job List Grid */
                            <div style={{ 
                                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, 
                                overflowY: 'auto', maxHeight: 'calc(100vh - 280px)', paddingBottom: 24
                            }}>
                                {jobs.map(j => (
                                    <div key={j.jobId} onClick={() => setSelectedJobId(j.jobId)} style={S.jobCard(selectedJobId === j.jobId)}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Badge status={j.status} />
                                            </div>
                                            <span style={{ fontSize: 10, color: '#8b8fa3', whiteSpace: 'nowrap' }}>{fmt.ago(j.createdAt)}</span>
                                        </div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={j.jobName}>
                                            📁 {j.jobName || 'คิวงาน OCR'}
                                        </div>
                                        <div style={S.progressTrack}><div style={S.progressFill(j.percent, j.status === 'completed')} /></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8b8fa3', marginTop: 8 }}>
                                            <span>{j.completed}/{j.totalFiles} ไฟล์ · {j.percent}%</span>
                                            <span>💳 {j.creditsUsed}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#a1a5b3', marginTop: 4 }}>
                                            <span>{j.createdBy?.displayName || '—'}</span>
                                            <span>{j.workerCount} Workers · {fmt.ms(j.elapsedMs)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {selectedJobId && jobDetail && (
                            /* DETAIL VIEW: Full Width Job Detail */
                            <div style={{ width: '100%', animation: 'ocr-fade-in 0.3s ease-out' }}>
                                {/* Back Button & Summary Card */}
                                <div style={{ marginBottom: 16 }}>
                                    <button 
                                        onClick={() => setSelectedJobId(null)}
                                        style={{ 
                                            background: '#fff', border: '1px solid #e2e8f0', padding: '6px 12px', 
                                            borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#475569', 
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                            marginBottom: 12, transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                        }}
                                        onMouseOver={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#0f172a'; }}
                                        onMouseOut={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#475569'; }}
                                    >
                                        <span style={{ fontSize: 14 }}>←</span> กลับหน้ารายการคิวงาน
                                    </button>
                                </div>
                                {/* Summary Card */}
                                    <div style={{ ...S.card, padding: 18, marginBottom: 14 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                    <Badge status={jobDetail.status} />
                                                    <span style={{ fontSize: 11, color: '#8b8fa3' }}>{jobDetail.createdBy?.displayName} · {fmt.ago(jobDetail.createdAt)}</span>
                                                </div>
                                                <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b', marginBottom: 2 }}>
                                                    📁 {jobDetail.jobName || 'คิวงาน OCR'}
                                                </div>
                                                <div style={{ fontSize: 10, color: '#a1a5b3', fontFamily: 'monospace' }}>{jobDetail.jobId}</div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                {[
                                                    { v: `${jobDetail.progress?.completed || 0}/${jobDetail.progress?.total || 0}`, l: 'ไฟล์' },
                                                    { v: jobDetail.summary?.totalCreditsUsed || 0, l: 'เครดิต', c: 'accent' },
                                                    { v: fmt.ms(jobDetail.summary?.elapsedMs), l: 'เวลา' },
                                                ].map((s, i) => (
                                                    <div key={i} style={S.statBox(s.c)}>
                                                        <div style={S.statVal(s.c)}>{s.v}</div>
                                                        <div style={S.statLabel}>{s.l}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div style={S.progressTrack}><div style={S.progressFill(jobDetail.progress?.percent || 0, jobDetail.status === 'completed')} /></div>
                                        <div style={{ textAlign: 'center', fontSize: 11, marginTop: 4, fontWeight: 700, color: '#8b8fa3' }}>{jobDetail.progress?.percent || 0}%</div>
                                    </div>

                                    {/* Workers Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 14 }}>
                                        {(jobDetail.workers || []).map((w, i) => (
                                            <div key={i} style={S.workerCard(w.status === 'done' ? '#22c55e' : w.status === 'processing' ? '#f97316' : '#cbd5e1')}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#2d2d3a' }}>บอทอ่านเอกสาร OCR Model {w.workerId}</span>
                                                    <span style={{
                                                        fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 700,
                                                        background: w.status === 'done' ? 'rgba(34,197,94,0.1)' : w.status === 'processing' ? 'rgba(249,115,22,0.1)' : '#f1f5f9',
                                                        color: w.status === 'done' ? '#16a34a' : w.status === 'processing' ? '#ea580c' : '#64748b'
                                                    }}>{w.status === 'done' ? '✅ เสร็จ' : w.status === 'processing' ? '⏳ อ่าน' : '⏸️ รอ'}</span>
                                                </div>
                                                {w.currentFile && (
                                                    <div style={{ padding: '4px 8px', background: '#fffbeb', borderRadius: 6, fontSize: 10, marginBottom: 4, fontWeight: 600, color: '#92400e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {w.currentFile}</div>
                                                )}
                                                <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#8b8fa3' }}>
                                                    <span>📁 {w.completed}/{w.total}</span>
                                                    <span>💳 {w.creditsUsed}</span>
                                                </div>
                                                {w.results?.length > 0 && (
                                                    <div style={{ marginTop: 6, borderTop: '1px solid #f1f3f5', paddingTop: 4 }}>
                                                        {w.results.slice(-5).map((r, ri) => (
                                                            <div key={ri} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: 10, color: '#64748b' }}>
                                                                <span>{r.status === 'done' ? '✅' : '❌'} {r.file}</span>
                                                                <span>{fmt.ms(r.timeMs)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {w.errors?.length > 0 && w.errors.map((e, ei) => (
                                                    <div key={ei} style={{ padding: '3px 6px', background: 'rgba(239,68,68,0.06)', borderRadius: 4, fontSize: 10, color: '#dc2626', marginTop: 3 }}>❌ {e.file}: {e.error}</div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Results — Premium Bento Grid */}
                                    {jobDetail.results?.length > 0 && (
                                        <div style={{ ...S.card, overflow: 'hidden' }}>
                                            <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg,#fafbfc,#f8f9fb)', borderBottom: '1px solid #eef0f2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 700, fontSize: 13, color: '#2d2d3a' }}>📋 ผลลัพธ์การอ่านเอกสาร</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {jobDetail.status === 'completed' && (
                                                        <button
                                                            onClick={handleExportExcel}
                                                            disabled={exporting}
                                                            style={{
                                                                padding: '4px 14px', border: 'none', borderRadius: 8,
                                                                background: exporting ? '#94a3b8' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                                                                color: '#fff', cursor: exporting ? 'not-allowed' : 'pointer',
                                                                fontSize: 11, fontWeight: 700,
                                                                display: 'flex', alignItems: 'center', gap: 5,
                                                                boxShadow: '0 2px 8px rgba(34,197,94,0.3)',
                                                                transition: 'all 0.15s'
                                                            }}
                                                            onMouseOver={e => { if (!exporting) e.currentTarget.style.transform = 'translateY(-1px)' }}
                                                            onMouseOut={e => e.currentTarget.style.transform = 'none'}
                                                        >
                                                            {exporting ? '⏳ กำลังส่งออก...' : '📥 ส่งออก Excel'}
                                                        </button>
                                                    )}
                                                    <span style={{ fontSize: 11, color: '#8b8fa3', background: '#fff', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>{jobDetail.results.length} ไฟล์</span>
                                                </div>
                                            </div>
                                            {jobDetail.results.map((r, i) => {
                                                const d = r.data || {}
                                                const validateTaxId = (id) => {
                                                    if (!id) return null
                                                    const digits = id.replace(/\D/g, '')
                                                    if (digits.length !== 13) return { valid: false, msg: `${digits.length} หลัก (ต้อง 13)` }
                                                    let sum = 0
                                                    for (let x = 0; x < 12; x++) sum += parseInt(digits[x]) * (13 - x)
                                                    let chk = 11 - (sum % 11)
                                                    if (chk === 10) chk = 0; if (chk === 11) chk = 1
                                                    return chk === parseInt(digits[12])
                                                        ? { valid: true, msg: 'Checksum ถูกต้อง' }
                                                        : { valid: false, msg: `Check digit ไม่ตรง (ควรลงท้าย ${chk})` }
                                                }
                                                const isOpen = expandedResults[i]
                                                const hasError = r.status === 'error'
                                                return (
                                                    <div key={i} style={{ borderBottom: '1px solid #eef0f2' }}>
                                                        {/* ── Summary Row ── */}
                                                        <div
                                                            onClick={() => setExpandedResults(prev => ({ ...prev, [i]: !prev[i] }))}
                                                            style={{
                                                                padding: '12px 18px', cursor: 'pointer',
                                                                background: isOpen ? 'linear-gradient(135deg, #f8fafc, #f1f5f9)' : '#fff',
                                                                borderLeft: isOpen ? '4px solid #3b82f6' : '4px solid transparent',
                                                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                                                            }}
                                                            onMouseOver={e => e.currentTarget.style.background = isOpen ? 'linear-gradient(135deg, #f8fafc, #f1f5f9)' : '#f8fafc'}
                                                            onMouseOut={e => e.currentTarget.style.background = isOpen ? 'linear-gradient(135deg, #f8fafc, #f1f5f9)' : '#fff'}>
                                                            {/* Row 1: File name & time */}
                                                            {(() => {
                                                                const fileParsed = parseDocFilename(r.file)
                                                                const fileBadgeC = fileParsed ? getDocBadgeColor(fileParsed.docType) : null
                                                                return (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                                        <span style={{
                                                                            fontSize: 10, color: '#3b82f6', transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                                            transform: isOpen ? 'rotate(90deg)' : 'none', flexShrink: 0, fontWeight: 900
                                                                        }}>▶</span>
                                                                        <span style={{ fontSize: 13, flexShrink: 0 }}>📄</span>
                                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                                                                                <span style={{ fontSize: 12, fontWeight: 600, color: '#2d2d3a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>{r.file}</span>
                                                                                {fileParsed && (
                                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                                                                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: fileBadgeC.bg, color: fileBadgeC.color, border: `1px solid ${fileBadgeC.border}`, whiteSpace: 'nowrap' }}>{fileParsed.docType}</span>
                                                                                        {fileParsed.accountCodes.map((c, ci) => (
                                                                                            <span key={'a'+ci} style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 5, background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', whiteSpace: 'nowrap' }}>📋{c}</span>
                                                                                        ))}
                                                                                        {fileParsed.paymentCodes.map((c, ci) => (
                                                                                            <span key={'p'+ci} style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 5, background: '#fdf2f8', color: '#db2777', border: '1px solid #fbcfe8', whiteSpace: 'nowrap' }}>💳{c}</span>
                                                                                        ))}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <div style={{ fontSize: 10, color: '#a1a5b3', marginTop: 1 }}>{d.documentType || ''}{d.documentDate ? ` · ${d.documentDate}` : ''}</div>
                                                                        </div>
                                                                        <span style={{ fontSize: 10, color: '#c4c8d4', flexShrink: 0 }}>{fmt.ms(r.timeMs)}</span>
                                                                    </div>
                                                                )
                                                            })()}
                                                            {/* Row 2: Company, Doc#, Subtotal, VAT, Total */}
                                                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, paddingLeft: 28, flexWrap: 'wrap' }}>
                                                                {/* ชื่อบริษัท */}
                                                                <div style={{ flex: '1 1 auto', minWidth: 100 }}>
                                                                    <div style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em', marginBottom: 2 }}>บริษัท</div>
                                                                    <div style={{ fontSize: 11, fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.sellerNameTh || '—'}</div>
                                                                </div>
                                                                {/* เลขที่เอกสาร */}
                                                                <div style={{ flexShrink: 0, minWidth: 80 }}>
                                                                    <div style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em', marginBottom: 2 }}>เลขที่เอกสาร</div>
                                                                    <div style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', fontFamily: "'JetBrains Mono',Consolas,monospace" }}>{d.documentNumber || '—'}</div>
                                                                </div>
                                                                {/* Separator */}
                                                                <div style={{ width: 1, height: 24, background: '#e2e8f0', flexShrink: 0 }} />
                                                                {/* จำนวนก่อนภาษี */}
                                                                <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 70 }}>
                                                                    <div style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em', marginBottom: 2 }}>ก่อนภาษี</div>
                                                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', fontFamily: "'JetBrains Mono',Consolas,monospace" }}>{d.subtotal ? parseFloat(String(d.subtotal).replace(/,/g, '')).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</div>
                                                                </div>
                                                                {/* ยอดภาษี */}
                                                                <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 60 }}>
                                                                    <div style={{ fontSize: 8, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em', marginBottom: 2 }}>VAT</div>
                                                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', fontFamily: "'JetBrains Mono',Consolas,monospace" }}>{d.vat ? parseFloat(String(d.vat).replace(/,/g, '')).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</div>
                                                                </div>
                                                                {/* ยอดสุทธิ */}
                                                                <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 80 }}>
                                                                    <div style={{ fontSize: 8, fontWeight: 700, color: '#3b82f6', letterSpacing: '0.04em', marginBottom: 2 }}>ยอดสุทธิ</div>
                                                                    <div style={{ fontSize: 16, fontWeight: 900, color: '#2563eb', fontFamily: "'JetBrains Mono',Consolas,monospace", letterSpacing: '-0.02em' }}>{d.total ? parseFloat(String(d.total).replace(/,/g, '')).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</div>
                                                                </div>
                                                            </div>
                                                            {/* Sub-lines from Company Profile (e.g. กรมศุลกากร 2 บรรทัด) */}
                                                            {r.subLines && r.subLines.length > 1 && (
                                                                <div style={{ paddingLeft: 28, marginTop: 6 }}>
                                                                    {r.subLines.map((line, li) => (
                                                                        <div key={li} style={{
                                                                            display: 'flex', alignItems: 'center', gap: 10,
                                                                            padding: '4px 10px', borderRadius: 8,
                                                                            background: li === 0 ? 'rgba(59,130,246,0.06)' : 'rgba(249,115,22,0.06)',
                                                                            border: `1px solid ${li === 0 ? 'rgba(59,130,246,0.15)' : 'rgba(249,115,22,0.15)'}`,
                                                                            marginBottom: 3, fontSize: 11
                                                                        }}>
                                                                            <span style={{ fontWeight: 700, color: li === 0 ? '#2563eb' : '#ea580c', minWidth: 100 }}>
                                                                                {line.lineDescription || `บรรทัดที่ ${li + 1}`}
                                                                            </span>
                                                                            <span style={{ color: '#64748b', fontFamily: "'JetBrains Mono',Consolas,monospace", fontWeight: 600, minWidth: 80, textAlign: 'right' }}>
                                                                                {line.subtotal ? parseFloat(String(line.subtotal).replace(/,/g, '')).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                                                                            </span>
                                                                            <span style={{ color: '#94a3b8', fontFamily: "'JetBrains Mono',Consolas,monospace", minWidth: 70, textAlign: 'right' }}>
                                                                                VAT {line.vat ? parseFloat(String(line.vat).replace(/,/g, '')).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
                                                                            </span>
                                                                            <span style={{ fontWeight: 800, color: li === 0 ? '#2563eb' : '#ea580c', fontFamily: "'JetBrains Mono',Consolas,monospace", minWidth: 90, textAlign: 'right' }}>
                                                                                {line.total ? parseFloat(String(line.total).replace(/,/g, '')).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* ── Expanded Bento Detail ── */}
                                                        {isOpen && (
                                                            <div style={{ padding: '16px 20px 20px', background: 'linear-gradient(180deg,#fafbfc,#f5f6f8)', borderTop: '1px solid #eef0f2' }}>

                                                                {/* ─ Top Stat Pills ─ */}
                                                                {(() => {
                                                                    const detailParsed = parseDocFilename(r.file)
                                                                    const basePills = [
                                                                        { icon: '📋', label: 'ประเภท', value: d.documentType, color: '#3b82f6' },
                                                                        { icon: '🔢', label: 'เลขที่', value: d.documentNumber, color: '#6366f1' },
                                                                        { icon: '📅', label: 'วันที่', value: d.documentDate, color: '#8b5cf6' },
                                                                        { icon: '⏱️', label: 'เวลาอ่าน', value: fmt.ms(r.timeMs), color: '#64748b' },
                                                                    ]
                                                                    if (detailParsed) {
                                                                        if (detailParsed.accountCodes.length > 0) {
                                                                            basePills.push({ icon: '📋', label: 'โค้ดบันทึกบัญชี', value: detailParsed.accountCodes.join(', '), color: '#059669' })
                                                                        }
                                                                        if (detailParsed.paymentCodes.length > 0) {
                                                                            basePills.push({ icon: '💳', label: 'โค้ดตัดชำระ', value: detailParsed.paymentCodes.join(', '), color: '#db2777' })
                                                                        }
                                                                    }
                                                                    return (
                                                                        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                                                                            {basePills.map((pill, pi) => (
                                                                                <div key={pi} style={{
                                                                                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                                                                                    background: '#fff', borderRadius: 10, border: '1px solid #eef0f2',
                                                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)', flex: '1 1 auto', minWidth: 120
                                                                                }}>
                                                                                    <span style={{ fontSize: 13 }}>{pill.icon}</span>
                                                                                    <div>
                                                                                        <div style={{ fontSize: 9, fontWeight: 700, color: '#a1a5b3', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{pill.label}</div>
                                                                                        <div style={{ fontSize: 12, fontWeight: 600, color: pill.color }}>{pill.value || '—'}</div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )
                                                                })()}

                                                                {/* ─ Seller & Buyer Side-by-Side Cards ─ */}
                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                                                                    {/* Seller Card */}
                                                                    <div style={{
                                                                        background: '#fff', borderRadius: 12, padding: 14,
                                                                        border: '1px solid #eef0f2', borderLeft: '3px solid #3b82f6',
                                                                        boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
                                                                    }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                                                            <span style={{ fontSize: 14 }}>🏢</span>
                                                                            <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', letterSpacing: '0.02em' }}>ผู้ขาย / ผู้ให้บริการ</span>
                                                                        </div>
                                                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>{d.sellerNameTh || '—'}</div>
                                                                        {d.sellerNameEn && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{d.sellerNameEn}</div>}
                                                                        {(() => {
                                                                            const v = validateTaxId(d.sellerTaxId); return (
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                                                                                    <span style={{ fontSize: 9, fontWeight: 700, color: '#a1a5b3', letterSpacing: '0.04em' }}>TAX ID</span>
                                                                                    <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',Consolas,monospace", color: '#334155', fontWeight: 600, background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>{d.sellerTaxId || '—'}</span>
                                                                                    {v && <span title={v.msg} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, cursor: 'help', background: v.valid ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: v.valid ? '#16a34a' : '#dc2626', border: `1px solid ${v.valid ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>{v.valid ? '✅ Valid' : '❌ Invalid'}</span>}
                                                                                    {d.sellerBranch && (
                                                                                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', marginLeft: 4 }}>
                                                                                            🏪 สาขา: {d.sellerBranch}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            )
                                                                        })()}
                                                                        <div style={{
                                                                            background: '#f8fafc', borderRadius: 8, padding: '8px 10px',
                                                                            border: '1px solid #e2e8f0', minHeight: 36
                                                                        }}>
                                                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                                                                <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>📍</span>
                                                                                <div>
                                                                                    <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em', marginBottom: 2 }}>ที่อยู่</div>
                                                                                    <div style={{ fontSize: 11, color: '#334155', lineHeight: 1.6, fontWeight: 500 }}>
                                                                                        {/* ลบส่วนสาขาออกจากที่อยู่ เพื่อไม่แสดงซ้ำ */}
                                                                                        {(d.sellerAddressFull || d.sellerAddress || '—').replace(/สาขา(?:ที่)?\s*\d+\s*สาขา\S+\s*[:：]?\s*/g, '').trim() || '—'}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Buyer Card */}
                                                                    <div style={{
                                                                        background: '#fff', borderRadius: 12, padding: 14,
                                                                        border: '1px solid #eef0f2', borderLeft: '3px solid #8b5cf6',
                                                                        boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
                                                                    }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                                                            <span style={{ fontSize: 14 }}>🧑‍💼</span>
                                                                            <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6', letterSpacing: '0.02em' }}>ผู้ซื้อ / ผู้รับบริการ</span>
                                                                        </div>
                                                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>{d.buyerNameTh || '—'}</div>
                                                                        {d.buyerNameEn && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{d.buyerNameEn}</div>}
                                                                        {(() => {
                                                                            const v = validateTaxId(d.buyerTaxId); return (
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                                                                                    <span style={{ fontSize: 9, fontWeight: 700, color: '#a1a5b3', letterSpacing: '0.04em' }}>TAX ID</span>
                                                                                    <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono',Consolas,monospace", color: '#334155', fontWeight: 600, background: '#f1f5f9', padding: '1px 6px', borderRadius: 4 }}>{d.buyerTaxId || '—'}</span>
                                                                                    {v && <span title={v.msg} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, cursor: 'help', background: v.valid ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: v.valid ? '#16a34a' : '#dc2626', border: `1px solid ${v.valid ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>{v.valid ? '✅ Valid' : '❌ Invalid'}</span>}
                                                                                </div>
                                                                            )
                                                                        })()}
                                                                        <div style={{
                                                                            background: '#f8fafc', borderRadius: 8, padding: '8px 10px',
                                                                            border: '1px solid #e2e8f0', minHeight: 36
                                                                        }}>
                                                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                                                                <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1 }}>📍</span>
                                                                                <div>
                                                                                    <div style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.04em', marginBottom: 2 }}>ที่อยู่</div>
                                                                                    <div style={{ fontSize: 11, color: '#334155', lineHeight: 1.6, fontWeight: 500 }}>{d.buyerAddressFull || d.buyerAddress || '—'}</div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* ─ Document Info Summary Card ─ */}
                                                                <div style={{
                                                                    background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                                                                    borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0',
                                                                    boxShadow: '0 4px 16px rgba(0,0,0,0.03)', marginBottom: 12
                                                                }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                            <span style={{ fontSize: 16 }}>🗂️</span>
                                                                            <span style={{ fontSize: 13, fontWeight: 800, color: '#334155', letterSpacing: '0.02em' }}>ข้อมูลเอกสาร</span>
                                                                        </div>
                                                                    </div>

                                                                    {/* Detail Row */}
                                                                    <div style={{
                                                                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
                                                                        padding: '8px 0'
                                                                    }}>
                                                                        <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
                                                                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ประเภทเอกสาร</div>
                                                                            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                                                                                {d.documentType ? (
                                                                                    <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '4px 10px', borderRadius: 8 }}>{d.documentType}</span>
                                                                                ) : (
                                                                                    <span style={{ color: '#94a3b8' }}>ไม่ระบุประเภท</span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
                                                                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>วันที่เอกสาร</div>
                                                                            <div style={{ fontSize: 16, fontWeight: 700, color: '#334155' }}>
                                                                                {d.documentDate || <span style={{ color: '#94a3b8', fontSize: 14, fontWeight: 400 }}>ไม่พบวันที่</span>}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* ─ Raw Data ─ */}
                                                                {d.rawData && Object.keys(d.rawData).length > 0 && (
                                                                    <details style={{ marginTop: 4 }}>
                                                                        <summary style={{
                                                                            fontSize: 10, color: '#a1a5b3', cursor: 'pointer', fontWeight: 600,
                                                                            padding: '6px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4,
                                                                            background: '#fff', border: '1px solid #eef0f2', transition: 'all 0.15s'
                                                                        }}>🔍 ข้อมูลดิบจาก OCR</summary>
                                                                        <div style={{
                                                                            marginTop: 8, padding: 12, background: '#fff', borderRadius: 10,
                                                                            border: '1px solid #eef0f2', fontSize: 11, fontFamily: "'JetBrains Mono',Consolas,monospace",
                                                                            whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 240, overflow: 'auto', color: '#475569', lineHeight: 1.6
                                                                        }}>
                                                                            {JSON.stringify(d.rawData, null, 2)}
                                                                        </div>
                                                                    </details>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                        )}
                    </div>
                )
            )}

            {/* ═══════ FILE BROWSER TAB ═══════ */}
            {tab === 'browser' && (
                <div style={S.card}>
                    {/* Path Input Bar */}
                    <div style={S.pathBar}>
                        <button onClick={goUp} disabled={!currentPath}
                            style={{ ...S.upBtn, opacity: currentPath ? 1 : 0.4 }}>
                            ↑
                        </button>
                        <input
                            type="text" value={pathInput}
                            onChange={e => setPathInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handlePathSubmit() }}
                            placeholder="วาง path โฟลเดอร์ที่นี่ เช่น V:\เอกสาร\invoices"
                            style={S.pathInput}
                            onFocus={e => { e.target.style.borderColor = '#f97316'; e.target.style.boxShadow = '0 0 0 3px rgba(249,115,22,0.1)' }}
                            onBlur={e => { e.target.style.borderColor = '#e2e5ea'; e.target.style.boxShadow = 'none' }}
                        />
                        <button onClick={handlePathSubmit} style={S.goBtn}>→</button>
                    </div>

                    {/* Action Chips */}
                    {currentPath && (
                        <div style={S.actionBar}>
                            <button onClick={selectAllOcr} style={S.chipBtn(false)}>☑ เลือกทั้งหมด</button>
                            {selectedFiles.length > 0 && (
                                <>
                                    <button onClick={() => setSelectedFiles([])} style={S.chipBtn(false)}>✕ ล้าง ({selectedFiles.length})</button>
                                    <button onClick={startBatch} style={S.startBtn}>🚀 เริ่ม OCR ({selectedFiles.length})</button>
                                </>
                            )}
                        </div>
                    )}

                    {/* File List / Empty */}
                    {!currentPath && files.length === 0 ? (
                        <div style={S.empty}>
                            <div style={{ fontSize: 44, marginBottom: 14, opacity: 0.7 }}>📂</div>
                            <div style={S.emptyTitle}>วาง path โฟลเดอร์แล้วกด Enter</div>
                            <div style={S.emptySub}>
                                เช่น <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 5, fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }}>V:\Documents\invoices</code>
                            </div>
                        </div>
                    ) : (
                        <div style={{ maxHeight: 'calc(100vh - 440px)', overflow: 'auto' }}>
                            {loading ? (
                                <div style={{ ...S.empty, padding: '40px 20px' }}>
                                    <div style={{ fontSize: 28, animation: 'ocr-spin 1s linear infinite', display: 'inline-block' }}>⏳</div>
                                    <div style={{ ...S.emptySub, marginTop: 8 }}>กำลังโหลด...</div>
                                </div>
                            ) : files.length === 0 ? (
                                <div style={{ ...S.empty, padding: '40px 20px' }}>
                                    <div style={{ fontSize: 28, marginBottom: 6 }}>📭</div>
                                    <div style={S.emptySub}>โฟลเดอร์ว่าง</div>
                                </div>
                            ) : (
                                files.map((f, i) => {
                                    const isDir = f.isDirectory, isOcr = !isDir && isOcrFile(f.name)
                                    const isSel = selectedFiles.includes(f.path)
                                    const ext = f.name.split('.').pop()?.toLowerCase()
                                    return (
                                        <div key={i}
                                            onClick={() => isDir ? browseTo(f.path) : isOcr ? toggleFile(f.path) : null}
                                            style={{ ...S.fileRow(isSel, i % 2 === 1), opacity: !isDir && !isOcr ? 0.35 : 1, cursor: isDir || isOcr ? 'pointer' : 'default' }}
                                            onMouseOver={e => { if (isDir || isOcr) e.currentTarget.style.background = isSel ? 'rgba(249,115,22,0.1)' : '#f5f7ff' }}
                                            onMouseOut={e => { e.currentTarget.style.background = isSel ? 'rgba(249,115,22,0.06)' : (i % 2 === 1 ? '#fafbfc' : '#fff') }}>
                                            <div style={{ width: 20, textAlign: 'center', flexShrink: 0 }}>
                                                {!isDir && isOcr ? (
                                                    <input type="checkbox" checked={isSel} readOnly style={{ width: 15, height: 15, accentColor: '#f97316', cursor: 'pointer' }} />
                                                ) : null}
                                            </div>
                                            <div style={{ fontSize: 16, flexShrink: 0 }}>{isDir ? '📁' : (FILE_ICONS[ext] || '📎')}</div>
                                            {(() => {
                                                const parsed = !isDir ? parseDocFilename(f.name) : null
                                                const badgeC = parsed ? getDocBadgeColor(parsed.docType) : null
                                                return (
                                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                                                        <span style={{ fontWeight: isDir ? 600 : 400, fontSize: 13, color: '#2d2d3a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>
                                                            {f.name}
                                                        </span>
                                                        {parsed && (
                                                            <span style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                                flexShrink: 0, flexWrap: 'nowrap'
                                                            }}>
                                                                <span style={{
                                                                    fontSize: 10, fontWeight: 700, padding: '2px 7px',
                                                                    borderRadius: 6, background: badgeC.bg, color: badgeC.color,
                                                                    border: `1px solid ${badgeC.border}`, whiteSpace: 'nowrap'
                                                                }}>{parsed.docType}</span>
                                                                {parsed.accountCodes.length > 0 && parsed.accountCodes.map((c, ci) => (
                                                                    <span key={ci} style={{
                                                                        fontSize: 10, fontWeight: 600, padding: '2px 6px',
                                                                        borderRadius: 6, background: '#ecfdf5', color: '#059669',
                                                                        border: '1px solid #a7f3d0', whiteSpace: 'nowrap'
                                                                    }}>📋{c}</span>
                                                                ))}
                                                                {parsed.paymentCodes.length > 0 && parsed.paymentCodes.map((c, ci) => (
                                                                    <span key={ci} style={{
                                                                        fontSize: 10, fontWeight: 600, padding: '2px 6px',
                                                                        borderRadius: 6, background: '#fdf2f8', color: '#db2777',
                                                                        border: '1px solid #fbcfe8', whiteSpace: 'nowrap'
                                                                    }}>💳{c}</span>
                                                                ))}
                                                            </span>
                                                        )}
                                                    </div>
                                                )
                                            })()}
                                            <div style={{ fontSize: 11, color: '#a1a5b3', flexShrink: 0, width: 70, textAlign: 'right' }}>{isDir ? '' : fmt.size(f.size)}</div>
                                            <div style={{ fontSize: 10, color: '#c4c8d4', flexShrink: 0, width: 50, textAlign: 'right', fontWeight: 600 }}>{isDir ? '' : ext?.toUpperCase()}</div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )}

                    {/* Bottom Selection Bar */}
                    {selectedFiles.length > 0 && (
                        <div style={S.bottomBar}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#2d2d3a' }}>
                                ✅ เลือกแล้ว <strong style={{ color: '#ea580c' }}>{selectedFiles.length}</strong> ไฟล์
                                <span style={{ color: '#a1a5b3', marginLeft: 8, fontWeight: 400 }}>เลือกข้ามโฟลเดอร์ได้</span>
                            </div>
                            <button onClick={startBatch} style={{ ...S.startBtn, padding: '6px 16px' }}>🚀 เริ่ม OCR แล้วไปดูคิว</button>
                        </div>
                    )}
                </div>
            )}

            {/* ═══════ RESULTS TAB ═══════ */}
            {tab === 'results' && (
                <div>
                    {doneJobs.length === 0 ? (
                        <div style={{ ...S.card, ...S.empty }}>
                            <div style={S.emptyIcon}>📭</div>
                            <div style={S.emptyTitle}>ยังไม่มีผลลัพธ์</div>
                            <div style={S.emptySub}>เมื่อ Job เสร็จแล้วจะแสดงที่นี่</div>
                        </div>
                    ) : doneJobs.map(j => (
                        <div key={j.jobId} style={{ ...S.card, padding: 14, marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                        <Badge status={j.status} />
                                        <span style={{ fontWeight: 700, fontSize: 12, color: '#2d2d3a' }}>{j.success}/{j.totalFiles} ไฟล์</span>
                                        <span style={{ fontSize: 11, color: '#8b8fa3' }}>💳 {j.creditsUsed} · ⏱️ {fmt.ms(j.elapsedMs)}</span>
                                    </div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }} title={j.jobName}>
                                        📁 {j.jobName || 'คิวงาน OCR'}
                                    </div>
                                </div>
                                <span style={{ fontSize: 11, color: '#a1a5b3' }}>{j.createdBy?.displayName} · {fmt.ago(j.createdAt)}</span>
                            </div>
                            <button onClick={() => { setSelectedJobId(j.jobId); setTab('queue') }}
                                style={{ ...S.chipBtn(true), fontSize: 11 }}>📊 ดูรายละเอียด</button>
                        </div>
                    ))}
                </div>
            )}

            {/* ═══════ BOT COMMAND TAB ═══════ */}
            {tab === 'bot-command' && (
                <div>
                    {/* ── Section 1: สั่งบอททำงาน ── */}
                    <div style={{
                        background: '#fff', borderRadius: 16, padding: '24px 28px',
                        border: '1px solid #e5e7eb', marginBottom: 20,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: 12,
                                background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20
                            }}>🤖</div>
                            <div>
                                <div style={{ fontSize: 16, fontWeight: 800, color: '#1e3a5f' }}>สั่งบอททำงาน</div>
                                <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>เลือกไฟล์ Excel ที่ OCR อ่านได้ แล้วสั่งบอทเริ่มทำงาน</div>
                            </div>
                            <div style={{
                                marginLeft: 'auto', padding: '5px 14px', borderRadius: 8,
                                background: '#fef3c7', border: '1px solid #fde68a',
                                color: '#92400e', fontSize: 11, fontWeight: 700
                            }}>🚧 รอการพัฒนา</div>
                        </div>

                        {/* File Path Input */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10
                        }}>
                            <span style={{ fontSize: 18, flexShrink: 0 }}>📂</span>
                            <input
                                type="text"
                                value={botExcelPath}
                                onChange={e => {
                                    const val = e.target.value
                                    setBotExcelPath(val)
                                    // Auto-detect Build Code from path
                                    // Pattern: S:\Build627 บริษัท... or V:\A.โฟร์เดอร์\Build000 ทดสอบ\...
                                    const match = val.match(/[/\\](Build\d+)\s+([^/\\]+)/i)
                                    if (match) {
                                        setBotBuildCode(match[1])
                                        setBotBuildName(match[2].trim())
                                    } else {
                                        // Try simpler: just "Build\d+" anywhere
                                        const m2 = val.match(/(Build\d+)/i)
                                        if (m2) {
                                            setBotBuildCode(m2[1])
                                            setBotBuildName('')
                                        } else {
                                            setBotBuildCode('')
                                            setBotBuildName('')
                                        }
                                    }
                                }}
                                placeholder="วาง Path ไฟล์ Excel ที่นี่ เช่น S:\Build627 บริษัท...\OCR_Export.xlsx"
                                style={{
                                    flex: 1, padding: '12px 16px', borderRadius: 12,
                                    border: `1.5px solid ${botExcelPath ? '#3b82f6' : '#e2e8f0'}`,
                                    background: botExcelPath ? '#fff' : '#f8fafc',
                                    fontSize: 13, color: '#334155', fontFamily: "'JetBrains Mono',monospace",
                                    outline: 'none', transition: 'border-color 0.2s'
                                }}
                            />
                        </div>

                        {/* Detected Build Code Display */}
                        {botBuildCode && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, marginTop: 12,
                                padding: '10px 16px', borderRadius: 12,
                                background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                                border: '1px solid #bbf7d0'
                            }}>
                                <span style={{ fontSize: 16 }}>✅</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>ตรวจพบ Build Code อัตโนมัติ</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                        <span style={{
                                            padding: '3px 12px', borderRadius: 8,
                                            background: '#eff6ff', border: '1px solid #bfdbfe',
                                            color: '#2563eb', fontSize: 13, fontWeight: 800,
                                            fontFamily: "'JetBrains Mono',monospace"
                                        }}>{botBuildCode}</span>
                                        {botBuildName && (
                                            <span style={{ fontSize: 12, color: '#334155', fontWeight: 600 }}>{botBuildName}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Build Code Manual Input + Action */}
                        <div style={{
                            display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, marginTop: 16
                        }}>
                            <div style={{
                                padding: '12px 16px', borderRadius: 12,
                                border: `1.5px solid ${botBuildCode ? '#3b82f6' : '#e2e8f0'}`,
                                background: botBuildCode ? '#eff6ff' : '#f8fafc',
                                display: 'flex', alignItems: 'center', gap: 10,
                                fontSize: 13, transition: 'all 0.2s'
                            }}>
                                <span style={{ fontSize: 16 }}>🏢</span>
                                <span style={{ color: botBuildCode ? '#2563eb' : '#94a3b8', fontWeight: botBuildCode ? 700 : 400 }}>
                                    {botBuildCode ? `${botBuildCode}${botBuildName ? ` — ${botBuildName}` : ''}` : 'Build Code จะถูกตรวจจับจาก Path อัตโนมัติ'}
                                </span>
                            </div>
                            <button
                                disabled={!botMatchedProfile || botStarting}
                                onClick={handleStartBot}
                                style={{
                                    padding: '12px 28px', borderRadius: 12, border: 'none',
                                    background: botMatchedProfile && !botStarting
                                        ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                                        : 'linear-gradient(135deg, #94a3b8, #cbd5e1)',
                                    color: '#fff', fontSize: 14, fontWeight: 700,
                                    cursor: botMatchedProfile && !botStarting ? 'pointer' : 'not-allowed',
                                    whiteSpace: 'nowrap',
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    transition: 'all 0.2s',
                                    boxShadow: botMatchedProfile && !botStarting ? '0 4px 14px rgba(59,130,246,0.3)' : 'none'
                                }}>
                                {botStarting ? '⏳ กำลังเปิดบอท...' : '🤖 สั่งบอทเริ่มทำงาน'}
                            </button>
                        </div>

                        {/* Matched Profile Display */}
                        {botProfileLoading && (
                            <div style={{
                                marginTop: 12, padding: '14px 18px', borderRadius: 12,
                                background: '#f8fafc', border: '1px solid #e2e8f0',
                                display: 'flex', alignItems: 'center', gap: 10
                            }}>
                                <div style={{
                                    width: 18, height: 18, border: '2px solid #3b82f6',
                                    borderTopColor: 'transparent', borderRadius: '50%',
                                    animation: 'ocr-spin 0.6s linear infinite'
                                }} />
                                <span style={{ fontSize: 13, color: '#64748b' }}>กำลังค้นหาข้อมูลบอท...</span>
                            </div>
                        )}

                        {!botProfileLoading && botBuildCode && botMatchedProfile && (
                            <div style={{
                                marginTop: 12, borderRadius: 14,
                                border: '1px solid #bfdbfe', overflow: 'hidden'
                            }}>
                                {/* Header */}
                                <div style={{
                                    padding: '12px 18px',
                                    background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                                    display: 'flex', alignItems: 'center', gap: 10
                                }}>
                                    <span style={{ fontSize: 18 }}>🤖</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 14, fontWeight: 800, color: '#1e3a5f' }}>
                                            {botMatchedProfile.id} — {botMatchedProfile.platform}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>
                                            ✅ พบข้อมูลบอทในฐานข้อมูล
                                        </div>
                                    </div>
                                    <span style={{
                                        padding: '4px 12px', borderRadius: 8,
                                        fontSize: 11, fontWeight: 700,
                                        background: botMatchedProfile.status === 'idle' ? '#f0fdf4' : '#fef3c7',
                                        border: `1px solid ${botMatchedProfile.status === 'idle' ? '#bbf7d0' : '#fde68a'}`,
                                        color: botMatchedProfile.status === 'idle' ? '#16a34a' : '#92400e'
                                    }}>
                                        {botMatchedProfile.status === 'idle' ? '🟢 พร้อมใช้งาน' : '🟡 ' + botMatchedProfile.status}
                                    </span>
                                </div>
                                {/* Details */}
                                <div style={{ padding: '14px 18px', background: '#fff' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 12 }}>
                                        {[
                                            { label: 'ชื่อผู้ใช้', value: botMatchedProfile.username, icon: '👤' },
                                            { label: 'รหัสผ่าน', value: botMatchedProfile.password, icon: '🔒' },
                                            { label: 'โปรแกรม', value: botMatchedProfile.software, icon: '💻' },
                                            { label: 'PEAK Code', value: botMatchedProfile.peak_code || '—', icon: '🔑' },
                                            { 
                                                label: 'จดทะเบียนภาษี', 
                                                value: botMatchedProfile.vat_status === 'registered' ? 'จดทะเบียนภาษีมูลค่าเพิ่ม' : 
                                                       botMatchedProfile.vat_status === 'unregistered' ? 'ยังไม่จดภาษีมูลค่าเพิ่ม' : 
                                                       (botMatchedProfile.vat_status || 'ไม่ระบุ'), 
                                                icon: '📝' 
                                            },
                                        ].map((item, i) => (
                                            <div key={i} style={{
                                                padding: '10px 12px', borderRadius: 10,
                                                background: '#f8fafc', border: '1px solid #e5e7eb'
                                            }}>
                                                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 3 }}>
                                                    {item.icon} {item.label}
                                                </div>
                                                <div style={{
                                                    fontSize: 13, fontWeight: 700, color: '#1e293b',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                }}>{item.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* PDF Configs */}
                                    {botMatchedProfile.pdfConfigs && botMatchedProfile.pdfConfigs.length > 0 && (
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>
                                                📋 ข้อมูลสำหรับบอท PDF ({botMatchedProfile.pdfConfigs.length} รายการ)
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {botMatchedProfile.pdfConfigs.map((cfg, i) => (
                                                    <div key={i} style={{
                                                        display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr',
                                                        gap: 8, padding: '8px 12px', borderRadius: 8,
                                                        background: '#f8fafc', border: '1px solid #e5e7eb', fontSize: 12
                                                    }}>
                                                        <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>บริษัท:</span> <span style={{ fontWeight: 700, color: '#1e293b' }}>{cfg.company_name || '—'}</span></div>
                                                        <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>ลูกค้า:</span> <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{cfg.customer_code || '—'}</span></div>
                                                        <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>บัญชี:</span> <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{cfg.account_code || '—'}</span></div>
                                                        <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>จ่าย:</span> <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{cfg.payment_code || '—'}</span></div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {!botProfileLoading && botBuildCode && !botMatchedProfile && (
                            <div style={{
                                marginTop: 12, padding: '12px 18px', borderRadius: 12,
                                background: '#fef2f2', border: '1px solid #fecaca',
                                display: 'flex', alignItems: 'center', gap: 10
                            }}>
                                <span style={{ fontSize: 16 }}>⚠️</span>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>
                                        ไม่พบข้อมูลบอทสำหรับ {botBuildCode}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#991b1b', marginTop: 2 }}>
                                        กรุณาเพิ่มข้อมูลบอทในหน้า "ฐานข้อมูล" ก่อน
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Section 2: Bot Command Center (Light Theme) ── */}
                    <div style={{
                        background: '#fff', borderRadius: 20, padding: '28px 28px 24px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                        position: 'relative', overflow: 'hidden'
                    }}>
                        {/* Subtle background accents */}
                        <div style={{
                            position: 'absolute', top: -40, right: -40, width: 200, height: 200,
                            background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)',
                            pointerEvents: 'none'
                        }} />
                        <div style={{
                            position: 'absolute', bottom: -30, left: -30, width: 160, height: 160,
                            background: 'radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)',
                            pointerEvents: 'none'
                        }} />

                        {/* Header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20,
                            position: 'relative', zIndex: 1
                        }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: 14,
                                background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                                border: '1px solid #bfdbfe',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 22
                            }}>🤖</div>
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontSize: 17, fontWeight: 800, color: '#1e3a5f',
                                    letterSpacing: '0.02em'
                                }}>Bot Command Center</div>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                    สถานะระบบ • {new Date().toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </div>
                            </div>

                            {/* Capacity Meter */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                    <span style={{
                                        fontSize: 10, fontWeight: 700, color: '#94a3b8',
                                        fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.05em'
                                    }}>ACTIVE BOTS</span>
                                    <div style={{ display: 'flex', gap: 3 }}>
                                        {Array.from({ length: botQueueInfo.maxConcurrent }, (_, i) => (
                                            <div key={i} style={{
                                                width: 8, height: 22, borderRadius: 3,
                                                background: i < botQueueInfo.runningCount
                                                    ? 'linear-gradient(180deg, #3b82f6, #2563eb)'
                                                    : '#f1f5f9',
                                                border: `1px solid ${i < botQueueInfo.runningCount ? '#93c5fd' : '#e2e8f0'}`,
                                                boxShadow: i < botQueueInfo.runningCount ? '0 2px 6px rgba(59,130,246,0.25)' : 'none',
                                                transition: 'all 0.4s ease'
                                            }} />
                                        ))}
                                    </div>
                                </div>
                                <span style={{
                                    padding: '6px 14px', borderRadius: 10, fontSize: 14, fontWeight: 800,
                                    background: botQueueInfo.runningCount > 0 ? '#eff6ff' : '#f8fafc',
                                    border: `1px solid ${botQueueInfo.runningCount > 0 ? '#bfdbfe' : '#e2e8f0'}`,
                                    color: botQueueInfo.runningCount > 0 ? '#2563eb' : '#94a3b8',
                                    fontFamily: "'JetBrains Mono',monospace"
                                }}>
                                    {botQueueInfo.runningCount}/{botQueueInfo.maxConcurrent}
                                </span>
                                {botQueueInfo.queuedCount > 0 && (
                                    <span style={{
                                        padding: '6px 14px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                                        background: '#fffbeb', border: '1px solid #fde68a',
                                        color: '#b45309'
                                    }}>
                                        ⏳ รอคิว {botQueueInfo.queuedCount}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Job List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', zIndex: 1 }}>
                            {botJobsList.length === 0 && (
                                <div style={{
                                    textAlign: 'center', padding: '52px 20px',
                                    background: '#f8fafc', borderRadius: 16,
                                    border: '1px dashed #e2e8f0'
                                }}>
                                    <div style={{ fontSize: 42, marginBottom: 12, opacity: 0.5 }}>🤖</div>
                                    <div style={{
                                        fontSize: 14, fontWeight: 700, color: '#94a3b8', marginBottom: 4
                                    }}>
                                        ยังไม่มีคิวงาน
                                    </div>
                                    <div style={{ fontSize: 11, color: '#cbd5e1' }}>
                                        เมื่อสั่งบอททำงานแล้วจะแสดงที่นี่
                                    </div>
                                </div>
                            )}

                            {botJobsList.map((job, jobIdx) => {
                                const statusConfig = {
                                    queued:    { label: '⏳ รอคิว',       accent: '#d97706', bg: '#fffbeb', border: '#fde68a', light: '#fef3c7' },
                                    running:   { label: '⚡ กำลังทำงาน', accent: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', light: '#dbeafe' },
                                    logged_in: { label: '🔐 Login แล้ว', accent: '#059669', bg: '#ecfdf5', border: '#a7f3d0', light: '#d1fae5' },
                                    working:   { label: '⚙️ กรอกข้อมูล', accent: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', light: '#dbeafe' },
                                    done:      { label: '✅ เสร็จสิ้น',   accent: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', light: '#dcfce7' },
                                    error:     { label: '❌ ผิดพลาด',    accent: '#dc2626', bg: '#fef2f2', border: '#fecaca', light: '#fee2e2' },
                                    stopped:   { label: '⏹️ หยุดแล้ว',   accent: '#64748b', bg: '#f8fafc', border: '#e2e8f0', light: '#f1f5f9' },
                                }
                                const s = statusConfig[job.status] || statusConfig.queued
                                const isActive = ['running', 'logged_in', 'working'].includes(job.status)
                                const isLogOpen = botActiveLogId === job.id
                                const botNumber = jobIdx + 1

                                // Count errors/warnings from logs (when logs are loaded for this job)
                                const jobLogs = isLogOpen ? botActiveLogs : []
                                const errorLogs = jobLogs.filter(l => l.level === 'error')
                                const warnLogs = jobLogs.filter(l => l.level === 'warn')

                                return (
                                    <div key={job.id} style={{
                                        borderRadius: 14, overflow: 'hidden',
                                        border: `1.5px solid ${isActive ? s.border : '#e2e8f0'}`,
                                        background: isActive
                                            ? `linear-gradient(135deg, ${s.bg}, #fff)`
                                            : '#fafbfc',
                                        boxShadow: isActive ? `0 4px 16px ${s.accent}15` : '0 1px 3px rgba(0,0,0,0.04)',
                                        transition: 'all 0.3s ease'
                                    }}>
                                        {/* Job Header */}
                                        <div style={{
                                            padding: '14px 18px',
                                            display: 'flex', alignItems: 'center', gap: 12
                                        }}>
                                            {/* Bot Avatar */}
                                            <div style={{
                                                position: 'relative',
                                                width: 42, height: 42, borderRadius: 12,
                                                background: `linear-gradient(135deg, ${s.bg}, ${s.light})`,
                                                border: `1.5px solid ${s.border}`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 18, flexShrink: 0
                                            }}>
                                                {isActive && (
                                                    <div style={{
                                                        position: 'absolute', inset: -4,
                                                        borderRadius: 15,
                                                        border: `2px solid ${s.accent}`,
                                                        opacity: 0.3,
                                                        animation: 'botPulse 2s ease-in-out infinite'
                                                    }} />
                                                )}
                                                🤖
                                            </div>

                                            {/* Bot Info */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: 14, fontWeight: 800, color: '#1e293b',
                                                    display: 'flex', alignItems: 'center', gap: 8
                                                }}>
                                                    <span style={{
                                                        color: s.accent, fontWeight: 900,
                                                        fontFamily: "'JetBrains Mono',monospace"
                                                    }}>BOT {botNumber}</span>
                                                    <span style={{ color: '#cbd5e1' }}>›</span>
                                                    <span style={{
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        color: '#334155'
                                                    }}>{job.profileName}</span>
                                                </div>
                                                <div style={{
                                                    fontSize: 11, color: '#94a3b8', marginTop: 2,
                                                    fontFamily: "'JetBrains Mono',monospace",
                                                    display: 'flex', gap: 8, alignItems: 'center'
                                                }}>
                                                    <span>ID: {job.id}</span>
                                                    <span style={{ color: '#e2e8f0' }}>•</span>
                                                    <span>📋 {job.logCount} logs</span>
                                                </div>
                                            </div>

                                            {/* Status Badge */}
                                            <div style={{
                                                padding: '5px 14px', borderRadius: 20,
                                                background: s.bg,
                                                border: `1px solid ${s.border}`,
                                                display: 'flex', alignItems: 'center', gap: 6
                                            }}>
                                                {isActive && (
                                                    <span style={{
                                                        width: 7, height: 7, borderRadius: '50%',
                                                        background: s.accent,
                                                        boxShadow: `0 0 6px ${s.accent}60`,
                                                        animation: 'botBlink 1.5s ease-in-out infinite',
                                                        display: 'inline-block'
                                                    }} />
                                                )}
                                                <span style={{
                                                    fontSize: 11, fontWeight: 700, color: s.accent
                                                }}>{s.label}</span>
                                            </div>

                                            {/* Actions */}
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button onClick={() => setBotActiveLogId(isLogOpen ? null : job.id)} style={{
                                                    padding: '6px 16px', borderRadius: 8,
                                                    border: `1px solid ${isLogOpen ? '#93c5fd' : '#e2e8f0'}`,
                                                    background: isLogOpen ? '#3b82f6' : '#f8fafc',
                                                    color: isLogOpen ? '#fff' : '#64748b',
                                                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}>
                                                    {isLogOpen ? '✕ ปิด' : '📋 ดู Log'}
                                                </button>
                                                {isActive && (
                                                    <button onClick={() => handleStopJob(job.id)} style={{
                                                        padding: '6px 16px', borderRadius: 8,
                                                        border: '1px solid #fecaca',
                                                        background: '#fef2f2', color: '#dc2626',
                                                        fontSize: 11, fontWeight: 700, cursor: 'pointer'
                                                    }}>
                                                        ⏹️ หยุด
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Error Report — shows when log is open and has errors */}
                                        {isLogOpen && (errorLogs.length > 0 || warnLogs.length > 0) && (() => {
                                            // Translate technical messages to user-friendly Thai
                                            const translateMsg = (msg) => {
                                                const m = (msg || '').replace(/^[❌⚠️✅🔐📋🔑⚙️📝▶️✕■⏹️🤖⏳🐛]+\s*/g, '').trim()
                                                const patterns = [
                                                    [/page\.goto.*Target page.*closed/i, 'หน้าเว็บถูกปิดไปก่อนที่บอทจะเปิดหน้าใหม่'],
                                                    [/page\.waitForTimeout.*closed/i, 'หน้าเว็บถูกปิดขณะบอทกำลังรอการโหลด'],
                                                    [/page\.waitForSelector.*closed/i, 'หน้าเว็บถูกปิดขณะบอทกำลังรอหาปุ่มหรือช่องกรอกข้อมูล'],
                                                    [/page\.click.*closed/i, 'หน้าเว็บถูกปิดขณะบอทกำลังกดปุ่ม'],
                                                    [/Target page.*context.*closed/i, 'เบราว์เซอร์ถูกปิดกลางคัน ทำให้บอททำงานต่อไม่ได้'],
                                                    [/browser has been closed/i, 'เบราว์เซอร์ถูกปิดไปแล้ว บอทไม่สามารถทำงานต่อได้'],
                                                    [/context.*closed/i, 'เบราว์เซอร์ถูกปิดกลางคัน'],
                                                    [/timeout.*exceeded/i, 'หน้าเว็บโหลดนานเกินไป (Timeout)'],
                                                    [/TimeoutError/i, 'หน้าเว็บโหลดนานเกินไป (Timeout)'],
                                                    [/net::ERR_/i, 'ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้ หรือเว็บปลายทาง offline'],
                                                    [/Navigation failed/i, 'เปิดหน้าเว็บไม่สำเร็จ อาจเกิดจากอินเทอร์เน็ตหรือเว็บล่ม'],
                                                    [/ไม่พบ.*ในรายชื่อ/i, null],
                                                    [/ตรวจสอบสิทธิ์ไม่สำเร็จ/i, null],
                                                    [/Page ถูกปิดจากภายนอก/i, 'หน้าเว็บถูกปิดจากภายนอก (อาจมีคนปิดเบราว์เซอร์)'],
                                                    [/Page ถูกปิดไปแล้ว/i, 'หน้าเว็บถูกปิดไปแล้ว'],
                                                    [/เกิดข้อผิดพลาด/i, null],
                                                    [/selector.*is not visible/i, 'บอทหาปุ่มหรือช่องกรอกข้อมูลไม่เจอ อาจเป็นเพราะหน้าเว็บเปลี่ยน'],
                                                    [/Cannot read prop/i, 'เกิดข้อผิดพลาดในระบบ (ข้อมูลบางอย่างหายไป)'],
                                                    [/ECONNREFUSED/i, 'เชื่อมต่อกับเซิร์ฟเวอร์ไม่ได้'],
                                                    [/ENOTFOUND/i, 'หาเซิร์ฟเวอร์ปลายทางไม่เจอ ตรวจสอบอินเทอร์เน็ต'],
                                                ]
                                                for (const [pattern, translation] of patterns) {
                                                    if (pattern.test(m)) {
                                                        return translation || m
                                                    }
                                                }
                                                // If message is already Thai, return as-is
                                                if (/[\u0E00-\u0E7F]/.test(m)) return m
                                                // Fallback: show original
                                                return m
                                            }

                                            // Generate summary sentence
                                            const summaryParts = []
                                            if (errorLogs.length > 0) summaryParts.push(`เกิดข้อผิดพลาด ${errorLogs.length} รายการ`)
                                            if (warnLogs.length > 0) summaryParts.push(`คำเตือน ${warnLogs.length} รายการ`)

                                            return (
                                            <div style={{ padding: '0 18px 12px' }}>
                                                <div style={{
                                                    background: errorLogs.length > 0
                                                        ? 'linear-gradient(135deg, #fef2f2, #fff5f5)'
                                                        : 'linear-gradient(135deg, #fffbeb, #fefce8)',
                                                    borderRadius: 12, padding: '16px 18px',
                                                    border: `1px solid ${errorLogs.length > 0 ? '#fecaca' : '#fde68a'}`
                                                }}>
                                                    {/* Header */}
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6
                                                    }}>
                                                        <span style={{ fontSize: 18 }}>
                                                            {errorLogs.length > 0 ? '📋' : '⚠️'}
                                                        </span>
                                                        <span style={{
                                                            fontSize: 14, fontWeight: 800,
                                                            color: errorLogs.length > 0 ? '#b91c1c' : '#92400e'
                                                        }}>
                                                            รายงานสรุปปัญหา
                                                        </span>
                                                        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                                                            {errorLogs.length > 0 && (
                                                                <span style={{
                                                                    padding: '3px 10px', borderRadius: 6,
                                                                    background: '#fee2e2', border: '1px solid #fecaca',
                                                                    fontSize: 11, fontWeight: 700, color: '#dc2626'
                                                                }}>
                                                                    ❌ {errorLogs.length} ข้อผิดพลาด
                                                                </span>
                                                            )}
                                                            {warnLogs.length > 0 && (
                                                                <span style={{
                                                                    padding: '3px 10px', borderRadius: 6,
                                                                    background: '#fef3c7', border: '1px solid #fde68a',
                                                                    fontSize: 11, fontWeight: 700, color: '#b45309'
                                                                }}>
                                                                    ⚠️ {warnLogs.length} คำเตือน
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Summary sentence */}
                                                    <div style={{
                                                        fontSize: 12.5, color: '#64748b', marginBottom: 12,
                                                        paddingLeft: 28, lineHeight: 1.6
                                                    }}>
                                                        การทำงานชุดนี้{summaryParts.join(' และ ')}
                                                        {errorLogs.length > 0
                                                            ? ' — บอทอาจทำงานไม่สำเร็จบางรายการ กรุณาตรวจสอบรายละเอียดด้านล่าง'
                                                            : ' — บอทยังคงทำงานต่อได้แต่มีจุดที่ต้องระวัง'}
                                                    </div>

                                                    {/* Error cards */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                        {errorLogs.map((log, i) => {
                                                            const friendly = translateMsg(log.message)
                                                            const isSameAsOriginal = friendly === (log.message || '').replace(/^[❌⚠️✅🔐📋🔑⚙️📝▶️✕■⏹️🤖⏳🐛]+\s*/g, '').trim()
                                                            const hasOriginalDetail = !isSameAsOriginal && log.message

                                                            return (
                                                                <div key={`err-${i}`} style={{
                                                                    padding: '10px 14px', borderRadius: 10,
                                                                    background: '#fff', border: '1px solid #fecaca',
                                                                }}>
                                                                    <div style={{
                                                                        display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: hasOriginalDetail ? 6 : 0
                                                                    }}>
                                                                        <span style={{
                                                                            fontSize: 10, color: '#fff', fontWeight: 700,
                                                                            background: '#ef4444', padding: '2px 8px', borderRadius: 4,
                                                                            flexShrink: 0, marginTop: 2
                                                                        }}>ผิดพลาด</span>
                                                                        <div style={{ fontSize: 13, color: '#991b1b', fontWeight: 600, lineHeight: 1.5 }}>
                                                                            {friendly}
                                                                        </div>
                                                                        <span style={{
                                                                            fontSize: 10, color: '#94a3b8', flexShrink: 0,
                                                                            fontFamily: "'JetBrains Mono',monospace"
                                                                        }}>{log.time}</span>
                                                                    </div>
                                                                    {hasOriginalDetail && (
                                                                        <div style={{
                                                                            fontSize: 10, color: '#94a3b8', paddingLeft: 50,
                                                                            fontFamily: "'JetBrains Mono',monospace",
                                                                            borderTop: '1px solid #fee2e2', paddingTop: 6,
                                                                            wordBreak: 'break-all'
                                                                        }}>
                                                                            💬 รายละเอียด: {log.message}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                        {warnLogs.map((log, i) => {
                                                            const friendly = translateMsg(log.message)
                                                            const isSameAsOriginal = friendly === (log.message || '').replace(/^[❌⚠️✅🔐📋🔑⚙️📝▶️✕■⏹️🤖⏳🐛]+\s*/g, '').trim()
                                                            const hasOriginalDetail = !isSameAsOriginal && log.message

                                                            return (
                                                                <div key={`warn-${i}`} style={{
                                                                    padding: '10px 14px', borderRadius: 10,
                                                                    background: '#fff', border: '1px solid #fde68a',
                                                                }}>
                                                                    <div style={{
                                                                        display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: hasOriginalDetail ? 6 : 0
                                                                    }}>
                                                                        <span style={{
                                                                            fontSize: 10, color: '#fff', fontWeight: 700,
                                                                            background: '#f59e0b', padding: '2px 8px', borderRadius: 4,
                                                                            flexShrink: 0, marginTop: 2
                                                                        }}>คำเตือน</span>
                                                                        <div style={{ fontSize: 13, color: '#92400e', fontWeight: 600, lineHeight: 1.5 }}>
                                                                            {friendly}
                                                                        </div>
                                                                        <span style={{
                                                                            fontSize: 10, color: '#94a3b8', flexShrink: 0,
                                                                            fontFamily: "'JetBrains Mono',monospace"
                                                                        }}>{log.time}</span>
                                                                    </div>
                                                                    {hasOriginalDetail && (
                                                                        <div style={{
                                                                            fontSize: 10, color: '#94a3b8', paddingLeft: 50,
                                                                            fontFamily: "'JetBrains Mono',monospace",
                                                                            borderTop: '1px solid #fef3c7', paddingTop: 6,
                                                                            wordBreak: 'break-all'
                                                                        }}>
                                                                            💬 รายละเอียด: {log.message}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                            )
                                        })()}

                                        {/* Log Viewer — Terminal */}
                                        {isLogOpen && (
                                            <div style={{ padding: '0 18px 14px' }}>
                                                <div style={{
                                                    background: '#0f172a', borderRadius: 12, overflow: 'hidden',
                                                    border: '1px solid #1e293b'
                                                }}>
                                                    {/* Terminal Title Bar */}
                                                    <div style={{
                                                        padding: '7px 14px',
                                                        background: '#1e293b',
                                                        borderBottom: '1px solid #334155',
                                                        display: 'flex', alignItems: 'center', gap: 8
                                                    }}>
                                                        <div style={{ display: 'flex', gap: 5 }}>
                                                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
                                                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fbbf24' }} />
                                                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
                                                        </div>
                                                        <span style={{
                                                            fontSize: 10, color: '#64748b',
                                                            fontFamily: "'JetBrains Mono',monospace"
                                                        }}>
                                                            bot_{job.id} — {botActiveLogs.length} entries
                                                        </span>
                                                    </div>

                                                    {/* Terminal Content */}
                                                    <div style={{
                                                        padding: '12px 16px', maxHeight: 320, overflowY: 'auto',
                                                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                                        fontSize: 12, lineHeight: 1.8
                                                    }}>
                                                        {botActiveLogs.length === 0 ? (
                                                            <div style={{ color: '#475569' }}>
                                                                <span style={{ color: '#3b82f6' }}>$</span> กำลังโหลด...
                                                                <span style={{
                                                                    display: 'inline-block', width: 7, height: 14,
                                                                    background: '#3b82f6', marginLeft: 2,
                                                                    animation: 'botBlink 1s step-end infinite',
                                                                    verticalAlign: 'text-bottom'
                                                                }} />
                                                            </div>
                                                        ) : (
                                                            botActiveLogs.map((log, i) => {
                                                                const colors = {
                                                                    info: '#94a3b8',
                                                                    success: '#4ade80',
                                                                    warn: '#fbbf24',
                                                                    error: '#f87171'
                                                                }
                                                                return (
                                                                    <div key={i} style={{
                                                                        color: colors[log.level] || '#94a3b8',
                                                                        borderLeft: log.level === 'error' ? '2px solid #ef4444'
                                                                            : log.level === 'warn' ? '2px solid #f59e0b'
                                                                            : log.level === 'success' ? '2px solid #10b981'
                                                                            : '2px solid transparent',
                                                                        paddingLeft: 10, marginBottom: 1
                                                                    }}>
                                                                        <span style={{ color: '#475569', fontSize: 10 }}>[{log.time}]</span>{' '}
                                                                        {log.message}
                                                                    </div>
                                                                )
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* CSS Animations */}
                    <style>{`
                        @keyframes botPulse {
                            0%, 100% { transform: scale(1); opacity: 0.3; }
                            50% { transform: scale(1.12); opacity: 0; }
                        }
                        @keyframes botBlink {
                            0%, 100% { opacity: 1; }
                            50% { opacity: 0.2; }
                        }
                    `}</style>
                </div>
            )}

            {/* ═══════ DUPLICATE CONFIRMATION MODAL ═══════ */}
            {showDupModal && dupData && createPortal(
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 99999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
                    animation: 'ocr-fadeIn 0.2s ease'
                }}>
                    <div style={{
                        background: '#fff', borderRadius: 22, width: '94%', maxWidth: 780,
                        boxShadow: '0 24px 64px rgba(0,0,0,0.22)', overflow: 'hidden',
                        animation: 'ocr-slideUp 0.3s ease'
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '24px 32px 20px',
                            background: 'linear-gradient(135deg, #fff7ed, #fef3c7)',
                            borderBottom: '1px solid #fde68a'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
                                <span style={{ fontSize: 36 }}>⚠️</span>
                                <div>
                                    <div style={{ fontSize: 20, fontWeight: 800, color: '#92400e' }}>พบไฟล์ที่เคยอ่านแล้ว</div>
                                    <div style={{ fontSize: 14, color: '#b45309', marginTop: 4 }}>
                                        พบ <strong>{dupData.duplicateCount}</strong> ไฟล์ซ้ำ จากทั้งหมด {dupData.totalFiles} ไฟล์
                                        {dupData.newCount > 0 && <> · ไฟล์ใหม่ <strong style={{ color: '#16a34a' }}>{dupData.newCount}</strong> ไฟล์</>}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Duplicate List */}
                        <div style={{ padding: '16px 32px', maxHeight: 460, overflowY: 'auto' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', marginBottom: 12, letterSpacing: '0.03em' }}>
                                📋 ไฟล์ที่เคยอ่านแล้ว:
                            </div>
                            {dupData.duplicates.map((d, i) => (
                                <div key={i} style={{
                                    padding: '18px 20px', marginBottom: 14,
                                    background: '#fefce8', borderRadius: 14,
                                    border: '1px solid #fef08a'
                                }}>
                                    {/* Row 1: File name + OCR date + Preview */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                                        <span style={{ fontSize: 24, flexShrink: 0 }}>📄</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: 15, fontWeight: 700, color: '#1e293b',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                            }}>{d.fileName}</div>
                                            <div style={{ fontSize: 13, color: '#92400e', marginTop: 3 }}>
                                                {d.documentType || 'ไม่ระบุประเภท'}
                                                {d.documentDate ? ` · วันที่เอกสาร: ${d.documentDate}` : ''}
                                            </div>
                                        </div>
                                        {/* Preview Button */}
                                        <button
                                            onClick={() => {
                                                const token = 'bypass';
                                                const url = `/api/tools/serve-file?filePath=${encodeURIComponent(d.filePath)}&token=${token}`;
                                                window.open(url, '_blank');
                                            }}
                                            style={{
                                                flexShrink: 0, padding: '8px 14px', border: '1.5px solid #3b82f6',
                                                borderRadius: 10, background: 'rgba(59,130,246,0.06)', cursor: 'pointer',
                                                fontSize: 12, fontWeight: 700, color: '#3b82f6',
                                                display: 'flex', alignItems: 'center', gap: 5,
                                                transition: 'all 0.15s'
                                            }}
                                            onMouseEnter={e => { e.target.style.background = '#3b82f6'; e.target.style.color = '#fff' }}
                                            onMouseLeave={e => { e.target.style.background = 'rgba(59,130,246,0.06)'; e.target.style.color = '#3b82f6' }}
                                            title="เปิดดูไฟล์ต้นฉบับ"
                                        >
                                            👁️ ดูไฟล์
                                        </button>
                                        <div style={{
                                            textAlign: 'right', flexShrink: 0, padding: '6px 14px',
                                            background: 'rgba(249,115,22,0.08)', borderRadius: 10
                                        }}>
                                            <div style={{ fontSize: 11, color: '#a1a5b3', fontWeight: 600 }}>อ่านเมื่อ</div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: '#ea580c' }}>
                                                {d.ocrDate ? new Date(d.ocrDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Row 2: Document Info Pills */}
                                    {d.documentNumber && (
                                        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                                            <span style={{
                                                fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 8,
                                                background: 'rgba(59,130,246,0.08)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.15)'
                                            }}>🔢 เลขที่: {d.documentNumber}</span>
                                        </div>
                                    )}

                                    {/* Row 3: Seller & Buyer */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                                        {/* Seller */}
                                        <div style={{
                                            padding: '10px 14px', background: '#fff', borderRadius: 10,
                                            borderLeft: '4px solid #3b82f6', fontSize: 13
                                        }}>
                                            <div style={{ fontWeight: 700, color: '#3b82f6', marginBottom: 4, fontSize: 11 }}>🏢 ผู้ขาย</div>
                                            <div style={{ fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {d.sellerName || '—'}
                                            </div>
                                            {d.sellerTaxId && (
                                                <div style={{ color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", marginTop: 3, fontSize: 11 }}>
                                                    Tax: {d.sellerTaxId}
                                                </div>
                                            )}
                                        </div>
                                        {/* Buyer */}
                                        <div style={{
                                            padding: '10px 14px', background: '#fff', borderRadius: 10,
                                            borderLeft: '4px solid #8b5cf6', fontSize: 13
                                        }}>
                                            <div style={{ fontWeight: 700, color: '#8b5cf6', marginBottom: 4, fontSize: 11 }}>🧑‍💼 ผู้ซื้อ</div>
                                            <div style={{ fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {d.buyerName || '—'}
                                            </div>
                                            {d.buyerTaxId && (
                                                <div style={{ color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace", marginTop: 3, fontSize: 11 }}>
                                                    Tax: {d.buyerTaxId}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Row 4: Financial Summary */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
                                        background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                                        borderRadius: 12, border: '1px solid #e2e8f0'
                                    }}>
                                        <span style={{ fontSize: 18 }}>💰</span>
                                        <div style={{ display: 'flex', gap: 24, flex: 1, alignItems: 'center', fontSize: 14 }}>
                                            {d.subtotal && (
                                                <div>
                                                    <span style={{ color: '#64748b', fontWeight: 700, fontSize: 12 }}>ก่อน VAT </span>
                                                    <span style={{ fontWeight: 800, color: '#0f172a', fontFamily: "'JetBrains Mono',monospace", fontSize: 15 }}>
                                                        {parseFloat(d.subtotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            )}
                                            {d.vat && (
                                                <div>
                                                    <span style={{ color: '#64748b', fontWeight: 700, fontSize: 12 }}>VAT </span>
                                                    <span style={{ fontWeight: 800, color: '#0f172a', fontFamily: "'JetBrains Mono',monospace", fontSize: 15 }}>
                                                        {parseFloat(d.vat).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 800 }}>ยอดสุทธิ </span>
                                            <span style={{
                                                fontSize: 20, fontWeight: 900, color: '#1d4ed8',
                                                fontFamily: "'JetBrains Mono',monospace"
                                            }}>
                                                {d.total ? parseFloat(d.total).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Action Buttons */}
                        <div style={{
                            padding: '16px 24px 20px',
                            borderTop: '1px solid #f1f3f5',
                            display: 'flex', flexDirection: 'column', gap: 8
                        }}>
                            {/* Option 1: Skip duplicates, OCR only new */}
                            {dupData.newCount > 0 && (
                                <button
                                    onClick={() => proceedBatch(dupData.newFiles, false)}
                                    style={{
                                        width: '100%', padding: '12px 16px', border: 'none', borderRadius: 12,
                                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                        color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                                        boxShadow: '0 4px 12px rgba(34,197,94,0.3)', transition: 'all 0.15s',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                                    }}
                                    onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                                    onMouseOut={e => e.currentTarget.style.transform = 'none'}
                                >
                                    ✅ ข้ามไฟล์ซ้ำ — อ่านเฉพาะไฟล์ใหม่ ({dupData.newCount} ไฟล์)
                                </button>
                            )}

                            {/* Option 2: Force reprocess all */}
                            <button
                                onClick={() => proceedBatch(selectedFiles, true)}
                                style={{
                                    width: '100%', padding: '12px 16px', border: '2px solid #f97316', borderRadius: 12,
                                    background: 'linear-gradient(135deg, #fff7ed, #ffedd5)',
                                    color: '#ea580c', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                                    transition: 'all 0.15s',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                                }}
                                onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                                onMouseOut={e => e.currentTarget.style.transform = 'none'}
                            >
                                🔄 อ่านทั้งหมดใหม่ — อัพเดตข้อมูลทุกไฟล์ ({dupData.totalFiles} ไฟล์)
                            </button>

                            {/* Option 3: Use old data (+ OCR new files only) */}
                            <button
                                onClick={async () => {
                                    setShowDupModal(false);
                                    setDupData(null);
                                    toast.success(`✅ นำข้อมูลเก่ากลับมาใช้ ${dupData.duplicateCount} ไฟล์${dupData.newCount > 0 ? ` + อ่านใหม่ ${dupData.newCount} ไฟล์` : ''}`);
                                    await proceedBatch(selectedFiles, false);
                                }}
                                style={{
                                    width: '100%', padding: '12px 16px', border: '2px solid #3b82f6', borderRadius: 12,
                                    background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                                    color: '#2563eb', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                                    transition: 'all 0.15s',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                                }}
                                onMouseOver={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                                onMouseOut={e => e.currentTarget.style.transform = 'none'}
                            >
                                📥 ใช้ข้อมูลเก่า — ไม่ต้องอ่านซ้ำ ({dupData.duplicateCount} ไฟล์)
                            </button>

                            {/* Option 4: Cancel */}
                            <button
                                onClick={() => { setShowDupModal(false); setDupData(null) }}
                                style={{
                                    width: '100%', padding: '10px 16px', border: '1px solid #e2e5ea', borderRadius: 12,
                                    background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                    transition: 'all 0.15s',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                }}
                            >
                                ✕ ยกเลิก
                            </button>
                        </div>
                    </div>
                </div>
            , document.body)}

            {/* Excel File Selection Modal */}
            {showExcelModal && createPortal(
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999,
                    animation: 'ocr-fadeIn 0.2s ease-out'
                }}>
                    <div style={{
                        background: '#ffffff', borderRadius: 24, width: '100%', maxWidth: 480,
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden',
                        animation: 'ocr-slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '24px 24px 20px', borderBottom: '1px solid #f1f5f9',
                            display: 'flex', alignItems: 'center', gap: 16
                        }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: 16,
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 8px 16px rgba(16, 185, 129, 0.2)'
                            }}>
                                <span style={{ fontSize: 24, color: '#fff' }}>📊</span>
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 20, color: '#0f172a', fontWeight: 800, letterSpacing: '-0.02em' }}>
                                    เลือกไฟล์ Excel
                                </h3>
                                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
                                    พบมากกว่า 1 ไฟล์ กรุณาเลือกไฟล์ที่ต้องการใช้งานให้บอท
                                </p>
                            </div>
                        </div>

                        {/* List of Files */}
                        <div style={{ padding: '16px 24px', maxHeight: '400px', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {excelFilesList.map((file, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => executeStartBot(file)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 16, width: '100%',
                                            padding: '16px', background: '#f8fafc',
                                            border: '1px solid #e2e8f0', borderRadius: 16,
                                            textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}
                                        onMouseOver={e => {
                                            e.currentTarget.style.background = '#f0fdf4'
                                            e.currentTarget.style.borderColor = '#bbf7d0'
                                            e.currentTarget.style.transform = 'translateY(-2px)'
                                            e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(16, 185, 129, 0.1)'
                                        }}
                                        onMouseOut={e => {
                                            e.currentTarget.style.background = '#f8fafc'
                                            e.currentTarget.style.borderColor = '#e2e8f0'
                                            e.currentTarget.style.transform = 'translateY(0)'
                                            e.currentTarget.style.boxShadow = 'none'
                                        }}
                                    >
                                        <div style={{
                                            width: 40, height: 40, borderRadius: 12,
                                            background: '#fff', border: '1px solid #e2e8f0',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 20, boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                        }}>
                                            📁
                                        </div>
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <div style={{
                                                fontWeight: 600, color: '#1e293b', fontSize: 14,
                                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                            }}>
                                                {file}
                                            </div>
                                        </div>
                                        <div style={{ color: '#10b981', fontSize: 18 }}>→</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <button
                                onClick={() => setShowExcelModal(false)}
                                style={{
                                    width: '100%', padding: '12px', background: '#fff',
                                    border: '1px solid #cbd5e1', borderRadius: 12,
                                    color: '#64748b', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                                }}
                                onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                onMouseOut={e => e.currentTarget.style.background = '#fff'}
                            >
                                ✕ ยกเลิกหน้าต่างนี้
                            </button>
                        </div>
                    </div>
                </div>
            , document.body)}



            <style>{`
                @keyframes ocr-pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
                @keyframes ocr-spin { to { transform:rotate(360deg); } }
                @keyframes ocr-fadeIn { from { opacity:0; } to { opacity:1; } }
                @keyframes ocr-slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
            `}
            </style>
        </div>
    )
}
