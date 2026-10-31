import { describe, it, expect } from 'vitest';
import { Lfo } from './Lfo';

describe('Lfo', () => {
  it('sine output in range', () => {
    const l = new Lfo(64);
    l.setShape('sine');
    for (let i = 0; i < 64; i++) {
      const v = l.tick(1 / 64);
      expect(v).toBeGreaterThanOrEqual(-1.1);
      expect(v).toBeLessThanOrEqual(1.1);
    }
  });

  it('custom points interpolation', () => {
    const l = new Lfo(16);
    l.setCustomPoints([{ t: 0, v: 0 }, { t: 1, v: 1 }], 'linear');
    l.setPhase(0.5);
    expect(l.value()).toBeCloseTo(0.5, 2);
  });

  it('reset returns phase 0', () => {
    const l = new Lfo(16);
    l.tick(0.5);
    l.reset();
    l.setShape('sine');
    expect(l.value()).toBeCloseTo(0, 2);
  });
});
