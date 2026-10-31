/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { computeFluxCurve, detectOnsetsInSamples, pickFluxOnsets } from './spectralFlux';
import { hits, silence } from '../../tests/mobileSignals';

const SR = 48000;

describe('computeFluxCurve', () => {
  it('produces one frame per hop over the buffer', () => {
    const samples = silence(0.1, SR); // 4800 frames
    const curve = computeFluxCurve(samples, { frameSize: 1024, hopSize: 512 });
    expect(curve.frameSize).toBe(1024);
    expect(curve.hopSize).toBe(512);
    expect(curve.frameCount).toBe(Math.floor((4800 - 1024) / 512) + 1);
    expect(curve.flux.length).toBe(curve.frameCount);
  });

  it('returns an empty curve for a buffer shorter than one frame', () => {
    const curve = computeFluxCurve(new Float32Array(100), { frameSize: 1024 });
    expect(curve.frameCount).toBe(0);
    expect(curve.flux.length).toBe(0);
  });

  it('defaults the hop to half a frame', () => {
    const curve = computeFluxCurve(silence(0.1, SR), { frameSize: 512 });
    expect(curve.hopSize).toBe(256);
  });
});

describe('pickFluxOnsets', () => {
  it('returns nothing for a curve that is too short to analyse', () => {
    const curve = computeFluxCurve(silence(0.02, SR), { frameSize: 1024 });
    expect(pickFluxOnsets(curve, SR)).toEqual([]);
  });

  it('returns nothing for a flat (silent) curve', () => {
    const curve = computeFluxCurve(silence(0.5, SR), { frameSize: 1024 });
    expect(pickFluxOnsets(curve, SR)).toEqual([]);
  });

  it('finds a hit and reports a normalized strength between 0 and 1', () => {
    const samples = hits([{ atSec: 0.3, freq: 200 }], 0.6, SR);
    const onset = detectOnsetsInSamples(samples, SR, { sensitivity: 0.8 });
    expect(onset.length).toBeGreaterThan(0);
    expect(onset[0].time).toBeGreaterThan(0.25);
    expect(onset[0].time).toBeLessThan(0.36);
    expect(onset[0].strength).toBeGreaterThan(0);
    expect(onset[0].strength).toBeLessThanOrEqual(1);
    expect(onset[0].sampleIndex).toBe(Math.round(onset[0].time * SR));
  });

  it('honours the strength floor', () => {
    const samples = hits([{ atSec: 0.3, freq: 200 }], 0.6, SR);
    const all = detectOnsetsInSamples(samples, SR, { sensitivity: 0.8 });
    const strong = detectOnsetsInSamples(samples, SR, { sensitivity: 0.8, minStrength: 1.1 });
    expect(strong.length).toBeLessThan(all.length);
  });
});
