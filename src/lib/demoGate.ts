/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEMO_SESSION_MS } from './demoConfig';

const LS_START = 'ncs_demo_start';
const LS_STATUS = 'ncs_demo_status';

export type DemoStatus = 'fresh' | 'active' | 'expired' | 'purchased';

export interface DemoResolution {
  status: DemoStatus;
  remaining: number;
  expiresAt: number;
}

export function isDesktopBuild(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window;
}

export function readDemoStatus(): DemoStatus {
  if (typeof localStorage === 'undefined') return 'fresh';
  const raw = localStorage.getItem(LS_STATUS);
  if (raw === 'purchased') return 'purchased';
  if (raw === 'expired') return 'expired';
  if (raw === 'active') return 'active';
  return 'fresh';
}

export function readDemoStart(): number | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(LS_START);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function beginDemoSession(now = Date.now()): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LS_START, String(now));
    localStorage.setItem(LS_STATUS, 'active');
  } catch {
    // quota-blocked / private mode — demo still works in-memory this session
  }
}

export function expireDemoSession(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LS_STATUS, 'expired');
  } catch {
    // ignore — non-fatal
  }
}

export function unlockDemoSession(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LS_STATUS, 'purchased');
  } catch {
    // ignore — non-fatal
  }
}

export function remainingMs(start: number, now = Date.now()): number {
  return Math.max(0, DEMO_SESSION_MS - (now - start));
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function resolveActiveSession(now = Date.now()): DemoResolution {
  const status = readDemoStatus();
  if (status === 'purchased' || status === 'expired' || status === 'fresh') {
    return { status, remaining: 0, expiresAt: 0 };
  }
  const start = readDemoStart();
  if (start === null) {
    expireDemoSession();
    return { status: 'expired', remaining: 0, expiresAt: 0 };
  }
  const remaining = remainingMs(start, now);
  if (remaining <= 0) {
    expireDemoSession();
    return { status: 'expired', remaining: 0, expiresAt: 0 };
  }
  return { status: 'active', remaining, expiresAt: start + DEMO_SESSION_MS };
}
