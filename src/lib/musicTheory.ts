/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 6.2 — scale locking, chord mode, and keyboard splits.
 *
 * Pure helpers that decide which notes may trigger when scale lock is on, build
 * a chord from a root + quality, and map a MIDI note to the correct side of a
 * keyboard split. Built on the Session Musician music-theory engine primitives
 * in `theory/pitch.ts` (pitch classes, scale pitch classes, chord qualities) so
 * note naming, interval math, and chord-tone derivation are the same as the
 * song-musician engine. All functions are unit-testable without a UI or audio
 * context.
 */

import {
  getScalePitchClasses,
  CHORD_QUALITIES,
  pitchClassOf,
  noteToMidi,
  midi,
  midiToPitchClass,
  chordTonesForQuality,
  type ScaleType,
} from './theory/pitch';
import {
  generateVoicingCandidates,
  pickBestVoicing,
  voiceLeadingCost,
  type Voicing,
} from './theory/voicing';
import { generateProgression, generateBestProgression, type TheoryChord } from './theory/progression';
import { applySophistication, type SophisticationLevel } from './theory/sophistication';
import {
  scoreProgression,
  progressionMetrics,
  progressionEnergy,
  isSonicallyViable,
  type ProgressionMetrics,
} from './theory/quality';

export interface ScaleLockSettings {
  /** Root pitch class, e.g. 'C', 'F#'. */
  root: string;
  /** Scale name (engine `ScaleType` or friendly alias), e.g. 'minor'. */
  scaleName: string;
  /** Locked? When false, all notes pass. */
  enabled: boolean;
}

export const DEFAULT_SCALE_LOCK: ScaleLockSettings = {
  root: 'C',
  scaleName: 'natural_minor',
  enabled: false,
};

/** Friendly scale-name aliases → engine `ScaleType`. */
const SCALE_ALIASES: Record<string, ScaleType> = {
  major: 'major',
  ionian: 'major',
  minor: 'natural_minor',
  'natural minor': 'natural_minor',
  'harmonic minor': 'harmonic_minor',
  'melodic minor': 'melodic_minor',
  dorian: 'dorian',
  phrygian: 'phrygian',
  lydian: 'lydian',
  mixolydian: 'mixolydian',
  locrian: 'locrian',
};

/** Common scale presets for the UI. */
export const SCALE_PRESETS = [
  'major',
  'minor',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'locrian',
  'harmonic minor',
  'melodic minor',
] as const;

/** Resolve a friendly scale name to the engine `ScaleType`. */
export function resolveScaleType(name: string): ScaleType {
  return SCALE_ALIASES[name.toLowerCase()] ?? 'major';
}

export interface ChordModeSettings {
  /** Chord mode on? A single pad press triggers a full chord. */
  enabled: boolean;
  /** Chord quality understood by the engine (e.g. 'maj7', 'min7', '7', ''). */
  quality: string;
}

export const DEFAULT_CHORD_MODE: ChordModeSettings = { enabled: false, quality: 'maj7' };

export interface KeyboardSplitSettings {
  /** Split on? When off, all keys hit the active layer. */
  enabled: boolean;
  /** MIDI note at which the split begins (>= this = upper side). */
  splitNote: number;
  /** Layer id for the lower side. */
  lowerLayerId: string | null;
  /** Layer id for the upper side. */
  upperLayerId: string | null;
}

export const DEFAULT_SPLIT: KeyboardSplitSettings = {
  enabled: false,
  splitNote: 60, // C4
  lowerLayerId: null,
  upperLayerId: null,
};

/** Get the set of pitch classes (0..11) in a scale. */
export function scalePitchClasses(root: string, scaleName: string): Set<number> {
  const rootPc = pitchClassOf(root);
  return new Set<number>(getScalePitchClasses(rootPc, resolveScaleType(scaleName)));
}

/**
 * Snap a MIDI note into the locked scale: if the note is already in scale,
 * return it unchanged; otherwise round to the nearest in-scale pitch class
 * (ties prefer moving down). Returns the same note when lock is off.
 */
export function snapToScale(midiNote: number, lock: ScaleLockSettings): number {
  if (!lock.enabled) return midiNote;
  const pcs = scalePitchClasses(lock.root, lock.scaleName);
  if (pcs.size === 0) return midiNote;
  const pc = midiToPitchClass(midiNote);
  if (pcs.has(pc)) return midiNote;
  // Search outward for the nearest in-scale pitch class.
  for (let step = 1; step <= 11; step++) {
    const d = ((pc - step) % 12 + 12) % 12;
    const u = (pc + step) % 12;
    if (pcs.has(d) && pcs.has(u)) {
      // Tie: prefer the lower note.
      return midiNote - step;
    }
    if (pcs.has(d)) return midiNote - step;
    if (pcs.has(u)) return midiNote + step;
  }
  return midiNote;
}

/**
 * Build a chord (array of MIDI notes) from a root MIDI note + chord quality,
 * using the engine's chord-quality interval table (CHORD_QUALITIES). The chord
 * is anchored to `rootMidi` (the pressed note). When scale lock is on, each
 * chord tone is snapped into the locked scale for an "in-key chord" feel.
 */
