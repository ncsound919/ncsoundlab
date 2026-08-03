/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Copied from the Session Musician music-theory engine (`theory/pitch.ts`).
 * Enhanced pitch primitives — everything works in MIDI numbers and pitch
 * classes. Scales, intervals, chord quality definitions, and note parsing
 * added. Self-contained (no imports) so it can be shared verbatim.
 */

export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTE_NAMES_FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Canonical key list – flats preferred (matches engine.ts KEYS)
export const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// ────────────────────────────────────────
// Pitch class ↔ name ↔ MIDI
// ────────────────────────────────────────

export function pitchClassOf(noteName: string): number {
  const stripped = noteName.replace(/[0-9\-]/g, '');
  let idx = NOTE_NAMES_SHARP.indexOf(stripped);
  if (idx === -1) idx = NOTE_NAMES_FLAT.indexOf(stripped);
  if (idx === -1) throw new Error(`Unknown note name: ${noteName}`);
  return idx;
}

export function noteName(pitchClass: number, preferFlat: boolean = true): string {
  const pc = ((pitchClass % 12) + 12) % 12;
  return preferFlat ? NOTE_NAMES_FLAT[pc] : NOTE_NAMES_SHARP[pc];
}

/** MIDI note number for a pitch class and octave (C4 = 60). */
export function midi(pitchClass: number, octave: number): number {
  return pitchClass + (octave + 1) * 12;
}

export function midiToPitchClass(m: number): number {
  return ((m % 12) + 12) % 12;
}

export function midiToOctave(m: number): number {
  return Math.floor(m / 12) - 1;
}

