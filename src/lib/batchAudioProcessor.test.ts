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

  it('classifies samples by filename keyword override before feature logic', () => {
    const buf = createMockBuffer();
    expect(analyzeAudioBuffer(buf, 'snare_hit.wav').suggestedCategory).toBe('Snare');
    expect(analyzeAudioBuffer(buf, 'closed-hat_01.wav').suggestedCategory).toBe('HiHat');
    expect(analyzeAudioBuffer(buf, 'clap_stack.wav').suggestedCategory).toBe('Clap');
    expect(analyzeAudioBuffer(buf, 'perc_loop.wav').suggestedCategory).toBe('Percussive FX');
    expect(analyzeAudioBuffer(buf, 'glitch_07.wav').suggestedCategory).toBe('Glitches');
    expect(analyzeAudioBuffer(buf, 'atmosphere_pad.wav').suggestedCategory).toBe('Atmospheres');
  });

  const makeCtx = () => ({
    createBuffer: vi.fn((channels: number, length: number, rate: number) => {
      const channelData = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        getChannelData: (ch: number) => channelData[ch] ?? channelData[0],
        copyToChannel: (src: Float32Array, ch: number) => channelData[ch]?.set(src),
        copyFromChannel: vi.fn(),
      };
    }),
  }) as any;

  const baseOptions = {
    normalizePeak: true,
    targetPeakDb: -1.0,
    trimSilence: true,
    silenceThresholdDb: -45,
    transientSharpness: 0,
    pitchSemitones: 0,
    tubeDrive: 0,
    highPassFreq: 0,
    lowPassFreq: 20000,
    fadeOutDurationSec: 0,
  };

  it('runs bitcrush, reverb and fade-out branches with finite output', () => {
    const out = processAudioBuffer(makeCtx(), createMockBuffer(), {
      ...baseOptions,
      bitcrushDepth: 60,
      reverbSpace: 40,
      fadeOutDurationSec: 0.05,
    }) as unknown as AudioBuffer;
    const data = out.getChannelData(0);
    expect(out.numberOfChannels).toBe(2);
    for (let i = 0; i < data.length; i += 37) expect(Number.isFinite(data[i])).toBe(true);
  });

  it('upmixes a mono source to two channels via the Haas pseudo-stereo path', () => {
    const data = new Float32Array(4410);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin((i / 4410) * Math.PI * 8) * 0.5;
    const mono = {
      numberOfChannels: 1,
      length: 4410,
      sampleRate: 44100,
      getChannelData: () => data,
    } as unknown as AudioBuffer;

    const out = processAudioBuffer(makeCtx(), mono, { ...baseOptions, stereoWidening: 150 }) as unknown as AudioBuffer;
    expect(out.numberOfChannels).toBe(2);
    // Haas channel is delayed ~12ms, so its first sample must be silent.
    expect(Math.abs(out.getChannelData(1)[0])).toBeLessThan(1e-6);
  });

  it('applies mid/side widening to a native stereo source', () => {
    const left = new Float32Array(4410);
    const right = new Float32Array(4410);
    for (let i = 0; i < 4410; i++) {
      left[i] = Math.sin((i / 4410) * Math.PI * 8) * 0.5;
      right[i] = Math.sin((i / 4410) * Math.PI * 6) * 0.5;
    }
    const stereo = {
      numberOfChannels: 2,
      length: 4410,
      sampleRate: 44100,
      getChannelData: (c: number) => (c === 0 ? left : right),
    } as unknown as AudioBuffer;

    const out = processAudioBuffer(makeCtx(), stereo, { ...baseOptions, stereoWidening: 150 }) as unknown as AudioBuffer;
    expect(out.numberOfChannels).toBe(2);
    const outL = out.getChannelData(0);
    for (let i = 0; i < outL.length; i += 53) expect(Number.isFinite(outL[i])).toBe(true);
  });

  it('keeps the original length when trimming is disabled (no normalization)', () => {
    const out = processAudioBuffer(makeCtx(), createMockBuffer(), {
      ...baseOptions,
      trimSilence: false,
      normalizePeak: false,
    }) as unknown as AudioBuffer;
    expect(out.length).toBe(4410);
  });

  it('returns no variants when count is zero', async () => {
    const variants = await generateVariants(makeCtx(), createMockBuffer(), 0, {});
    expect(variants).toEqual([]);
  });

  it('shifts pitch independently: duration is preserved', () => {
    const out = processAudioBuffer(makeCtx(), createMockBuffer(), {
      ...baseOptions,
      trimSilence: false,
      normalizePeak: false,
      pitchSemitones: 7,
    }) as unknown as AudioBuffer;
    // Varispeed would have shortened a +7st shift to ~0.67x; independent
    // pitch keeps the timeline intact.
    expect(out.length).toBe(4410);
  });

  it('applies the low-pass filter to high-frequency content', () => {
    const sr = 44100;
    const data = new Float32Array(4410);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin((2 * Math.PI * 8000 * i) / sr) * 0.5;
    const hi = {
      numberOfChannels: 1,
      length: 4410,
      sampleRate: sr,
      getChannelData: () => data,
    } as unknown as AudioBuffer;
    const rms = (buf: AudioBuffer) => {
      const d = buf.getChannelData(0);
      let sum = 0;
      for (let i = 1000; i < d.length; i++) sum += d[i] * d[i];
      return Math.sqrt(sum / (d.length - 1000));
    };
    const open = processAudioBuffer(makeCtx(), hi, {
      ...baseOptions, trimSilence: false, normalizePeak: false, lowPassFreq: 20000,
    }) as unknown as AudioBuffer;
    const filtered = processAudioBuffer(makeCtx(), hi, {
      ...baseOptions, trimSilence: false, normalizePeak: false, lowPassFreq: 1000,
    }) as unknown as AudioBuffer;
    // 8 kHz through a 1 kHz one-pole low-pass loses the bulk of its energy.
    expect(rms(filtered)).toBeLessThan(rms(open) * 0.5);
    // Wide open leaves the tone (nearly) intact.
    expect(rms(open)).toBeCloseTo(rms(hi), 1);
  });
});
