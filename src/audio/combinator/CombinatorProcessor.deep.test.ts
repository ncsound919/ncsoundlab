import { describe, it, expect } from 'vitest';
import { CombinatorProcessor } from './CombinatorProcessor';

describe('CombinatorProcessor deep', () => {
  it('master mix 0 returns dry', () => {
    const p = new CombinatorProcessor(44100, 120);
    p.setCombinator({ slots: [{ id: 's1', moduleId: 'SATURATION', enabled: true, mix: 1, preGainDb: 0, postGainDb: 0, polarity: false, bands: { low: true, mid: true, high: true }, crossovers: [200, 2000], params: { drive: 10, mix: 100 }, motion: 'macro', motionParams: { depth: 0, macro: 0.5 }, locked: false }], routes: [], masterMix: 0, bpm: 120, tightMode: true, xyAssign: { x: '', y: '' }, morphAmount: 0 } as any);
    const out = new Float32Array(2);
    p.processSampleInto(0.5, -0.25, out);
    expect(out[0]).toBeCloseTo(0.5, 5);
    expect(out[1]).toBeCloseTo(-0.25, 5);
  });

  it('empty returns input', () => {
    const p = new CombinatorProcessor(44100, 120);
    p.setCombinator(null);
    const out = new Float32Array(2);
    p.processSampleInto(0.3, 0.7, out);
    expect(out[0]).toBeCloseTo(0.3, 5);
    expect(out[1]).toBeCloseTo(0.7, 5);
  });

  it('reset does not throw', () => {
    const p = new CombinatorProcessor(44100, 120);
    p.setCombinator({ slots: [{ id: 's1', moduleId: 'FILTER', enabled: true, mix: 1, preGainDb: 0, postGainDb: 0, polarity: false, bands: { low: true, mid: true, high: true }, crossovers: [200, 2000], params: { cutoff: 1000, resonance: 4, drive: 0 }, motion: 'lfo', motionParams: { depth: 0.5, rateBeats: 1 }, locked: false }], routes: [], masterMix: 1, bpm: 120, tightMode: true, xyAssign: { x: '', y: '' }, morphAmount: 0 } as any);
    p.reset();
    expect(p.isEmpty).toBe(false);
  });

  it('multiband runs', () => {
    const p = new CombinatorProcessor(44100, 120);
    p.setCombinator({ slots: [{ id: 's1', moduleId: 'FILTER', enabled: true, mix: 1, preGainDb: 0, postGainDb: 0, polarity: false, bands: { low: true, mid: false, high: true }, crossovers: [300, 3000], params: { cutoff: 1000, resonance: 4, drive: 0 }, motion: 'macro', motionParams: { depth: 0, macro: 0.5 }, locked: false }], routes: [], masterMix: 1, bpm: 120, tightMode: true, xyAssign: { x: '', y: '' }, morphAmount: 0 } as any);
    const out = new Float32Array(2);
    p.processSampleInto(0.4, -0.4, out);
    expect(Number.isFinite(out[0])).toBe(true);
    expect(Number.isFinite(out[1])).toBe(true);
  });

  it('disabled slot passes through', () => {
    const p = new CombinatorProcessor(44100, 120);
    p.setCombinator({ slots: [{ id: 's1', moduleId: 'SATURATION', enabled: false, mix: 1, preGainDb: 0, postGainDb: 0, polarity: false, bands: { low: true, mid: true, high: true }, crossovers: [200, 2000], params: { drive: 20, mix: 100 }, motion: 'macro', motionParams: { depth: 0, macro: 0.5 }, locked: false }], routes: [], masterMix: 1, bpm: 120, tightMode: true, xyAssign: { x: '', y: '' }, morphAmount: 0 } as any);
    // enabled false filtered out in setCombinator, so runtimes empty -> passthrough
    const out = new Float32Array(2);
    p.processSampleInto(0.2, 0.6, out);
    expect(out[0]).toBeCloseTo(0.2, 5);
    expect(out[1]).toBeCloseTo(0.6, 5);
  });
});
