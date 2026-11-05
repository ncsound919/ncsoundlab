import { describe, expect, it } from 'vitest';
import { isAudioWorkletSupported, assembleWorkletBuffer } from './workletRecorder';

describe('worklet recorder support', () => {
  it('reports unsupported in jsdom (no AudioWorklet)', () => {
    expect(isAudioWorkletSupported()).toBe(false);
  });
});

describe('assembleWorkletBuffer', () => {
  it('sums chunk frames and copies each channel', () => {
    const chunks: Float32Array[][] = [
      [new Float32Array([1, 2]), new Float32Array([10, 20])],
      [new Float32Array([3]), new Float32Array([30])],
    ];
    const copied: { ch: number; off: number; len: number }[] = [];
    const fake = {
      length: 3,
      copyToChannel(src: Float32Array, ch: number, off: number) {
        copied.push({ ch, off, len: src.length });
      },
    };
    const result = assembleWorkletBuffer(chunks, 2, 48000, () => fake);
    expect(result.length).toBe(3);
    expect(result.sampleRate).toBe(48000);
    expect(result.channels).toBe(2);
    expect(copied).toEqual([
      { ch: 0, off: 0, len: 2 },
      { ch: 1, off: 0, len: 2 },
      { ch: 0, off: 2, len: 1 },
      { ch: 1, off: 2, len: 1 },
    ]);
  });

  it('handles an empty capture without crashing', () => {
    const fake = { length: 1, copyToChannel() {} };
    const result = assembleWorkletBuffer([], 1, 44100, () => fake);
    expect(result.length).toBe(1);
    expect(result.sampleRate).toBe(44100);
  });
});
