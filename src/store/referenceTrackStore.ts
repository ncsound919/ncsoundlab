/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reference track store (Phase 4.3).
 *
 * Holds the currently-imported reference track — a single
 * AudioBuffer the user dropped in for A/B / tempo matching. Lives in
 * session memory only (not the project document); it's a working
 * reference, not a project asset.
 *
 * Phase 4.4 layers tempo detection on top of this store via
 * `getBpm()`; the audio engine reads `getBuffer()` to play the
 * reference alongside the song.
 */

import { create } from 'zustand';
import type { ReferenceTrackMeta } from '../audio/referenceImport';

interface ReferenceTrackState {
  buffer: AudioBuffer | null;
  meta: ReferenceTrackMeta | null;
  /** Linear gain 0..1 applied when playing the reference. */
  gain: number;
  /** When true, the reference plays alongside the song. */
  playing: boolean;
  /** When true, the reference is muted relative to the song (A/B switch). */
  muted: boolean;
  setBuffer: (buffer: AudioBuffer | null, meta: ReferenceTrackMeta | null) => void;
  setGain: (gain: number) => void;
  setPlaying: (playing: boolean) => void;
  setMuted: (muted: boolean) => void;
  clear: () => void;
}

export const useReferenceTrackStore = create<ReferenceTrackState>((set) => ({
  buffer: null,
  meta: null,
  gain: 0.8,
  playing: false,
  muted: false,
  setBuffer: (buffer, meta) => set({ buffer, meta }),
  setGain: (gain) => set({ gain: Math.max(0, Math.min(1, gain)) }),
  setPlaying: (playing) => set({ playing }),
  setMuted: (muted) => set({ muted }),
  clear: () => set({ buffer: null, meta: null, playing: false }),
}));
