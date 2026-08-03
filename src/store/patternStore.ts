import { create } from 'zustand';
import type {
  Pattern, PatternCell, SongChain, SequenceExportV1, SequenceExportV2,
  Arrangement, ArrangementClip, TempoPoint,
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
  /**
   * Phase 2.1 — arrangement timeline (clips on a shared beat-timeline).
   * Legacy `songChain.order` is derived from this for the existing mixdown
   * path; new playback will honour clips directly.
   */
  arrangement: Arrangement;
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

  /**
   * Phase 1.3 — pattern editing operations.
   *
   * - `copyPatternInto(src, dst)`: clones cells/bpm/time-sig/stepLength/swing
   *    from `src` into `dst` (overwriting dst). The destination's `name` is
   *    preserved so users can rename before pasting without losing their
   *    label.
   * - `clearPatternCells(patternId, layerId?)`: clears all rows of the
   *    pattern (or just one layer row). BPM/time-sig/swing/stepLength are
   *    preserved.
   * - `clipboard`: a transient layer-row paste buffer. `copyCells(patternId,
   *    layerId?)` clones cells into the buffer; `pasteCells(patternId,
   *    layerId?)` writes them back into the given pattern/layer (the buffer
   *    shape is preserved; the destination row is rebuilt to match the
   *    destination's `stepLength` so cells beyond the destination's length
   *    are dropped and missing slots are filled with `{on:false}`).
   */
  copyPatternInto: (src: PatternId, dst: PatternId) => void;
  clearPatternCells: (patternId: PatternId, layerId?: string) => void;
  clipboard: PatternCell[] | null;
  copyCells: (patternId: PatternId, layerId?: string) => void;
  pasteCells: (patternId: PatternId, layerId?: string) => void;
  clearClipboard: () => void;

  /**
   * Phase 2.1 — arrangement helpers.
   *
   * `addClip`, `updateClip`, `removeClip`, `moveClip`: CRUD on the clip
   * timeline. `moveClip` re-orders the clips array so the playback order is
   * the array order; clips can overlap (e.g. layering a pad on top of a
   * drum pattern) but `totalBeats` is the maximum clip end.
   *
   * `deriveSongChain` rebuilds the legacy `songChain.order` from the
   * current clips (sorted by startBeat, each clip contributes its patternId
   * once per loop). Useful for the existing mixdown / export pipeline.
   */
  addClip: (clip: Omit<ArrangementClip, 'id'>) => string;
  updateClip: (id: string, updates: Partial<ArrangementClip>) => void;
  removeClip: (id: string) => void;
  moveClip: (id: string, newStartBeat: number) => void;
  duplicateClip: (id: string) => string | null;
  splitClipAtBeat: (id: string, beat: number) => void;
  deriveSongChain: () => void;

  /**
   * Phase 2.2 — tempo automation. `tempoMap` is a sorted array of
   * `{tick, bpm}` points; the scheduler interpolates BPM linearly between
   * points. `getBpmAtBeat(beat)` is the runtime accessor.
   */
  addTempoPoint: (point: TempoPoint) => void;
  updateTempoPoint: (tick: number, bpm: number) => void;
  removeTempoPoint: (tick: number) => void;
  clearTempoMap: () => void;
  getBpmAtBeat: (beat: number) => number;
}

function makePatterns(layerIds: string[]): Record<PatternId, Pattern> {
  return {
    A: newEmptyPattern(layerIds),
    B: newEmptyPattern(layerIds),
    C: newEmptyPattern(layerIds),
    D: newEmptyPattern(layerIds),
  };
}

const emptyArrangement = (): Arrangement => ({ totalBeats: 0, clips: [], tempoMap: [] });

/**
 * Compute the length of a clip in beats. Each pattern is `stepLength / 4`
 * beats long (a 16-step pattern = 4 beats at 4/4). The clip's `beats`
 * already accounts for `loops`.
 */
const clipEnd = (clip: ArrangementClip): number =>
  clip.startBeat + Math.max(0, clip.beats);

const recomputeArrangement = (arr: Arrangement): Arrangement => {
  const total = arr.clips.reduce((acc, c) => Math.max(acc, clipEnd(c)), 0);
  return { ...arr, totalBeats: total };
};

const sortTempoMap = (points: TempoPoint[]): TempoPoint[] =>
  [...points].sort((a, b) => a.tick - b.tick);

