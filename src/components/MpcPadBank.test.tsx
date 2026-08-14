/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the pure MPC-pad helpers in `src/components/MpcPadBank.tsx`:
 * velocity-curve mapping (linear/exponential/log + full-level) and note-repeat
 * interval math.
 */

import { describe, expect, it } from 'vitest';
import { padVelocityFor, noteRepeatIntervalMs } from './MpcPadBank';

describe('padVelocityFor', () => {
  it('full level always returns 1 regardless of position or curve', () => {
    expect(padVelocityFor(0, 'linear', true)).toBe(1);
    expect(padVelocityFor(0.5, 'exponential', true)).toBe(1);
    expect(padVelocityFor(1, 'log', true)).toBe(1);
    expect(padVelocityFor(99, 'linear', true)).toBe(1);
  });

  it('top of pad (y=0) is loudest for every curve', () => {
    expect(padVelocityFor(0, 'linear', false)).toBe(1);
    expect(padVelocityFor(0, 'exponential', false)).toBe(1);
    expect(padVelocityFor(0, 'log', false)).toBe(1);
  });

  it('bottom of pad (y=1) floors at 0.1', () => {
    expect(padVelocityFor(1, 'linear', false)).toBeCloseTo(0.1, 5);
    expect(padVelocityFor(1, 'exponential', false)).toBeCloseTo(0.1, 5);
    expect(padVelocityFor(1, 'log', false)).toBeCloseTo(0.1, 5);
  });

  it('linear is a straight 1 - y mapping', () => {
    expect(padVelocityFor(0.25, 'linear', false)).toBeCloseTo(0.75, 5);
    expect(padVelocityFor(0.5, 'linear', false)).toBeCloseTo(0.5, 5);
  });

  it('exponential squares the height (softer at the top)', () => {
    // t = 1 - y = 0.5 → 0.25
    expect(padVelocityFor(0.5, 'exponential', false)).toBeCloseTo(0.25, 5);
    // t = 1 - y = 0.4 → 0.16
    expect(padVelocityFor(0.6, 'exponential', false)).toBeCloseTo(0.16, 5);
  });

  it('exponential floors at 0.1 near the bottom edge', () => {
    // t² = 0.0625 < the 0.1 floor → 0.1
    expect(padVelocityFor(0.75, 'exponential', false)).toBeCloseTo(0.1, 5);
  });

  it('log takes the square root (hotter at the bottom)', () => {
    // t = 1 - y = 0.25 → sqrt(0.25) = 0.5
    expect(padVelocityFor(0.75, 'log', false)).toBeCloseTo(0.5, 5);
  });

  it('clamps out-of-range input to [0,1]', () => {
    expect(padVelocityFor(-0.5, 'linear', false)).toBe(1);
    expect(padVelocityFor(2, 'linear', false)).toBeCloseTo(0.1, 5);
  });

  it('exponential is never louder than linear at the same height', () => {
    for (const y of [0.1, 0.3, 0.6, 0.9]) {
      expect(padVelocityFor(y, 'exponential', false)).toBeLessThanOrEqual(
        padVelocityFor(y, 'linear', false)
      );
    }
  });
});

describe('noteRepeatIntervalMs', () => {
  it('quarter notes at 120 BPM = 500ms', () => {
    expect(noteRepeatIntervalMs(120, 1)).toBe(500);
  });

  it('scales with division', () => {
    expect(noteRepeatIntervalMs(120, 2)).toBe(250); // 1/8
    expect(noteRepeatIntervalMs(120, 4)).toBe(125); // 1/16
    expect(noteRepeatIntervalMs(120, 8)).toBe(62.5); // 1/32
  });

  it('scales with BPM', () => {
    expect(noteRepeatIntervalMs(60, 4)).toBe(250);
    expect(noteRepeatIntervalMs(240, 4)).toBe(62.5);
  });
});
