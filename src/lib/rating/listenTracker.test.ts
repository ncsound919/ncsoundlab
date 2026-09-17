/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the listen-time accumulator + gate math.
 */

import { describe, it, expect } from 'vitest';
import { createListenTracker, hasMetListenGate } from './listenTracker';

describe('createListenTracker', () => {
  it('accumulates per-side time only while that side is active', () => {
    const t = createListenTracker();
    t.reset(0);
    t.setActive('A');
    t.tick(0); // baseline
    t.tick(10); // +10 A
    t.tick(25); // +15 A
    expect(t.msA()).toBe(25);
    expect(t.msB()).toBe(0);

    t.setActive('B'); // switch flushes the baseline
    t.tick(100); // baseline only
    t.tick(110); // +10 B
    expect(t.msA()).toBe(25);
    expect(t.msB()).toBe(10);
  });

  it('ignores implausibly large jumps (tab idle) and negative deltas', () => {
    const t = createListenTracker();
    t.reset(0);
    t.setActive('A');
    t.tick(0);
    t.tick(5000); // > 1000ms → ignored
    expect(t.msA()).toBe(0);
    t.tick(4990); // negative delta → ignored
    expect(t.msA()).toBe(0);
  });

  it('reset() zeroes counters and rearms the baseline', () => {
    const t = createListenTracker();
    t.reset(0);
    t.setActive('A');
    t.tick(0);
    t.tick(50);
    expect(t.msA()).toBe(50);

    t.reset(100);
    expect(t.msA()).toBe(0);
    expect(t.msB()).toBe(0);

    t.setActive('B');
    t.tick(100); // baseline
    t.tick(120); // +20
    expect(t.msB()).toBe(20);
  });
});

describe('hasMetListenGate', () => {
  it('requires both sides to reach 60% of the render duration', () => {
    const gate = hasMetListenGate(1200, 1200, 2000);
    expect(gate.ready).toBe(true);
    expect(gate.gate).toBe(1200);
    expect(gate.pctA).toBeCloseTo(0.6, 5);
    expect(gate.pctB).toBeCloseTo(0.6, 5);

    expect(hasMetListenGate(1199, 1300, 2000).ready).toBe(false);
    expect(hasMetListenGate(1300, 1199, 2000).ready).toBe(false);
  });

  it('honours a custom gate percentage', () => {
    expect(hasMetListenGate(800, 800, 2000, 0.4).ready).toBe(true);
    expect(hasMetListenGate(800, 800, 2000, 0.5).ready).toBe(false);
  });

  it('treats a zero-length render as fully listened', () => {
    const gate = hasMetListenGate(0, 0, 0);
    expect(gate.ready).toBe(true);
    expect(gate.pctA).toBe(1);
    expect(gate.pctB).toBe(1);
  });
});
