/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  beginDemoSession,
  expireDemoSession,
  formatCountdown,
  isDesktopBuild,
  readDemoStart,
  readDemoStatus,
  remainingMs,
  resolveActiveSession,
  unlockDemoSession,
} from './demoGate';
import { DEMO_SESSION_MS } from './demoConfig';

const ORIGINAL_LOCAL_STORAGE = globalThis.localStorage;

function withoutLocalStorage() {
  const store = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true, writable: true });
  return () => {
    Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
  };
}

describe('demoGate', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  afterEach(() => {
    globalThis.localStorage = ORIGINAL_LOCAL_STORAGE;
  });

  describe('isDesktopBuild', () => {
    it('returns true when running inside the Tauri shell', () => {
      Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true, writable: true });
      expect(isDesktopBuild()).toBe(true);
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    });

    it('returns false in a plain browser', () => {
      expect(isDesktopBuild()).toBe(false);
    });
  });

  it('degrades gracefully when localStorage is unavailable', () => {
    const restore = withoutLocalStorage();
    try {
      expect(readDemoStatus()).toBe('fresh');
      expect(readDemoStart()).toBeNull();
      expect(() => beginDemoSession(1_000)).not.toThrow();
      expect(() => expireDemoSession()).not.toThrow();
      expect(() => unlockDemoSession()).not.toThrow();
      expect(resolveActiveSession(1_000)).toEqual({ status: 'fresh', remaining: 0, expiresAt: 0 });
    } finally {
      restore();
    }
  });

  it('treats a non-numeric stored start as missing', () => {
    beginDemoSession(1_000_000);
    globalThis.localStorage.setItem('ncs_demo_start', 'not-a-number');
    expect(readDemoStart()).toBeNull();
  });

  it('starts fresh for a first-time visitor', () => {
    expect(readDemoStatus()).toBe('fresh');
  });

  it('begins a session and persists the start timestamp', () => {
    const now = 1_000_000;
    beginDemoSession(now);
    expect(readDemoStatus()).toBe('active');
    expect(readDemoStart()).toBe(now);
  });

  it('reports the full remaining time right after starting', () => {
    const now = 1_000_000;
    beginDemoSession(now);
    expect(resolveActiveSession(now)).toEqual({
      status: 'active',
      remaining: DEMO_SESSION_MS,
      expiresAt: now + DEMO_SESSION_MS,
    });
  });

  it('counts down remaining time as wall-clock advances', () => {
    const now = 1_000_000;
    beginDemoSession(now);
    const later = now + 60_000;
    const res = resolveActiveSession(later);
    expect(res.remaining).toBe(DEMO_SESSION_MS - 60_000);
    expect(res.expiresAt).toBe(now + DEMO_SESSION_MS);
  });

  it('expires the session when time runs out', () => {
    const now = 1_000_000;
    beginDemoSession(now);
    const res = resolveActiveSession(now + DEMO_SESSION_MS + 1);
    expect(res.status).toBe('expired');
    expect(res.remaining).toBe(0);
    expect(readDemoStatus()).toBe('expired');
  });

  it('stays expired after the session elapses (no reset on refresh)', () => {
    const now = 1_000_000;
    beginDemoSession(now);
    resolveActiveSession(now + DEMO_SESSION_MS + 1);
    expect(resolveActiveSession(now + DEMO_SESSION_MS + 999_999).status).toBe('expired');
  });

  it('honors an explicit expiry', () => {
    beginDemoSession(1_000_000);
    expireDemoSession();
    expect(readDemoStatus()).toBe('expired');
  });

  it('expires a corrupt active session that has no start timestamp', () => {
    globalThis.localStorage.setItem('ncs_demo_status', 'active');
    const res = resolveActiveSession(1_000);
    expect(res.status).toBe('expired');
    expect(res.remaining).toBe(0);
    expect(readDemoStatus()).toBe('expired');
  });

  it('unlocks permanently after purchase', () => {
    beginDemoSession(1_000_000);
    expireDemoSession();
    unlockDemoSession();
    expect(readDemoStatus()).toBe('purchased');
    expect(resolveActiveSession(1_000_000).status).toBe('purchased');
  });

  it('clamps remaining time at zero', () => {
    const start = 1_000_000;
    expect(remainingMs(start, start + DEMO_SESSION_MS + 100)).toBe(0);
  });

  describe('formatCountdown', () => {
    it('formats full minutes', () => {
      expect(formatCountdown(DEMO_SESSION_MS)).toBe('20:00');
    });

    it('pads seconds', () => {
      expect(formatCountdown(61_500)).toBe('1:02');
    });

    it('handles zero', () => {
      expect(formatCountdown(0)).toBe('0:00');
    });
  });
});
