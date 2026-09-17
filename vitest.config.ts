import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Component/integration suites (App shell, AAF panel, SmartRandomizer) render
    // large jsdom trees and can exceed the 5s default on constrained Windows
    // boxes (small pagefile, Defender scanning, Mandatory ASLR). The ceiling is
    // for environment throughput, not for hiding hangs — genuine deadlocks still
    // fail, just at a higher bound.
    //
    // 30s rather than 15s because `npm run test:coverage` instruments every
    // module (roughly 2x slower) and the heaviest suites — App.coverage,
    // StudioSequencer.coverage, LayerEditor.coverage, audioEngine.extra — were
    // timing out at 15s under instrumentation on a 4-core box while passing
    // uninstrumented. The coverage gate reads that run, so a timeout there is a
    // false failure, not a real one.
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./src/tests/setup.ts'],
    exclude: ['e2e/**/*', 'node_modules/**/*', 'dist/**/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**/*',
        'dist/**/*',
        'e2e/**/*',
        'src/tests/**/*',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        'src/vite-env.d.ts',
      ],
      // Modest global floor so the suite as a whole can't regress. The real
      // gate for new/changed code is scripts/check-new-code-coverage.mjs (90%).
      thresholds: {
        statements: 40,
        branches: 32,
        functions: 40,
        lines: 40,
      },
    },
  },
});
