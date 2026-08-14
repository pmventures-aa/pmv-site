import type { ServerResponse } from 'node:http'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:8788',
    changeOrigin: true,
    configure(proxy: { on: (event: 'error', listener: (err: Error, req: unknown, res: ServerResponse) => void) => void }) {
      proxy.on('error', (_err, _req, res) => {
        if (res.headersSent || typeof res.writeHead !== 'function') return
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'The API is not running on port 8788.' }))
      })
    },
  },
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/motion')) return 'motion'
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react-router') || id.includes('node_modules/react/')) return 'react-vendor'
        },
      },
    },
  },
})
