/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Automation lane interpolation (Phase 2.3).
 *
 * Given a sorted-by-tick array of `{tick, value}` points and a target tick,
 * returns the linearly interpolated value at that tick. Used by the
 * scheduler to drive per-layer AudioParam ramps during arrangement
 * playback.
 */

import type { AutomationLane, AutomationPoint } from '../types';

export const AUTOMATION_MIN_TICK = 0;

/**
 * Linearly interpolate the value at `tick` from a sorted-by-tick array of
 * points. Returns `defaultValue` when `points` is empty.
 */
export const interpolateAutomation = (
  points: AutomationPoint[],
  tick: number,
  defaultValue = 0
): number => {
  if (points.length === 0) return defaultValue;
  if (tick < points[0].tick) return points[0].value;
  // Find the last point whose tick <= query tick. Walk forward in the array.
  // Collapsed (duplicate) ticks are treated as one — we return the last one.
  let active = points[0];
  for (const p of points) {
    if (p.tick <= tick) active = p;
    else break;
  }
  if (active.tick === tick) return active.value;
  // Find the segment to the right and interpolate.
  const idx = points.indexOf(active);
  const next = points[idx + 1];
  if (!next) return active.value;
  const span = next.tick - active.tick;
  if (span <= 0) return active.value;
  const t = (tick - active.tick) / span;
  return active.value + (next.value - active.value) * t;
};

/**
 * Compute the wall-clock (audio-context) time at which a given beat
 * triggers given a list of tempo points and the audio context's currentTime.
 * Phase 2.3 lays the foundation; the scheduler uses this in a follow-up.
 */
export const beatToAudioTime = (
  beat: number,
  tempoPoints: { tick: number; bpm: number }[],
  audioContextStartSec: number
): number => {
  if (tempoPoints.length === 0) {
    return audioContextStartSec + beat * (60 / 120) / 4; // assume 120 BPM fallback
  }
  let elapsedSec = 0;
  let prevTick = 0;
  let prevBpm = tempoPoints[0].bpm;
  for (const p of tempoPoints) {
    if (beat <= p.tick) {
      elapsedSec += (beat - prevTick) * (60 / prevBpm) / 4;
      return audioContextStartSec + elapsedSec;
    }
    elapsedSec += (p.tick - prevTick) * (60 / prevBpm) / 4;
    prevTick = p.tick;
    prevBpm = p.bpm;
  }
  elapsedSec += (beat - prevTick) * (60 / prevBpm) / 4;
  return audioContextStartSec + elapsedSec;
};

/**
 * Create an empty lane with sane defaults. Used when adding a lane via UI.
 */
export const makeEmptyLane = (
  id: string,
  target: AutomationLane['target'],
  min = 0,
  max = 1
): AutomationLane => ({
  id,
  target,
  min,
  max,
  points: [],
});
