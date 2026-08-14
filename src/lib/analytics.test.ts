/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { trackEvent, readEventLog, clearEventLog } from './analytics';

describe('analytics', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as any).dataLayer;
    delete (window as any).gtag;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records events into the local event log', () => {
    trackEvent('demo_started', { source: 'welcome' });
    const log = readEventLog();
    expect(log).toHaveLength(1);
    expect(log[0].name).toBe('demo_started');
    expect(log[0].props).toEqual({ source: 'welcome' });
  });

  it('pushes to dataLayer when GTM is present', () => {
    const dataLayer: unknown[] = [];
    (window as any).dataLayer = dataLayer;
    trackEvent('purchased');
    expect(dataLayer).toHaveLength(1);
    expect(dataLayer[0]).toMatchObject({ event: 'purchased' });
  });

  it('calls gtag when present', () => {
    const gtag = vi.fn();
    (window as any).gtag = gtag;
    trackEvent('paywall_seen');
    expect(gtag).toHaveBeenCalledWith('event', 'paywall_seen', {});
  });

  it('does not throw in storage-less environments', () => {
    const badStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
      clear: () => { throw new Error('denied'); },
      key: () => null,
      length: 0,
    };
    vi.stubGlobal('localStorage', badStorage);
    expect(() => trackEvent('demo_started')).not.toThrow();
    expect(() => readEventLog()).not.toThrow();
  });

  it('caps the local log length', () => {
    for (let i = 0; i < 150; i++) trackEvent(`evt_${i}`);
    const log = readEventLog();
    expect(log.length).toBeLessThanOrEqual(100);
  });

  it('clears the log', () => {
    trackEvent('demo_started');
    clearEventLog();
    expect(readEventLog()).toHaveLength(0);
  });
});
