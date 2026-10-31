/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  applyEdgeFades,
  cutSlice,
  mergeShort,
  sliceEvenly,
  sliceOnsets,
  splitLong,
  trimEdges,
} from './onsetSlicer';
import { concat, hits, silence, tone } from '../../tests/mobileSignals';

const SR = 48000;

describe('sliceEvenly', () => {
  const sine = (seconds: number): Float32Array => {
    const samples = new Float32Array(Math.round(seconds * SR));
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 220 * i) / SR) * 0.5;
    }
    return samples;
  };

  it('chops a take into the requested number of ordered parts', () => {
    const samples = sine(1);
    const slices = sliceEvenly(samples, SR, 4);

    expect(slices).toHaveLength(4);
    expect(slices[0].startSample).toBeLessThan(16);
    expect(slices[slices.length - 1].endSample).toBeGreaterThan(samples.length - 16);
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i].startSample).toBeGreaterThanOrEqual(slices[i - 1].endSample);
    }
    for (const slice of slices) {
      expect(slice.durationMs).toBeGreaterThan(200);
      expect(slice.silent).toBe(false);
    }
  });

  it('clamps the count to the supported range', () => {
    const samples = sine(1);
    expect(sliceEvenly(samples, SR, 100)).toHaveLength(32);
    expect(sliceEvenly(samples, SR, 1)).toHaveLength(2);
  });

  it('returns nothing when the take is shorter than the requested count', () => {
    expect(sliceEvenly(new Float32Array(10), SR, 8)).toEqual([]);
  });
});

describe('sliceOnsets', () => {
  it('cuts one slice per transient, padded back into the attack', () => {
    const capture = hits(
      [
        { atSec: 0.2, freq: 90 },
        { atSec: 0.6, freq: 200 },
        { atSec: 1.0, freq: 400 },
      ],
      1.4,
      SR
    );
    const { slices, onsets } = sliceOnsets(capture, SR, { sensitivity: 0.9, preRollMs: 10 });
    expect(onsets.length).toBeGreaterThanOrEqual(3);
    expect(slices.length).toBeGreaterThanOrEqual(3);
    for (const expected of [0.2, 0.6, 1.0]) {
      const match = slices.find((slice) => Math.abs(slice.startSec - expected) < 0.03);
      expect(match, `slice near ${expected}s`).toBeDefined();
      expect(match!.startSec).toBeLessThanOrEqual(expected + 0.001);
      expect(match!.peak).toBeGreaterThan(0.1);
      expect(match!.silent).toBe(false);
    }
  });

  it('is deterministic — the same capture yields identical slices', () => {
    const capture = hits([{ atSec: 0.1, freq: 150 }, { atSec: 0.5, freq: 300 }], 0.8, SR);
    const first = sliceOnsets(capture, SR, { sensitivity: 0.9 });
    const second = sliceOnsets(capture, SR, { sensitivity: 0.9 });
    expect(JSON.stringify(first.slices)).toBe(JSON.stringify(second.slices));
  });

  it('treats a continuous capture with no transient as one slice', () => {
    const { slices, onsets } = sliceOnsets(tone(300, 0.5, SR, 0.4), SR);
    // A tone that starts abruptly may register its own attack; what matters for
    // the no-onset path is that the capture stays one usable slice.
    expect(onsets.length).toBeLessThanOrEqual(1);
    expect(slices).toHaveLength(1);
    // Trimming may drop the leading zero-crossing sample, nothing more.
    expect(slices[0].startSample).toBeLessThan(10);
    expect(slices[0].durationMs).toBeGreaterThan(400);
  });

  it('rejects a silent capture', () => {
    const result = sliceOnsets(silence(0.5, SR), SR);
    expect(result.slices).toHaveLength(0);
    expect(result.rejected[0].reason).toBe('SILENT');
  });

  it('splits a slice longer than maxSliceMs', () => {
    const { slices } = sliceOnsets(tone(300, 2.0, SR, 0.4), SR, { maxSliceMs: 400 });
    expect(slices.length).toBeGreaterThanOrEqual(4);
    for (const slice of slices) expect(slice.durationMs).toBeLessThanOrEqual(420);
  });

  it('keeps the strongest slices when capped', () => {
    const capture = hits(
      [
        { atSec: 0.1, freq: 100, amp: 0.9 },
        { atSec: 0.4, freq: 200, amp: 0.2 },
        { atSec: 0.7, freq: 300, amp: 0.8 },
      ],
      1.0,
      SR
    );
    const { slices } = sliceOnsets(capture, SR, { sensitivity: 0.6, maxSlices: 2 });
    expect(slices).toHaveLength(2);
    expect(slices[0].startSample).toBeLessThan(slices[1].startSample);
  });

  it('reports clipping on a hot slice', () => {
    const capture = tone(200, 0.3, SR, 1.6);
    const { slices } = sliceOnsets(capture, SR);
    expect(slices[0].clipped).toBe(true);
  });
});

describe('mergeShort / splitLong', () => {
  it('folds a short slice into its neighbour', () => {
    const merged = mergeShort(
      [
        { start: 0, end: 1000, strength: 1 },
        { start: 1000, end: 1010, strength: 0.5 },
      ],
      100
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].end).toBe(1010);
  });

  it('folds a short first slice forward', () => {
    const merged = mergeShort(
      [
        { start: 0, end: 10, strength: 0.2 },
        { start: 10, end: 2000, strength: 0.9 },
      ],
      100
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].start).toBe(0);
    expect(merged[0].strength).toBe(0.9);
  });

  it('splits at exact multiples and only credits strength to the first part', () => {
    const parts = splitLong([{ start: 0, end: 250, strength: 0.7 }], 100);
    expect(parts.map((p) => [p.start, p.end])).toEqual([
      [0, 100],
      [100, 200],
      [200, 250],
    ]);
    expect(parts[0].strength).toBe(0.7);
    expect(parts[1].strength).toBe(0);
  });
});

describe('trimEdges', () => {
  it('trims leading and trailing silence but keeps the body', () => {
    const padded = concat([silence(0.02, SR), tone(200, 0.1, SR, 0.5), silence(0.02, SR)]);
    const { start, end } = trimEdges(padded, { tailFloorDb: -40 });
    expect(start).toBeGreaterThan(0);
    expect(start).toBeLessThan(0.03 * SR);
    expect(end).toBeLessThan(padded.length);
    expect(end - start).toBeGreaterThan(0.09 * SR);
  });

  it('keeps the whole buffer when it is silent', () => {
    const silent = silence(0.05, SR);
    expect(trimEdges(silent)).toEqual({ start: 0, end: silent.length });
  });
});

describe('cutSlice / applyEdgeFades', () => {
  it('copies the slice and fades its edges', () => {
    const capture = tone(200, 0.2, SR, 0.6);
    const slice = { startSample: 100, endSample: 5000 };
    const cut = cutSlice(capture, slice, SR, 3);
    expect(cut.length).toBe(4900);
    expect(Math.abs(cut[0])).toBeLessThan(1e-6);
    expect(Math.abs(cut[cut.length - 1])).toBeLessThan(1e-6);
    expect(Math.abs(cut[Math.floor(cut.length / 2)])).toBeGreaterThan(0.1);
  });

  it('is a no-op for a very short buffer', () => {
    const tiny = Float32Array.from([0.5, 0.5]);
    applyEdgeFades(tiny, SR, 3);
    expect([...tiny]).toEqual([0.5, 0.5]);
  });
});
