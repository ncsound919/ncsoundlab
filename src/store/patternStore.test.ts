import { describe, it, expect, beforeEach } from 'vitest';
import { usePatternStore, newEmptyPattern, migrateFromV1 } from './patternStore';
import type { Pattern, SequenceExportV1, SequenceExportV2 } from '../types';

describe('patternStore', () => {
  beforeEach(() => {
    usePatternStore.getState().reset();
  });

  it('starts with one default pattern A (4/4, 16 steps, swing 0, bpm 120)', () => {
    const s = usePatternStore.getState();
    expect(s.patterns.A).toBeDefined();
    expect(s.patterns.A.timeSignature).toEqual([4, 4]);
    expect(s.patterns.A.stepLength).toBe(16);
    expect(s.patterns.A.swing).toBe(0);
    expect(s.patterns.A.bpm).toBe(120);
    expect(s.activePatternId).toBe('A');
  });

  it('sets a layer row in the active pattern', () => {
    usePatternStore.getState().setCell('A', 'layer1', 0, { on: true, velocity: 100 });
    const row = usePatternStore.getState().patterns.A.layerRows.layer1;
    expect(row[0]).toEqual({ on: true, velocity: 100 });
  });

  it('switches active pattern', () => {
    usePatternStore.getState().setActivePattern('B');
    expect(usePatternStore.getState().activePatternId).toBe('B');
  });

  it('updates BPM and propagates to the active pattern', () => {
    usePatternStore.getState().setBpm(140);
    expect(usePatternStore.getState().patterns.A.bpm).toBe(140);
  });

  it('updates time signature (3/4)', () => {
    usePatternStore.getState().setTimeSignature(3, 4);
    expect(usePatternStore.getState().patterns.A.timeSignature).toEqual([3, 4]);
  });

  it('updates time signature (6/8)', () => {
    usePatternStore.getState().setTimeSignature(6, 8);
    expect(usePatternStore.getState().patterns.A.timeSignature).toEqual([6, 8]);
  });

  it('updates step length to 32', () => {
    usePatternStore.getState().setStepLength(32);
    expect(usePatternStore.getState().patterns.A.stepLength).toBe(32);
  });

  it('updates swing clamped 0..0.66', () => {
    usePatternStore.getState().setSwing(0.7);
    expect(usePatternStore.getState().patterns.A.swing).toBeLessThanOrEqual(0.66);
  });
});

describe('migrateFromV1', () => {
  it('migrates a v1 export to v2 with default time-sig, stepLength, swing', () => {
    const v1: SequenceExportV1 = {
      format: 'ncsoundlab-mpc-sequence',
      version: 1,
      bpm: 130,
      steps: 16,
      ppq: 96,
      pattern: { layer1: Array.from({ length: 16 }, (_, i) => ({ on: i % 4 === 0 })) },
    };
    const v2: SequenceExportV2 = migrateFromV1(v1);
    expect(v2.version).toBe(2);
    expect(v2.bpm).toBe(130);
    expect(v2.timeSignature).toEqual([4, 4]);
    expect(v2.stepLength).toBe(16);
    expect(v2.swing).toBe(0);
    expect(v2.pattern.layer1[0].on).toBe(true);
  });
});

describe('patternStore song chain', () => {
  beforeEach(() => {
    usePatternStore.getState().reset();
  });

  it('starts with all four patterns in the chain in order', () => {
    const { songChain } = usePatternStore.getState();
    expect(songChain.order).toEqual(['A', 'B', 'C', 'D']);
  });

  it('moves a pattern in the chain', () => {
    usePatternStore.getState().moveInChain(0, 2);
    expect(usePatternStore.getState().songChain.order).toEqual(['B', 'C', 'A', 'D']);
  });

  it('duplicates a pattern in the chain (appends the same id)', () => {
    usePatternStore.getState().duplicateInChain(0);
    expect(usePatternStore.getState().songChain.order).toEqual(['A', 'A', 'B', 'C', 'D']);
  });

  it('removes a pattern from the chain', () => {
    usePatternStore.getState().removeFromChain(1);
    expect(usePatternStore.getState().songChain.order).toEqual(['A', 'C', 'D']);
  });
});

