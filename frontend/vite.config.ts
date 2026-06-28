import path from 'path'
import { readFileSync } from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Read version from package.json at build time so the version stamp in
// the UI never drifts from the actual release. release.ps1 bumps
// package.json as part of every release, so this is always current.
// Uses import.meta.url because __dirname doesn't exist in ESM context.
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8')
)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
      '/download-thumbnails': 'http://localhost:5000',
    },
  },
})
