/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Generalized app-wide undo/redo (Phase 0.3).
 *
 * A snapshot/command bus that tracks committed state for layers, patterns,
 * songChain, programs, master, etc. The store is decoupled from any specific
 * sub-store: callers register an `applier` that rehydrates in-memory state
 * from a snapshot, then commit snapshots as users make edits.
 *
 * Coalescing: `beginTransaction()` / `endTransaction()` group multiple
 * commits into a single undo entry, so a multi-zone edit (e.g. toggle a cell
 * AND move a fader) collapses into one undo step.
 */

import { create } from 'zustand';
import type { SoundLayer } from '../types';
import type { BankId, Program } from './sequencerStore';
import type { PatternId } from './patternStore';
import type { RackModule } from '../types';

export interface HistorySnapshot {
  /** ISO timestamp at commit time. */
  committedAt: string;
  /** Free-form label describing what the snapshot represents. Useful for debugging. */
  label?: string;
  layers: SoundLayer[];
  patterns: Record<PatternId, import('../types').Pattern>;
  programs: Record<BankId, Program>;
  activePatternId: PatternId;
  songChain: { order: string[] };
  activeBank: BankId;
  masterLevel: number;
  masterRack: RackModule[];
  globalSwing: number;
  bpm: number;
  timeSignature: [number, number];
}

export type SnapshotApplier = (snapshot: HistorySnapshot) => void;

interface HistoryStore {
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  limit: number;
  /** When > 0, commits are coalesced into a single undo entry. */
  transactionDepth: number;

  setApplier: (fn: SnapshotApplier | null) => void;
  commit: (snapshot: HistorySnapshot) => void;
  beginTransaction: () => void;
  endTransaction: () => void;
  cancelTransaction: () => void;
  undo: () => HistorySnapshot | null;
  redo: () => HistorySnapshot | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
}

const defaultLimit = 100;

export const useHistoryStore = create<HistoryStore>((set, get) => {
  let applier: SnapshotApplier | null = null;
  return {
    past: [],
    future: [],
    limit: defaultLimit,
    transactionDepth: 0,

    setApplier: (fn) => {
      applier = fn;
    },

    commit: (snapshot) => {
      const { past, limit, transactionDepth } = get();
      if (transactionDepth > 0) {
        // Inside a transaction — overwrite the most recent pending commit so
        // intermediate states never appear in history.
        if (past.length === 0) {
          set({ past: [snapshot] });
        } else {
          set({ past: [...past.slice(0, -1), snapshot] });
        }
        return;
      }
      const next = [...past, snapshot];
      const trimmed = next.length > limit ? next.slice(next.length - limit) : next;
      set({ past: trimmed, future: [] });
    },

    beginTransaction: () => {
      set((s) => ({ transactionDepth: s.transactionDepth + 1 }));
    },

    endTransaction: () => {
      const depth = get().transactionDepth;
      if (depth <= 0) return;
      if (depth === 1) {
        set({ transactionDepth: 0 });
      } else {
        set({ transactionDepth: depth - 1 });
      }
    },

    cancelTransaction: () => {
      // Discards the most recent pending commit (the coalesced result of all
      // commits made since `beginTransaction`). This makes the transaction
      // vanish from history WITHOUT pushing onto `future`, so an explicit
      // `undo()` before cancel would re-apply it. Callers that want the live
      // state rolled back too must re-apply the pre-transaction snapshot via
      // the applier themselves — this store only manages the history stack.
      const { past } = get();
      if (past.length === 0) return;
      set({ past: past.slice(0, -1), transactionDepth: 0 });
    },

    undo: () => {
      const { past, future } = get();
      if (past.length === 0) return null;
      const last = past[past.length - 1];
      const newPast = past.slice(0, -1);
      const newFuture = [...future, last];
      set({ past: newPast, future: newFuture });
      applier?.(last);
      return last;
    },

    redo: () => {
      const { past, future } = get();
      if (future.length === 0) return null;
      const next = future[future.length - 1];
      const newPast = [...past, next];
      const newFuture = future.slice(0, -1);
      set({ past: newPast, future: newFuture });
      applier?.(next);
      return next;
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    clear: () => {
      set({ past: [], future: [], transactionDepth: 0 });
    },
  };
});

/**
 * Convenience selectors for components that read undo/redo state without
 * subscribing to the full snapshot arrays.
 */
export const useCanUndo = (): boolean => useHistoryStore((s) => s.past.length > 0);
export const useCanRedo = (): boolean => useHistoryStore((s) => s.future.length > 0);

/**
 * Build a snapshot from the current in-memory state. Callers pass plain
 * in-memory values (no AudioBuffers are serialized — they are referenced
 * directly, so commits only duplicate the layer array, not the buffer data).
 */
export const buildSnapshot = (params: Omit<HistorySnapshot, 'committedAt'>): HistorySnapshot => ({
  ...params,
  committedAt: new Date().toISOString(),
});

/**
 * Cheap structural check used by callers to decide whether a state change
 * warrants a commit. Identical-shape snapshots are skipped so transient
 * re-renders don't pollute history.
 */
export const snapshotsEqual = (a: HistorySnapshot, b: HistorySnapshot): boolean => {
  if (a.layers !== b.layers) return false;
  if (a.activePatternId !== b.activePatternId) return false;
  if (a.activeBank !== b.activeBank) return false;
  if (a.bpm !== b.bpm) return false;
  if (a.globalSwing !== b.globalSwing) return false;
  if (a.masterLevel !== b.masterLevel) return false;
  if (a.timeSignature[0] !== b.timeSignature[0] || a.timeSignature[1] !== b.timeSignature[1]) return false;
  if (a.masterRack !== b.masterRack) return false;
  if (a.programs !== b.programs) return false;
  if (a.songChain !== b.songChain) return false;
  return true;
};