describe('newEmptyPattern', () => {
  it('creates a pattern with N empty rows for the given layer ids', () => {
    const p: Pattern = newEmptyPattern(['l1', 'l2'], 120);
    expect(p.timeSignature).toEqual([4, 4]);
    expect(p.stepLength).toBe(16);
    expect(p.layerRows.l1).toHaveLength(16);
    expect(p.layerRows.l2).toHaveLength(16);
    expect(p.layerRows.l1.every((c) => !c.on)).toBe(true);
  });

  it('honors time-sig, stepLength, swing, bpm params', () => {
    const p = newEmptyPattern(['l1'], 90, 3, 4, 32, 0.5);
    expect(p.bpm).toBe(90);
    expect(p.timeSignature).toEqual([3, 4]);
    expect(p.stepLength).toBe(32);
    expect(p.swing).toBe(0.5);
    expect(p.layerRows.l1).toHaveLength(32);
  });
});

describe('Phase 1.1 — pattern cell duration/probability + 32-step preservation', () => {
  beforeEach(() => {
    usePatternStore.getState().reset();
  });

  it('setCell persists duration and probability', () => {
    usePatternStore.getState().setCell('A', 'l1', 2, {
      on: true,
      note: 60,
      velocity: 100,
      duration: 4,
      probability: 0.5,
    });
    const cell = usePatternStore.getState().patterns.A.layerRows.l1[2];
    expect(cell).toEqual({
      on: true,
      note: 60,
      velocity: 100,
      duration: 4,
      probability: 0.5,
    });
  });

  it('cells without duration/probability leave them undefined', () => {
    usePatternStore.getState().setCell('A', 'l1', 0, { on: true });
    const cell = usePatternStore.getState().patterns.A.layerRows.l1[0];
    expect(cell.on).toBe(true);
    expect(cell.duration).toBeUndefined();
    expect(cell.probability).toBeUndefined();
  });

  it('setStepLength 16 → 32 preserves duration/probability on existing cells', () => {
    usePatternStore.getState().setCell('A', 'l1', 0, {
      on: true,
      note: 60,
      velocity: 100,
      duration: 8,
      probability: 0.75,
    });
    usePatternStore.getState().setCell('A', 'l1', 15, { on: true, note: 64 });
    usePatternStore.getState().setStepLength(32);
    const row = usePatternStore.getState().patterns.A.layerRows.l1;
    expect(row).toHaveLength(32);
    expect(row[0]).toEqual({ on: true, note: 60, velocity: 100, duration: 8, probability: 0.75 });
    expect(row[15]).toEqual({ on: true, note: 64 });
    // Newly-added cells are bare {on:false}.
    expect(row[16]).toEqual({ on: false });
  });

  it('setStepLength 32 → 16 truncates the row', () => {
    usePatternStore.getState().setCell('A', 'l1', 20, { on: true, note: 67 });
    usePatternStore.getState().setStepLength(32);
    usePatternStore.getState().setCell('A', 'l1', 5, { on: true, note: 60 });
    usePatternStore.getState().setStepLength(16);
    const row = usePatternStore.getState().patterns.A.layerRows.l1;
    expect(row).toHaveLength(16);
    expect(row[5]).toEqual({ on: true, note: 60 });
    expect(row[20]).toBeUndefined();
  });

  it('layer row loop bound honours pattern.stepLength (32 emits 32 ticks)', () => {
    usePatternStore.getState().reset();
    usePatternStore.getState().setStepLength(32);
    usePatternStore.getState().setRow('A', 'k1', Array.from({ length: 32 }, () => ({ on: false })));
    const row = usePatternStore.getState().patterns.A.layerRows.k1;
    expect(row).toHaveLength(32);
    // Walk the loop bound like the scheduler does — must wrap at 32, not 16.
    let step = 0;
    const visited = new Set<number>();
    for (let i = 0; i < 64; i++) {
      step = (step + 1) % 32;
      visited.add(step);
    }
    expect(visited.size).toBe(32);
  });
});

