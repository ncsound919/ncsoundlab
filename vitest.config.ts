import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    exclude: ['e2e/**/*', 'node_modules/**/*', 'dist/**/*'],
    // Windows-safe test profile.
    // The V8 "Committing semi space failed" crash (nodejs#32265) is a Windows
    // VirtualAlloc commit-charge race. Empirical pattern on this repo:
    //  - Capping worker count (maxWorkers) makes it WORSE: Vitest reuses a fixed
    //    set of worker processes across the file queue, so fewer workers = each
    //    churns through far more test files sequentially, accumulating jsdom
    //    memory and V8 old-space growth per process before exiting. Leave the
    //    pool at default parallelism so each worker's lifetime (and heap growth)
    //    stays short.
    //  - Keep V8's incremental/concurrent marking enabled: disabling it forces
    //    big pressure-driven scavenges that trigger the commit-charge race.
    //  - A moderate old-space cap gives workers headroom (768 was the only
    //    fully-green combination measured).
    // If a semi-space crash still shows up on a Windows CI runner, the right
    // mitigation is a job-level retry (re-run the failed CI step), since Vitest
    // `retry` only re-executes failed *tests*, not a worker that hard-crashed.
    execArgv: ['--max-old-space-size=768'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/**/*', 'dist/**/*', 'e2e/**/*', 'src/tests/**/*'],
    },
  },
});
