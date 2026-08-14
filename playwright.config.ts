import { defineConfig, devices } from '@playwright/test';

// Use a dedicated port so the Overlay365 ecosystem services that also bind
// port 3000 (e.g. Overlay Justice dev server) never collide with our E2E.
// Always start a fresh Vite server locally so a stale foreign process is
// never silently reused.
const E2E_PORT = 3117;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npx vite --port ${E2E_PORT} --strictPort`,
    url: `http://localhost:${E2E_PORT}`,
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
