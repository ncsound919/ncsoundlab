import { test, expect, devices } from '@playwright/test';

test('desktop entry opens the Sound Design stage and never loads the field studio', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(new URL(request.url()).pathname));

  await page.goto('/');
  await expect(page.getByRole('main').getByRole('heading', { name: 'Layers & Samples' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: /demo|paywall|welcome/i })).toHaveCount(0);

  expect(requested.some((path) => path.includes('/src/field.tsx'))).toBe(false);
  expect(requested.some((path) => path.includes('FieldStudio'))).toBe(false);
});

test('field entry opens the phone studio and never loads the desktop app', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(new URL(request.url()).pathname));

  await page.goto('/field.html');
  await expect(page.getByRole('heading', { name: 'FIELD', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record' })).toBeVisible();
  await expect(page.getByText('PRODUCTION PIPELINE')).toHaveCount(0);

  expect(requested.some((path) => path.includes('/src/App.tsx'))).toBe(false);
  expect(requested.some((path) => path.includes('/node_modules/.vite/deps/tone'))).toBe(false);
});

test('a phone opening the root is routed to the field entry', async ({ browser }) => {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    baseURL: test.info().project.use.baseURL,
  });
  const page = await context.newPage();
  await page.goto('/');

  await expect(page).toHaveURL(/\/field\.html$/);
  await expect(page.getByRole('heading', { name: 'FIELD', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record' })).toBeVisible();

  await context.close();
});

test('legacy field links redirect and the desktop override still works', async ({ page, browser }) => {
  await page.goto('/#/field');
  await expect(page).toHaveURL(/\/field\.html$/);
  await expect(page.getByRole('heading', { name: 'FIELD', exact: true })).toBeVisible();

  const context = await browser.newContext({
    ...devices['iPhone 13'],
    baseURL: test.info().project.use.baseURL,
  });
  const phone = await context.newPage();
  await phone.goto('/?surface=desktop');
  await expect(phone.getByRole('main').getByRole('heading', { name: 'Layers & Samples' })).toBeVisible();

  await context.close();
});

test('ships an installable manifest that starts the field entry', async ({ page, request }) => {
  await page.goto('/field.html');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.json');

  const response = await request.get('/manifest.json');
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest.start_url).toBe('/field.html');
  expect(manifest.scope).toBe('/');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512'])
  );
});
