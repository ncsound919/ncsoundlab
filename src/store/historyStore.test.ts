/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the generalized undo/redo store (Phase 0.3).
 *
 * The store follows the invariant that `past`'s top entry is the LIVE state
 * (callers commit after each change). See the regression suite at the bottom,
 * which pins the App.tsx "commit-after-change" usage that was previously
 * off-by-one.
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
  arrangement: { totalBeats: 0, clips: [], tempoMap: [] },
  buses: {},
  layerSends: {},
  masterDynamics: {
    thresholdDb: -0.5,
    ratio: 20,
    attackSec: 0.002,
    releaseSec: 0.1,
    makeupDb: 0,
    enabled: true,
  },
  sidechains: [],
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

  it('a single committed state has nothing to undo (top entry is live)', () => {
    useHistoryStore.getState().commit(empty());
    expect(useHistoryStore.getState().canUndo()).toBe(false);
    expect(useHistoryStore.getState().undo()).toBeNull();
  });

  it('undo applies the PREVIOUS state via the registered applier', () => {
    const applier = vi.fn();
    useHistoryStore.getState().setApplier(applier);
    const first = empty({ bpm: 120 });
    const second = empty({ bpm: 140 });
    useHistoryStore.getState().commit(first);
    useHistoryStore.getState().commit(second);
    expect(useHistoryStore.getState().canUndo()).toBe(true);
    const restored = useHistoryStore.getState().undo();
    expect(restored).toBe(first);
    expect(applier).toHaveBeenCalledWith(first);
    expect(useHistoryStore.getState().canRedo()).toBe(true);
    expect(useHistoryStore.getState().canUndo()).toBe(false);
  });

  it('redo re-applies the state that was undone', () => {
    const applier = vi.fn();
    useHistoryStore.getState().setApplier(applier);
    const first = empty({ bpm: 100 });
    const second = empty({ bpm: 150 });
    useHistoryStore.getState().commit(first);
    useHistoryStore.getState().commit(second);
    useHistoryStore.getState().undo();
    expect(useHistoryStore.getState().canRedo()).toBe(true);
    const redone = useHistoryStore.getState().redo();
    expect(redone).toBe(second);
    expect(applier).toHaveBeenLastCalledWith(second);
    expect(useHistoryStore.getState().canUndo()).toBe(true);
    expect(useHistoryStore.getState().canRedo()).toBe(false);
  });

  it('a fresh commit clears the redo stack', () => {
    const first = empty({ bpm: 100 });
    const second = empty({ bpm: 150 });
    const third = empty({ bpm: 200 });
    useHistoryStore.getState().commit(first);
    useHistoryStore.getState().commit(second);
    useHistoryStore.getState().undo();
    expect(useHistoryStore.getState().canRedo()).toBe(true);
    useHistoryStore.getState().commit(third);
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
  it('coalesces in-transaction commits into a single undo step', () => {
    const applier = vi.fn();
    useHistoryStore.getState().setApplier(applier);
    const base = empty({ bpm: 120 });
    useHistoryStore.getState().commit(base); // live = 120
    useHistoryStore.getState().beginTransaction();
    useHistoryStore.getState().commit(empty({ bpm: 130 }));
    useHistoryStore.getState().commit(empty({ bpm: 140 }));
    useHistoryStore.getState().commit(empty({ bpm: 150 }));
    useHistoryStore.getState().endTransaction();
    // [base, final] — the three in-flight commits collapsed into one entry.
    expect(useHistoryStore.getState().past.length).toBe(2);
    const undone = useHistoryStore.getState().undo();
    expect(undone).toBe(base);
    expect(undone?.bpm).toBe(120);
  });

  it('nested begin/end balances and preserves the pre-transaction target', () => {
    const base = empty({ bpm: 120 });
    useHistoryStore.getState().commit(base);
    useHistoryStore.getState().beginTransaction();
    useHistoryStore.getState().beginTransaction();
    useHistoryStore.getState().commit(empty({ bpm: 200 }));
    useHistoryStore.getState().endTransaction();
    useHistoryStore.getState().endTransaction();
    expect(useHistoryStore.getState().transactionDepth).toBe(0);
    expect(useHistoryStore.getState().past.length).toBe(2);
    expect(useHistoryStore.getState().undo()).toBe(base);
  });

  it('cancelTransaction drops the in-flight edit without a history entry', () => {
    const base = empty({ bpm: 120 });
    useHistoryStore.getState().commit(base);
    useHistoryStore.getState().beginTransaction();
    useHistoryStore.getState().commit(empty({ bpm: 175 }));
    useHistoryStore.getState().cancelTransaction();
    expect(useHistoryStore.getState().past.length).toBe(1);
    expect(useHistoryStore.getState().past[0]).toBe(base);
    expect(useHistoryStore.getState().transactionDepth).toBe(0);
    expect(useHistoryStore.getState().canUndo()).toBe(false);
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
      arrangement: { totalBeats: 0, clips: [], tempoMap: [] },
      buses: {},
      layerSends: {},
      masterDynamics: {
        thresholdDb: -0.5,
        ratio: 20,
        attackSec: 0.002,
        releaseSec: 0.1,
        makeupDb: 0,
        enabled: true,
      },
      sidechains: [],
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

  it('snapshotsEqual compares the Phase 2.2 fields by reference', () => {
    const base = empty();
    // A shallow copy shares every field reference, so it is "equal".
    expect(snapshotsEqual(base, { ...base })).toBe(true);
    expect(
      snapshotsEqual(base, { ...base, arrangement: { totalBeats: 16, clips: [], tempoMap: [] } })
    ).toBe(false);
    expect(
      snapshotsEqual(base, { ...base, buses: { reverb: { enabled: false, gain: 1, pan: 0 } } })
    ).toBe(false);
    expect(snapshotsEqual(base, { ...base, layerSends: { l1: { reverb: 0.5 } } })).toBe(false);
    expect(
      snapshotsEqual(base, { ...base, masterDynamics: { ...base.masterDynamics, ratio: 4 } })
    ).toBe(false);
    expect(
      snapshotsEqual(base, {
        ...base,
        sidechains: [
          { id: 'sc', source: 'l1', target: 'reverb', amount: 0.5, attackSec: 0.01, releaseSec: 0.1, enabled: true },
        ],
      })
    ).toBe(false);
  });
});

describe('historyStore — App commit-after-change semantics (regression)', () => {
  it('undo restores the previous state when the caller commits the current one', () => {
    const applied: number[] = [];
    useHistoryStore.getState().setApplier((s) => applied.push(s.bpm));
    // Mirrors App.tsx: the effect commits the CURRENT state after each change.
    useHistoryStore.getState().commit(empty({ bpm: 120 }));
    useHistoryStore.getState().commit(empty({ bpm: 140 }));
    useHistoryStore.getState().undo();
    expect(applied).toEqual([120]);
  });

  it('a re-commit of the undone state is a no-op, preserving redo', () => {
    const first = empty({ bpm: 120 });
    const second = empty({ bpm: 140 });
    useHistoryStore.getState().commit(first);
    useHistoryStore.getState().commit(second);
    useHistoryStore.getState().undo();
    // After undo the live state is `first`; the App effect re-commits it.
    const head = useHistoryStore.getState().past[useHistoryStore.getState().past.length - 1];
    expect(head).toBe(first);
    expect(snapshotsEqual(head, first)).toBe(true);
    // Redo still works because a commit was never issued for the re-applied state.
    expect(useHistoryStore.getState().redo()).toBe(second);
  });
});
