/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  BPM_MAX,
  BPM_MIN,
  SWING_MAX_FRACTION,
  SWING_MAX_PERCENT,
  clampBpm,
  clampSwingFraction,
  clampSwingPercent,
  swingFractionToPercent,
  swingPercentToFraction,
} from './controlRanges';

describe('clampBpm', () => {
  it('exposes a canonical range', () => {
    expect(BPM_MIN).toBe(60);
    expect(BPM_MAX).toBe(240);
    expect(BPM_MIN).toBeLessThan(BPM_MAX);
  });

  it('clamps to the canonical range', () => {
    expect(clampBpm(10)).toBe(BPM_MIN);
    expect(clampBpm(9999)).toBe(BPM_MAX);
    expect(clampBpm(120)).toBe(120);
  });

  it('rounds fractional tempos', () => {
    expect(clampBpm(120.4)).toBe(120);
    expect(clampBpm(120.6)).toBe(121);
  });

  it('falls back to 120 for non-finite input', () => {
    expect(clampBpm(Number.NaN)).toBe(120);
    expect(clampBpm(Number.POSITIVE_INFINITY)).toBe(120);
  });
});

describe('swing clamping', () => {
  it('clamps fractions to 0..0.66', () => {
    expect(SWING_MAX_FRACTION).toBeCloseTo(0.66, 6);
    expect(clampSwingFraction(-0.5)).toBe(0);
    expect(clampSwingFraction(2)).toBe(SWING_MAX_FRACTION);
    expect(clampSwingFraction(0.3)).toBe(0.3);
    expect(clampSwingFraction(Number.NaN)).toBe(0);
  });

  it('clamps percents to 0..75 and rounds', () => {
    expect(SWING_MAX_PERCENT).toBe(75);
    expect(clampSwingPercent(-10)).toBe(0);
    expect(clampSwingPercent(500)).toBe(SWING_MAX_PERCENT);
    expect(clampSwingPercent(42.6)).toBe(43);
    expect(clampSwingPercent(Number.NaN)).toBe(0);
  });
});

describe('swing unit conversion', () => {
  it('converts percent to fraction and back within range', () => {
    expect(swingPercentToFraction(50)).toBeCloseTo(0.5, 6);
    expect(swingFractionToPercent(0.5)).toBe(50);
    expect(swingFractionToPercent(swingPercentToFraction(30))).toBe(30);
  });

  it('clamps on both sides of the conversion', () => {
    // 200% would be 2.0 as a fraction — clamped to the fraction ceiling.
    expect(swingPercentToFraction(200)).toBe(SWING_MAX_FRACTION);
    // 1.0 as a fraction would be 100% — clamped to the percent ceiling.
    expect(swingFractionToPercent(1)).toBe(SWING_MAX_PERCENT);
    expect(swingPercentToFraction(-5)).toBe(0);
    expect(swingFractionToPercent(-1)).toBe(0);
  });
});
