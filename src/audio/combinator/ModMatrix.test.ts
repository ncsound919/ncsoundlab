import { describe, it, expect } from 'vitest';
import { ModMatrix } from './ModMatrix';

describe('ModMatrix', () => {
  it('applies a route', () => {
    const m = new ModMatrix();
    m.setRoutes([{ src: 'a', dst: 's1.cutoff', amount: 100, polarity: false, curve: 'linear' }]);
    const params: Record<string, Record<string, number>> = { s1: { cutoff: 1000 } };
    m.apply({ a: 0.5 }, params);
    expect(params.s1.cutoff).toBeCloseTo(1050, 0);
  });

  it('polarity inverts', () => {
    const m = new ModMatrix();
    m.setRoutes([{ src: 'a', dst: 's1.cutoff', amount: 100, polarity: true, curve: 'linear' }]);
    const params: Record<string, Record<string, number>> = { s1: { cutoff: 1000 } };
    m.apply({ a: 0.5 }, params);
    expect(params.s1.cutoff).toBeCloseTo(950, 0);
  });

  it('ignores missing source/dest', () => {
    const m = new ModMatrix();
    m.setRoutes([{ src: 'x', dst: 's1.cutoff', amount: 100, polarity: false, curve: 'linear' }]);
    const params: Record<string, Record<string, number>> = { s1: { cutoff: 1000 } };
    m.apply({ a: 0.5 }, params);
    expect(params.s1.cutoff).toBe(1000);
  });

  it('exp curve', () => {
    const m = new ModMatrix();
    m.setRoutes([{ src: 'a', dst: 's1.cutoff', amount: 100, polarity: false, curve: 'exp' }]);
    const params: Record<string, Record<string, number>> = { s1: { cutoff: 1000 } };
    m.apply({ a: 0.5 }, params);
    // 0.5*0.5=0.25 *100 =25
    expect(params.s1.cutoff).toBeCloseTo(1025, 0);
  });
});
