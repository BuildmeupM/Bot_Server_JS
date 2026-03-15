const { chromium } = require('playwright');

const MAX_CONCURRENT = 5;
const jobs = new Map();
const jobQueue = [];
let jobCounter = 0;
let sharedBrowser = null;

// Cleanup old jobs every hour (keep 24h)
setInterval(() => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (const [jobId, job] of jobs.entries()) {
        const jobAgeDate = job.finishedAt || job.createdAt;
        if (jobAgeDate && now - new Date(jobAgeDate).getTime() > ONE_DAY_MS) {
            if (job.context) {
                job.context.close().catch(console.error);
            }
            jobs.delete(jobId);
        }
    }
}, 60 * 60 * 1000);

function generateJobId() {
    jobCounter++;
    const ts = Date.now().toString(36);
    return `JOB-${ts}-${String(jobCounter).padStart(3, '0')}`;
}

function createJob(profileId, profile, excelPath) {
    const jobId = generateJobId();
    const job = {
        id: jobId,
        profileId,
        profileName: profile.platform,
        username: profile.username,
        software: profile.software,
        peakCode: profile.peak_code,
        vatStatus: profile.vat_status || 'registered',
        excelPath,
        status: 'queued',
        logs: [],
        browser: null,
        page: null,
        context: null,
        createdAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
    };
    jobs.set(jobId, job);
    return job;
}

function getRunningCount() {
    let count = 0;
    for (const job of jobs.values()) {
        if (['running', 'logged_in', 'working'].includes(job.status)) count++;
    }
    return count;
}

async function getSharedBrowser() {
    if (!sharedBrowser || !sharedBrowser.isConnected()) {
        sharedBrowser = await chromium.launch({
            headless: false,
            args: ['--start-maximized'],
        });
    }
    return sharedBrowser;
}

module.exports = {
    MAX_CONCURRENT,
    jobs,
    jobQueue,
    createJob,
    getRunningCount,
    getSharedBrowser,
};
