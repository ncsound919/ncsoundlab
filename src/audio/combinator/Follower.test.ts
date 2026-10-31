import { describe, it, expect } from 'vitest';
import { Follower } from './Follower';

describe('Follower', () => {
  it('rises on loud input', () => {
    const f = new Follower(44100, 1, 100);
    const v = f.process(1);
    expect(v).toBeGreaterThan(0);
  });

  it('decays on silence', () => {
    const f = new Follower(44100, 1, 5);
    f.process(1);
    const before = f.valueNow();
    f.process(0);
    expect(f.valueNow()).toBeLessThanOrEqual(before);
  });

  it('reset to zero', () => {
    const f = new Follower(44100, 1, 5);
    f.process(1);
    f.reset();
    expect(f.valueNow()).toBe(0);
  });

  it('shape curves', () => {
    expect(Follower.shape(0.5, 'linear')).toBeCloseTo(0.5, 5);
    expect(Follower.shape(0.5, 'exp')).toBeCloseTo(0.25, 5);
    expect(Follower.shape(0.5, 'log')).toBeCloseTo(Math.sqrt(0.5), 5);
  });
});
