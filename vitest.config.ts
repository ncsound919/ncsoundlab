import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    exclude: ['e2e/**/*', 'node_modules/**/*', 'dist/**/*'],
    // Windows commit-charge workaround for "Committing semi space failed" in worker forks.
    // See https://github.com/nodejs/node/issues/32265 for the underlying V8 / OS commit pattern.
    // Disabling V8's concurrent/incremental marking threads stops the GC thread from racing
    // the main thread on semi-space VirtualAlloc under memory-pressure GC.
    // In Vitest 4, pool-specific options (formerly poolOptions.forks.execArgv) live at the top level.
    execArgv: ['--no-concurrent-marking', '--no-incremental-marking', '--max-old-space-size=256'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/**/*', 'dist/**/*', 'e2e/**/*', 'src/tests/**/*'],
    },
  },
});
