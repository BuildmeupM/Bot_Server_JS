import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Plugin: LAN Access Guard
// Polls backend every 5s to check if LAN access is enabled
// Blocks non-localhost requests with 403 when disabled
function lanAccessGuard() {
    let lanEnabled = false
    let pollTimer = null

    async function pollStatus() {
        try {
            const res = await fetch('http://localhost:4000/api/lan')
            const data = await res.json()
            lanEnabled = data.enabled
        } catch {
            // Backend not ready yet — default to blocked
            lanEnabled = false
        }
    }

    return {
        name: 'lan-access-guard',
        configureServer(server) {
            // Start polling
            pollStatus()
            pollTimer = setInterval(pollStatus, 5000)

            // Cleanup on server close
            server.httpServer?.on('close', () => {
                if (pollTimer) clearInterval(pollTimer)
            })

            // Middleware to check incoming request IP
            server.middlewares.use((req, res, next) => {
                const remoteIP = req.socket.remoteAddress || ''

                // Always allow localhost / loopback
                const isLocal =
                    remoteIP === '127.0.0.1' ||
                    remoteIP === '::1' ||
                    remoteIP === '::ffff:127.0.0.1' ||
                    remoteIP === '' ||
                    remoteIP === '0.0.0.0'

                if (isLocal || lanEnabled) {
                    return next()
                }

                // Block external access
                res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' })
                res.end(`
                    <html>
                    <head><title>403 - Access Denied</title></head>
                    <body style="font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1e1e2d;color:#fff;margin:0">
                        <div style="text-align:center">
                            <div style="font-size:64px;margin-bottom:16px">🔒</div>
                            <h1 style="font-size:24px;margin-bottom:8px">ปิดการเข้าถึงจากภายนอก</h1>
                            <p style="color:#a0a3b1">LAN access is currently disabled by the administrator.</p>
                        </div>
                    </body>
                    </html>
                `)
            })
        }
    }
}

export default defineConfig({
    plugins: [react(), lanAccessGuard()],
    server: {
        host: true,  // Bind to 0.0.0.0 — accept LAN connections
        port: 8080,
        fs: {
            allow: [
                '..',
                'C:/Users/USER/.gemini/antigravity/brain/b12a1933-a8f2-41d1-8146-0c7b64ad8f9a'
            ]
        },
        proxy: {
            '/api': {
                target: 'http://localhost:4000',
                changeOrigin: true
            }
        }
    }
})
