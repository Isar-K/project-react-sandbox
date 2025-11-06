import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // everything starting with /api will be sent to your live Flask server
      '/api': {
        target: 'https://gerritsxd.com/ships',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, ''), // removes the /api prefix
      },
    },
  },
})
