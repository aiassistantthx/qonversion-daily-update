import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Production API key (from Coolify DASHBOARD_API_KEY)
const API_KEY = 'sk_dash_7f3k9m2x5p8q1n4v6b0c'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        // Use local API for development: http://localhost:3001
        target: 'http://rwwc84wcsgkc48g88wsoco4o.46.225.26.104.sslip.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        headers: {
          'X-API-Key': API_KEY,
        },
      },
    },
  },
})
