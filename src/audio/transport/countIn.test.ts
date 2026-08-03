import { describe, it, expect } from 'vitest';
import { buildCountInBeats, COUNT_IN_BEATS, isCountInActive } from './countIn';

describe('count-in', () => {
  it('constant COUNT_IN_BEATS = 4 (one bar in 4/4)', () => {
    expect(COUNT_IN_BEATS).toBe(4);
  });

  it('buildCountInBeats returns N beats of the given bpm', () => {
    const beats = buildCountInBeats(4, 120);
    expect(beats).toHaveLength(4);
    // 120 BPM = 0.5s per beat; 4 beats = 2s total
    expect(beats[0].timeSec).toBeCloseTo(0, 5);
    expect(beats[1].timeSec).toBeCloseTo(0.5, 5);
    expect(beats[2].timeSec).toBeCloseTo(1.0, 5);
    expect(beats[3].timeSec).toBeCloseTo(1.5, 5);
  });

  it('buildCountInBeats marks beat 0 as accent', () => {
    const beats = buildCountInBeats(4, 120);
    expect(beats[0].isAccent).toBe(true);
    expect(beats[1].isAccent).toBe(false);
  });

  it('isCountInActive is true while position is within count-in window', () => {
    expect(isCountInActive(0, 120, 4)).toBe(true);
    expect(isCountInActive(1.5, 120, 4)).toBe(true);
    expect(isCountInActive(1.99, 120, 4)).toBe(true);
    expect(isCountInActive(2.0, 120, 4)).toBe(false);
  });
});