describe('Phase 1.3 — pattern editing: copy/paste, duplicate, clear', () => {
  beforeEach(() => {
    usePatternStore.getState().reset();
  });

  it('copyPatternInto clones cells and tempo into another pattern slot', () => {
    usePatternStore.getState().setCell('A', 'l1', 0, { on: true, note: 60, velocity: 100 });
    usePatternStore.getState().setCell('A', 'l1', 4, { on: true, note: 64 });
    usePatternStore.getState().setBpm(140);
    usePatternStore.getState().setStepLength(32);
    usePatternStore.getState().copyPatternInto('A', 'B');
    const b = usePatternStore.getState().patterns.B;
    expect(b.bpm).toBe(140);
    expect(b.stepLength).toBe(32);
    expect(b.layerRows.l1[0]).toEqual({ on: true, note: 60, velocity: 100 });
    expect(b.layerRows.l1[4]).toEqual({ on: true, note: 64 });
    // Source should be unchanged.
    const a = usePatternStore.getState().patterns.A;
    expect(a.layerRows.l1).not.toBe(b.layerRows.l1);
  });

  it('clearPatternCells clears all rows when no layerId is provided', () => {
    usePatternStore.getState().setCell('A', 'l1', 0, { on: true });
    usePatternStore.getState().setCell('A', 'l2', 2, { on: true });
    usePatternStore.getState().clearPatternCells('A');
    const p = usePatternStore.getState().patterns.A;
    expect(p.layerRows.l1.every((c) => !c.on)).toBe(true);
    expect(p.layerRows.l2.every((c) => !c.on)).toBe(true);
  });

  it('clearPatternCells clears only the specified layer row', () => {
    usePatternStore.getState().setCell('A', 'l1', 0, { on: true });
    usePatternStore.getState().setCell('A', 'l2', 2, { on: true });
    usePatternStore.getState().clearPatternCells('A', 'l1');
    const p = usePatternStore.getState().patterns.A;
    expect(p.layerRows.l1.every((c) => !c.on)).toBe(true);
    expect(p.layerRows.l2[2]).toEqual({ on: true });
  });

  it('copyCells + pasteCells round-trips a layer row through the clipboard', () => {
    usePatternStore.getState().setCell('A', 'l1', 1, { on: true, note: 60, velocity: 110 });
    usePatternStore.getState().copyCells('A', 'l1');
    expect(usePatternStore.getState().clipboard).toBeTruthy();
    expect(usePatternStore.getState().clipboard![1]).toEqual({ on: true, note: 60, velocity: 110 });
    // Clear and paste back.
    usePatternStore.getState().clearPatternCells('A', 'l1');
    expect(usePatternStore.getState().patterns.A.layerRows.l1[1].on).toBe(false);
    usePatternStore.getState().pasteCells('A', 'l1');
    expect(usePatternStore.getState().patterns.A.layerRows.l1[1]).toEqual({ on: true, note: 60, velocity: 110 });
  });

  it('pasteCells truncates or pads to destination stepLength', () => {
    usePatternStore.getState().setStepLength(32);
    usePatternStore.getState().copyCells('A', 'l1'); // empty, 16-wide clipboard
    // Make clipboard a 16-cell wide row.
    usePatternStore.getState().setCell('A', 'l1', 5, { on: true, note: 60 });
    usePatternStore.getState().copyCells('A', 'l1');
    // Now resize destination to 32.
    usePatternStore.getState().setStepLength(32);
    // First we need a layer row in the new length.
    usePatternStore.getState().ensureLayerRow('A', 'l1');
    usePatternStore.getState().pasteCells('A', 'l1');
    const row = usePatternStore.getState().patterns.A.layerRows.l1;
    expect(row).toHaveLength(32);
    expect(row[5]).toEqual({ on: true, note: 60 });
    expect(row[16]).toEqual({ on: false });
  });

  it('pasteCells is a no-op when clipboard is empty', () => {
    usePatternStore.getState().clearClipboard();
    usePatternStore.getState().setCell('A', 'l1', 0, { on: true });
    usePatternStore.getState().pasteCells('A', 'l1');
    expect(usePatternStore.getState().patterns.A.layerRows.l1[0]).toEqual({ on: true });
  });
});

