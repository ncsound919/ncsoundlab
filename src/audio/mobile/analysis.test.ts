/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  analyseSamples,
  autoFilterIssues,
  isNearDuplicate,
  isRejected,
  spectralDistance,
  suggestSubLayer,
  toDb,
} from './analysis';
import { hits, noise, silence, tone } from '../../tests/mobileSignals';

const SR = 48000;

describe('analyseSamples', () => {
  it('measures a 1 kHz tone at the right centroid and band', () => {
    const analysis = analyseSamples(tone(1000, 0.3, SR, 0.5), SR);
    expect(Math.abs(analysis.centroidHz - 1000)).toBeLessThan(150);
    expect(analysis.bands.mid).toBeGreaterThan(0.8);
    expect(analysis.peak).toBeCloseTo(0.5, 2);
    expect(toDb(analysis.peak)).toBeCloseTo(-6.02, 1);
    expect(Math.abs(analysis.dcOffset)).toBeLessThan(0.01);
  });

  it('reports DC offset', () => {
    const biased = tone(400, 0.2, SR, 0.2);
    for (let i = 0; i < biased.length; i++) biased[i] += 0.25;
    const analysis = analyseSamples(biased, SR);
    expect(analysis.dcOffset).toBeCloseTo(0.25, 2);
    expect(autoFilterIssues(analysis).some((i) => i.code === 'DC_OFFSET')).toBe(true);
  });

  it('flags a clipped capture', () => {
    const hot = tone(220, 0.2, SR, 2.5);
    const analysis = analyseSamples(hot, SR);
    expect(analysis.clippingRatio).toBeGreaterThan(0.1);
    const issues = autoFilterIssues(analysis);
    expect(issues.some((i) => i.code === 'CLIPPED' && i.severity === 'reject')).toBe(true);
    expect(isRejected(issues)).toBe(true);
  });

  it('treats an empty buffer as silent and rejects it', () => {
    const analysis = analyseSamples(silence(0.2, SR), SR);
    expect(analysis.peak).toBe(0);
    const issues = autoFilterIssues(analysis);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('SILENT');
  });

  it('distinguishes a percussive hit from a sustained tone by crest factor', () => {
    const transient = analyseSamples(hits([{ atSec: 0.05, freq: 90, decaySec: 0.05 }], 0.4, SR), SR);
    const sustained = analyseSamples(tone(90, 0.4, SR, 0.5), SR);
    expect(transient.crest).toBeGreaterThan(sustained.crest);
    expect(transient.attackMs).toBeLessThan(60);
  });

  it('measures tail length on a decaying hit', () => {
    const decayed = analyseSamples(hits([{ atSec: 0.02, freq: 150, decaySec: 0.25 }], 1.5, SR), SR);
    expect(decayed.tailSec).toBeGreaterThan(0.1);
    expect(decayed.silenceRatio).toBeGreaterThan(0);
  });

  it('rejects a take shorter than the floor', () => {
    const issues = autoFilterIssues(analyseSamples(tone(500, 0.01, SR, 0.5), SR));
    expect(issues.some((i) => i.code === 'TOO_SHORT')).toBe(true);
  });
});

describe('spectralDistance', () => {
  it('is zero for identical material and large for different material', () => {
    const bright = analyseSamples(tone(4000, 0.3, SR, 0.4), SR);
    const same = analyseSamples(tone(4000, 0.3, SR, 0.4), SR);
    const dark = analyseSamples(tone(120, 0.3, SR, 0.4), SR);
    expect(spectralDistance(bright, same)).toBeCloseTo(0, 6);
    expect(spectralDistance(bright, dark)).toBeGreaterThan(0.1);
    expect(isNearDuplicate(bright, dark, 0.08)).toBe(false);
  });

  it('treats two renders of a noisy source as near-duplicates', () => {
    const a = analyseSamples(noise(0.3, SR, 0.2, 7), SR);
    const b = analyseSamples(noise(0.3, SR, 0.2, 7), SR);
    expect(isNearDuplicate(a, b, 0.08)).toBe(true);
  });
});

describe('suggestSubLayer', () => {
  it('suggests a sub layer under a thin, bright source', () => {
    const thin = analyseSamples(tone(2000, 0.3, SR, 0.4), SR);
    const suggestion = suggestSubLayer(thin, { fundamentalHz: 2000 });
    expect(suggestion.suggest).toBe(true);
    expect(suggestion.weight).toBeGreaterThan(0);
    expect(suggestion.hz).toBeGreaterThan(20);
    expect(suggestion.reason).toMatch(/thin/);
  });

  it('declines when the low end is already there', () => {
    const thick = analyseSamples(tone(60, 0.3, SR, 0.6), SR);
    const suggestion = suggestSubLayer(thick);
    expect(suggestion.suggest).toBe(false);
    expect(suggestion.weight).toBe(0);
  });

  it('declines on a silent capture', () => {
    expect(suggestSubLayer(analyseSamples(silence(0.1, SR), SR)).suggest).toBe(false);
  });
});
