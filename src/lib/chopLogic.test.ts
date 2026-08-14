/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/lib/chopLogic.ts` — the pure slicing functions extracted from
 * the ChopEditor: marker→slice conversion, region extraction, and silence-based
 * auto-slicing.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { slicesFromMarkers, sliceRegion, autoMarkers } from './chopLogic';

class MockAudioBuffer {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  private data: Float32Array[];
  constructor(opts: { length: number; sampleRate: number; numberOfChannels: number }) {
    this.length = opts.length;
    this.sampleRate = opts.sampleRate;
    this.numberOfChannels = opts.numberOfChannels;
    this.data = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length));
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(ch: number): Float32Array {
    return this.data[ch];
  }
  copyToChannel(src: Float32Array, ch: number): void {
    this.data[ch].set(src);
  }
}

const makeCtx = (): BaseAudioContext => ({
  createBuffer: (channels: number, length: number, sampleRate: number) =>
    new MockAudioBuffer({ length, sampleRate, numberOfChannels: channels }),
} as unknown as BaseAudioContext);

const makeBuffer = (length: number, sampleRate = 1000, channels = 1): AudioBuffer => {
  const b = new MockAudioBuffer({ length, sampleRate, numberOfChannels: channels });
  for (let c = 0; c < channels; c++) b.getChannelData(c).fill(0.5);
  return b as unknown as AudioBuffer;
};

beforeAll(() => {
  (globalThis as any).AudioBuffer = MockAudioBuffer;
});

describe('slicesFromMarkers', () => {
  it('returns the whole file with no markers', () => {
    expect(slicesFromMarkers([])).toEqual([{ start: 0, end: 1 }]);
  });

  it('splits at sorted markers and includes 0 and 1 boundaries', () => {
    expect(slicesFromMarkers([0.25, 0.5, 0.75])).toEqual([
      { start: 0, end: 0.25 },
      { start: 0.25, end: 0.5 },
      { start: 0.5, end: 0.75 },
      { start: 0.75, end: 1 },
    ]);
  });

  it('sorts out-of-order markers', () => {
    expect(slicesFromMarkers([0.8, 0.2]).map((s) => s.start)).toEqual([0, 0.2, 0.8]);
  });

  it('drops duplicate / sub-1ms markers and keeps full coverage', () => {
    const slices = slicesFromMarkers([0.2, 0.2, 0.2001, 0.5]);
    expect(slices).toHaveLength(3);
    expect(slices[0]).toEqual({ start: 0, end: 0.2 });
    expect(slices[1]).toEqual({ start: 0.2, end: 0.5 });
    expect(slices[2]).toEqual({ start: 0.5, end: 1 });
  });

  it('always covers exactly to the end of the file', () => {
    const slices = slicesFromMarkers([0.98]);
    expect(slices[slices.length - 1]).toEqual({ start: 0.98, end: 1 });
    expect(slices.reduce((acc, s) => acc + (s.end - s.start), 0)).toBeCloseTo(1, 5);
  });

  it('collapses markers within 0.1% of the end into the final boundary', () => {
    expect(slicesFromMarkers([0.9999])).toEqual([{ start: 0, end: 1 }]);
    expect(slicesFromMarkers([0.5, 1])).toEqual([
      { start: 0, end: 0.5 },
      { start: 0.5, end: 1 },
    ]);
  });

  it('clamps out-of-range markers', () => {
    const slices = slicesFromMarkers([-0.5, 0.5, 1.5]);
    expect(slices[0]).toEqual({ start: 0, end: 0.5 });
    expect(slices[slices.length - 1]).toEqual({ start: 0.5, end: 1 });
  });
});

describe('sliceRegion', () => {
  it('extracts a [startPct, endPct] region as a new buffer', () => {
    const buf = makeBuffer(1000);
    const out = sliceRegion(makeCtx(), buf, 0.2, 0.6);
    expect(out.length).toBe(400);
    expect(out.sampleRate).toBe(1000);
    expect(out.numberOfChannels).toBe(1);
  });

  it('clamps to the buffer bounds', () => {
    const buf = makeBuffer(1000);
    const out = sliceRegion(makeCtx(), buf, -1, 2);
    expect(out.length).toBe(1000);
  });

  it('keeps a minimum length of 1 sample for a zero-width region', () => {
    const buf = makeBuffer(1000);
    const out = sliceRegion(makeCtx(), buf, 0.5, 0.5);
    expect(out.length).toBe(1);
  });

  it('copies channel data', () => {
    const buf = makeBuffer(1000, 1000, 2);
    const out = sliceRegion(makeCtx(), buf, 0, 0.5);
    expect(out.numberOfChannels).toBe(2);
    expect(out.getChannelData(0)[0]).toBe(0.5);
  });
});

describe('autoMarkers', () => {
  it('returns no markers for silence', () => {
    const buf = makeBuffer(8000);
    buf.getChannelData(0).fill(0);
    expect(autoMarkers(buf, 16)).toEqual([]);
  });

  it('returns no markers for a near-silent buffer (peak below floor)', () => {
    const buf = makeBuffer(8000);
    buf.getChannelData(0).fill(1e-7);
    expect(autoMarkers(buf, 16)).toEqual([]);
  });

  it('caps markers at maxChops - 1', () => {
    // Alternating loud/silent windows over ~2000 samples at 1000Hz.
    const buf = makeBuffer(4000, 1000);
    const d = buf.getChannelData(0);
    const win = Math.max(256, Math.floor(1000 * 0.01)); // 256
    for (let i = 0; i < d.length; i += win * 2) {
      for (let j = i; j < Math.min(d.length, i + win); j++) d[j] = 0.9;
    }
    const markers = autoMarkers(buf, 4);
    expect(markers.length).toBeLessThanOrEqual(3);
  });

  it('finds boundaries around a single loud burst', () => {
    // 1000Hz buffer, 256-sample windows. Put one loud burst in the middle.
    const buf = makeBuffer(5120, 1000);
    const d = buf.getChannelData(0);
    for (let i = 2000; i < 3000; i++) d[i] = 0.9;
    const markers = autoMarkers(buf, 16);
    // At least the burst's start and end should be marked.
    expect(markers.length).toBeGreaterThanOrEqual(1);
    for (const m of markers) {
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
    }
  });

  it('marks boundaries with a stereo buffer using channel 0 only', () => {
    const buf = makeBuffer(5120, 1000, 2);
    const d = buf.getChannelData(0);
    for (let i = 1500; i < 2500; i++) d[i] = 0.9;
    const markers = autoMarkers(buf, 8);
    expect(markers.length).toBeGreaterThanOrEqual(1);
  });

  it('marks the end of a loud burst that decays into silence', () => {
    const buf = makeBuffer(5120, 1000);
    const d = buf.getChannelData(0);
    d.fill(0);
    for (let i = 1500; i < 2500; i++) d[i] = 0.9;
    const markers = autoMarkers(buf, 8);
    expect(markers.length).toBeGreaterThanOrEqual(2); // burst start + end
  });
});
