/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sequencer bridge (Phase 8).
 *
 * The controller engine now lives at App level so MIDI survives tab switches,
 * but the pattern clock, pad tune/choke, and arrange-editing closures live
 * inside StudioSequencer. The sequencer publishes those here while mounted;
 * the App-level host calls through the bridge when present and uses honest
 * store-backed fallbacks (layer-stack transport, direct layer triggering)
 * when it is absent. Nothing here touches audio or React — it is a tiny
 * mutable registry with a null-safe reader, unit-tested below.
 */

import type { GrooveTemplate } from '../grooveTemplates';
import type { TheoryChord } from '../theory/progression';

/** Live Beat Studio closures the App-level controller host can drive. */
export interface SequencerBridge {
  getPadTune: () => Record<string, number>;
  getPadChoke: () => Record<string, number>;
  triggerLayer: (layerId: string, semitones: number, velocity01: number, chokeKey?: string) => void;
  playNote: (midi: number, velocity01: number) => void;
  stopNote: (midi: number) => void;
  getIsPlaying: () => boolean;
  togglePlay: () => void;
  toggleRecord: () => void;
  tapTempo: () => void;
  setSwing: (swing: number) => void;
  getSelectedPad: () => number;
  clearPad: (index: number) => void;
  assignPad: (index: number) => void;
  clearPattern: () => void;
  quantizePattern: () => void;
  humanizePattern: () => void;
  applyGroove: (template: GrooveTemplate) => void;
  applyProgressionToPattern: (chords: TheoryChord[]) => void;
}

let current: SequencerBridge | null = null;

/** Called by StudioSequencer on every render (closures stay fresh). */
export function setSequencerBridge(bridge: SequencerBridge): void {
  current = bridge;
}

/** Called by StudioSequencer on unmount. */
export function clearSequencerBridge(): void {
  current = null;
}

/** The live bridge, or null when Beat Studio is not mounted. */
export function getSequencerBridge(): SequencerBridge | null {
  return current;
}

export function hasSequencerBridge(): boolean {
  return current !== null;
}
