/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for clip-launch timing math.
 */

import { describe, it, expect } from 'vitest';
import { nextLoopBoundarySec, msUntil, loopBars } from './clipLauncher';

describe('nextLoopBoundarySec', () => {
  it('returns the in-progress loop start when on the grid', () => {
    expect(nextLoopBoundarySec(0, 2)).toBe(0);
    expect(nextLoopBoundarySec(2, 2)).toBe(2);
  });

  it('returns the next boundary mid-loop', () => {
    expect(nextLoopBoundarySec(0.5, 2)).toBe(2);
    expect(nextLoopBoundarySec(1.999, 2)).toBe(2);
    expect(nextLoopBoundarySec(2.001, 2)).toBe(4);
  });

  it('clamps degenerate inputs', () => {
    expect(nextLoopBoundarySec(-1, 2)).toBe(0);
    expect(nextLoopBoundarySec(1, 0)).toBeGreaterThanOrEqual(0);
  });
});

describe('msUntil', () => {
  it('converts audio-clock deltas to non-negative milliseconds', () => {
    expect(msUntil(2.5, 2.0)).toBe(500);
    expect(msUntil(1.0, 2.0)).toBe(0);
  });
});

describe('loopBars', () => {
  it('derives bars from the step length', () => {
    expect(loopBars(16)).toBe(1);
    expect(loopBars(32)).toBe(2);
  });
});
