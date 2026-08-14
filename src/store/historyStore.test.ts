/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the generalized undo/redo store (Phase 0.3).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSnapshot,
  snapshotsEqual,
  useHistoryStore,
  type HistorySnapshot,
} from './historyStore';

const empty = (overrides: Partial<HistorySnapshot> = {}): HistorySnapshot => ({
  committedAt: new Date().toISOString(),
  layers: [],
  patterns: { A: undefined as never, B: undefined as never, C: undefined as never, D: undefined as never },
  programs: {
    A: Array.from({ length: 16 }, () => null),
    B: Array.from({ length: 16 }, () => null),
    C: Array.from({ length: 16 }, () => null),
    D: Array.from({ length: 16 }, () => null),
  },
  activePatternId: 'A',
  songChain: { order: ['A', 'B', 'C', 'D'] },
  activeBank: 'A',
  masterLevel: 0.8,
  masterRack: [],
  globalSwing: 0,
  bpm: 120,
  timeSignature: [4, 4],
  ...overrides,
});

beforeEach(() => {
  useHistoryStore.getState().clear();
});

describe('historyStore — basic commit/undo/redo', () => {
  it('starts empty with nothing to undo/redo', () => {
    expect(useHistoryStore.getState().canUndo()).toBe(false);
    expect(useHistoryStore.getState().canRedo()).toBe(false);
  });

  it('commits a snapshot and exposes canUndo', () => {
    useHistoryStore.getState().commit(empty());
    expect(useHistoryStore.getState().canUndo()).toBe(true);
    expect(useHistoryStore.getState().canRedo()).toBe(false);
  });

  it('undo applies the snapshot via the registered applier', () => {
    const applier = vi.fn();
    useHistoryStore.getState().setApplier(applier);
    const snap = empty({ bpm: 140 });
    useHistoryStore.getState().commit(snap);
    const restored = useHistoryStore.getState().undo();
    expect(restored).toBe(snap);
    expect(applier).toHaveBeenCalledWith(snap);
    expect(useHistoryStore.getState().canRedo()).toBe(true);
    expect(useHistoryStore.getState().canUndo()).toBe(false);
  });

  it('redo re-applies a previously-undone snapshot', () => {
    const applier = vi.fn();
    useHistoryStore.getState().setApplier(applier);
    const snap1 = empty({ bpm: 100 });
    const snap2 = empty({ bpm: 150 });
    useHistoryStore.getState().commit(snap1);
    useHistoryStore.getState().commit(snap2);
    useHistoryStore.getState().undo();
    expect(useHistoryStore.getState().canRedo()).toBe(true);
    const redone = useHistoryStore.getState().redo();
    expect(redone).toBe(snap2);
    expect(applier).toHaveBeenLastCalledWith(snap2);
  });

  it('a fresh commit clears the redo stack', () => {
    const snap1 = empty({ bpm: 100 });
    const snap2 = empty({ bpm: 150 });
    const snap3 = empty({ bpm: 200 });
    useHistoryStore.getState().commit(snap1);
    useHistoryStore.getState().commit(snap2);
    useHistoryStore.getState().undo();
    expect(useHistoryStore.getState().canRedo()).toBe(true);
    useHistoryStore.getState().commit(snap3);
    expect(useHistoryStore.getState().canRedo()).toBe(false);
  });

  it('caps the past stack at the limit', () => {
    const limit = useHistoryStore.getState().limit;
    for (let i = 0; i < limit + 5; i++) {
      useHistoryStore.getState().commit(empty({ bpm: 100 + i }));
    }
    expect(useHistoryStore.getState().past.length).toBe(limit);
  });
});

describe('historyStore — transactions', () => {
  it('beginTransaction/endTransaction coalesce commits into a single undo step', () => {
    const applier = vi.fn();
    useHistoryStore.getState().setApplier(applier);
    useHistoryStore.getState().beginTransaction();
    useHistoryStore.getState().commit(empty({ bpm: 130 }));
    useHistoryStore.getState().commit(empty({ bpm: 140 }));
    useHistoryStore.getState().commit(empty({ bpm: 150 }));
    useHistoryStore.getState().endTransaction();
    // Only the LAST in-transaction commit should remain in past.
    expect(useHistoryStore.getState().past.length).toBe(1);
    const undone = useHistoryStore.getState().undo();
    expect(undone?.bpm).toBe(150);
  });

  it('nested begin/end balances correctly', () => {
    useHistoryStore.getState().beginTransaction();
    useHistoryStore.getState().beginTransaction();
    useHistoryStore.getState().commit(empty({ bpm: 200 }));
    // Inner commit (still inside the outer transaction) writes the snapshot;
    // the outer endTransaction finalises it.
    expect(useHistoryStore.getState().past.length).toBe(1);
    useHistoryStore.getState().endTransaction();
    // Outer endTransaction leaves the committed snapshot in place.
    expect(useHistoryStore.getState().past.length).toBe(1);
  });

  it('cancelTransaction discards in-flight edits', () => {
    useHistoryStore.getState().beginTransaction();
    useHistoryStore.getState().commit(empty({ bpm: 175 }));
    useHistoryStore.getState().cancelTransaction();
    expect(useHistoryStore.getState().past.length).toBe(0);
    expect(useHistoryStore.getState().transactionDepth).toBe(0);
  });
});

describe('historyStore — helpers', () => {
  it('buildSnapshot stamps committedAt', () => {
    const snap = buildSnapshot({
      layers: [],
      patterns: { A: undefined as never, B: undefined as never, C: undefined as never, D: undefined as never },
      programs: {
        A: Array.from({ length: 16 }, () => null),
        B: Array.from({ length: 16 }, () => null),
        C: Array.from({ length: 16 }, () => null),
        D: Array.from({ length: 16 }, () => null),
      },
      activePatternId: 'A',
      songChain: { order: ['A'] },
      activeBank: 'A',
      masterLevel: 0.8,
      masterRack: [],
      globalSwing: 0,
      bpm: 120,
      timeSignature: [4, 4],
    });
    expect(typeof snap.committedAt).toBe('string');
  });

  it('snapshotsEqual detects shallow reference differences', () => {
    const shared = empty({ bpm: 100 });
    expect(snapshotsEqual(shared, shared)).toBe(true);
    const twin = empty({ bpm: 100 });
    expect(snapshotsEqual(shared, twin)).toBe(false);
    const different = empty({ bpm: 110 });
    expect(snapshotsEqual(shared, different)).toBe(false);
  });
});