export const usePatternStore = create<PatternStore>((set, get) => ({
  patterns: makePatterns([]),
  activePatternId: 'A',
  songChain: { order: ['A', 'B', 'C', 'D'] },
  arrangement: emptyArrangement(),

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

  reset: () => set({ patterns: makePatterns([]), activePatternId: 'A', songChain: { order: ['A', 'B', 'C', 'D'] }, arrangement: emptyArrangement() }),

  copyPatternInto: (src, dst) =>
    set((s) => {
      const from = s.patterns[src];
      const to = s.patterns[dst];
      if (!from || !to) return {};
      const layerRows: Record<string, PatternCell[]> = {};
      for (const [k, row] of Object.entries(from.layerRows)) {
        layerRows[k] = row.map((c) => ({ ...c }));
      }
      return {
        patterns: {
          ...s.patterns,
          [dst]: {
            ...to,
            bpm: from.bpm,
            timeSignature: [...from.timeSignature] as [number, number],
            stepLength: from.stepLength,
            swing: from.swing,
            layerRows,
          },
        },
      };
    }),

  clearPatternCells: (patternId, layerId) =>
    set((s) => {
      const p = s.patterns[patternId];
      if (!p) return {};
      const blankRow: PatternCell[] = Array.from({ length: p.stepLength }, () => ({ on: false }));
      let layerRows: Record<string, PatternCell[]>;
      if (layerId) {
        layerRows = { ...p.layerRows, [layerId]: blankRow };
      } else {
        layerRows = {};
        for (const k of Object.keys(p.layerRows)) {
          layerRows[k] = blankRow;
        }
      }
      return { patterns: { ...s.patterns, [patternId]: { ...p, layerRows } } };
    }),

  clipboard: null,

  copyCells: (patternId, layerId) =>
    set((s) => {
      const p = s.patterns[patternId];
      if (!p) return {};
      const targetLayer = layerId ?? Object.keys(p.layerRows)[0];
      if (!targetLayer) return {};
      const row = p.layerRows[targetLayer];
      if (!row) return {};
      return { clipboard: row.map((c) => ({ ...c })) };
    }),

  pasteCells: (patternId, layerId) =>
    set((s) => {
      const p = s.patterns[patternId];
      if (!p || !s.clipboard) return {};
      const targetLayer = layerId ?? Object.keys(p.layerRows)[0];
      if (!targetLayer) return {};
      const src = s.clipboard;
      const dst = Array.from({ length: p.stepLength }, (_, i) =>
        src[i] ? { ...src[i] } : { on: false }
      );
      return {
        patterns: {
          ...s.patterns,
          [patternId]: { ...p, layerRows: { ...p.layerRows, [targetLayer]: dst } },
        },
      };
    }),

  clearClipboard: () => set({ clipboard: null }),

  addClip: (clip) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const newClip: ArrangementClip = { id, ...clip };
    set((s) => ({
      arrangement: recomputeArrangement({ ...s.arrangement, clips: [...s.arrangement.clips, newClip] }),
    }));
    get().deriveSongChain();
    return id;
  },

  updateClip: (id, updates) => {
    set((s) => {
      const clips = s.arrangement.clips.map((c) => (c.id === id ? { ...c, ...updates, id } : c));
      return { arrangement: recomputeArrangement({ ...s.arrangement, clips }) };
    });
    get().deriveSongChain();
  },

  removeClip: (id) => {
    set((s) => ({
      arrangement: recomputeArrangement({
        ...s.arrangement,
        clips: s.arrangement.clips.filter((c) => c.id !== id),
      }),
    }));
    get().deriveSongChain();
  },

  moveClip: (id, newStartBeat) => {
    const beat = Math.max(0, newStartBeat);
    set((s) => {
      const clips = s.arrangement.clips.map((c) => (c.id === id ? { ...c, startBeat: beat } : c));
      return { arrangement: recomputeArrangement({ ...s.arrangement, clips }) };
    });
    get().deriveSongChain();
  },

  duplicateClip: (id) => {
    const state = get();
    const src = state.arrangement.clips.find((c) => c.id === id);
    if (!src) return null;
    const dup: Omit<ArrangementClip, 'id'> = {
      patternId: src.patternId,
      startBeat: clipEnd(src),
      beats: src.beats,
      loops: src.loops,
      muted: src.muted,
      color: src.color,
    };
    return get().addClip(dup);
  },

  splitClipAtBeat: (id, beat) => {
    const state = get();
    const src = state.arrangement.clips.find((c) => c.id === id);
    if (!src) return;
    if (beat <= src.startBeat || beat >= clipEnd(src)) return;
    const leftBeats = beat - src.startBeat;
    const rightBeats = src.beats - leftBeats;
    state.updateClip(id, { beats: leftBeats });
    state.addClip({
      patternId: src.patternId,
      startBeat: beat,
      beats: rightBeats,
      loops: 1,
      muted: src.muted,
      color: src.color,
    });
  },  deriveSongChain: () => {
    set((s) => {
      const sorted = [...s.arrangement.clips].sort((a, b) => a.startBeat - b.startBeat);
      const order: string[] = [];
      for (const clip of sorted) {
        for (let i = 0; i < Math.max(1, clip.loops); i++) {
          order.push(clip.patternId);
        }
      }
      return { songChain: { order: order.length > 0 ? order : ['A', 'B', 'C', 'D'] } };
    });
  },

  addTempoPoint: (point) => {
    set((s) => ({
      arrangement: {
        ...s.arrangement,
        tempoMap: sortTempoMap([
          ...s.arrangement.tempoMap.filter((p) => Math.abs(p.tick - point.tick) > 0.001),
          { tick: Math.max(0, point.tick), bpm: Math.max(20, Math.min(300, point.bpm)) },
        ]),
      },
    }));
  },

  updateTempoPoint: (tick, bpm) => {
    set((s) => ({
      arrangement: {
        ...s.arrangement,
        tempoMap: sortTempoMap(
          s.arrangement.tempoMap.map((p) =>
            Math.abs(p.tick - tick) < 0.001 ? { tick: p.tick, bpm: Math.max(20, Math.min(300, bpm)) } : p
          )
        ),
      },
    }));
  },

  removeTempoPoint: (tick) => {
    set((s) => ({
      arrangement: {
        ...s.arrangement,
        tempoMap: s.arrangement.tempoMap.filter((p) => Math.abs(p.tick - tick) > 0.001),
      },
    }));
  },

  clearTempoMap: () => {
    set((s) => ({ arrangement: { ...s.arrangement, tempoMap: [] } }));
  },

  getBpmAtBeat: (beat) => {
    const map = get().arrangement.tempoMap;
    if (map.length === 0) {
      return get().patterns[get().activePatternId].bpm;
    }
    // Find the latest point whose tick <= beat.
    let active = map[0];
    for (const p of map) {
      if (p.tick <= beat) active = p;
      else break;
    }
    return active.bpm;
  },
}));
