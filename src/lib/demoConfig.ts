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
