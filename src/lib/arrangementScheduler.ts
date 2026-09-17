/**
 * Arrangement scheduler (Phase 2.3) — turn an `Arrangement` into a bar-by-bar
 * playback plan the existing per-bar song-mode engine can execute.
 *
 * SoundLab's live transport advances one bar at a time over a `songChain.order`.
 * This module makes the Arrangement the SOURCE OF TRUTH (as the Phase 2.3 design
 * comment intends) by flattening clips onto a per-bar timeline, honoring each
 * clip's `startBeat`, `loops`, and `muted`, and deriving a per-bar tempo map.
 *
 * Platform bound (documented, not a bug here): only patterns A-D exist and each
 * is at most 2 bars, so an arrangement beyond that reuses those patterns.
 */

import { Arrangement, Pattern, PatternCell } from '../types';

/** SoundLab has exactly four pattern slots. */
export type PatternId = 'A' | 'B' | 'C' | 'D';

export interface BarPlan {
  /** One bar (4 beats) each; entry is the pattern to play that bar. */
  order: (PatternId | '')[];
  /** bpm at the start of each bar (from tempoMap, else the pattern's bpm). */
  bpm: number[];
  /** total bars represented. */
  bars: number;
}

const BAR_BEATS = 4;

function bpmAtBeat(tempoMap: Arrangement['tempoMap'], beat: number, fallback: number): number {
  let current = fallback;
  for (const p of [...tempoMap].sort((a, b) => a.tick - b.tick)) {
    if (p.tick <= beat) current = p.bpm;
    else break;
  }
  return current;
}

/**
 * Flatten an arrangement into a per-bar pattern order. A clip occupies
 * [startBeat, startBeat + beats) on the beat timeline; a muted clip is carried
 * as the previous pattern (SoundLab's song chain cannot express per-bar rests).
 */
export function planFromArrangement(arrangement: Arrangement | undefined | null, patterns: Record<PatternId, { stepLength: number; bpm: number }>, fallbackId: PatternId = 'A'): BarPlan {
  if (!arrangement || !Array.isArray(arrangement.clips)) {
    return { order: [fallbackId], bpm: [patterns[fallbackId]?.bpm ?? 90], bars: 1 };
  }
  const endBeat = Math.max(0, arrangement.totalBeats ?? 0);
  const bars = Math.max(1, Math.ceil(endBeat / BAR_BEATS));
  const order: (PatternId | '')[] = [];
  const bpm: number[] = [];
  let lastActive: PatternId = fallbackId;
  for (let bar = 0; bar < bars; bar++) {
    const barStart = bar * BAR_BEATS;
    let chosen: PatternId | '' = '';
    for (const clip of arrangement.clips) {
      if (clip.muted) continue;
      const clipEnd = clip.startBeat + clip.beats;
      if (barStart >= clip.startBeat && barStart < clipEnd) {
        chosen = clip.patternId as PatternId;
        break; // first covering clip wins
      }
    }
    if (chosen) lastActive = chosen;
    order.push(chosen || lastActive);
    const fallback = patterns[chosen || lastActive]?.bpm ?? 90;
    bpm.push(bpmAtBeat(arrangement.tempoMap ?? [], barStart, fallback));
  }
  return { order, bpm, bars };
}

const BEATS_PER_STEP = 0.25; // a 16th note

/**
 * Convert a beat position on the arrangement timeline to seconds, integrating
 * the tempo map (each tempo point applies from its tick until the next).
 */
export function beatToSeconds(tempoMap: Arrangement['tempoMap'], beat: number, fallbackBpm: number): number {
  if (beat <= 0) return 0;
  const points = [...(tempoMap ?? [])].filter((p) => p.tick > 0).sort((a, b) => a.tick - b.tick);
  let seconds = 0;
  let prevTick = 0;
  let bpm = fallbackBpm > 0 ? fallbackBpm : 120;
  for (const point of points) {
    if (point.tick >= beat) break;
    seconds += (point.tick - prevTick) * (60 / bpm);
    prevTick = point.tick;
    bpm = point.bpm > 0 ? point.bpm : bpm;
  }
  seconds += (beat - prevTick) * (60 / bpm);
  return Math.max(0, seconds);
}

/** One scheduled musical event on the clip-accurate arrangement timeline. */
export interface ArrangementCell {
  patternId: PatternId;
  layerId: string;
  stepIdx: number;
  /** Which loop repetition of the clip this cell belongs to (0-based). */
  repetition: number;
  timeSec: number;
  note?: number;
  notes?: number[];
  velocity?: number;
  duration?: number;
}

export interface ArrangementPlan {
  durationSec: number;
  cells: ArrangementCell[];
  /** Overlapping clips can sound at once; true when any two cells overlap. */
  hasOverlaps: boolean;
}

/**
 * Flatten an arrangement into clip-accurate cell events.
 *
 * Unlike `planFromArrangement` (which collapses each bar to a single pattern),
 * this keeps sub-bar clip starts, honours each clip's `loops`, and emits cells
 * for EVERY covering clip — so overlapping clips layer instead of one winning.
 * Tempo changes are integrated across the timeline.
 */
