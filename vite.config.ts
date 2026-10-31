import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      // Offline-first field app. Workbox precaches the hashed build, so a phone
      // that installed the app keeps working with no signal — the hand-written
      // sw.js only ever cached the shell and fetched the JS at runtime.
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null,
        manifest: false, // public/manifest.json is maintained by hand
        workbox: {
          globPatterns: [
            '**/*.{js,css,html,png,svg,woff2,ttf,otf}',
            'manifest.json',
          ],
          // The 1.8 MB promo logo is a favicon, not an app asset: keep it out
          // of the install-time precache. The install icons are still included.
          // `/ncsound` is a separate static catalogue, so it is not app shell:
          // precaching it would add weight and let the app's navigation fallback
          // answer a catalogue URL.
          globIgnores: [
            'logo.png',
            'ncsound/**',
            // Phone-first install: the `**/*.js` glob above would otherwise put
            // every workstation lazy chunk into a phone install (~1.5 MB of code
            // the field entry can never reach). Each stem below is unreachable
            // from field.html. scripts/check-precache.mjs fails the gate if a
            // field-reachable file is excluded or a desktop-only chunk is
            // precached again, so this list cannot silently drift.
            'assets/AafExportPanel-*.js',
            'assets/AddToKitModal-*.js',
            'assets/App-*.js',
            'assets/ChopEditor-*.js',
            'assets/CompareEnginePanel-*.js',
            'assets/EvolutionPanel-*.js',
            'assets/FXChainPresetsPanel-*.js',
            'assets/Fader-*.js',
            'assets/KeyboardShortcutsModal-*.js',
            'assets/LayerEditor-*.js',
            'assets/LayerMixer-*.js',
            'assets/LayerPresetBrowser-*.js',
            'assets/MasterDynamicsPanel-*.js',
            'assets/ProjectManagerModal-*.js',
            'assets/SamplerUnit-*.js',
            'assets/SoundKitCatalog-*.js',
            'assets/SoundKitCreator-*.js',
            'assets/StudioRack-*.js',
            'assets/StudioSequencer-*.js',
            'assets/ThreeDSoundSpace-*.js',
            'assets/TimeStretch-*.js',
            'assets/UserManualModal-*.js',
            'assets/analysis-*.js',
            'assets/audio-engine-*.js',
            'assets/batchAudioProcessor-*.js',
            'assets/chopMaps-*.js',
            'assets/lucide-*.js',
            'assets/main-*.js',
            'assets/mixdown-*.js',
            'assets/motion-*.js',
            'assets/recourseEvolution-*.js',
            'assets/velocityLayers-*.js',
          ],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/\/ncsound(\/|$)/],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          // Workstation lazy chunks are excluded from the precache above, so
          // cache them the first time the desktop actually loads one — the
          // workstation still works offline after a normal online session,
          // while a phone install never fetches them at all.
          runtimeCaching: [
            {
              urlPattern: /\/assets\/.+\.js$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'lazy-chunks',
                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
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
        // Two HTML entries, two surfaces: the phone field studio cannot pull in
        // the desktop workstation's module graph (or vice versa).
        input: {
          main: path.resolve(__dirname, 'index.html'),
          field: path.resolve(__dirname, 'field.html'),
        },
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
