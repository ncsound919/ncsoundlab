import { describe, it, expect } from 'vitest';
import { evolveCombinatorState } from './combinatorEvolution';

describe('combinatorEvolution', () => {
  const base: any = {
    slots: [{ id: 's1', moduleId: 'FILTER', enabled: true, mix: 1, preGainDb: 0, postGainDb: 0, polarity: false, bands: { low: true, mid: true, high: true }, crossovers: [200, 2000], params: { cutoff: 1000 }, motion: 'lfo', motionParams: { depth: 0.5 }, locked: false }],
    routes: [],
    masterMix: 1,
    bpm: 120,
    tightMode: true,
    xyAssign: { x: 's1.cutoff', y: 's1.cutoff' },
    morphAmount: 0,
  };

  it('produces count variants', () => {
    const v = evolveCombinatorState(base, 5, 0.5);
    expect(v.length).toBe(5);
  });

  it('variants differ from base', () => {
    const v = evolveCombinatorState(base, 3, 1);
    expect(v[0].slots[0].moduleId).toBeTruthy();
  });

  it('preserves slot count', () => {
    const v = evolveCombinatorState(base, 2, 0.3);
    expect(v[0].slots.length).toBe(1);
  });
});
