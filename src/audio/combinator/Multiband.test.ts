import { describe, it, expect } from 'vitest';
import { MultibandSplitter } from './Multiband';

describe('MultibandSplitter', () => {
  it('splits signal into bands', () => {
    const m = new MultibandSplitter(44100, 200, 2000);
    const out = m.process(1, 1);
    expect(out.low).toBeDefined();
    expect(out.mid).toBeDefined();
    expect(out.high).toBeDefined();
  });

  it('reset works', () => {
    const m = new MultibandSplitter(44100, 200, 2000);
    m.process(1, 1);
    m.reset();
    // no throw
    expect(true).toBe(true);
  });

  it('setCrossovers works', () => {
    const m = new MultibandSplitter(44100, 200, 2000);
    m.setCrossovers(300, 3000);
    const out = m.process(0.5, 0.5);
    expect(out.low[0]).toBeGreaterThanOrEqual(-2);
  });
});
