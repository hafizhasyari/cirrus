import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Lockstep version (see CLAUDE.md's "Versioning" section) — read at build
// time from this package's own package.json, which scripts/bump-version.sh
// keeps in sync with the repo-root VERSION file, so the running frontend can
// display the exact version it was built from without a second source.
const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/auth': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
})
