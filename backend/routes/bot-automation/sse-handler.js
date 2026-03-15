// SSE client tracking: jobId -> [res, res, ...]
const sseClients = new Map();

/**
 * Add a log entry to a job and notify SSE clients
 */
function addLog(jobs, jobId, level, message) {
    const job = jobs.get(jobId);
    if (!job) return;
    const entry = {
        time: new Date().toLocaleTimeString('th-TH', { hour12: false }),
        level,
        message,
    };
    job.logs.push(entry);

    // Notify SSE clients
    const clients = sseClients.get(jobId);
    if (clients && clients.length) {
        const data = JSON.stringify(entry);
        clients.forEach((res) => {
            try { res.write(`data: ${data}\n\n`); } catch (e) {}
        });
    }
}

/**
 * Register SSE route handlers on the router
 */
function registerSSERoutes(router, jobs) {
    router.get('/stream/:jobId', (req, res) => {
        const jobId = req.params.jobId;
        const job = jobs.get(jobId);
        if (!job) return res.status(404).json({ error: 'Job not found' });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        // Send existing logs first
        job.logs.forEach((entry) => {
            res.write(`data: ${JSON.stringify(entry)}\n\n`);
        });

        // Register client
        if (!sseClients.has(jobId)) sseClients.set(jobId, []);
        sseClients.get(jobId).push(res);

        // Cleanup on disconnect
        req.on('close', () => {
            const clients = sseClients.get(jobId);
            if (clients) {
                const idx = clients.indexOf(res);
                if (idx > -1) clients.splice(idx, 1);
                if (clients.length === 0) sseClients.delete(jobId);
            }
        });
    });
}

module.exports = { sseClients, addLog, registerSSERoutes };
