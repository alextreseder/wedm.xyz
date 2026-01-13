import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react()
  ],
  assetsInclude: ['**/*.wasm'], // Treat WASM as static assets
  optimizeDeps: {
    exclude: ['opencascade.js']
  }
})
