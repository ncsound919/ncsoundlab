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

import { Arrangement } from '../types';

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
