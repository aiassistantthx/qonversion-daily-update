import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/asa': {
        // Use SSH tunnel: ssh -L 3001:10.0.1.20:3000 -i ~/.ssh/coolify root@46.225.26.104
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
