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