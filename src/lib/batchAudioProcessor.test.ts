/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { analyzeAudioBuffer, generateVariants, processAudioBuffer } from './batchAudioProcessor';

describe('batchAudioProcessor', () => {
  const createMockBuffer = () => {
    // Real AudioBuffer semantics: getChannelData() must return the SAME array
    // on every call. Allocating a fresh Float32Array per call is catastrophic
    // for code paths that read getChannelData() inside a nested loop (see the
    // trimSilence scan in processAudioBuffer), turning every read into a full
    // buffer allocation.
    const channel0 = new Float32Array(4410);
    const channel1 = new Float32Array(4410);
    for (let i = 0; i < 4410; i++) {
      const s = Math.sin((i / 4410) * Math.PI * 10) * 0.5;
      channel0[i] = s;
      channel1[i] = s;
    }
    return {
      numberOfChannels: 2,
      length: 4410,
      sampleRate: 44100,
      getChannelData: (channel: number) => (channel === 0 ? channel0 : channel1)
    } as unknown as AudioBuffer;
  };

  it('analyzes AudioBuffer correctly', () => {
    const mockBuffer = createMockBuffer();
    const result = analyzeAudioBuffer(mockBuffer, 'kick_808.wav');
    expect(result).toBeDefined();
    expect(result.channels).toBe(2);
    expect(result.sampleRate).toBe(44100);
    expect(result.peakDb).toBeLessThanOrEqual(0);
    expect(result.suggestedCategory.toLowerCase()).toBe('kick');
  });

  it('processes AudioBuffer with custom options', () => {
    const mockBuffer = createMockBuffer();
    const mockCtx = {
      createBuffer: vi.fn((channels: number, length: number, rate: number) => {
        const channelData = Array.from({ length: channels }, () => new Float32Array(length));
        return {
          numberOfChannels: channels,
          length: length,
          sampleRate: rate,
          getChannelData: (ch: number) => channelData[ch] ?? channelData[0],
          copyToChannel: (src: Float32Array, ch: number) => channelData[ch]?.set(src),
          copyFromChannel: vi.fn()
        };
      })
    } as any;

    const options = {
      normalizePeak: true,
      targetPeakDb: -1.0,
      trimSilence: true,
      silenceThresholdDb: -30,
      transientSharpness: 50,
      pitchSemitones: 2.0,
      tubeDrive: 10,
      highPassFreq: 80,
      lowPassFreq: 12000,
      fadeOutDurationSec: 0.1
    };

    const processed = processAudioBuffer(mockCtx, mockBuffer, options);
    expect(processed).toBeDefined();
    expect(mockCtx.createBuffer).toHaveBeenCalled();
  });

  it('generates multiple variants of a sound based on profile', async () => {
    const mockBuffer = createMockBuffer();
    const mockCtx = {
      createBuffer: vi.fn((channels: number, length: number, rate: number) => {
        const channelData = Array.from({ length: channels }, () => new Float32Array(length));
        return {
          numberOfChannels: channels,
          length: length,
          sampleRate: rate,
          getChannelData: (ch: number) => channelData[ch] ?? channelData[0],
          copyToChannel: (src: Float32Array, ch: number) => channelData[ch]?.set(src),
          copyFromChannel: vi.fn()
        };
      })
    } as any;

    const profile = {
      transientBoost: 10,
      saturation: 15,
      eqTilt: -5
    };

    const variants = await generateVariants(mockCtx, mockBuffer, 2, profile);
    expect(variants).toHaveLength(2);
    expect(variants[0]).toBeDefined();
  });

  it('does NOT elongate short buffers during trim (regression: 1024 floor + OOB read)', () => {
    const data = new Float32Array(300); // ~6.8ms — shorter than the old 1024 floor
    data.fill(0);
    for (let i = 0; i < 100; i++) data[i] = Math.sin(i / 100 * Math.PI) * 0.5;
    const shortBuffer = {
      numberOfChannels: 1,
      length: 300,
      sampleRate: 44100,
      getChannelData: () => data,
    } as unknown as AudioBuffer;

    const mockCtx = {
      createBuffer: vi.fn((channels: number, length: number, rate: number) => {
        const channelData = Array.from({ length: channels }, () => new Float32Array(length));
        return {
          numberOfChannels: channels,
          length,
          sampleRate: rate,
          getChannelData: (ch: number) => channelData[ch] ?? channelData[0],
          copyToChannel: (src: Float32Array, ch: number) => channelData[ch]?.set(src),
          copyFromChannel: vi.fn()
        };
      })
    } as any;

    const processed = processAudioBuffer(mockCtx, shortBuffer, {
      normalizePeak: true,
      targetPeakDb: -6,
      trimSilence: true,
      silenceThresholdDb: -40,
      transientSharpness: 50,
      pitchSemitones: 0,
      tubeDrive: 0,
      highPassFreq: 0,
      lowPassFreq: 20000,
      fadeOutDurationSec: 0,
    }) as unknown as { length: number };
    // The output must not be padded to 1024 samples — it should stay ≤ input.
    expect(processed.length).toBeLessThanOrEqual(300);
  });

  it('analyzeAudioBuffer on an empty buffer returns finite clamped values (regression)', () => {
    const emptyBuffer = {
      numberOfChannels: 1,
      length: 0,
      sampleRate: 44100,
      getChannelData: () => new Float32Array(0),
    } as unknown as AudioBuffer;
    const result = analyzeAudioBuffer(emptyBuffer, 'empty.wav');
    expect(Number.isFinite(result.transientSharpness)).toBe(true);
    expect(result.transientSharpness).toBeGreaterThanOrEqual(0);
    expect(result.transientSharpness).toBeLessThanOrEqual(10);
    expect(Number.isFinite(result.peakDb)).toBe(true);
  });
});
