import { useState, useEffect } from 'react'
import Sidebar from '../../components/Sidebar'
import useFileBrowser from '../../hooks/useFileBrowser'
import useSplitPdf from '../../hooks/useSplitPdf'
import useUnlockPdf from '../../hooks/useUnlockPdf'
import useMergePdf from '../../hooks/useMergePdf'
import useHeicConvert from '../../hooks/useHeicConvert'
import usePdfToImage from '../../hooks/usePdfToImage'
import useRarExtract from '../../hooks/useRarExtract'
import useCreateZip from '../../hooks/useCreateZip'
import useUnlockExcel from '../../hooks/useUnlockExcel'
import useImageToPdf from '../../hooks/useImageToPdf'
import PageLightbox from '../../components/tools/PageLightbox'
import SplitTab from './tools/SplitTab'
import UnlockTab from './tools/UnlockTab'
import MergeTab from './tools/MergeTab'
import HeicTab from './tools/HeicTab'
import PdfToImageTab from './tools/PdfToImageTab'
import RarTab from './tools/RarTab'
import ZipTab from './tools/ZipTab'
import ExcelUnlockTab from './tools/ExcelUnlockTab'
import ImageToPdfTab from './tools/ImageToPdfTab'

export default function ToolsPage() {
    const [activeTab, setActiveTab] = useState('split')
    const browser = useFileBrowser(activeTab)
    const { currentPath, files, loading, loadFiles, pathInput, setPathInput, handleBrowse } = browser

    const split   = useSplitPdf(currentPath, loadFiles)
    const unlock  = useUnlockPdf(currentPath, loadFiles)
    const merge   = useMergePdf(currentPath, loadFiles)
    const heic    = useHeicConvert(currentPath, loadFiles)
    const pdfImg  = usePdfToImage(currentPath, loadFiles)
    const rar     = useRarExtract(currentPath, loadFiles)
    const zip     = useCreateZip(currentPath, loadFiles)
    const excel   = useUnlockExcel(currentPath, loadFiles)
    const imgPdf  = useImageToPdf(currentPath, loadFiles)

    // Sync output dirs when currentPath changes
    useEffect(() => {
        if (!currentPath) return
        split.setOutputDir(currentPath)
        unlock.setOutputDir(currentPath)
        merge.setOutputDir(currentPath)
        heic.setOutputDir(currentPath)
        pdfImg.setOutputDir(currentPath)
        rar.setOutputDir(currentPath)
        zip.setOutputDir(currentPath)
        excel.setOutputDir(currentPath)
        imgPdf.setOutputDir(currentPath)
    }, [currentPath])

    return (
        <div className="app-layout">
            <Sidebar active="tools" />
            <main className="main-content">
                <div className="page-header animate-in">
                    <div className="breadcrumb">หน้าหลัก / คัดแยกเอกสาร / การจัดการเอกสาร</div>
                    <h1>🔧 เครื่องมือจัดการเอกสาร</h1>
                    <p>แยก/รวม PDF, ปลดล็อค PDF/Excel, แปลง PDF เป็นรูป, แปลง HEIC, แตกไฟล์/รวมไฟล์ ZIP</p>
                </div>

                <div className="animate-in" style={{ animationDelay: '.05s' }}>
                    {/* จัดการไฟล์ PDF */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap' }}>📄 จัดการไฟล์ PDF</span>
                        <div style={{ flex: 1, height: 1, background: '#e5e7eb' }}></div>
                    </div>
                    <div className="page-tabs" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
                        <button className={`page-tab ${activeTab === 'split' ? 'active' : ''}`} onClick={() => setActiveTab('split')}>✂️ แยก PDF</button>
                        <button className={`page-tab ${activeTab === 'merge' ? 'active' : ''}`} onClick={() => setActiveTab('merge')}>📑 รวม PDF</button>
                        <button className={`page-tab ${activeTab === 'unlock' ? 'active' : ''}`} onClick={() => setActiveTab('unlock')}>🔓 ปลดล็อค PDF</button>
                        <button className={`page-tab ${activeTab === 'pdfimg' ? 'active' : ''}`} onClick={() => setActiveTab('pdfimg')}>🖼️ PDF เป็นภาพ</button>
                        <button className={`page-tab ${activeTab === 'imgpdf' ? 'active' : ''}`} onClick={() => setActiveTab('imgpdf')}>📸 ภาพเป็น PDF</button>
                    </div>
                    {/* จัดการไฟล์ ZIP */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap' }}>📦 จัดการไฟล์ ZIP</span>
                        <div style={{ flex: 1, height: 1, background: '#e5e7eb' }}></div>
                    </div>
                    <div className="page-tabs" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
                        <button className={`page-tab ${activeTab === 'rar' ? 'active' : ''}`} onClick={() => setActiveTab('rar')}>📦 แตกไฟล์ RAR</button>
                        <button className={`page-tab ${activeTab === 'zip' ? 'active' : ''}`} onClick={() => setActiveTab('zip')}>🗜️ รวมไฟล์ ZIP</button>
                    </div>
                    {/* อื่น ๆ */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap' }}>🔧 อื่น ๆ</span>
                        <div style={{ flex: 1, height: 1, background: '#e5e7eb' }}></div>
                    </div>
                    <div className="page-tabs" style={{ marginBottom: 6, flexWrap: 'wrap' }}>
                        <button className={`page-tab ${activeTab === 'heic' ? 'active' : ''}`} onClick={() => setActiveTab('heic')}>🖼️ แปลง HEIC</button>
                        <button className={`page-tab ${activeTab === 'excel' ? 'active' : ''}`} onClick={() => setActiveTab('excel')}>📊 ปลดล็อค Excel</button>
                    </div>
                </div>

                {/* Folder Picker */}
                <div className="folder-picker animate-in" style={{ animationDelay: '.08s' }}>
                    <div className="picker-row">
                        <span className="picker-label">📂 ที่อยู่โฟลเดอร์ทำงาน</span>
                        <button className="browse-btn" onClick={handleBrowse}>📂 เปิดโฟลเดอร์</button>
                    </div>
                    <input className="form-input" value={pathInput} onChange={e => setPathInput(e.target.value)}
                        placeholder="เช่น C:\Documents\PDF" onKeyDown={e => e.key === 'Enter' && handleBrowse()}
                        style={{ fontSize: 13 }} />
                </div>

                {/* Tab Content */}
                {activeTab === 'split'  && <SplitTab files={files} loading={loading} currentPath={currentPath} split={split} />}
                {activeTab === 'unlock' && <UnlockTab files={files} loading={loading} unlock={unlock} />}
                {activeTab === 'merge'  && <MergeTab files={files} loading={loading} currentPath={currentPath} setPathInput={setPathInput} loadFiles={loadFiles} merge={merge} />}
                {activeTab === 'heic'   && <HeicTab files={files} loading={loading} heic={heic} />}
                {activeTab === 'pdfimg' && <PdfToImageTab files={files} loading={loading} currentPath={currentPath} setPathInput={setPathInput} loadFiles={loadFiles} pdfImg={pdfImg} />}
                {activeTab === 'rar'    && <RarTab files={files} loading={loading} rar={rar} />}
                {activeTab === 'zip'    && <ZipTab files={files} loading={loading} zip={zip} />}
                {activeTab === 'excel'  && <ExcelUnlockTab files={files} loading={loading} excel={excel} />}
                {activeTab === 'imgpdf' && <ImageToPdfTab files={files} loading={loading} currentPath={currentPath} imgPdf={imgPdf} />}

                {/* PDF Page Lightbox */}
                {split.previewPage && split.pdfDoc && (
                    <PageLightbox
                        pdfDoc={split.pdfDoc}
                        pageNum={split.previewPage}
                        totalPages={split.splitInfo?.pageCount || 1}
                        onClose={() => split.setPreviewPage(null)}
                        onPrev={() => split.setPreviewPage(p => Math.max(1, p - 1))}
                        onNext={() => split.setPreviewPage(p => Math.min(split.splitInfo?.pageCount || 1, p + 1))}
                    />
                )}
            </main>
        </div>
    )
}
