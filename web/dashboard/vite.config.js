import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// API must be running on port 3000 (npm run web from project root).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
      '/reports': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
