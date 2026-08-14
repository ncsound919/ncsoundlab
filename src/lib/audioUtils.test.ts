/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { audioBufferToWav, synthesizeSampleBuffer, safeAudioValue, dbToGain, gainToDb, removeDcOffset, audioBufferToBase64, base64ToAudioBuffer, createSwarmBuffer, createReverbBuffer } from './audioUtils';

const createFakeCtx = () => {
  const buffers: any[] = [];
  return {
    sampleRate: 44100,
    createBuffer: vi.fn((channels: number, length: number, rate: number) => {
      const channelData = Array.from({ length: channels }, () => new Float32Array(length));
      const b = {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        duration: length / rate,
        getChannelData: (ch: number) => channelData[ch] ?? channelData[0],
      };
      buffers.push(b);
      return b;
    }),
    decodeAudioData: vi.fn(async () => ({ decoded: true })),
  };
};

const makeWaveBuffer = (length = 100) => {
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) data[i] = Math.sin((2 * Math.PI * i) / 10) * 0.5;
  return { numberOfChannels: 1, length, sampleRate: 44100, getChannelData: () => data } as any;
};

describe('Audio Utils', () => {
  it('should synthesize sample buffer correctly', () => {
    // Mock OfflineAudioContext as a class
    (window as any).OfflineAudioContext = class {
      createBuffer = vi.fn((channels: number, length: number, rate: number) => {
        const channelData = Array.from({ length: channels }, () => new Float32Array(length));
        return {
          numberOfChannels: channels,
          length,
          sampleRate: rate,
          getChannelData: (ch: number) => channelData[ch] ?? channelData[0]
        };
      });
    };

    const buf = synthesizeSampleBuffer('Kick', 0.1, 44100);
    expect(buf).toBeDefined();
    expect(buf.numberOfChannels).toBe(2);
  });

  it('should validate safeAudioValue correctly', () => {
    expect(safeAudioValue(50, 0)).toBe(50);
    expect(safeAudioValue(NaN, 10)).toBe(10);
    expect(safeAudioValue('invalid', 5)).toBe(5);
    expect(safeAudioValue(Infinity, 0)).toBe(0);
  });

  it('should calculate dbToGain and gainToDb correctly', () => {
    expect(dbToGain(0)).toBeCloseTo(1, 4);
    expect(gainToDb(1)).toBeCloseTo(0, 4);
    expect(gainToDb(0)).toBe(-100);
  });

  it('should convert audioBufferToWav to Blob', () => {
    const channelData = [new Float32Array(10)];
    const mockBuffer = {
      numberOfChannels: 1,
      length: 10,
      sampleRate: 44100,
      getChannelData: (ch: number) => channelData[ch] ?? channelData[0]
    } as any;

    const blob = audioBufferToWav(mockBuffer);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/wav');
  });

  it('removeDcOffset subtracts the channel mean and returns a new buffer (regression)', () => {
    const data = new Float32Array(1000);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin((2 * Math.PI * i) / 100) * 0.5 + 0.3; // +0.3 DC
    const inBuf = {
      numberOfChannels: 1,
      length: 1000,
      sampleRate: 44100,
      duration: 1000 / 44100,
      getChannelData: () => data,
    } as unknown as AudioBuffer;

    const out = removeDcOffset(inBuf);
    expect(out).not.toBe(inBuf); // new buffer, input untouched
    const outData = out.getChannelData(0);
    // Original still carries the +0.3 offset (input not mutated).
    const origMean = data.reduce((s, v) => s + v, 0) / data.length;
    expect(origMean).toBeGreaterThan(0.29);
    // Output mean ≈ 0.
    const outMean = outData.reduce((s, v) => s + v, 0) / outData.length;
    expect(Math.abs(outMean)).toBeLessThan(1e-6);
  });

  it('audioBufferToBase64 encodes a 24-bit WAV', async () => {
    const b64 = await audioBufferToBase64(makeWaveBuffer(), 24);
    expect(b64.length).toBeGreaterThan(0);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(bytes.length).toBeGreaterThan(44);
  });

  it('audioBufferToBase64 falls back to Buffer when btoa is unavailable', async () => {
    const original = globalThis.btoa;
    try {
      Object.defineProperty(globalThis, 'btoa', { value: undefined, configurable: true });
      const b64 = await audioBufferToBase64(makeWaveBuffer(64), 16);
      expect(b64.length).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(globalThis, 'btoa', { value: original, configurable: true });
    }
  });

  it('base64ToAudioBuffer uses the Buffer fallback when atob is unavailable', async () => {
    const original = globalThis.atob;
    try {
      Object.defineProperty(globalThis, 'atob', { value: undefined, configurable: true });
      const ctx = createFakeCtx();
      const buf = await base64ToAudioBuffer(ctx as any, 'TWFu');
      expect(buf).toEqual({ decoded: true });
      expect(ctx.decodeAudioData).toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'atob', { value: original, configurable: true });
    }
  });

  it('createSwarmBuffer builds a resonator impulse response for several materials', async () => {
    const ctx = createFakeCtx();
    const metal = await createSwarmBuffer(ctx as any, 0.05, 'metal', 0.5);
    expect(metal.numberOfChannels).toBe(2);
    expect(metal.length).toBeGreaterThan(0);
    const bio = await createSwarmBuffer(ctx as any, 0.05, 'bio', 0.3);
    const glass = await createSwarmBuffer(ctx as any, 0.05, 'glass', 0.3);
    expect(bio.length).toBeGreaterThan(0);
    expect(glass.length).toBeGreaterThan(0);
  });

  it('createReverbBuffer builds a decaying noise buffer', async () => {
    const ctx = createFakeCtx();
    const buf = await createReverbBuffer(ctx as any, 0.05, 2);
    expect(buf.numberOfChannels).toBe(2);
  });

  it('synthesizes snare, hat and generic lead categories', () => {
    expect(synthesizeSampleBuffer('Snare', 0.05).length).toBeGreaterThan(0);
    expect(synthesizeSampleBuffer('Hat', 0.05).length).toBeGreaterThan(0);
    expect(synthesizeSampleBuffer('Lead', 0.05).length).toBeGreaterThan(0);
  });
});
