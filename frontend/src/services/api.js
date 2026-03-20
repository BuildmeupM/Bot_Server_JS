import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    timeout: 300000, // 5min for large files
});

// Attach JWT token from localStorage to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle 401 responses — redirect to login
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            // Only redirect if not already on login page
            if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// Auth
export const login = (username, password) => api.post('/auth/login', { username, password });
export const getMe = () => api.get('/auth/me');
export const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
};

// Files
export const browseDirectory = (dirPath) => api.post('/files/browse', { dirPath });
export const getDrives = () => api.get('/files/drives');
export const renameFile = (filePath, newName) => api.put('/files/rename', { filePath, newName });
export const moveFile = (filePath, destDir) => api.put('/files/move', { filePath, destDir });
export const deleteFile = (filePath) => api.delete('/files/delete', { data: { filePath } });

// PDF
export const getPdfInfo = (filePath) => api.get('/pdf/info', { params: { path: filePath } });
export const splitPdf = (data) => api.post('/pdf/split', data);
export const unlockPdf = (data) => api.post('/pdf/unlock', data);

// Get preview URL
export const getPreviewUrl = (filePath) => {
    const token = localStorage.getItem('token');
    return `/api/files/preview?path=${encodeURIComponent(filePath)}&token=${token}`;
};

// Tools
export const convertHeic = (data) => api.post('/tools/heic-convert', data);
export const convertHeicBatch = (data) => api.post('/tools/heic-convert-batch', data);
export const extractArchive = (data) => api.post('/tools/extract-archive', data);
export const mergePdf = (data) => api.post('/pdf/merge', data);
export const pdfToImage = (data) => api.post('/pdf/to-image', data);
export const createZip = (data) => api.post('/tools/create-zip', data);
export const unlockExcel = (data) => api.post('/tools/unlock-excel', data);
export const imageToPdf = (data) => api.post('/tools/image-to-pdf', data);

// Get text file content for preview
export const getFileContent = (filePath) => api.get('/files/preview', {
    params: { path: filePath },
    responseType: 'text',
    transformResponse: [(data) => data],
});

// Rename Process
export const executeRename = (data) => api.post('/rename-process/execute', data);
export const executeBatchRename = (data) => api.post('/rename-process/execute-batch', data);
export const backupAllFiles = (directoryPath, fileNames) => api.post('/rename-process/backup-all', { directoryPath, fileNames });
export const consolidateFiles = (directoryPath, recursive) => api.post('/rename-process/consolidate', { directoryPath, recursive });

// Companies
export const getCompanies = (search, group_code) => api.get('/companies', { params: { search, group_code } });
export const getCompany = (id) => api.get(`/companies/${id}`);
export const createCompany = (data) => api.post('/companies', data);
export const updateCompany = (id, data) => api.put(`/companies/${id}`, data);
export const deleteCompany = (id) => api.delete(`/companies/${id}`);
// Usage Logs
export const logUsage = (data) => api.post('/usage-logs', data).catch(() => { });  // silent fail
export const getUsageSummary = (params) => api.get('/usage-logs/summary', { params });
export const deleteUsageLog = (id) => api.delete(`/usage-logs/${id}`);

// OCR
export const getOcrHealth = () => api.get('/ocr/health');
export const checkDuplicates = (filePaths) => api.post('/ocr/check-duplicates', { filePaths });
export const startBatchOcr = (filePaths, maxWorkers, forceReprocess) => api.post('/ocr/batch-process', { filePaths, maxWorkers, forceReprocess });
export const getBatchStatus = (jobId) => api.get(`/ocr/batch-status/${jobId}`);
export const getBatchJobs = () => api.get('/ocr/batch-jobs');

// Bot Database
export const getBotProfiles = () => api.get('/bot-database/profiles');
export const createBotProfile = (data) => api.post('/bot-database/profiles', data);
export const updateBotProfile = (id, data) => api.put(`/bot-database/profiles/${id}`, data);
export const deleteBotProfile = (id) => api.delete(`/bot-database/profiles/${id}`);
export const getBotCredentials = () => api.get('/bot-database/credentials');
export const createBotCredential = (data) => api.post('/bot-database/credentials', data);
export const deleteBotCredential = (id) => api.delete(`/bot-database/credentials/${id}`);

// Bot Automation (Queue System)
export const getExcelFiles = (dir) => api.get('/bot-automation/excel-files', { params: { dir } });
export const startBot = (data) => api.post('/bot-automation/start', data);
export const getBotJobs = () => api.get('/bot-automation/jobs');
export const getBotLogs = (jobId) => api.get(`/bot-automation/logs/${jobId}`);
export const stopBotJob = (jobId) => api.post(`/bot-automation/stop/${jobId}`);

export default api;