export function chordFromRoot(rootMidi: number, lock: ScaleLockSettings, quality: string): number[] {
  const def = CHORD_QUALITIES[quality] ?? CHORD_QUALITIES[''];
  const tones = def.intervals.map((semi) => rootMidi + semi);
  if (!lock.enabled) return tones;
  return tones.map((t) => snapToScale(t, lock));
}

/**
 * Resolve which layer should play a MIDI note under a keyboard split.
 * Returns `upper` when note >= splitNote (or split off → null = use active).
 */
export function resolveSplit(
  midiNote: number,
  split: KeyboardSplitSettings
): 'lower' | 'upper' | null {
  if (!split.enabled) return null;
  if (!split.lowerLayerId && !split.upperLayerId) return null;
  return midiNote >= split.splitNote ? 'upper' : 'lower';
}

/** Compute the 16-level velocity level from a pointer Y position (0..1). */
export const velocityFromPadY = (y: number): number =>
  Math.max(0.1, 1 - Math.max(0, Math.min(1, y)));

// ---------------------------------------------------------------------------
// Enhanced theory (Session Musician engine port) — voicings + progressions
// ---------------------------------------------------------------------------

/**
 * Generate a smooth sequence of chord voicings (MIDI note sets) for a list of
 * chords. Uses the engine's voice-leading cost to pick the connecting voicing
 * for each step. `octave` sets the register (4 = C4-centered).
 */
export function voiceChords(
  chords: Array<{ root: string; type: string }>,
  octave = 4
): Voicing[] {
  const out: Voicing[] = [];
  let prev: Voicing | null = null;
  for (const chord of chords) {
    const rootPc = pitchClassOf(chord.root);
    const tones = chordTonesForQuality(rootPc, chord.type);
    const candidates = generateVoicingCandidates(tones, rootPc, octave);
    const chosen = pickBestVoicing(candidates, prev);
    if (chosen) {
      out.push(chosen);
      prev = chosen;
    }
  }
  return out;
}

/**
 * Compute the voice-leading smoothness between two voicings (0 = perfectly
 * smooth). Higher = more total semitone motion / crossings.
 */
export const voicingSmoothness = (a: number[], b: number[]): number => voiceLeadingCost(a, b);

/**
 * Generate a deterministic chord progression in a key/scale (engine port).
 * Returns root+quality+duration chords suitable for `voiceChords` or pads.
 *
 * Pass `trials` > 1 to enable smart-randomizer style Monte Carlo selection:
 * N candidates are generated and the highest-scoring one (by the quality
 * rubric) is returned. Deterministic for a given seed.
 */
export function makeProgression(
  key: string,
  opts: { scaleType?: string; bars?: number; complexity?: number; mode?: 'functional' | 'section'; seed?: number; trials?: number } = {}
): TheoryChord[] {
  const scaleType = resolveScaleType(opts.scaleType ?? 'major');
  const { trials = 1 } = opts;
  if (trials > 1) {
    return generateBestProgression({
      key,
      scaleType,
      bars: opts.bars,
      complexity: opts.complexity,
      mode: opts.mode,
      seed: opts.seed,
      trials,
    });
  }
  return generateProgression({
    key,
    scaleType,
    bars: opts.bars,
    complexity: opts.complexity,
    mode: opts.mode,
    seed: opts.seed,
  });
}

/** Convert a progression to plain root+type pairs (for voicing/preview). */
export function progressionChords(prog: TheoryChord[]): TheoryChord[] {
  return prog.map((c) => ({ ...c }));
}

/**
 * Upgrade a progression with harmonic sophistication (0 = plain, 1 = 9ths on
 * cadences, 2 = secondary dominants + color, 3 = tritone subs + altered doms).
 */
export function sophisticateProgression(prog: TheoryChord[], level: SophisticationLevel): TheoryChord[] {
  return applySophistication(prog, level);
}

/**
 * Snap a whole progression's roots into the locked scale (in-key chords).
 * Each root is moved to the nearest in-scale pitch class; quality is kept
 * (caller may re-harmonize separately). Returns the input unchanged when lock
 * is off.
 */
export function snapProgressionToScale(prog: TheoryChord[], lock: ScaleLockSettings): TheoryChord[] {
  if (!lock.enabled) return prog;
  const pcs = scalePitchClasses(lock.root, lock.scaleName);
  if (pcs.size === 0) return prog;
  return prog.map((c) => {
    const rootPc = pitchClassOf(c.root);
    if (pcs.has(rootPc)) return c;
    // Nearest in-scale pitch class (tie → lower).
    for (let step = 1; step <= 11; step++) {
      const d = ((rootPc - step) % 12 + 12) % 12;
      const u = (rootPc + step) % 12;
      if (pcs.has(d) && pcs.has(u)) return { ...c, root: noteNameOf(d) };
      if (pcs.has(d)) return { ...c, root: noteNameOf(d) };
      if (pcs.has(u)) return { ...c, root: noteNameOf(u) };
    }
    return c;
  });
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteNameOf = (pc: number): string => SHARP_NAMES[((pc % 12) + 12) % 12];

// Re-export engine primitives so consumers share one source of truth.
export {
  midi,
  noteToMidi,
  pitchClassOf,
  generateVoicingCandidates,
  pickBestVoicing,
  voiceLeadingCost,
  generateBestProgression,
  scoreProgression,
  progressionMetrics,
  progressionEnergy,
  isSonicallyViable,
  type ProgressionMetrics,
};
