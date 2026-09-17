/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for seamless-loop crossfade rendering.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderXfadeLoop } from './loopXfade';

const makeCtx = () => ({
  createBuffer: vi.fn((channels: number, length: number, rate: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      length,
      sampleRate: rate,
      getChannelData: (ch: number) => data[ch] ?? data[0],
    };
  }),
}) as unknown as BaseAudioContext;

// A ramp: head starts at 0, tail ends at 1 — the worst case for loop clicks.
const makeRamp = (length = 1000) => {
  const data = Float32Array.from({ length }, (_, i) => i / (length - 1));
  return {
    numberOfChannels: 1,
    length,
    sampleRate: 1000,
    duration: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
};

describe('renderXfadeLoop', () => {
  it('renders the region with a continuous wrap point', () => {
    const out = renderXfadeLoop(makeCtx(), makeRamp(), { xfadeSec: 0.1 });
    expect(out.length).toBe(1000);
    const d = out.getChannelData(0);
    // out[0] blends from the tail (≈1 at the loop end) instead of the raw
    // head (0): the wrap discontinuity shrinks dramatically.
    expect(d[0]).toBeGreaterThan(0.9);
    // Past the crossfade the head is untouched.
    expect(d[500]).toBeCloseTo(500 / 999, 6);
  });

  it('respects crop bounds and smooths the wrap point', () => {
    const out = renderXfadeLoop(makeCtx(), makeRamp(), { startPct: 0.25, endPct: 0.75, xfadeSec: 0.01 });
    expect(out.length).toBe(500);
    const d = out.getChannelData(0);
    // The raw region would wrap 0.75 → 0.25 (a 0.5 jump); the 10-sample
    // tail-into-head blend pulls the wrap discontinuity under 0.05.
    expect(Math.abs(d[0] - d[499])).toBeLessThan(0.05);
    // Past the crossfade the head is untouched.
    expect(d[100]).toBeCloseTo(350 / 999, 6);
  });
});
