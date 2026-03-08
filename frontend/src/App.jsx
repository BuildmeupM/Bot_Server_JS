import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import HomePage from './pages/HomePage'
import ManagePage from './pages/docsort/ManagePage'
import ToolsPage from './pages/docsort/ToolsPage'
import CompanyPage from './pages/docsort/CompanyPage'
import DashboardPage from './pages/docsort/DashboardPage'
import ManualPage from './pages/docsort/ManualPage'
import BotAutomationPage from './pages/bot/BotAutomationPage'
import OcrDashboardPage from './pages/bot/OcrDashboardPage'
import OcrBuildReportPage from './pages/bot/OcrBuildReportPage'
import AkmReaderPage from './pages/akm-reader/AkmReaderPage'
import BotDatabasePage from './pages/bot/BotDatabasePage'
import WithholdingTaxPage from './pages/tax/WithholdingTaxPage'

export default function App() {
    return (
        <BrowserRouter>
            <Toaster position="top-right" toastOptions={{
                style: { borderRadius: '10px', background: '#1e1e2d', color: '#fff', fontSize: '14px' }
            }} />
            <Routes>
                <Route path="/" element={<Navigate to="/home" replace />} />
                <Route path="/home" element={<HomePage />} />
                <Route path="/manage" element={<ManagePage />} />
                <Route path="/tools" element={<ToolsPage />} />
                <Route path="/companies" element={<CompanyPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/manual" element={<ManualPage />} />
                <Route path="/bot-automation" element={<BotAutomationPage />} />
                <Route path="/bot-database" element={<BotDatabasePage />} />
                <Route path="/ocr-dashboard" element={<OcrDashboardPage />} />
                <Route path="/ocr-report/:code" element={<OcrBuildReportPage />} />
                <Route path="/akm-reader" element={<AkmReaderPage />} />
                <Route path="/tax-certificate" element={<WithholdingTaxPage />} />
            </Routes>
        </BrowserRouter>
    )
}

