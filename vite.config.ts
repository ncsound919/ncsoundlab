import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // Ignore build/artifacts dirs so Tauri/Node writing them cannot crash the watcher (EBUSY).
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/node_modules/**', '**/dist/**', '**/src-tauri/target/**', '**/playwright-report/**', '**/test-results/**'],
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'motion': ['motion', 'framer-motion'],
            'lucide': ['lucide-react']
          }
        }
      }
    }
  };
});
