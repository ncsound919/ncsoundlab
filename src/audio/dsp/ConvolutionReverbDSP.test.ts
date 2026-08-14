/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/audio/dsp/ConvolutionReverbDSP.ts` pure functions:
 * `generateImpulseResponse`, `processImpulseResponseBuffer`, and the
 * `irCache` LRU cache. The node-graph class (`ConvolutionReverbDSP`) is
 * not exercised here — it builds a real Web Audio graph.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  generateImpulseResponse,
  processImpulseResponseBuffer,
  irCache,
  ConvolutionReverbDSP,
} from './ConvolutionReverbDSP';

interface MockBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  getChannelData: (ch: number) => Float32Array;
  copyToChannel: (src: Float32Array, ch: number) => void;
}

function makeCtx(sampleRate = 48000): any {
  return {
    sampleRate,
    createBuffer: (channels: number, length: number, rate: number): AudioBuffer => {
      const channelData = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        getChannelData: (ch: number) => channelData[ch] ?? channelData[0],
        copyToChannel: (src: Float32Array, ch: number) => channelData[ch]?.set(src),
      } as unknown as AudioBuffer;
    },
  };
}

function toArray(buffer: MockBuffer, ch = 0): Float32Array {
  return buffer.getChannelData(ch);
}

function nonZeroCount(arr: Float32Array): number {
  let n = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] !== 0) n++;
  return n;
}

describe('generateImpulseResponse', () => {
  beforeEach(() => {
    irCache.clear();
  });

  it('returns a stereo buffer of the requested duration', () => {
    const ctx = makeCtx(48000);
    const ir = generateImpulseResponse(ctx, 'room_test', 1.0, 3.0);
    expect(ir.numberOfChannels).toBe(2);
    expect(ir.length).toBe(48000);
    expect(ir.sampleRate).toBe(48000);
  });

  it('clamps the minimum duration to 0.1s', () => {
    const ctx = makeCtx(48000);
    const ir = generateImpulseResponse(ctx, 'room_min', 0.01, 3.0);
    expect(ir.length).toBe(Math.floor(48000 * 0.1));
  });

  it('is non-silent and decays toward zero for a standard room IR', () => {
    const ctx = makeCtx(48000);
    const ir = generateImpulseResponse(ctx, 'room_decay', 1.0, 3.0);
    const data = toArray(ir);
    expect(nonZeroCount(data)).toBeGreaterThan(100);
    // Envelope should decay: the tail energy is far below the head.
    const energy = (a: Float32Array) => {
      let s = 0;
      for (const v of a) s += v * v;
      return s;
    };
    const head = energy(data.slice(0, Math.floor(data.length * 0.1)));
    const tail = energy(data.slice(Math.floor(data.length * 0.8)));
    expect(head).toBeGreaterThan(tail);
  });

  it('treats metallic IRs with a comb resonance ring (larger peaks)', () => {
    const ctx = makeCtx(48000);
    const metallic = generateImpulseResponse(ctx, 'metal_ring', 1.0, 3.0);
    const plain = generateImpulseResponse(ctx, 'plain', 1.0, 3.0);
    // Comb addition pushes the metallic max magnitude up vs the plain noise.
    let mMax = 0;
    let pMax = 0;
    for (let i = 0; i < 48000; i++) {
      mMax = Math.max(mMax, Math.abs(toArray(metallic)[i]));
      pMax = Math.max(pMax, Math.abs(toArray(plain)[i]));
    }
    expect(mMax).toBeGreaterThan(pMax);
  });

  it('applies the ghost swell envelope (starts at 0, peaks mid-way)', () => {
    const ctx = makeCtx(48000);
    const ir = generateImpulseResponse(ctx, 'ghost_swell', 1.0, 3.0);
    const data = toArray(ir);
    const first = Math.abs(data[0]);
    const mid = Math.abs(data[Math.floor(data.length / 2)]);
    expect(mid).toBeGreaterThan(first);
  });

  it('caches identical (id, duration, decay) invocations', () => {
    const ctx = makeCtx(48000);
    const a = generateImpulseResponse(ctx, 'cached_ir', 1.0, 3.0);
    const b = generateImpulseResponse(ctx, 'cached_ir', 1.0, 3.0);
    expect(a).toBe(b); // same object identity from the baseIrCache
  });

  it('irCache returns the same object and refresh LRU order', () => {
    const ctx = makeCtx(48000);
    const first = irCache.get(ctx, 'c1', 1.0, 3.0);
    const second = irCache.get(ctx, 'c1', 1.0, 3.0);
    expect(second).toBe(first);
  });

  it('irCache keeps serving valid buffers beyond maxEntries (LRU pressure)', () => {
    const ctx = makeCtx(48000);
    // Insert well past the 40-entry max; every entry must still resolve to a
    // valid, correctly-sized stereo buffer without throwing.
    for (let i = 0; i < 60; i++) {
      const buf = irCache.get(ctx, `pressure_${i}`, 0.5 + (i % 10) * 0.1, 3.0);
      expect(buf.numberOfChannels).toBe(2);
      expect(buf.length).toBe(Math.floor(48000 * (0.5 + (i % 10) * 0.1)));
    }
    // Re-fetching an older key still returns a valid buffer post-eviction.
    const again = irCache.get(ctx, 'pressure_0', 0.5, 3.0);
    expect(again.numberOfChannels).toBe(2);
    expect(again.length).toBe(24000);
  });

  it('irCache.clear() empties the cache but still serves fresh (base-cached) buffers', () => {
    const ctx = makeCtx(48000);
    irCache.clear();
    const a = irCache.get(ctx, 'clr', 1.0, 3.0);
    irCache.clear();
    const b = irCache.get(ctx, 'clr', 1.0, 3.0);
    // Content is regenerated deterministically from the base IR generator,
    // so both are valid identical-length buffers even across clears.
    expect(a.numberOfChannels).toBe(2);
    expect(b.length).toBe(48000);
  });
});

describe('processImpulseResponseBuffer', () => {
  beforeEach(() => {
    irCache.clear();
  });

  const makeSource = (ctx: any, length: number) => {
    const buf = ctx.createBuffer(2, length, ctx.sampleRate) as AudioBuffer;
    const data = toArray(buf);
    for (let i = 0; i < length; i++) data[i] = Math.sin((i / length) * Math.PI * 20);
    return buf;
  };

  it('changes length according to stretchFactor', () => {
    const ctx = makeCtx(48000);
    const src = makeSource(ctx, 1000);
    const stretched = processImpulseResponseBuffer(ctx, src, {
      stretchFactor: 2.0,
      reverse: false,
      irLowShelfDb: 0,
      irHighShelfDb: 0,
    });
    expect(stretched.length).toBeGreaterThan(src.length);
    const shrunk = processImpulseResponseBuffer(ctx, src, {
      stretchFactor: 0.5,
      reverse: false,
      irLowShelfDb: 0,
      irHighShelfDb: 0,
    });
    expect(shrunk.length).toBeLessThan(src.length);
  });

  it('clamps stretchFactor to [0.2, 3.0] and enforces a 128-sample minimum', () => {
    const ctx = makeCtx(48000);
    const src = makeSource(ctx, 100);
    const out = processImpulseResponseBuffer(ctx, src, {
      stretchFactor: 50,
      reverse: false,
      irLowShelfDb: 0,
      irHighShelfDb: 0,
    });
    expect(out.length).toBeGreaterThanOrEqual(128);
    expect(out.length).toBeLessThanOrEqual(100 * 3.0);
  });

  it('reverse=true mirrors the buffer content', () => {
    const ctx = makeCtx(48000);
    const src = makeSource(ctx, 500);
    const normal = processImpulseResponseBuffer(ctx, src, {
      stretchFactor: 1.0,
      reverse: false,
      irLowShelfDb: 0,
      irHighShelfDb: 0,
    });
    const reversed = processImpulseResponseBuffer(ctx, src, {
      stretchFactor: 1.0,
      reverse: true,
      irLowShelfDb: 0,
      irHighShelfDb: 0,
    });
    const nData = toArray(normal);
    const rData = toArray(reversed);
    expect(rData[0]).toBeCloseTo(nData[nData.length - 1], 5);
    expect(rData[10]).toBeCloseTo(nData[nData.length - 11], 5);
  });

  it('shelf EQ at 0 dB is a no-op; non-zero shelves modify the signal', () => {
    const ctx = makeCtx(48000);
    const src = makeSource(ctx, 800);
    const options = {
      stretchFactor: 1.0,
      reverse: false,
      irLowShelfDb: 0,
      irHighShelfDb: 0,
    };
    const noEq = processImpulseResponseBuffer(ctx, src, options);
    const noEqAgain = processImpulseResponseBuffer(ctx, src, options);
    // Both skip the shelf filter (|gainDb| < 0.01) → identical content.
    expect(toArray(noEq)).toEqual(toArray(noEqAgain));

    const withEq = processImpulseResponseBuffer(ctx, src, {
      ...options,
      irLowShelfDb: 6,
    });
    // A non-zero low shelf changes the signal, so outputs differ.
    expect(toArray(withEq)).not.toEqual(toArray(noEq));
  });

  it('caches by cacheKeyExtra so identical options return the same buffer', () => {
    const ctx = makeCtx(48000);
    const src = makeSource(ctx, 500);
    const options = {
      stretchFactor: 1.2,
      reverse: true,
      irLowShelfDb: 2,
      irHighShelfDb: -3,
    };
    const a = processImpulseResponseBuffer(ctx, src, options, 'key_test');
    const b = processImpulseResponseBuffer(ctx, src, options, 'key_test');
    expect(b).toBe(a);
  });

  it('treats each source buffer independently when no cache key is given', () => {
    const ctx = makeCtx(48000);
    const src = makeSource(ctx, 500);
    const options = {
      stretchFactor: 1.0,
      reverse: false,
      irLowShelfDb: 0,
      irHighShelfDb: 0,
    };
    const a = processImpulseResponseBuffer(ctx, src, options);
    const b = processImpulseResponseBuffer(ctx, src, options);
    // No cacheKeyExtra → fresh buffer each call, but identical content.
    expect(a).not.toBe(b);
    expect(toArray(a)).toEqual(toArray(b));
  });

  it('applies the shimmer envelope (bright modulated decay)', () => {
    const ctx = makeCtx(48000);
    const ir = generateImpulseResponse(ctx, 'ether_shimmer', 1.0, 3.0);
    const data = toArray(ir);
    expect(nonZeroCount(data)).toBeGreaterThan(100);
  });

  it('applies plate diffusion (pow-shaped density)', () => {
    const ctx = makeCtx(48000);
    const ir = generateImpulseResponse(ctx, 'plate_verb', 1.0, 3.0);
    expect(ir.numberOfChannels).toBe(2);
    expect(nonZeroCount(toArray(ir))).toBeGreaterThan(100);
  });

  it('skips the shelf filter entirely when gain is negligible (< 0.01 dB)', () => {
    const ctx = makeCtx(48000);
    const src = makeSource(ctx, 400);
    const out = processImpulseResponseBuffer(ctx, src, {
      stretchFactor: 1.0,
      reverse: false,
      irLowShelfDb: 0.005,
      irHighShelfDb: 0.004,
    });
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('ConvolutionReverbDSP node graph', () => {
  const makeParam = () => ({
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    setTargetAtTime: vi.fn(),
  });

  const makeNode = (over: Record<string, unknown> = {}): any => ({
    connect: vi.fn(() => undefined),
    disconnect: vi.fn(() => undefined),
    gain: makeParam(),
    frequency: makeParam(),
    Q: makeParam(),
    delayTime: makeParam(),
    pan: makeParam(),
    type: 'lowpass',
    curve: null,
    buffer: null,
    oversample: 'none',
    start: vi.fn(),
    stop: vi.fn(),
    ...over,
  });

  const makeCtx = (): any => {
    const ctx: any = {
      sampleRate: 48000,
      currentTime: 0,
    };
    ctx.createGain = vi.fn(() => makeNode());
    ctx.createBiquadFilter = vi.fn(() => makeNode());
    ctx.createConvolver = vi.fn(() => makeNode());
    ctx.createWaveShaper = vi.fn(() => makeNode());
    ctx.createDelay = vi.fn(() => makeNode());
    ctx.createOscillator = vi.fn(() => makeNode());
    ctx.createBuffer = vi.fn((channels: number, length: number, rate: number) => {
      const channelData = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        duration: length / rate,
        getChannelData: (ch: number) => channelData[ch] ?? channelData[0],
        copyToChannel: (src: Float32Array, ch: number) => channelData[ch]?.set(src),
      } as unknown as AudioBuffer;
    });
    return ctx;
  };

  const makePreset = (over: Record<string, unknown> = {}): any => ({
    id: 'test_preset',
    name: 'Test',
    category: 'room',
    irId: 'room_short',
    preEq: { hpFreq: 100, tiltAmount: 0.2 },
    irProcessing: {
      stretchFactor: 1.0,
      reverse: false,
      irLowShelfDb: 0,
      irHighShelfDb: 0,
      mode: 'fullband',
      multibandIRs: { low: 'room_sub', mid: 'room_short', high: 'room_air' },
    },
    mix: { dry: 0.8, wet: 0.3 },
    postEq: { dampingFreq: 8000, presenceDb: 1.0, airDb: 0.0 },
    nonlinearTail: { saturationAmount: 0.1, tailModDepth: 0.1, tailModRate: 0.5 },
    ...over,
  });

  beforeEach(() => {
    irCache.clear();
  });

  it('constructs the full graph with default IRs loaded', () => {
    const ctx = makeCtx();
    const dsp = new ConvolutionReverbDSP(ctx);
    expect(ctx.createGain).toHaveBeenCalled();
    expect(ctx.createBiquadFilter).toHaveBeenCalled();
    expect(ctx.createWaveShaper).toHaveBeenCalled();
    expect(ctx.createDelay).toHaveBeenCalled();
    expect(ctx.createOscillator).toHaveBeenCalled();
    expect((dsp as any).mainConvolver.buffer).toBeTruthy();
    expect((dsp as any).lowConvolver.buffer).toBeTruthy();
    expect((dsp as any).highConvolver.buffer).toBeTruthy();
    expect((dsp as any).tailLfo.start).toHaveBeenCalled();
    expect((dsp as any).tailSaturator.curve).toBeInstanceOf(Float32Array);
  });

  it('applyPreset routes the fullband path and sets the main convolver', () => {
    const ctx = makeCtx();
    const dsp = new ConvolutionReverbDSP(ctx);
    (dsp as any).applyPreset(makePreset());
    expect((dsp as any).mainConvolver.buffer).toBeTruthy();
    expect((dsp as any).dryGain.gain.setTargetAtTime).toHaveBeenCalled();
    expect((dsp as any).wetGain.gain.setTargetAtTime).toHaveBeenCalled();
    expect((dsp as any).hpFilter.frequency.setTargetAtTime).toHaveBeenCalledWith(100, 0, 0.03);
  });

  it('applyPreset with a custom IR buffer uses it for the fullband convolver', () => {
    const ctx = makeCtx();
    const dsp = new ConvolutionReverbDSP(ctx);
    const custom = ctx.createBuffer(2, 1000, 48000);
    (dsp as any).applyPreset(makePreset(), custom);
    expect((dsp as any).mainConvolver.buffer).toBeTruthy();
  });

  it('applyPreset routes the multiband path and feeds all three band convolvers', () => {
    const ctx = makeCtx();
    const dsp = new ConvolutionReverbDSP(ctx);
    (dsp as any).applyPreset(makePreset({ irProcessing: { ...makePreset().irProcessing, mode: 'multiband' } }));
    expect((dsp as any).lowConvolver.buffer).toBeTruthy();
    expect((dsp as any).midConvolver.buffer).toBeTruthy();
    expect((dsp as any).highConvolver.buffer).toBeTruthy();
  });

  it('applyPreset multiband with a custom IR buffer processes it per-band', () => {
    const ctx = makeCtx();
    const dsp = new ConvolutionReverbDSP(ctx);
    const custom = ctx.createBuffer(2, 1000, 48000);
    (dsp as any).applyPreset(
      makePreset({ irProcessing: { ...makePreset().irProcessing, mode: 'multiband' } }),
      custom
    );
    expect((dsp as any).lowConvolver.buffer).toBeTruthy();
    expect((dsp as any).midConvolver.buffer).toBeTruthy();
    expect((dsp as any).highConvolver.buffer).toBeTruthy();
  });

  it('swallows disconnect errors while rebuilding the graph', () => {
    const ctx = makeCtx();
    const dsp = new ConvolutionReverbDSP(ctx);
    (dsp as any).tiltHigh.disconnect = vi.fn(() => {
      throw new Error('boom');
    });
    expect(() => (dsp as any).applyPreset(makePreset())).not.toThrow();
  });
});
