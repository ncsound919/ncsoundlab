/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the audio metering helpers (Phase 3.1).
 */

import { describe, expect, it } from 'vitest';
import { ampToDb, computeMeterLevel, dbToAmp, makeScratchBuffer, type AnalyserLike } from './metering';

const makeAnalyser = (samples: number[]): AnalyserLike => {
  let i = 0;
  return {
    fftSize: samples.length,
    getFloatTimeDomainData: (target: Float32Array) => {
      for (let k = 0; k < samples.length; k++) {
        target[k] = samples[(i + k) % samples.length] ?? 0;
      }
      i = (i + samples.length) % samples.length;
    },
  };
};

describe('metering — computeMeterLevel', () => {
  it('returns zeros and -100 dB for a null analyser', () => {
    const reading = computeMeterLevel(null, makeScratchBuffer());
    expect(reading.peak).toBe(0);
    expect(reading.rms).toBe(0);
    expect(reading.peakDb).toBe(-100);
    expect(reading.rmsDb).toBe(-100);
  });

  it('reads peak amplitude in linear scale', () => {
    const samples = new Array(1024).fill(0).map((_, i) => (i === 500 ? 0.7 : 0));
    const analyser = makeAnalyser(samples);
    const reading = computeMeterLevel(analyser, makeScratchBuffer(1024));
    expect(reading.peak).toBeCloseTo(0.7, 5);
    expect(reading.peakDb).toBeCloseTo(20 * Math.log10(0.7), 5);
  });

  it('clamps readings to 0..1', () => {
    const samples = [1.5];
    const analyser = makeAnalyser(samples);
    const reading = computeMeterLevel(analyser, makeScratchBuffer(1));
    expect(reading.peak).toBe(1);
    expect(reading.rms).toBe(1);
  });

  it('computes RMS over a sine-like frame', () => {
    const samples: number[] = [];
    for (let i = 0; i < 256; i++) {
      samples.push(Math.sin((i / 256) * Math.PI * 2) * 0.5);
    }
    const analyser = makeAnalyser(samples);
    const reading = computeMeterLevel(analyser, makeScratchBuffer(256));
    expect(reading.peak).toBeCloseTo(0.5, 2);
    // RMS of a 0.5-amplitude sine = 0.5 / sqrt(2) ≈ 0.3536.
    expect(reading.rms).toBeCloseTo(0.3536, 2);
  });

  it('handles a negative-only signal symmetrically', () => {
    const samples = [-0.6, -0.4, -0.2, -0.1];
    const analyser = makeAnalyser(samples);
    const reading = computeMeterLevel(analyser, makeScratchBuffer(4));
    expect(reading.peak).toBeCloseTo(0.6, 5);
    const rmsExpected = Math.sqrt((0.36 + 0.16 + 0.04 + 0.01) / 4);
    expect(reading.rms).toBeCloseTo(rmsExpected, 5);
  });
});

describe('metering — ampToDb / dbToAmp', () => {
  it('round-trips amplitude through dB', () => {
    for (const amp of [1, 0.5, 0.1, 0.01]) {
      expect(dbToAmp(ampToDb(amp))).toBeCloseTo(amp, 5);
    }
  });

  it('returns MIN_DB for non-positive amplitudes', () => {
    expect(ampToDb(0)).toBe(-100);
    expect(ampToDb(-1)).toBe(-100);
  });

  it('returns 0 dB for unity gain', () => {
    expect(ampToDb(1)).toBeCloseTo(0, 5);
  });
});
