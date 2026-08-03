/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the per-layer parametric EQ helper (Phase 3.4).
 */

import { describe, expect, it } from 'vitest';
import {
  createEqChain,
  eqBandResponseDb,
  updateEqChain,
  type AudioContextLike,
} from './eqBands';

const makeContext = (): AudioContextLike => {
  const created: { type: BiquadFilterType; freq: number; q: number; gain: number }[] = [];
  const paramFactory = (initial: number) => {
    let v = initial;
    return {
      get value() {
        return v;
      },
      setValueAtTime: (next: number) => {
        v = next;
      },
    };
  };
  return {
    currentTime: 0,
    createBiquadFilter: () => {
      const node = {
        type: 'peaking' as BiquadFilterType,
        frequency: paramFactory(1000),
        Q: paramFactory(1),
        gain: paramFactory(0),
        _captured: created,
        connect: () => {},
      };
      return node as unknown as AudioContextLike['createBiquadFilter'] extends () => infer T ? T : never;
    },
  } as unknown as AudioContextLike;
};

describe('eqBands — createEqChain', () => {
  it('returns empty chain when bands are missing', () => {
    const ctx = makeContext();
    const chain = createEqChain(ctx, undefined);
    expect(chain.filters).toEqual([]);
  });

  it('skips disabled bands', () => {
    const ctx = makeContext();
    const chain = createEqChain(ctx, [
      { type: 'peaking', frequency: 1000, gainDb: 3, q: 1, enabled: true },
      { type: 'peaking', frequency: 2000, gainDb: 6, q: 1, enabled: false },
      { type: 'peaking', frequency: 4000, gainDb: 9, q: 1, enabled: true },
    ]);
    expect(chain.filters).toHaveLength(2);
  });

  it('returns the input/output nodes for splicing into a chain', () => {
    const ctx = makeContext();
    const chain = createEqChain(ctx, [
      { type: 'peaking', frequency: 1000, gainDb: 3, q: 1, enabled: true },
    ]);
    expect(chain.input).toBe(chain.filters[0]);
    expect(chain.output).toBe(chain.filters[0]);
  });
});

describe('eqBands — updateEqChain', () => {
  it('updates parameters of existing filters in place', () => {
    const ctx = makeContext();
    const chain = createEqChain(ctx, [
      { type: 'peaking', frequency: 1000, gainDb: 3, q: 1, enabled: true },
      { type: 'peaking', frequency: 4000, gainDb: 6, q: 1.5, enabled: true },
    ]);
    updateEqChain(chain, [
      { type: 'peaking', frequency: 1500, gainDb: -2, q: 2, enabled: true },
      { type: 'peaking', frequency: 5000, gainDb: 4, q: 0.5, enabled: true },
    ], 0);
    expect((chain.filters[0].frequency as unknown as { value: number }).value).toBe(1500);
    expect((chain.filters[0].gain as unknown as { value: number }).value).toBe(-2);
    expect((chain.filters[1].Q as unknown as { value: number }).value).toBe(0.5);
  });

  it('does not crash when called with no bands', () => {
    const ctx = makeContext();
    const chain = createEqChain(ctx, []);
    expect(() => updateEqChain(chain, undefined, 0)).not.toThrow();
  });
});

describe('eqBands — eqBandResponseDb', () => {
  it('returns 0 for a disabled band', () => {
    expect(eqBandResponseDb({ type: 'peaking', frequency: 1000, gainDb: 6, q: 1, enabled: false }, 1000)).toBe(0);
  });

  it('peaking band returns gain at the centre frequency', () => {
    const band = { type: 'peaking' as const, frequency: 1000, gainDb: 6, q: 1 };
    expect(eqBandResponseDb(band, 1000)).toBeCloseTo(6, 5);
  });

  it('peaking band attenuates away from the centre', () => {
    const band = { type: 'peaking' as const, frequency: 1000, gainDb: 6, q: 1 };
    const responseAt2k = eqBandResponseDb(band, 2000);
    expect(responseAt2k).toBeLessThan(6);
    expect(responseAt2k).toBeGreaterThan(0);
  });

  it('lowshelf returns full gain below and 0 above the shelf', () => {
    const band = { type: 'lowshelf' as const, frequency: 200, gainDb: 4, q: 0.7 };
    expect(eqBandResponseDb(band, 100)).toBe(4);
    expect(eqBandResponseDb(band, 1000)).toBe(0);
  });

  it('highshelf returns full gain above and 0 below', () => {
    const band = { type: 'highshelf' as const, frequency: 4000, gainDb: 3, q: 0.7 };
    expect(eqBandResponseDb(band, 100)).toBe(0);
    expect(eqBandResponseDb(band, 8000)).toBe(3);
  });

  it('allpass returns 0', () => {
    const band = { type: 'allpass' as const, frequency: 1000, gainDb: 0, q: 1 };
    expect(eqBandResponseDb(band, 1000)).toBe(0);
    expect(eqBandResponseDb(band, 500)).toBe(0);
  });
});
