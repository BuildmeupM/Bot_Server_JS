import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export { pdfjsLib }

export function formatSize(bytes) {
    if (!bytes) return '—'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
}

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif']

export const TAB_FILTERS = {
    split: f => !f.isDirectory && f.isPdf,
    unlock: f => !f.isDirectory && f.isPdf,
    merge: f => f.isDirectory || f.isPdf || IMAGE_EXTENSIONS.includes(f.name.toLowerCase().slice(f.name.lastIndexOf('.'))),
    pdfimg: f => f.isDirectory || f.isPdf,
    imgpdf: f => !f.isDirectory && IMAGE_EXTENSIONS.includes(f.name.toLowerCase().slice(f.name.lastIndexOf('.'))),
    heic: f => !f.isDirectory && ['.heic', '.heif'].includes(f.name.toLowerCase().slice(f.name.lastIndexOf('.'))),
    rar: f => !f.isDirectory && ['.rar', '.zip', '.7z'].includes(f.name.toLowerCase().slice(f.name.lastIndexOf('.'))),
    zip: f => !f.isDirectory,
    excel: f => !f.isDirectory && f.name.toLowerCase().endsWith('.xlsx'),
}

export const CHUNK_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#14b8a6', '#f59e0b', '#ec4899', '#6366f1', '#06b6d4']
