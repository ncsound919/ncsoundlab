/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/audio/dsp/AdvancedParametricEQ.ts` — the pure magnitude-response
 * calculator used to draw the EQ curve overlay. Verifies each band type against
 * its closed-form behavior (bell peak, shelf plateaus, 12 dB/oct filter slopes,
 * notch window), plus clamping, disabled bands, and the zero-freq guards.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EQ_SETTINGS,
  calculateAdvancedEQResponse,
  type AdvancedEQSettings,
  type EQBand,
} from './AdvancedParametricEQ';

const freqs = (list: number[]): Float32Array => new Float32Array(list);

const singleBand = (band: Partial<EQBand> & { type: EQBand['type'] }): AdvancedEQSettings => ({
  outputTrimDb: 0,
  bands: [
    {
      id: 'b',
      freq: 1000,
      gain: 0,
      q: 1,
      enabled: true,
      ...band,
    },
  ],
});

describe('calculateAdvancedEQResponse', () => {
  it('returns one point per input frequency in the same order', () => {
    const f = freqs([20, 250, 1000, 8000]);
    const result = calculateAdvancedEQResponse(DEFAULT_EQ_SETTINGS, f);
    expect(result.map((r) => r.freq)).toEqual([20, 250, 1000, 8000]);
  });

  it('bell peaks exactly at the band center (factor 1)', () => {
    const settings = singleBand({ type: 'bell', freq: 1000, gain: 6 });
    const at = calculateAdvancedEQResponse(settings, freqs([1000]))[0];
    expect(at.magnitudeDb).toBeCloseTo(6, 5);
  });

  it('bell gain decays toward zero far from the center', () => {
    const settings = singleBand({ type: 'bell', freq: 1000, gain: 6, q: 1 });
    // 3 octaves out, factor ≈ exp(-(3/0.5)^2) ≈ 0
    const far = calculateAdvancedEQResponse(settings, freqs([8000]))[0];
    expect(far.magnitudeDb).toBeLessThan(0.01);
  });

  it('lowShelf holds its gain below the corner and falls off above', () => {
    const settings = singleBand({ type: 'lowShelf', freq: 200, gain: 3 });
    const below = calculateAdvancedEQResponse(settings, freqs([100]))[0];
    const at = calculateAdvancedEQResponse(settings, freqs([200]))[0];
    // 3 octaves above: falloff = max(0, 1 - 3*0.8) = 0
    const far = calculateAdvancedEQResponse(settings, freqs([1600]))[0];
    expect(below.magnitudeDb).toBeCloseTo(3, 5);
    expect(at.magnitudeDb).toBeCloseTo(3, 5);
    expect(far.magnitudeDb).toBeCloseTo(0, 5);
  });

  it('highShelf holds its gain above the corner and falls off below', () => {
    const settings = singleBand({ type: 'highShelf', freq: 1000, gain: 4 });
    const above = calculateAdvancedEQResponse(settings, freqs([2000]))[0];
    // 3.32 octaves below: falloff → 0
    const far = calculateAdvancedEQResponse(settings, freqs([100]))[0];
    expect(above.magnitudeDb).toBeCloseTo(4, 5);
    expect(far.magnitudeDb).toBeCloseTo(0, 5);
  });

  it('highpass applies 12 dB/oct × q below the corner and passes above', () => {
    const settings = singleBand({ type: 'highpass', freq: 100, gain: 0, q: 0.7 });
    const below = calculateAdvancedEQResponse(settings, freqs([50]))[0];
    const above = calculateAdvancedEQResponse(settings, freqs([1000]))[0];
    // one octave down → -12 * 0.7
    expect(below.magnitudeDb).toBeCloseTo(-8.4, 5);
    expect(above.magnitudeDb).toBeCloseTo(0, 5);
  });

  it('lowpass applies 12 dB/oct × q above the corner and passes below', () => {
    const settings = singleBand({ type: 'lowpass', freq: 5000, gain: 0, q: 1 });
    const above = calculateAdvancedEQResponse(settings, freqs([10000]))[0];
    const below = calculateAdvancedEQResponse(settings, freqs([100]))[0];
    expect(above.magnitudeDb).toBeCloseTo(-12, 5);
    expect(below.magnitudeDb).toBeCloseTo(0, 5);
  });

  it('notch cuts to the floor within its bandwidth window and nothing outside', () => {
    const settings = singleBand({ type: 'notch', freq: 500, gain: 0, q: 2 });
    const at = calculateAdvancedEQResponse(settings, freqs([500]))[0];
    const outside = calculateAdvancedEQResponse(settings, freqs([750]))[0];
    // The -36 dB window hit clamps to the -24 dB floor; outside the window is untouched.
    expect(at.magnitudeDb).toBe(-24);
    expect(outside.magnitudeDb).toBeCloseTo(0, 5);
  });

  it('disabled bands contribute nothing', () => {
    const settings = singleBand({ type: 'bell', freq: 1000, gain: 6, enabled: false });
    const result = calculateAdvancedEQResponse(settings, freqs([1000]))[0];
    expect(result.magnitudeDb).toBeCloseTo(0, 5);
  });

  it('outputTrimDb shifts the whole response', () => {
    const settings: AdvancedEQSettings = {
      outputTrimDb: -2,
      bands: [{ id: 'b', type: 'lowShelf', freq: 200, gain: 3, q: 1, enabled: true }],
    };
    const below = calculateAdvancedEQResponse(settings, freqs([100]))[0];
    expect(below.magnitudeDb).toBeCloseTo(1, 5);
  });

  it('clamps the response to ±24 dB', () => {
    const loud = singleBand({ type: 'bell', freq: 1000, gain: 100 });
    const quiet = singleBand({ type: 'bell', freq: 1000, gain: -100 });
    expect(calculateAdvancedEQResponse(loud, freqs([1000]))[0].magnitudeDb).toBe(24);
    expect(calculateAdvancedEQResponse(quiet, freqs([1000]))[0].magnitudeDb).toBe(-24);
  });

  it('never returns NaN or Infinity, including at zero hertz', () => {
    const allTypes: EQBand['type'][] = [
      'bell',
      'lowShelf',
      'highShelf',
      'lowpass',
      'highpass',
      'notch',
    ];
    for (const type of allTypes) {
      const settings = singleBand({ type, freq: 0, gain: 6, q: 3 });
      for (const f of [0, 1, 60, 1000, 20000]) {
        const r = calculateAdvancedEQResponse(settings, freqs([f]))[0];
        expect(Number.isFinite(r.magnitudeDb)).toBe(true);
      }
    }
  });

  it('default settings produce a sane, bounded curve', () => {
    const f = new Float32Array(200);
    for (let i = 0; i < 200; i++) f[i] = 20 * Math.pow(20000 / 20, i / 199);
    const result = calculateAdvancedEQResponse(DEFAULT_EQ_SETTINGS, f);
    expect(result).toHaveLength(200);
    for (const r of result) {
      expect(Number.isFinite(r.magnitudeDb)).toBe(true);
      expect(r.magnitudeDb).toBeGreaterThanOrEqual(-24);
      expect(r.magnitudeDb).toBeLessThanOrEqual(24);
    }
  });
});
