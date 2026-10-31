import { describe, it, expect } from 'vitest';
import { Sequencer } from './Sequencer';

describe('Sequencer', () => {
  it('steps through values', () => {
    const s = new Sequencer();
    s.setSteps([1, 0]);
    s.setTempo(120, 4, 44100);
    s.setGlide(0);
    const vals = new Set<number>();
    for (let i = 0; i < 200000; i++) vals.add(s.tick());
    expect(vals.has(0)).toBe(true);
    expect(vals.has(1)).toBe(true);
  });

  it('reset restarts', () => {
    const s = new Sequencer();
    s.setSteps([1, 0]);
    s.setTempo(120, 4, 44100);
    for (let i = 0; i < 50000; i++) s.tick();
    s.reset();
    expect(s.currentIndex()).toBe(0);
  });

  it('glide interpolates', () => {
    const s = new Sequencer();
    s.setSteps([0, 1]);
    s.setTempo(120, 1, 44100);
    s.setGlide(1);
    const v = s.tick();
    expect(typeof v).toBe('number');
  });

  it('empty steps defaults', () => {
    const s = new Sequencer();
    s.setSteps([]);
    expect(s.currentIndex()).toBe(0);
  });
});
