import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  root: 'landing',
  envDir: path.resolve(__dirname),
  publicDir: path.resolve(__dirname, 'public'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5176
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-landing'),
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
  },
})
