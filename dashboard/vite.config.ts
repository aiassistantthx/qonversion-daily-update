import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
          'X-API-Key': '0f2c53cb2211180b5d731a9ed90dd5ccac0e55f9286c2ddf',
        },
      },
    },
  },
})
