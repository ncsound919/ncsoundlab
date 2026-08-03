import { describe, it, expect } from 'vitest';
import { quantizeTime, stepIndexToSeconds, secondsToStepIndex } from './quantize';

describe('quantize', () => {
  it('quantizes to the nearest 1/16 step (timeCorrect = 1)', () => {
    const bpm = 120;
    const secPer16 = 60 / bpm / 4;
    expect(quantizeTime(0.01, bpm, 1)).toBeCloseTo(0, 5);
    expect(quantizeTime(secPer16 * 0.4, bpm, 1)).toBeCloseTo(0, 5);
    expect(quantizeTime(secPer16 * 0.6, bpm, 1)).toBeCloseTo(secPer16, 5);
  });

  it('quantizes to the nearest 1/8 step (timeCorrect = 2)', () => {
    const bpm = 120;
    const secPer8 = 60 / bpm / 2;
    expect(quantizeTime(secPer8 * 0.7, bpm, 2)).toBeCloseTo(secPer8, 5);
  });

  it('quantizes to the nearest 1/4 step (timeCorrect = 4)', () => {
    const bpm = 120;
    const secPer4 = 60 / bpm;
    expect(quantizeTime(secPer4 * 0.4, bpm, 4)).toBeCloseTo(0, 5);
    expect(quantizeTime(secPer4 * 0.6, bpm, 4)).toBeCloseTo(secPer4, 5);
  });

  it('round-trips step index <-> seconds (within tolerance)', () => {
    const bpm = 140;
    for (let i = 0; i < 16; i++) {
      const sec = stepIndexToSeconds(i, bpm);
      const idx = secondsToStepIndex(sec, bpm);
      expect(idx).toBe(i);
    }
  });
});
