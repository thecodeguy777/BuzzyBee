import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ command }) => ({
  // vue-devtools is dev-only — strips out in production builds.
  plugins: [
    vue(),
    tailwindcss(),
    ...(command === 'serve' ? [vueDevTools()] : []),
  ],
  root: path.resolve(__dirname, 'electron/renderer'),
  envDir: path.resolve(__dirname),
  base: './',
  resolve: {
    alias: {
      '@electron': path.resolve(__dirname, 'electron'),
    },
  },
  server: {
    port: 5177,
  },
  build: {
    outDir: path.resolve(__dirname, 'electron/dist-renderer'),
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        control: path.resolve(__dirname, 'electron/renderer/index.html'),
        overlay: path.resolve(__dirname, 'electron/renderer/overlay.html'),
        dialer: path.resolve(__dirname, 'electron/renderer/dialer.html'),
      },
    },
  },
}))
