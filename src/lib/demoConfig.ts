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
 * Per-kit purchase links (Stripe Payment Links). Lets a web visitor buy a
 * premium sound kit directly without first owning the desktop app — the S2
 * revenue stream. Keyed by kit id (see FACTORY_KITS in SoundKitCatalog).
 * Override any entry at build time with `VITE_KIT_<ID>_URL`.
 */
const envKitUrl = (key: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const v = (import.meta.env as Record<string, string | undefined>)[key];
    if (v) return v;
  }
  return '';
};

export const KIT_PURCHASE_URLS: Record<string, string> = {
  'factory-1': envKitUrl('VITE_KIT_FACTORY_1_URL') || '',
  'factory-3': envKitUrl('VITE_KIT_FACTORY_3_URL') || '',
};
