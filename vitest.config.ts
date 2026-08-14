import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
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
