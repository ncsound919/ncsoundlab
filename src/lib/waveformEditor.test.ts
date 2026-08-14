/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/lib/waveformEditor.ts` (sample edit DSP ops).
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  trimBuffer,
  glitchBuffer,
  cloneBuffer,
  reverseBuffer,
  invertPhase,
  normalizeBuffer,
  fadeInBuffer,
  fadeOutBuffer,
  gainAdjustBuffer,
} from './waveformEditor';

/** Minimal fake AudioContext that allocates real Float32Array-backed buffers. */
const fakeCtx = {
  createBuffer: (channels: number, length: number, sampleRate: number) => {
    const channelData = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: (ch: number) => channelData[ch] ?? channelData[0],
      copyToChannel: (src: Float32Array, ch: number) => channelData[ch]?.set(src),
      copyFromChannel: () => {},
    } as unknown as AudioBuffer;
  },
} as unknown as AudioContext;

const makeBuffer = (length: number, sampleRate = 44100): AudioBuffer => {
  const b = fakeCtx.createBuffer(1, length, sampleRate);
  const data = b.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.sin((2 * Math.PI * i) / length) * 0.5;
  return b;
};

describe('trimBuffer', () => {
  it('crops to the requested range', () => {
    const buf = makeBuffer(4000);
    const out = trimBuffer(fakeCtx, buf, 0.25, 0.5);
    expect(out.length).toBe(1000);
  });

  it('normalizes an inverted range instead of returning a 1-sample silent buffer (regression)', () => {
    const buf = makeBuffer(4000);
    const out = trimBuffer(fakeCtx, buf, 0.75, 0.25);
    // [0.25, 0.75] → 2000 samples, not 1 sample.
    expect(out.length).toBe(2000);
  });

  it('clamps out-of-range pcts to the buffer bounds', () => {
    const buf = makeBuffer(4000);
    const out = trimBuffer(fakeCtx, buf, -0.5, 1.5);
    expect(out.length).toBe(4000);
  });
});

describe('glitchBuffer', () => {
  it('returns a same-length buffer and never throws on very short input (regression)', () => {
    const tiny = makeBuffer(64);
    expect(() => glitchBuffer(fakeCtx, tiny, 0.8)).not.toThrow();
    const out = glitchBuffer(fakeCtx, tiny, 0.8);
    expect(out.length).toBe(64);
  });

  it('injects silence glitches when Math.random decides type=silence', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const buf = makeBuffer(44100);
    const out = glitchBuffer(fakeCtx, buf, 0.5);
    // A chunk of the output must be hard-zeroed by a silence glitch.
    const zeros = Array.from(out.getChannelData(0)).filter((v) => v === 0).length;
    expect(zeros).toBeGreaterThan(100);
    spy.mockRestore();
  });

  it('injects noise bursts when Math.random decides type=noise', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const buf = makeBuffer(44100);
    const out = glitchBuffer(fakeCtx, buf, 0.5);
    const data = out.getChannelData(0);
    expect(Number.isFinite(data[0])).toBe(true);
    expect(out.length).toBe(44100);
    spy.mockRestore();
  });
});

describe('cloneBuffer', () => {
  it('deep-copies every channel into a fresh buffer', () => {
    const buf = makeBuffer(128, 44100);
    buf.getChannelData(0).fill(0.5);
    const copy = cloneBuffer(fakeCtx, buf);
    expect(copy).not.toBe(buf);
    expect(copy.getChannelData(0)).not.toBe(buf.getChannelData(0));
    expect(copy.getChannelData(0)).toEqual(buf.getChannelData(0));
  });
});

describe('reverseBuffer', () => {
  it('mirrors the sample order', () => {
    const buf = makeBuffer(16, 44100);
    const data = buf.getChannelData(0);
    for (let i = 0; i < 16; i++) data[i] = i;
    const out = reverseBuffer(fakeCtx, buf);
    const o = out.getChannelData(0);
    expect(o[0]).toBe(15);
    expect(o[15]).toBe(0);
    expect(o[5]).toBe(10);
  });
});

describe('invertPhase', () => {
  it('negates every sample', () => {
    const buf = makeBuffer(32, 44100);
    const data = buf.getChannelData(0);
    for (let i = 0; i < 32; i++) data[i] = i / 32 - 0.5;
    const out = invertPhase(fakeCtx, buf);
    const o = out.getChannelData(0);
    for (let i = 0; i < 32; i++) expect(o[i]).toBeCloseTo(-(i / 32 - 0.5), 5);
  });
});

describe('normalizeBuffer', () => {
  it('scales the peak up to the target level', () => {
    const buf = makeBuffer(1000, 44100);
    buf.getChannelData(0).fill(0.5);
    const out = normalizeBuffer(fakeCtx, buf, 0.98);
    let peak = 0;
    for (const v of out.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeCloseTo(0.98, 3);
  });

  it('returns an unchanged all-zero buffer without dividing by zero', () => {
    const buf = makeBuffer(64, 44100);
    buf.getChannelData(0).fill(0);
    const out = normalizeBuffer(fakeCtx, buf);
    expect(out.getChannelData(0)).toEqual(buf.getChannelData(0));
  });
});

describe('fadeInBuffer', () => {
  it('fades the head in towards unity and leaves the tail untouched', () => {
    const buf = makeBuffer(44100, 44100);
    buf.getChannelData(0).fill(1);
    const out = fadeInBuffer(fakeCtx, buf, 0.1);
    const o = out.getChannelData(0);
    expect(Math.abs(o[0])).toBeLessThan(0.02);
    expect(o[o.length - 1]).toBe(1);
  });

  it('returns immediately for a zero duration', () => {
    const buf = makeBuffer(64, 44100);
    buf.getChannelData(0).fill(1);
    const out = fadeInBuffer(fakeCtx, buf, 0);
    expect(out.getChannelData(0)).toEqual(buf.getChannelData(0));
  });
});

describe('fadeOutBuffer', () => {
  it('fades the tail out and leaves the head untouched', () => {
    const buf = makeBuffer(44100, 44100);
    buf.getChannelData(0).fill(1);
    const out = fadeOutBuffer(fakeCtx, buf, 0.1);
    const o = out.getChannelData(0);
    expect(o[0]).toBe(1);
    expect(Math.abs(o[o.length - 1])).toBeLessThan(0.02);
  });

  it('returns immediately for a zero duration', () => {
    const buf = makeBuffer(64, 44100);
    buf.getChannelData(0).fill(1);
    const out = fadeOutBuffer(fakeCtx, buf, 0);
    expect(out.getChannelData(0)).toEqual(buf.getChannelData(0));
  });
});

describe('gainAdjustBuffer', () => {
  it('attenuates by a negative dB value', () => {
    const buf = makeBuffer(1000, 44100);
    buf.getChannelData(0).fill(0.5);
    const out = gainAdjustBuffer(fakeCtx, buf, -20);
    expect(Math.max(...out.getChannelData(0))).toBeCloseTo(0.05, 5);
  });

  it('clamps boosted samples to ±1', () => {
    const buf = makeBuffer(1000, 44100);
    buf.getChannelData(0).fill(0.5);
    const out = gainAdjustBuffer(fakeCtx, buf, 20);
    for (const v of out.getChannelData(0)) {
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
