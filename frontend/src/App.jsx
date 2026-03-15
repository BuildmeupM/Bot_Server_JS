import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import LoginPage from './pages/auth/LoginPage'
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

function ProtectedRoute({ children }) {
    const token = localStorage.getItem('token')
    if (!token) {
        return <Navigate to="/login" replace />
    }
    return children
}

export default function App() {
    return (
        <BrowserRouter>
            <Toaster position="top-right" toastOptions={{
                style: { borderRadius: '10px', background: '#1e1e2d', color: '#fff', fontSize: '14px' }
            }} />
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/" element={<Navigate to="/home" replace />} />
                <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
                <Route path="/manage" element={<ProtectedRoute><ManagePage /></ProtectedRoute>} />
                <Route path="/tools" element={<ProtectedRoute><ToolsPage /></ProtectedRoute>} />
                <Route path="/companies" element={<ProtectedRoute><CompanyPage /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                <Route path="/manual" element={<ProtectedRoute><ManualPage /></ProtectedRoute>} />
                <Route path="/bot-automation" element={<ProtectedRoute><BotAutomationPage /></ProtectedRoute>} />
                <Route path="/bot-database" element={<ProtectedRoute><BotDatabasePage /></ProtectedRoute>} />
                <Route path="/ocr-dashboard" element={<ProtectedRoute><OcrDashboardPage /></ProtectedRoute>} />
                <Route path="/ocr-report/:code" element={<ProtectedRoute><OcrBuildReportPage /></ProtectedRoute>} />
                <Route path="/akm-reader" element={<ProtectedRoute><AkmReaderPage /></ProtectedRoute>} />
                <Route path="/tax-certificate" element={<ProtectedRoute><WithholdingTaxPage /></ProtectedRoute>} />
            </Routes>
        </BrowserRouter>
    )
}
