/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/lib/padKeyMap.ts` (Phase 6.1).
 */

import { describe, expect, it } from 'vitest';
import { resolvePadKey, velocityFromPointerY, DEFAULT_PAD_KEYS } from './padKeyMap';

describe('resolvePadKey', () => {
  it('maps the default band keys to pads 0..15', () => {
    expect(resolvePadKey('z').padIndex).toBe(0);
    expect(resolvePadKey('s').padIndex).toBe(1);
    expect(resolvePadKey('/').padIndex).toBe(14);
    expect(resolvePadKey("'").padIndex).toBe(15);
  });

  it('is case-insensitive', () => {
    expect(resolvePadKey('Z').padIndex).toBe(0);
    expect(resolvePadKey('S').padIndex).toBe(1);
  });

  it('returns consumed=false for unbound keys', () => {
    const r = resolvePadKey('q');
    expect(r.padIndex).toBe(null);
    expect(r.consumed).toBe(false);
    expect(r.velocity).toBe(0);
  });

  it('uses full velocity without shift', () => {
    expect(resolvePadKey('z').velocity).toBe(1);
    expect(resolvePadKey('z').shiftHeld).toBe(false);
  });

  it('derives 16-levels velocity with shift (lower level = louder)', () => {
    const soft = resolvePadKey('z', DEFAULT_PAD_KEYS, true, 0);   // top = hardest
    const hard = resolvePadKey('z', DEFAULT_PAD_KEYS, true, 15);  // bottom = softest
    expect(soft.velocity).toBeGreaterThan(hard.velocity);
    expect(soft.velocity).toBeCloseTo(1, 5);
    expect(hard.velocity).toBeCloseTo(0.1, 5);
  });

  it('clamps level to 0..15', () => {
    expect(resolvePadKey('z', DEFAULT_PAD_KEYS, true, 99).velocity).toBe(0.1);
    expect(resolvePadKey('z', DEFAULT_PAD_KEYS, true, -5).velocity).toBe(1);
  });
});

describe('velocityFromPointerY', () => {
  it('maps top to full velocity and bottom to minimum', () => {
    expect(velocityFromPointerY(0)).toBe(1);
    expect(velocityFromPointerY(1)).toBe(0.1);
  });

  it('clamps out-of-range', () => {
    expect(velocityFromPointerY(-2)).toBe(1);
    expect(velocityFromPointerY(3)).toBe(0.1);
  });
});
