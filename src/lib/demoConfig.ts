/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * One-time purchase configuration.
 *
 * Create a $5 Payment Link in your Stripe Dashboard
 * (Stripe Dashboard → Products → Payment Links → "+ New") and paste the full
 * https://buy.stripe.com/... URL below, or set it at build/deploy time via the
 * `VITE_PURCHASE_URL` env var (e.g. in vercel.json env or your CI). The web
 * demo's paywall buttons open this link in a new tab. No accounts, no
 * memberships, no backend required.
 */
export const PURCHASE_URL =
  (import.meta.env && import.meta.env.VITE_PURCHASE_URL) ||
  'https://buy.stripe.com/eVqdRb5Ribjd4rN16e3oA07';
export const DOWNLOAD_URL =
  (import.meta.env && import.meta.env.VITE_DOWNLOAD_URL) ||
  'https://github.com/ncsound919/ncsoundlab/releases';
export const DEMO_PRICE_DISPLAY = '$5';
export const DEMO_PRODUCT_NAME = 'NC Sound Lab Desktop';
export const DEMO_SESSION_MS = 20 * 60 * 1000;

/**
 * Optional endpoint for capturing emails on the welcome gate. Set at build
 * time via `VITE_EMAIL_CAPTURE_URL` (e.g. a Formspree / Zapier / Netlify
 * form action). When unset, emails are stored locally only (no network).
 */
export const EMAIL_CAPTURE_URL =
  (import.meta.env && import.meta.env.VITE_EMAIL_CAPTURE_URL) || '';

/**
 * Founder's music — the real product behind the tool. The app gives back at
 * $5; the albums are what NCSOUND publishes. Set the streaming/store links
 * at build time via VITE_ALBUM_1_URL / VITE_ALBUM_2_URL. When unset, the
 * paywall shows the album names without links.
 */
export const ALBUM_1 = {
  title: 'Im Different',
  url:
    (import.meta.env && import.meta.env.VITE_ALBUM_1_URL) || '',
};
export const ALBUM_2 = {
  title: 'Free Lunch',
  url:
    (import.meta.env && import.meta.env.VITE_ALBUM_2_URL) || '',
};