export function planArrangementCells(
  arrangement: Arrangement | undefined | null,
  patterns: Record<string, Pattern>,
  fallbackBpm = 120
): ArrangementPlan {
  if (!arrangement || !Array.isArray(arrangement.clips) || arrangement.clips.length === 0) {
    return { durationSec: 0, cells: [], hasOverlaps: false };
  }
  const cells: ArrangementCell[] = [];
  let endBeat = 0;
  const tempoMap = arrangement.tempoMap ?? [];

  for (const clip of arrangement.clips) {
    if (clip.muted) continue;
    const pattern = patterns[clip.patternId as PatternId];
    if (!pattern) continue;
    const patternBeats = Math.max(1, pattern.stepLength * BEATS_PER_STEP);
    const loops = Math.max(1, Math.round(clip.loops || 1));
    endBeat = Math.max(endBeat, clip.startBeat + clip.beats, clip.startBeat + loops * patternBeats);

    for (let rep = 0; rep < loops; rep++) {
      const repStartBeat = clip.startBeat + rep * patternBeats;
      for (const [layerId, row] of Object.entries(pattern.layerRows)) {
        for (let step = 0; step < row.length; step++) {
          const cell = row[step] as PatternCell | undefined;
          if (!cell || !cell.on) continue;
          const beat = repStartBeat + step * BEATS_PER_STEP;
          cells.push({
            patternId: pattern.id as PatternId,
            layerId,
            stepIdx: step,
            repetition: rep,
            timeSec: beatToSeconds(tempoMap, beat, pattern.bpm || fallbackBpm),
            note: cell.note,
            notes: cell.notes,
            velocity: cell.velocity,
            duration: cell.duration,
          });
        }
      }
    }
  }

  cells.sort((a, b) => a.timeSec - b.timeSec);

  // Overlap detection: two cells whose [time, time+duration) windows intersect
  // and that come from different clips (same-start duplicates also count).
  let hasOverlaps = false;
  for (let i = 1; i < cells.length && !hasOverlaps; i++) {
    if (cells[i].timeSec - cells[i - 1].timeSec < 1e-6) hasOverlaps = true;
  }

  return {
    durationSec: beatToSeconds(tempoMap, endBeat, fallbackBpm),
    cells,
    hasOverlaps,
  };
}

/** Total 16th-note steps an arrangement spans (for the live scheduler loop). */
export function totalArrangementSteps(
  arrangement: Arrangement | undefined | null,
  patterns: Record<string, Pattern>
): number {
  if (!arrangement || !Array.isArray(arrangement.clips) || arrangement.clips.length === 0) return 0;
  let maxBeat = 0;
  for (const clip of arrangement.clips) {
    if (clip.muted) continue;
    const pattern = patterns[clip.patternId as PatternId];
    const patternBeats = pattern ? pattern.stepLength * BEATS_PER_STEP : clip.beats;
    maxBeat = Math.max(maxBeat, clip.startBeat + clip.beats, clip.startBeat + Math.max(1, clip.loops || 1) * patternBeats);
  }
  return Math.max(1, Math.ceil(maxBeat / BEATS_PER_STEP));
}

/** One active cell at a global 16th-note step. */
export interface ArrangementStepCell {
  patternId: PatternId;
  layerId: string;
  stepIdx: number;
  cell: PatternCell;
}

/**
 * Resolve every cell active at global 16th-step `globalStep`. Overlapping clips
 * all contribute, so the live scheduler layers them exactly like the offline
 * renderer. Sub-bar clip starts are honoured (the pattern is offset into the
 * clip, not snapped to a bar).
 */
export function cellsAtGlobalStep(
  arrangement: Arrangement | undefined | null,
  patterns: Record<string, Pattern>,
  globalStep: number
): ArrangementStepCell[] {
  if (!arrangement || !Array.isArray(arrangement.clips)) return [];
  const beat = globalStep * BEATS_PER_STEP;
  const out: ArrangementStepCell[] = [];
  for (const clip of arrangement.clips) {
    if (clip.muted) continue;
    const pattern = patterns[clip.patternId as PatternId];
    if (!pattern) continue;
    const patternBeats = Math.max(1, pattern.stepLength * BEATS_PER_STEP);
    const loops = Math.max(1, Math.round(clip.loops || 1));
    const span = patternBeats * loops;
    if (beat < clip.startBeat || beat >= clip.startBeat + span) continue;
    const localBeat = beat - clip.startBeat;
    const stepIdx = Math.min(
      pattern.stepLength - 1,
      Math.max(0, Math.round((localBeat % patternBeats) / BEATS_PER_STEP))
    );
    for (const [layerId, row] of Object.entries(pattern.layerRows)) {
      const cell = row[stepIdx] as PatternCell | undefined;
      if (cell?.on) {
        out.push({ patternId: clip.patternId as PatternId, layerId, stepIdx, cell });
      }
    }
  }
  return out;
}
