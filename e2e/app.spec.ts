import { test, expect } from '@playwright/test';

test('has required ui elements', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ncs_demo_status', 'purchased');
  });
  await page.goto('/');
  // Default stage is the Sound Lab (Synth Layering & Samples)
  await expect(page.getByRole('main').getByRole('heading', { name: 'Synth Layering & Samples' })).toBeVisible();
});

test('web demo shows the timed-session welcome gate for a fresh visitor', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Welcome to NC Sound Lab' })).toBeVisible();
  await page.getByRole('button', { name: /Start my 20-minute demo/i }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome to NC Sound Lab' })).toBeHidden();
  await expect(page.getByRole('button', { name: /Demo/i })).toBeVisible();
});

test('expired demo shows the paywall with purchase and installer links', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ncs_demo_status', 'expired');
  });
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'Free demo session ended' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Get NC Sound Lab Desktop/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Download Windows installer/i })).toBeVisible();
});
