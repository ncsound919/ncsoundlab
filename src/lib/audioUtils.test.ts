/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { audioBufferToWav, synthesizeSampleBuffer, safeAudioValue, dbToGain, gainToDb } from './audioUtils';

describe('Audio Utils', () => {
  it('should synthesize sample buffer correctly', () => {
    // Mock OfflineAudioContext as a class
    (window as any).OfflineAudioContext = class {
      createBuffer = vi.fn((channels, length, rate) => ({
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        getChannelData: vi.fn(() => new Float32Array(length))
      }));
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
    const mockBuffer = {
      numberOfChannels: 1,
      length: 10,
      sampleRate: 44100,
      getChannelData: vi.fn(() => new Float32Array(10))
    } as any;

    const blob = audioBufferToWav(mockBuffer);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/wav');
  });
});
