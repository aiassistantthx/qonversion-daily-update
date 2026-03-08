import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/asa': {
        target: 'http://rwwc84wcsgkc48g88wsoco4o.46.225.26.104.sslip.io',
        changeOrigin: true,
      },
    },
  },
})
