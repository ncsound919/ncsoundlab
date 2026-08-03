/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { analyzeAudioBuffer, generateVariants, processAudioBuffer } from './batchAudioProcessor';

describe('batchAudioProcessor', () => {
  const createMockBuffer = () => {
    return {
      numberOfChannels: 2,
      length: 4410,
      sampleRate: 44100,
      getChannelData: (_channel: number) => {
        const arr = new Float32Array(4410);
        for (let i = 0; i < 4410; i++) {
          arr[i] = Math.sin((i / 4410) * Math.PI * 10) * 0.5;
        }
        return arr;
      }
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
      createBuffer: vi.fn((channels, length, rate) => ({
        numberOfChannels: channels,
        length: length,
        sampleRate: rate,
        getChannelData: vi.fn(() => new Float32Array(length))
      }))
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
      createBuffer: vi.fn((channels, length, rate) => ({
        numberOfChannels: channels,
        length: length,
        sampleRate: rate,
        getChannelData: vi.fn(() => new Float32Array(length))
      }))
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
});
