import { describe, it, expect } from 'vitest';
import { CombinatorProcessor } from './CombinatorProcessor';

describe('CombinatorProcessor', () => {
  it('passes through when empty', () => {
    const p = new CombinatorProcessor(44100, 120);
    const out = new Float32Array(2);
    p.processSampleInto(0.5, -0.25, out);
    expect(out[0]).toBeCloseTo(0.5, 5);
    expect(out[1]).toBeCloseTo(-0.25, 5);
  });

  it('isEmpty true initially', () => {
    const p = new CombinatorProcessor(44100, 120);
    expect(p.isEmpty).toBe(true);
  });
});
