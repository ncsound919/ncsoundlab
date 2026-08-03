import { create } from 'zustand';
import type {
  Pattern, PatternCell, SongChain, SequenceExportV1, SequenceExportV2,
} from '../types';

export const PATTERN_IDS = ['A', 'B', 'C', 'D'] as const;
export type PatternId = typeof PATTERN_IDS[number];

export function newEmptyPattern(
  layerIds: string[],
  bpm = 120,
  beats: 3 | 4 | 6 = 4,
  noteValue: 4 | 8 = 4,
  stepLength: 16 | 32 = 16,
  swing = 0,
): Pattern {
  const layerRows: Record<string, PatternCell[]> = {};
  for (const id of layerIds) {
    layerRows[id] = Array.from({ length: stepLength }, () => ({ on: false }));
  }
  return {
    id: 'A',
    name: 'Pattern A',
    layerRows,
    timeSignature: [beats, noteValue],
    stepLength,
    swing,
    bpm,
  };
}

export function migrateFromV1(v1: SequenceExportV1): SequenceExportV2 {
  return {
    format: 'ncsoundlab-mpc-sequence',
    version: 2,
    bpm: v1.bpm,
    timeSignature: [4, 4],
    stepLength: (v1.steps === 32 ? 32 : 16),
    swing: 0,
    steps: v1.steps,
    ppq: v1.ppq,
    pattern: Object.fromEntries(
      Object.entries(v1.pattern).map(([k, cells]) => [
        k,
        cells.map((c) => ({ on: !!c.on, note: c.note, velocity: undefined })),
      ]),
    ),
  };
}

interface PatternStore {
  patterns: Record<PatternId, Pattern>;
  activePatternId: PatternId;
  songChain: SongChain;
  setActivePattern: (id: PatternId) => void;
  setCell: (patternId: PatternId, layerId: string, stepIdx: number, cell: PatternCell) => void;
  setBpm: (bpm: number) => void;
  setTimeSignature: (beats: 3 | 4 | 6, noteValue: 4 | 8) => void;
  setStepLength: (len: 16 | 32) => void;
  setSwing: (swing: number) => void;
  setRow: (patternId: PatternId, layerId: string, row: PatternCell[]) => void;
  ensureLayerRow: (patternId: PatternId, layerId: string) => void;
  loadFromExport: (data: SequenceExportV2) => void;
  moveInChain: (fromIdx: number, toIdx: number) => void;
  duplicateInChain: (idx: number) => void;
  removeFromChain: (idx: number) => void;
  reset: () => void;
}

function makePatterns(layerIds: string[]): Record<PatternId, Pattern> {
  return {
    A: newEmptyPattern(layerIds),
    B: newEmptyPattern(layerIds),
    C: newEmptyPattern(layerIds),
    D: newEmptyPattern(layerIds),
  };
}

export const usePatternStore = create<PatternStore>((set) => ({
  patterns: makePatterns([]),
  activePatternId: 'A',
  songChain: { order: ['A', 'B', 'C', 'D'] },

  setActivePattern: (id) => set({ activePatternId: id }),

  setCell: (patternId, layerId, stepIdx, cell) =>
    set((s) => {
      const p = s.patterns[patternId];
      const row = p.layerRows[layerId] ?? Array.from({ length: p.stepLength }, () => ({ on: false }));
      const next = row.slice();
      next[stepIdx] = cell;
      return {
        patterns: { ...s.patterns, [patternId]: { ...p, layerRows: { ...p.layerRows, [layerId]: next } } },
      };
    }),

  setBpm: (bpm) =>
    set((s) => {
      const p = s.patterns[s.activePatternId];
      return { patterns: { ...s.patterns, [s.activePatternId]: { ...p, bpm } } };
    }),

  setTimeSignature: (beats, noteValue) =>
    set((s) => {
      const p = s.patterns[s.activePatternId];
      return { patterns: { ...s.patterns, [s.activePatternId]: { ...p, timeSignature: [beats, noteValue] } } };
    }),

  setStepLength: (len) =>
    set((s) => {
      const p = s.patterns[s.activePatternId];
      const layerRows: Record<string, PatternCell[]> = {};
      for (const [k, row] of Object.entries(p.layerRows)) {
        layerRows[k] = row.length === len
          ? row.slice()
          : Array.from({ length: len }, (_, i) => {
              const existing = row[i];
              if (existing) return { ...existing };
              return { on: false };
            });
      }
      return { patterns: { ...s.patterns, [s.activePatternId]: { ...p, stepLength: len, layerRows } } };
    }),

  setSwing: (swing) =>
    set((s) => {
      const clamped = Math.min(0.66, Math.max(0, swing));
      const p = s.patterns[s.activePatternId];
      return { patterns: { ...s.patterns, [s.activePatternId]: { ...p, swing: clamped } } };
    }),

  setRow: (patternId, layerId, row) =>
    set((s) => {
      const p = s.patterns[patternId];
      return { patterns: { ...s.patterns, [patternId]: { ...p, layerRows: { ...p.layerRows, [layerId]: row } } } };
    }),

  ensureLayerRow: (patternId, layerId) =>
    set((s) => {
      const p = s.patterns[patternId];
      if (p.layerRows[layerId]) return {};
      return {
        patterns: {
          ...s.patterns,
          [patternId]: {
            ...p,
            layerRows: { ...p.layerRows, [layerId]: Array.from({ length: p.stepLength }, () => ({ on: false })) },
          },
        },
      };
    }),

  loadFromExport: (data) =>
    set((s) => {
      const merged = { ...s.patterns };
      for (const [layerId, row] of Object.entries(data.pattern)) {
        for (const pid of PATTERN_IDS) {
          merged[pid].layerRows[layerId] = row.map((c) => ({ ...c }));
        }
      }
      merged.A = {
        ...merged.A,
        bpm: data.bpm,
        timeSignature: data.timeSignature,
        stepLength: data.stepLength,
        swing: data.swing,
      };
      return { patterns: merged, songChain: data.songChain ?? s.songChain };
    }),

  moveInChain: (fromIdx, toIdx) =>
    set((s) => {
      const order = s.songChain.order.slice();
      if (fromIdx < 0 || fromIdx >= order.length || toIdx < 0 || toIdx >= order.length) return {};
      const [item] = order.splice(fromIdx, 1);
      order.splice(toIdx, 0, item);
      return { songChain: { order } };
    }),

  duplicateInChain: (idx) =>
    set((s) => {
      const order = s.songChain.order.slice();
      if (idx < 0 || idx >= order.length) return {};
      order.splice(idx + 1, 0, order[idx]);
      return { songChain: { order } };
    }),

  removeFromChain: (idx) =>
    set((s) => {
      const order = s.songChain.order.filter((_, i) => i !== idx);
      return { songChain: { order } };
    }),

  reset: () => set({ patterns: makePatterns([]), activePatternId: 'A', songChain: { order: ['A', 'B', 'C', 'D'] } }),
}));
