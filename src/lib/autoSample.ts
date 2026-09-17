/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MPC-style auto-sampler: render one synth patch at N MIDI pitches into
 * one-shot sample layers, ready to drop onto a pad program. The rendering
 * itself is injected (`renderNote`) so the orchestration — note→frequency
 * math, naming, ordering — is unit-testable without an audio engine.
 */

import { Note } from 'tonal';
import { DEFAULT_SYNTH, type SoundLayer } from '../types';

export interface AutoSampledNote {
  name: string;
  midi: number;
  buffer: AudioBuffer;
}

/** MIDI note number → pitch name (`60` → `C4`, `61` → `CS4`). Never throws. */
export function midiNoteName(midi: number): string {
  try {
    const name = Note.fromMidi(Math.max(0, Math.min(127, Math.round(midi))));
    if (name) return name.replace('#', 'S');
  } catch {
    /* fall through */
  }
  return `M${midi}`;
}

/** Equal-tempered frequency for a MIDI note (A4 = 440 Hz). */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Default auto-sample span: 16 semitones (C2–D#3) — exactly one pad bank. */
export const AUTO_SAMPLE_NOTES: number[] = Array.from({ length: 16 }, (_, i) => 36 + i);

export interface AutoSampleOptions {
  /** MIDI notes to render (default `AUTO_SAMPLE_NOTES`). */
  notes?: number[];
  /** Seconds to render per note (default 2). */
  noteDurationSec?: number;
  /** Name prefix for the sampled layers (default the layer name). */
  baseName?: string;
}

/**
 * Render a synth patch across `notes`, retuning its oscillator per note.
 * Render goes through the injected `renderNote` (in the app:
 * `audioEngine.exportWav`, which renders the full chain — what you hear is
 * what you sample).
 */
export async function autoSampleSynthLayer(
  layer: SoundLayer,
  renderNote: (pitched: SoundLayer, durationSec: number) => Promise<AudioBuffer>,
  opts: AutoSampleOptions = {}
): Promise<AutoSampledNote[]> {
  const notes = opts.notes ?? AUTO_SAMPLE_NOTES;
  const durationSec = Math.max(0.25, opts.noteDurationSec ?? 2);
  const base = (opts.baseName ?? layer.name ?? 'Synth').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const out: AutoSampledNote[] = [];
  for (const midi of notes) {
    const pitched: SoundLayer = {
      ...layer,
      synth: {
        ...DEFAULT_SYNTH,
        ...(layer.synth || {}),
        frequency: midiToFrequency(midi),
      },
    };
    const buffer = await renderNote(pitched, durationSec);
    out.push({ name: `${base}_${midiNoteName(midi)}`, midi, buffer });
  }
  return out;
}
