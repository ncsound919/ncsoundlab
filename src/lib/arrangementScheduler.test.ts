import { describe, expect, it } from 'vitest';
import { planFromArrangement, planArrangementCells, beatToSeconds, cellsAtGlobalStep, totalArrangementSteps, PatternId } from './arrangementScheduler';
import { Arrangement, Pattern, PatternCell } from '../types';

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

// ---------------------------------------------------------------------------
// Clip-accurate planning (planArrangementCells / beatToSeconds)
// ---------------------------------------------------------------------------

function pattern(id: 'A' | 'B' | 'C' | 'D', bpm: number, onSteps: Record<string, number[]>): Pattern {
  const layerRows: Record<string, PatternCell[]> = {};
  for (const [layerId, steps] of Object.entries(onSteps)) {
    const row: PatternCell[] = Array.from({ length: 16 }, () => ({ on: false }));
    for (const s of steps) row[s] = { on: true, note: 60 + s, velocity: 100 };
    layerRows[layerId] = row;
  }
  return { id, name: id, layerRows, timeSignature: [4, 4], stepLength: 16, swing: 0, bpm };
}

describe('beatToSeconds', () => {
  it('integrates a tempo map', () => {
    expect(beatToSeconds([], 4, 120)).toBeCloseTo(2, 6);
    // 4 beats at 60 then 4 beats at 120 → 4 + 2 = 6s at beat 8.
    expect(beatToSeconds([{ tick: 0, bpm: 60 }, { tick: 4, bpm: 120 }], 8, 60)).toBeCloseTo(6, 6);
    expect(beatToSeconds([], -2, 120)).toBe(0);
  });
});

describe('planArrangementCells', () => {
  it('keeps sub-bar clip starts (clip-accurate, not bar-snapped)', () => {
    const patterns = { A: pattern('A', 120, { l1: [0, 1] }) } as unknown as Record<string, Pattern>;
    const plan = planArrangementCells(
      arr([{ id: 'c1', patternId: 'A', startBeat: 1, beats: 4, loops: 1, muted: false }]),
      patterns,
      120
    );
    // Beat 1 at 120bpm = 0.5s; the 2nd 16th step is +0.125s.
    expect(plan.cells).toHaveLength(2);
    expect(plan.cells[0].timeSec).toBeCloseTo(0.5, 6);
    expect(plan.cells[1].timeSec).toBeCloseTo(0.625, 6);
  });

  it('repeats a clipped pattern per loop', () => {
    const patterns = { A: pattern('A', 120, { l1: [0] }) } as unknown as Record<string, Pattern>;
    const plan = planArrangementCells(
      arr([{ id: 'c1', patternId: 'A', startBeat: 0, beats: 8, loops: 2, muted: false }]),
      patterns,
      120
    );
    expect(plan.cells).toHaveLength(2);
    expect(plan.cells[1].repetition).toBe(1);
    // Pattern is 16 steps = 4 beats = 2s at 120bpm.
    expect(plan.cells[1].timeSec).toBeCloseTo(2, 6);
  });

  it('emits cells for overlapping clips (layering) and flags the overlap', () => {
    const patterns = {
      A: pattern('A', 120, { l1: [0] }),
      B: pattern('B', 120, { l2: [0] }),
    } as unknown as Record<string, Pattern>;
    const plan = planArrangementCells(
      arr([
        { id: 'c1', patternId: 'A', startBeat: 0, beats: 4, loops: 1, muted: false },
        { id: 'c2', patternId: 'B', startBeat: 2, beats: 4, loops: 1, muted: false },
      ]),
      patterns,
      120
    );
    expect(plan.cells.map((c) => c.layerId).sort()).toEqual(['l1', 'l2']);
    expect(plan.hasOverlaps).toBe(false); // different times (0s vs 1s)
  });

  it('detects a true simultaneous overlap', () => {
    const patterns = {
      A: pattern('A', 120, { l1: [0] }),
      B: pattern('B', 120, { l2: [0] }),
    } as unknown as Record<string, Pattern>;
    const plan = planArrangementCells(
      arr([
        { id: 'c1', patternId: 'A', startBeat: 0, beats: 4, loops: 1, muted: false },
        { id: 'c2', patternId: 'B', startBeat: 0, beats: 4, loops: 1, muted: false },
      ]),
      patterns,
      120
    );
    expect(plan.hasOverlaps).toBe(true);
  });

  it('skips muted clips and returns empty for no arrangement', () => {
    const patterns = { A: pattern('A', 120, { l1: [0] }) } as unknown as Record<string, Pattern>;
    expect(planArrangementCells(null, patterns).cells).toHaveLength(0);
    const plan = planArrangementCells(
      arr([{ id: 'c1', patternId: 'A', startBeat: 0, beats: 4, loops: 1, muted: true }]),
      patterns,
      120
    );
    expect(plan.cells).toHaveLength(0);
  });
});

describe('live arrangement stepping (cellsAtGlobalStep / totalArrangementSteps)', () => {
  const patterns = {
    A: pattern('A', 120, { l1: [0, 4] }),
    B: pattern('B', 120, { l2: [0] }),
  } as unknown as Record<string, Pattern>;

  it('resolves the active cells at a global 16th step', () => {
    const arrangement = arr([{ id: 'c1', patternId: 'A', startBeat: 0, beats: 4, loops: 1, muted: false }]);
    expect(cellsAtGlobalStep(arrangement, patterns, 0).map((c) => c.layerId)).toEqual(['l1']);
    expect(cellsAtGlobalStep(arrangement, patterns, 4).map((c) => c.stepIdx)).toEqual([4]);
    expect(cellsAtGlobalStep(arrangement, patterns, 1)).toHaveLength(0); // no cell there
  });

  it('honours a sub-bar clip start by offsetting into the pattern', () => {
    // Clip starts at beat 2 (= global step 8); its pattern step 0 lands there.
    const arrangement = arr([{ id: 'c1', patternId: 'A', startBeat: 2, beats: 4, loops: 1, muted: false }]);
    expect(cellsAtGlobalStep(arrangement, patterns, 7)).toHaveLength(0);
    expect(cellsAtGlobalStep(arrangement, patterns, 8).map((c) => c.stepIdx)).toEqual([0]);
  });

  it('layers overlapping clips at the same step', () => {
    const arrangement = arr([
      { id: 'c1', patternId: 'A', startBeat: 0, beats: 4, loops: 1, muted: false },
      { id: 'c2', patternId: 'B', startBeat: 0, beats: 4, loops: 1, muted: false },
    ]);
    expect(cellsAtGlobalStep(arrangement, patterns, 0).map((c) => c.layerId).sort()).toEqual(['l1', 'l2']);
  });

  it('counts the total steps and returns 0 without clips', () => {
    const arrangement = arr([{ id: 'c1', patternId: 'A', startBeat: 0, beats: 4, loops: 1, muted: false }]);
    expect(totalArrangementSteps(arrangement, patterns)).toBe(16);
    expect(totalArrangementSteps(null, patterns)).toBe(0);
  });
});
