/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tiny dependency-free analytics helper.
 *
 * Pushes events to `window.dataLayer` when Google Tag Manager / gtag is
 * installed (drop the snippet into index.html), otherwise no-ops safely.
 * Also persists a small local event log under `ncs_events` so the funnel
 * (demo_started → paywall_seen → purchased) is introspectable without a
 * backend. Never throws — analytics must never break the app.
 */

export interface TrackEvent {
  name: string;
  props?: Record<string, unknown>;
  ts: number;
}

const LS_EVENTS = 'ncs_events';
const MAX_LOCAL_EVENTS = 100;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(name: string, props: Record<string, unknown> = {}): void {
  try {
    if (typeof window === 'undefined') return;
    const payload = { event: name, ...props };

    if (typeof window.dataLayer !== 'undefined') {
      window.dataLayer.push(payload);
    }
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, props);
    }

    const log: TrackEvent[] = readEventLog();
    log.push({ name, props, ts: Date.now() });
    while (log.length > MAX_LOCAL_EVENTS) log.shift();
    try {
      localStorage.setItem(LS_EVENTS, JSON.stringify(log));
    } catch {
      /* storage full / private mode — fine */
    }
  } catch {
    /* never break the app */
  }
}

export function readEventLog(): TrackEvent[] {
  try {
    const raw = localStorage.getItem(LS_EVENTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrackEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearEventLog(): void {
  try {
    localStorage.removeItem(LS_EVENTS);
  } catch {
    /* ignore */
  }
}
