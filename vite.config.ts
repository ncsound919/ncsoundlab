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
          // Keep the entry chunk small by separating vendor libraries into
          // long-lived, cacheable groups. Function form so subpath imports
          // (e.g. react/jsx-runtime) are grouped with their package. Heavy
          // feature panels are already lazy-loaded on top of this.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react-vendor';
            if (/[\\/]node_modules[\\/](motion|framer-motion)[\\/]/.test(id)) return 'motion';
            if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return 'lucide';
            if (/[\\/]node_modules[\\/]tone[\\/]/.test(id)) return 'audio-engine';
            if (/[\\/]node_modules[\\/]tonal[\\/]/.test(id)) return 'music-theory';
            if (/[\\/]node_modules[\\/](dexie|jszip)[\\/]/.test(id)) return 'persistence';
            if (/[\\/]node_modules[\\/](meyda|wavesurfer\.js)[\\/]/.test(id)) return 'analysis';
            return 'vendor';
          },
        }
      }
    }
  };
});