export function midiToNoteName(m: number, preferFlat: boolean = true): string {
  return `${noteName(midiToPitchClass(m), preferFlat)}${midiToOctave(m)}`;
}

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Parse a note name like "C#4" or "Eb3" into a MIDI number. */
export function noteToMidi(note: string): number {
  const match = note.trim().match(/^([A-Ga-g][#b]?)(-?\d+)$/);
  if (!match) throw new Error(`Invalid note format: ${note}`);
  const pc = pitchClassOf(match[1]);
  const octave = parseInt(match[2], 10);
  return midi(pc, octave);
}

// ────────────────────────────────────────
// Intervals & transposition
// ────────────────────────────────────────

export function transposePitchClass(pc: number, semitones: number): number {
  return ((pc + semitones) % 12 + 12) % 12;
}

/** Distance in semitones from `from` to `to` (positive = ascending). */
export function pitchClassDistance(from: number, to: number): number {
  return ((to - from + 12) % 12);
}

/** All interval names from root (in semitones) – for reference. */
export const INTERVAL_SEMITONES: Record<string, number> = {
  'P1': 0, 'm2': 1, 'M2': 2, 'm3': 3, 'M3': 4, 'P4': 5,
  'd5': 6, 'P5': 7, 'm6': 8, 'M6': 9, 'm7': 10, 'M7': 11,
  'P8': 12, 'b9': 13, '9': 14, '#9': 15, '11': 17,
  '#11': 18, 'b13': 20, '13': 21,
};

// ────────────────────────────────────────
// Scales
// ────────────────────────────────────────

export type ScaleType = 'major' | 'natural_minor' | 'harmonic_minor' | 'melodic_minor' |
                        'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'locrian';

const SCALE_INTERVALS: Record<ScaleType, number[]> = {
  major:           [0, 2, 4, 5, 7, 9, 11],
  natural_minor:   [0, 2, 3, 5, 7, 8, 10],
  harmonic_minor:  [0, 2, 3, 5, 7, 8, 11],
  melodic_minor:   [0, 2, 3, 5, 7, 9, 11],
  dorian:          [0, 2, 3, 5, 7, 9, 10],
  phrygian:        [0, 1, 3, 5, 7, 8, 10],
  lydian:          [0, 2, 4, 6, 7, 9, 11],
  mixolydian:      [0, 2, 4, 5, 7, 9, 10],
  locrian:         [0, 1, 3, 5, 6, 8, 10],
};

/** Get pitch classes of a scale (one octave). */
export function getScalePitchClasses(rootPc: number, type: ScaleType = 'major'): number[] {
  return SCALE_INTERVALS[type].map(i => (rootPc + i) % 12);
}

/** Return true if a pitch class belongs to the given scale. */
export function isDiatonicToKey(pc: number, keyPc: number, scaleType: ScaleType = 'major'): boolean {
  return getScalePitchClasses(keyPc, scaleType).includes(pc);
}

// ────────────────────────────────────────
// Chord quality definitions (intervals from root)
// ────────────────────────────────────────

export interface ChordQualityDef {
  intervals: number[];    // semitones (extensions use compound intervals: 14 = 9th, 21 = 13th, etc.)
  essential: number[];    // indices into intervals that must be present in any voicing
}

const Q = (intervals: number[], essential: number[]): ChordQualityDef => ({ intervals, essential });

export const CHORD_QUALITIES: Record<string, ChordQualityDef> = {
  // Triads
  '':         Q([0, 4, 7],               [0, 1, 2]),   // major
  'm':        Q([0, 3, 7],               [0, 1, 2]),   // minor
  'dim':      Q([0, 3, 6],               [0, 1, 2]),   // diminished triad
  'aug':      Q([0, 4, 8],               [0, 1, 2]),   // augmented triad
  'sus4':     Q([0, 5, 7],               [0, 1, 2]),
  'sus2':     Q([0, 2, 7],               [0, 1, 2]),

  // 6ths
  '6':        Q([0, 4, 7, 9],            [0, 1, 3]),
  'm6':       Q([0, 3, 7, 9],            [0, 1, 3]),
  '6/9':      Q([0, 4, 7, 9, 14],        [0, 1, 3, 4]),

  // Major 7ths & extensions
  'maj7':     Q([0, 4, 7, 11],           [0, 1, 3]),
  'maj9':     Q([0, 4, 7, 11, 14],       [0, 1, 3, 4]),
  'maj13':    Q([0, 4, 7, 11, 14, 21],   [0, 1, 3, 5]),
  'maj7#11':  Q([0, 4, 7, 11, 18],       [0, 1, 3, 4]),

  // Dominant 7ths & alterations
  '7':        Q([0, 4, 7, 10],           [0, 1, 3]),
  '9':        Q([0, 4, 7, 10, 14],       [0, 1, 3, 4]),
  '13':       Q([0, 4, 7, 10, 14, 21],   [0, 1, 3, 5]),
  '13b9':     Q([0, 4, 7, 10, 13, 21],   [0, 1, 3, 5]),
  '7b9':      Q([0, 4, 7, 10, 13],       [0, 1, 3, 4]),
  '7#9':      Q([0, 4, 7, 10, 15],       [0, 1, 3, 4]),
  '7#11':     Q([0, 4, 7, 10, 18],       [0, 1, 3, 4]),
  '7b13':     Q([0, 4, 7, 10, 20],       [0, 1, 3, 4]),
  '7b5':      Q([0, 4, 6, 10],           [0, 1, 2, 3]),
  '7#5':      Q([0, 4, 8, 10],           [0, 1, 2, 3]),
  '9sus4':    Q([0, 5, 7, 10, 14],       [0, 1, 3, 4]),
  '7sus4':    Q([0, 5, 7, 10],           [0, 1, 3]),
  '13sus4':   Q([0, 5, 7, 10, 14, 21],   [0, 1, 3, 5]),
  '7#9#5':    Q([0, 4, 8, 10, 15],       [0, 1, 2, 3]),   // #5 and #9
  'alt':      Q([0, 4, 7, 10, 13, 15, 17, 20], [0, 1, 2, 3]), // full altered (b9,#9,b5,#5) – most voicings pick a subset

  // Minor 7ths & extensions
  'm7':       Q([0, 3, 7, 10],           [0, 1, 3]),
  'm9':       Q([0, 3, 7, 10, 14],       [0, 1, 3, 4]),
  'm11':      Q([0, 3, 7, 10, 14, 17],   [0, 1, 3, 5]),
  'm7b5':     Q([0, 3, 6, 10],           [0, 1, 2, 3]),   // half‑diminished
  'dim7':     Q([0, 3, 6, 9],            [0, 1, 2, 3]),   // fully diminished 7th

  // Minor-major
  'mMaj7':    Q([0, 3, 7, 11],           [0, 1, 3]),
  'mMaj9':    Q([0, 3, 7, 11, 14],       [0, 1, 3, 4]),

  // Add chords
  'add9':     Q([0, 4, 7, 14],           [0, 1, 2, 3]),
  'madd9':    Q([0, 3, 7, 14],           [0, 1, 2, 3]),
};

export function chordTonesForQuality(rootPc: number, quality: string): number[] {
  const def = CHORD_QUALITIES[quality] ?? CHORD_QUALITIES[''];
  return def.intervals.map(i => (rootPc + i) % 12);
}

/** Returns the essential pitch classes (indices into chordTonesForQuality) that must be voiced. */
export function essentialChordTonesForQuality(rootPc: number, quality: string): number[] {
  const def = CHORD_QUALITIES[quality] ?? CHORD_QUALITIES[''];
  const all = chordTonesForQuality(rootPc, quality);
  return def.essential.map(i => all[i]);
}

// ────────────────────────────────────────
// Chord quality predicates (updated for new qualities)
// ────────────────────────────────────────

export function isDominantQuality(quality: string): boolean {
  return [
    '7', '9', '13', '13b9', '7b9', '7#9', '7#11', '7b13', '7b5', '7#5', '9sus4', '7sus4', '13sus4', '7#9#5', 'alt'
  ].includes(quality);
}

export function isMajorQuality(quality: string): boolean {
  return [
    '', '6', '6/9', 'maj7', 'maj9', 'maj13', 'maj7#11', 'add9', 'sus4', 'sus2'
  ].includes(quality);
}

export function isMinorQuality(quality: string): boolean {
  return [
    'm', 'm6', 'm7', 'm9', 'm11', 'm7b5', 'dim', 'dim7', 'mMaj7', 'mMaj9', 'madd9', 'aug'
  ].includes(quality);
}

// ────────────────────────────────────────
// Additional helpers
// ────────────────────────────────────────

/** All pitch classes of the 12 notes. */
export const ALL_PITCH_CLASSES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Given a root pitch class and quality, return chord tones as MIDI numbers in a given octave range. */
export function chordTonesAsMidi(
  rootPc: number, quality: string, octave: number = 4
): number[] {
  const intervals = CHORD_QUALITIES[quality]?.intervals ?? CHORD_QUALITIES[''].intervals;
  return intervals.map(i => midi(rootPc, octave) + i);
}
