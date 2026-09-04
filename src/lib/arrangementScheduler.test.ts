import { describe, expect, it } from 'vitest';
import { planFromArrangement, PatternId } from './arrangementScheduler';
import { Arrangement } from '../types';

function p(step: number, bpm: number) {
  return { stepLength: step as 16 | 32, bpm };
}
const pats = { A: p(16, 90), B: p(16, 100), C: p(16, 110), D: p(16, 120) } as Record<PatternId, { stepLength: 16 | 32; bpm: number }>;

function arr(clips: Arrangement['clips'], opts: Partial<Arrangement> = {}): Arrangement {
  const totalBeats = Math.max(...clips.map((c) => c.startBeat + c.beats), 4);
  return { totalBeats, clips, tempoMap: opts.tempoMap ?? [] };
}

describe('arrangement scheduler plan', () => {
  it('flattens sequential clips onto the per-bar timeline', () => {
    const plan = planFromArrangement(
      arr([
        { id: 'c1', patternId: 'A', startBeat: 0, beats: 4, loops: 1, muted: false },
        { id: 'c2', patternId: 'B', startBeat: 4, beats: 4, loops: 1, muted: false },
      ]),
      pats,
    );
    expect(plan.bars).toBe(2);
    expect(plan.order).toEqual(['A', 'B']);
    expect(plan.bpm).toEqual([90, 100]);
  });

  it('honors clip loops by repeating the pattern across the clip span', () => {
    const plan = planFromArrangement(
      arr([{ id: 'c1', patternId: 'A', startBeat: 0, beats: 8, loops: 2, muted: false }]),
      pats,
    );
    expect(plan.order).toEqual(['A', 'A']);
  });

  it('carries the previous pattern across a muted clip (no rests in song chain)', () => {
    const plan = planFromArrangement(
      arr([
        { id: 'c1', patternId: 'A', startBeat: 0, beats: 4, loops: 1, muted: false },
        { id: 'c2', patternId: 'B', startBeat: 4, beats: 4, loops: 1, muted: true },
      ]),
      pats,
    );
    expect(plan.order).toEqual(['A', 'A']); // B muted -> A carries
  });

  it('uses the tempo map for per-bar bpm', () => {
    const plan = planFromArrangement(
      arr([{ id: 'c1', patternId: 'A', startBeat: 0, beats: 8, loops: 2, muted: false }], { tempoMap: [{ tick: 0, bpm: 70 }, { tick: 4, bpm: 130 }] }),
      pats,
    );
    expect(plan.bpm).toEqual([70, 130]);
  });

  it('handles an empty arrangement gracefully', () => {
    const plan = planFromArrangement(null, pats);
    expect(plan.order).toEqual(['A']);
    expect(plan.bars).toBe(1);
  });
});
