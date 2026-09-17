/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chord-pad engine.
 *
 * Turns the current key/scale into 16 playable pads: pads 1–7 are the seven
 * diatonic triads (or 7th chords) of the scale, pads 8–14 repeat them an
 * octave up, and pads 15–16 continue into the third octave. This is the
 * "chord progression on the controller" path — one pad press fires a voiced,
 * in-key chord, so a progression can be performed rather than programmed.
 *
 * Built on the shared pitch primitives (`theory/pitch.ts`) so chord spelling
 * matches the rest of the app.
 */

import { midi, pitchClassOf, type ScaleType } from '../theory/pitch';
import { resolveScaleType } from '../musicTheory';

export interface ChordPadSettings {
  /** Root key name, e.g. 'C', 'F#', 'Bb'. */
  key: string;
  /** Friendly scale name understood by `resolveScaleType`. */
  scale: string;
  /** Use diatonic 7th chords instead of plain triads. */
  seventh: boolean;
  /** Base octave (4 = middle C register). */
  octave: number;
  /** Move the lowest N chord tones up an octave. */
  inversion: number;
  /** 0 = block chord; >0 = strum spread in milliseconds. */
  strumMs: number;
  /** 0 = close voicing; 1 = wide (every other tone up an octave). */
  spread: number;
}

export const DEFAULT_CHORD_SETTINGS: ChordPadSettings = {
  key: 'C',
  scale: 'minor',
  seventh: false,
  octave: 4,
  inversion: 0,
  strumMs: 0,
  spread: 0.35,
};

/** Diatonic scale-degree intervals (semitones from the scale root). */
const SCALE_INTERVALS: Record<ScaleType, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  natural_minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  melodic_minor: [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

interface DiatonicTables {
  triads: string[];
  sevenths: string[];
}

/** Roman-numeral correct diatonic quality per scale degree. */
export const DIATONIC_TABLES: Record<ScaleType, DiatonicTables> = {
  major: {
    triads: ['', 'm', 'm', '', '', 'm', 'dim'],
    sevenths: ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'],
  },
  natural_minor: {
    triads: ['m', 'dim', '', 'm', 'm', '', ''],
    sevenths: ['m7', 'm7b5', 'maj7', 'm7', 'm7', 'maj7', '7'],
  },
  harmonic_minor: {
    triads: ['m', 'dim', 'aug', 'm', '', '', 'dim'],
    sevenths: ['mMaj7', 'm7b5', 'maj7#5', 'm7', '7', 'maj7', 'dim7'],
  },
  melodic_minor: {
    triads: ['m', 'm', 'aug', '', '', 'dim', 'dim'],
    sevenths: ['mMaj7', 'm7', 'maj7#5', '7', '7', 'm7b5', 'm7b5'],
  },
  dorian: {
    triads: ['m', 'm', '', '', 'm', 'dim', ''],
    sevenths: ['m7', 'm7', 'maj7', '7', 'm7', 'm7b5', 'maj7'],
  },
  phrygian: {
    triads: ['m', '', '', 'm', 'dim', '', 'm'],
    sevenths: ['m7', 'maj7', '7', 'm7', 'm7b5', 'maj7', 'm7'],
  },
  lydian: {
    triads: ['', '', 'm', 'dim', '', 'm', 'm'],
    sevenths: ['maj7', '7', 'm7', 'm7b5', 'maj7', 'm7', 'm7'],
  },
  mixolydian: {
    triads: ['', 'm', 'dim', '', 'm', 'm', ''],
    sevenths: ['7', 'm7', 'm7b5', 'maj7', 'm7', 'm7', 'maj7'],
  },
  locrian: {
    triads: ['dim', '', 'm', 'm', '', '', 'm'],
    sevenths: ['m7b5', 'maj7', 'm7', 'm7', 'maj7', '7', 'm7'],
  },
};

/** The seven diatonic chord qualities for a scale. */
export function diatonicQualities(scale: string, seventh = false): string[] {
  const table = DIATONIC_TABLES[resolveScaleType(scale)] ?? DIATONIC_TABLES.major;
  return seventh ? table.sevenths : table.triads;
}

export interface ChordPad {
  /** Scale degree 0..6 (0 = tonic). */
  degree: number;
  /** Octave transposition applied to the whole chord (0/1/2). */
  octaveShift: number;
  /** Chord root name (sharp spelling). */
  root: string;
  /** Chord quality key understood by the theory engine. */
  quality: string;
  /** Voiced MIDI notes, ready to trigger. */
  notes: number[];
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Chord-tone intervals (semitones) for a quality, falling back to a triad. */
const CHORD_INTERVALS: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  '7': [0, 4, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  mMaj7: [0, 3, 7, 11],
  'maj7#5': [0, 4, 8, 11],
};

const intervalsFor = (quality: string): number[] => CHORD_INTERVALS[quality] ?? CHORD_INTERVALS[''];

/**
 * Build a chord pad. `padIndex` 0..15 walks the seven degrees then repeats an
 * octave up, so the same pad grid covers roughly two and a half octaves.
 */
export function chordPadAt(settings: ChordPadSettings, padIndex: number): ChordPad {
  const scaleType = resolveScaleType(settings.scale);
  const intervals = SCALE_INTERVALS[scaleType] ?? SCALE_INTERVALS.major;
  const qualities = diatonicQualities(settings.scale, settings.seventh);
  const safeIndex = ((Math.floor(padIndex) % 16) + 16) % 16;
  const degree = safeIndex % 7;
  const octaveShift = Math.floor(safeIndex / 7);

  const rootPc = (pitchClassOf(settings.key) + intervals[degree]) % 12;
  const quality = qualities[degree] ?? '';
  const rootMidi = midi(pitchClassOf(settings.key), settings.octave) + intervals[degree] + octaveShift * 12;

  let notes = intervalsFor(quality).map((semi) => rootMidi + semi);
  notes = applyInversion(notes, settings.inversion);
  notes = applySpread(notes, settings.spread);

  return {
    degree,
    octaveShift,
    root: SHARP_NAMES[((rootPc % 12) + 12) % 12],
    quality,
    notes,
  };
}

/** Move the lowest `n` notes up an octave (first inversion, etc.). */
export function applyInversion(notes: number[], inversion: number): number[] {
  const sorted = [...notes].sort((a, b) => a - b);
  const n = Math.max(0, Math.min(sorted.length - 1, Math.floor(inversion)));
  for (let i = 0; i < n; i++) sorted[i] += 12;
  return sorted.sort((a, b) => a - b);
}

/**
 * Open the voicing: at spread > 0.5 every second tone (after the bass) is
 * lifted an octave. Keeps the root on the bottom so the chord stays grounded.
 */
export function applySpread(notes: number[], spread: number): number[] {
  if (spread <= 0.5) return [...notes].sort((a, b) => a - b);
  const sorted = [...notes].sort((a, b) => a - b);
  return sorted.map((n, i) => (i > 0 && i % 2 === 1 ? n + 12 : n)).sort((a, b) => a - b);
}

/** Voiced notes for a pad index, with a strum offset per note in seconds. */
export function chordPadTiming(
  settings: ChordPadSettings,
  padIndex: number
): { notes: number[]; offsetsMs: number[] } {
  const { notes } = chordPadAt(settings, padIndex);
  const step = Math.max(0, settings.strumMs);
  return { notes, offsetsMs: notes.map((_, i) => i * step) };
}

/** MIDI note number → "C4"-style label, for the pad UI. */
export function noteLabel(m: number): string {
  return `${SHARP_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}
