/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the sample-accurate step scheduling helper.
 * `stepOffsetSeconds` computes swing/groove/pocket offsets as audio-clock
 * seconds (never JS timers) and clamps pushed (negative) offsets to 0.
 */

import { describe, expect, it } from 'vitest';
import { stepOffsetSeconds } from './sequencerHelpers';

const opts = {
  stepMs: 125, // 16th note @ 120 BPM
  stepIndex: 1, // odd = off-beat
  swingPercent: 0,
  cellOffset: 0,
  pocketMs: 0,
};

describe('stepOffsetSeconds', () => {
  it('returns 0 with no swing/groove/pocket', () => {
    expect(stepOffsetSeconds(opts)).toBe(0);
  });

  it('swings off-beat 16ths by swing% of the step', () => {
    expect(stepOffsetSeconds({ ...opts, swingPercent: 50 })).toBeCloseTo(0.0625, 6);
    expect(stepOffsetSeconds({ ...opts, swingPercent: 100 })).toBeCloseTo(0.125, 6);
  });

  it('does not swing even steps', () => {
    expect(stepOffsetSeconds({ ...opts, stepIndex: 0, swingPercent: 50 })).toBe(0);
  });

  it('applies the per-cell groove offset as a fraction of the step', () => {
    expect(stepOffsetSeconds({ ...opts, cellOffset: 0.5 })).toBeCloseTo(0.0625, 6);
    expect(stepOffsetSeconds({ ...opts, cellOffset: 0.25 })).toBeCloseTo(0.03125, 6);
  });

  it('adds the pocket bias in ms', () => {
    expect(stepOffsetSeconds({ ...opts, pocketMs: 20 })).toBeCloseTo(0.02, 6);
  });

  it('combines swing + groove + pocket', () => {
    const out = stepOffsetSeconds({ ...opts, swingPercent: 50, cellOffset: 0.5, pocketMs: 10 });
    expect(out).toBeCloseTo(0.0625 + 0.0625 + 0.01, 6);
  });

  it('clamps pushed (negative) offsets to 0 — cannot schedule in the past', () => {
    expect(stepOffsetSeconds({ ...opts, cellOffset: -0.5 })).toBe(0);
    expect(stepOffsetSeconds({ ...opts, pocketMs: -9999 })).toBe(0);
  });
});
