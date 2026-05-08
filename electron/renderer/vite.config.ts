import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Resolve from root project node_modules so DaisyUI/Tailwind work properly
const rootDir = path.resolve(__dirname, '..', '..')

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@electron': path.resolve(__dirname, '..'),
    },
  },
  server: {
    port: 5177,
    fs: {
      allow: [rootDir],
    },
  },
  build: {
    outDir: path.resolve(__dirname, '..', 'dist-renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        control: path.resolve(__dirname, 'index.html'),
        overlay: path.resolve(__dirname, 'overlay.html'),
      },
    },
  },
})
