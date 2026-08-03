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
