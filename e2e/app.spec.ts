import { test, expect } from '@playwright/test';

test('has required ui elements', async ({ page }) => {
  await page.goto('/');
  // Default stage is the Sound Lab (Synth Layering & Samples)
  await expect(page.locator('h2', { hasText: 'Synth Layering & Samples' })).toBeVisible();
});
