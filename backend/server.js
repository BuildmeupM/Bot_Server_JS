require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'uploads');
fs.ensureDirSync(uploadDir);

// Initialize MySQL (single database — SQLite removed)
const { initMySQL } = require('./mysql');
initMySQL();

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/files', require('./routes/files'));
app.use('/api/pdf', require('./routes/docsort/pdf'));
app.use('/api/tools', require('./routes/docsort/tools'));
app.use('/api/rename-process', require('./routes/docsort'));
app.use('/api/companies', require('./routes/companies'));
app.use('/api/usage-logs', require('./routes/usage-logs'));
app.use('/api/ocr', require('./routes/ocr'));
app.use('/api/companies-master', require('./routes/ocr/companies-master'));
app.use('/api/lan', require('./routes/lan'));
app.use('/api/bot-database', require('./routes/bot-database'));
app.use('/api/bot-automation', require('./routes/bot-automation'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'DocSort Pro API is running' });
});

// Global error handler — catches unhandled errors from all routes
app.use((err, req, res, _next) => {
    console.error('❌ Unhandled Error:', err.message);
    console.error(err.stack);

    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        error: process.env.NODE_ENV === 'production'
            ? 'เกิดข้อผิดพลาดในระบบ'
            : err.message,
    });
});

app.listen(PORT, () => {
    console.log(`🚀 DocSort Pro Backend running on http://localhost:${PORT}`);
});
