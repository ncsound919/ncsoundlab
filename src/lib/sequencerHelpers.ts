/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure helpers for the studio sequencer. Kept free of heavyweight imports
 * (Tone, react-piano, stores) so they can be unit-tested in isolation.
 */

import type { SoundLayer } from '../types';
import { DEFAULT_SYNTH } from '../types';

/**
 * Apply a semitone offset to a layer copy, returning a new object. For synth
 * layers this scales the oscillator frequency by `2^(semitones/12)`; for
 * sample layers it offsets the `pitch` field. The input layer is never
 * mutated. `semitones === 0` returns an equal but independent copy.
 */
export function applySemitoneShift(layer: SoundLayer, semitones: number): SoundLayer {
  if (!semitones) return { ...layer };
  if (layer.type === 'synth') {
    return {
      ...layer,
      synth: {
        ...DEFAULT_SYNTH,
        ...(layer.synth || {}),
        frequency: (layer.synth?.frequency || 440) * Math.pow(2, semitones / 12),
      },
    };
  }
  return { ...layer, pitch: (layer.pitch || 0) + semitones };
}

/**
 * Compute the swing/groove/pocket offset (in seconds) for a 16th-note step,
 * given the per-pad swing %, per-cell groove offset (fraction of a step), and
 * per-piece pocket bias (ms). This is the sample-accurate scheduling math the
 * sequencer applies on the Web Audio clock (see web.dev "A tale of two
 * clocks"): offsets are expressed as audio-time deltas, never JS timers.
 *
 * Returns the offset in seconds. Pushed (early) offsets can't be scheduled in
 * the past on the audio clock, so negative results are clamped to 0 — the
 * caller fires the note on the step time.
 */
export function stepOffsetSeconds(opts: {
  stepMs: number;
  stepIndex: number;
  swingPercent: number;
  cellOffset: number; // fraction of a 16th-note step, +late / -early
  pocketMs: number;
}): number {
  const { stepMs, stepIndex, swingPercent, cellOffset, pocketMs } = opts;
  const offBeat = stepIndex % 2 === 1;
  const swingDelayMs = offBeat && swingPercent > 0 ? (swingPercent / 100) * stepMs : 0;
  const grooveDelayMs = cellOffset * stepMs;
  const delayMs = swingDelayMs + grooveDelayMs + pocketMs;
  return Math.max(0, delayMs) / 1000;
}