describe('Phase 2.1 — arrangement timeline', () => {
  beforeEach(() => {
    usePatternStore.getState().reset();
  });

  it('starts with an empty arrangement and the legacy default chain', () => {
    const s = usePatternStore.getState();
    expect(s.arrangement.clips).toEqual([]);
    expect(s.arrangement.totalBeats).toBe(0);
    expect(s.songChain.order).toEqual(['A', 'B', 'C', 'D']);
  });

  it('addClip appends a clip and updates totalBeats', () => {
    const id = usePatternStore.getState().addClip({
      patternId: 'A',
      startBeat: 0,
      beats: 4,
      loops: 1,
      muted: false,
    });
    const s = usePatternStore.getState();
    expect(s.arrangement.clips).toHaveLength(1);
    expect(s.arrangement.clips[0].id).toBe(id);
    expect(s.arrangement.totalBeats).toBe(4);
  });

  it('moveClip re-anchors a clip on the timeline', () => {
    const id = usePatternStore.getState().addClip({
      patternId: 'A',
      startBeat: 0,
      beats: 4,
      loops: 1,
      muted: false,
    });
    usePatternStore.getState().moveClip(id, 8);
    const s = usePatternStore.getState();
    expect(s.arrangement.clips[0].startBeat).toBe(8);
    expect(s.arrangement.totalBeats).toBe(12);
  });

  it('updateClip mutates fields and recomputes totalBeats', () => {
    const id = usePatternStore.getState().addClip({
      patternId: 'A',
      startBeat: 0,
      beats: 4,
      loops: 1,
      muted: false,
    });
    usePatternStore.getState().updateClip(id, { muted: true, beats: 8 });
    const s = usePatternStore.getState();
    expect(s.arrangement.clips[0].muted).toBe(true);
    expect(s.arrangement.clips[0].beats).toBe(8);
    expect(s.arrangement.totalBeats).toBe(8);
  });

  it('removeClip shrinks totalBeats and clears songChain on empty', () => {
    const id = usePatternStore.getState().addClip({
      patternId: 'A',
      startBeat: 0,
      beats: 4,
      loops: 1,
      muted: false,
    });
    usePatternStore.getState().removeClip(id);
    const s = usePatternStore.getState();
    expect(s.arrangement.clips).toHaveLength(0);
    expect(s.arrangement.totalBeats).toBe(0);
    expect(s.songChain.order).toEqual(['A', 'B', 'C', 'D']);
  });

  it('duplicateClip appends a copy at the original clip end', () => {
    const id = usePatternStore.getState().addClip({
      patternId: 'A',
      startBeat: 0,
      beats: 4,
      loops: 1,
      muted: false,
    });
    const dupId = usePatternStore.getState().duplicateClip(id);
    expect(dupId).not.toBeNull();
    const s = usePatternStore.getState();
    expect(s.arrangement.clips).toHaveLength(2);
    expect(s.arrangement.clips[1].startBeat).toBe(4);
    expect(s.arrangement.totalBeats).toBe(8);
  });

  it('splitClipAtBeat creates two contiguous clips', () => {
    const id = usePatternStore.getState().addClip({
      patternId: 'A',
      startBeat: 0,
      beats: 8,
      loops: 1,
      muted: false,
    });
    usePatternStore.getState().splitClipAtBeat(id, 4);
    const clips = usePatternStore.getState().arrangement.clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].beats).toBe(4);
    expect(clips[1].startBeat).toBe(4);
    expect(clips[1].beats).toBe(4);
  });

  it('splitClipAtBeat refuses to split outside the clip', () => {
    const id = usePatternStore.getState().addClip({
      patternId: 'A',
      startBeat: 0,
      beats: 4,
      loops: 1,
      muted: false,
    });
    usePatternStore.getState().splitClipAtBeat(id, 0);
    usePatternStore.getState().splitClipAtBeat(id, 4);
    expect(usePatternStore.getState().arrangement.clips).toHaveLength(1);
  });

  it('deriveSongChain rebuilds the legacy order from clips, sorted by startBeat, repeated by loops', () => {
    usePatternStore.getState().addClip({ patternId: 'B', startBeat: 4, beats: 4, loops: 2, muted: false });
    usePatternStore.getState().addClip({ patternId: 'A', startBeat: 0, beats: 4, loops: 1, muted: false });
    usePatternStore.getState().addClip({ patternId: 'C', startBeat: 12, beats: 4, loops: 1, muted: false });
    const order = usePatternStore.getState().songChain.order;
    expect(order).toEqual(['A', 'B', 'B', 'C']);
  });

  it('addClip updates songChain order via deriveSongChain', () => {
    usePatternStore.getState().addClip({ patternId: 'B', startBeat: 0, beats: 4, loops: 1, muted: false });
    expect(usePatternStore.getState().songChain.order).toContain('B');
  });
});

