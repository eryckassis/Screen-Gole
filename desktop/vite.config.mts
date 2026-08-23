import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const desktopRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: desktopRoot,
  plugins: [react()],
  clearScreen: false,
  server: {
    host: 'localhost',
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: resolve(desktopRoot, 'dist'),
    emptyOutDir: true,
  },
})