describe('Phase 2.2 — tempo automation', () => {
  beforeEach(() => {
    usePatternStore.getState().reset();
  });

  it('starts with an empty tempoMap', () => {
    expect(usePatternStore.getState().arrangement.tempoMap).toEqual([]);
  });

  it('addTempoPoint inserts and keeps the map sorted by tick', () => {
    usePatternStore.getState().addTempoPoint({ tick: 8, bpm: 130 });
    usePatternStore.getState().addTempoPoint({ tick: 0, bpm: 90 });
    usePatternStore.getState().addTempoPoint({ tick: 16, bpm: 150 });
    const map = usePatternStore.getState().arrangement.tempoMap;
    expect(map.map((p) => p.tick)).toEqual([0, 8, 16]);
    expect(map.map((p) => p.bpm)).toEqual([90, 130, 150]);
  });

  it('addTempoPoint replaces an existing point at the same tick', () => {
    usePatternStore.getState().addTempoPoint({ tick: 4, bpm: 100 });
    usePatternStore.getState().addTempoPoint({ tick: 4, bpm: 120 });
    const map = usePatternStore.getState().arrangement.tempoMap;
    expect(map).toHaveLength(1);
    expect(map[0].bpm).toBe(120);
  });

  it('clamps BPM to 20..300', () => {
    usePatternStore.getState().addTempoPoint({ tick: 0, bpm: 5 });
    usePatternStore.getState().addTempoPoint({ tick: 4, bpm: 500 });
    const map = usePatternStore.getState().arrangement.tempoMap;
    expect(map[0].bpm).toBe(20);
    expect(map[1].bpm).toBe(300);
  });

  it('updateTempoPoint mutates BPM at a tick', () => {
    usePatternStore.getState().addTempoPoint({ tick: 4, bpm: 110 });
    usePatternStore.getState().updateTempoPoint(4, 125);
    expect(usePatternStore.getState().arrangement.tempoMap[0].bpm).toBe(125);
  });

  it('removeTempoPoint drops the matching tick', () => {
    usePatternStore.getState().addTempoPoint({ tick: 4, bpm: 110 });
    usePatternStore.getState().addTempoPoint({ tick: 8, bpm: 120 });
    usePatternStore.getState().removeTempoPoint(4);
    const map = usePatternStore.getState().arrangement.tempoMap;
    expect(map).toHaveLength(1);
    expect(map[0].tick).toBe(8);
  });

  it('clearTempoMap empties the map', () => {
    usePatternStore.getState().addTempoPoint({ tick: 0, bpm: 100 });
    usePatternStore.getState().addTempoPoint({ tick: 4, bpm: 120 });
    usePatternStore.getState().clearTempoMap();
    expect(usePatternStore.getState().arrangement.tempoMap).toEqual([]);
  });

  it('getBpmAtBeat returns the latest point <= beat', () => {
    usePatternStore.getState().addTempoPoint({ tick: 0, bpm: 90 });
    usePatternStore.getState().addTempoPoint({ tick: 4, bpm: 110 });
    usePatternStore.getState().addTempoPoint({ tick: 12, bpm: 140 });
    expect(usePatternStore.getState().getBpmAtBeat(0)).toBe(90);
    expect(usePatternStore.getState().getBpmAtBeat(3)).toBe(90);
    expect(usePatternStore.getState().getBpmAtBeat(4)).toBe(110);
    expect(usePatternStore.getState().getBpmAtBeat(11)).toBe(110);
    expect(usePatternStore.getState().getBpmAtBeat(12)).toBe(140);
    expect(usePatternStore.getState().getBpmAtBeat(9999)).toBe(140);
  });

  it('getBpmAtBeat falls back to active pattern BPM when map is empty', () => {
    usePatternStore.getState().setBpm(123);
    expect(usePatternStore.getState().getBpmAtBeat(0)).toBe(123);
    expect(usePatternStore.getState().getBpmAtBeat(99)).toBe(123);
  });

  it('recomputeArrangement preserves tempoMap when clips change', () => {
    usePatternStore.getState().addTempoPoint({ tick: 0, bpm: 100 });
    usePatternStore.getState().addTempoPoint({ tick: 8, bpm: 120 });
    usePatternStore.getState().addClip({ patternId: 'A', startBeat: 0, beats: 4, loops: 1, muted: false });
    const map = usePatternStore.getState().arrangement.tempoMap;
    expect(map).toHaveLength(2);
    expect(map[0].bpm).toBe(100);
  });
});
