/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Copied/adapted from the Session Musician music-theory engine
 * (`musicTheoryEngine.ts` — generateSectionProgression + the legacy functional
 * generator). Deterministic chord-progression generation driven by seeded
 * PRNG, key, scale, and a target mood/harmony complexity.
 */

import {
  NOTE_NAMES_SHARP,
  getScalePitchClasses,
  CHORD_QUALITIES,
  type ScaleType,
} from './pitch';
import { createSeededRng, hashStringToInt, type SeededRng } from './prng';
import { scoreProgression } from './quality';

export interface TheoryChord {
  root: string;
  type: string; // a CHORD_QUALITIES key
  duration: number; // in beats
}

export interface ProgressionOptions {
  key: string;
  scaleType?: ScaleType;
  bars?: number;
  /**
   * 0 = plain triads, 1 = 7ths, 2 = 9ths/extensions (0..2).
   * Determines how many chord qualities get extended.
   */
  complexity?: number;
  /** 'functional' (tonic/subdominant/dominant walk) or 'section' (pattern table). */
  mode?: 'functional' | 'section';
  seed?: number;
}

export interface BestProgressionOptions extends ProgressionOptions {
  /**
   * Monte Carlo trials (smart-randomizer style): generate N candidates with
   * per-trial seeds, score each against the progression-quality rubric, and
   * keep the highest-scoring one. Deterministic for a given `seed`. Defaults
   * to 1 (plain `generateProgression`).
   */
  trials?: number;
}

const ROOTS = NOTE_NAMES_SHARP;

/** Scale degree → diatonic chord quality (roman-numeral convention). */
// Note: use the exact CHORD_QUALITIES keys ('m7', not 'min7') so voicings and
// sophistication rules recognize every emitted type. 'min7' was silently
// falling back to a major triad in chordTonesForQuality.
const MAJOR_DEGREE_QUALITY = ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'];
const MINOR_DEGREE_QUALITY = ['m7', 'm7b5', 'maj7', 'm7', 'm7', 'maj7', '7'];

/**
 * Generate a chord progression for `bars` bars in `key`. Returns an array of
 * `TheoryChord` whose durations sum to `bars * 4` beats.
 */
export function generateProgression(opts: ProgressionOptions): TheoryChord[] {
  const {
    key,
    scaleType = 'major',
    bars = 8,
    complexity = 1,
    mode = 'functional',
    seed,
  } = opts;

  const seedBase = hashStringToInt(`${key}-${scaleType}-${bars}-${complexity}-${mode}`);
  const rng: SeededRng = createSeededRng(seed ?? seedBase);

  const scale = getScalePitchClasses(ROOTS.indexOf(key) % 12, scaleType);
  const isMinor = scaleType !== 'major';
  const degreeQualities = isMinor ? MINOR_DEGREE_QUALITY : MAJOR_DEGREE_QUALITY;

  if (mode === 'section') {
    return generateSectionProgression(scale, degreeQualities, bars, complexity, rng);
  }
  return generateFunctionalProgression(scale, degreeQualities, bars, complexity, rng);
}

/** Pattern-table progression (I–vi–IV–V, etc.) with cadential weighting. */
function generateSectionProgression(
  scale: number[],
  qualities: string[],
  bars: number,
  complexity: number,
  rng: SeededRng
): TheoryChord[] {
  // Every pattern resolves to the tonic (degree 0) so a section always lands
  // on I — a sequence ending on V/vi was a harmonic dead end (weak ending).
  const patterns: number[][] = [
    [0, 5, 3, 0], // I vi IV I (plagal close)
    [0, 5, 2, 0], // I vi ii I
    [3, 0, 5, 4], // IV I V I (authentic close)
    [2, 4, 0, 0], // ii V I I
    [0, 3, 5, 4], // I IV V I (authentic close)
    [5, 3, 4, 0], // vi IV V I (authentic close)
  ];
  const pattern = rng.pick(patterns);
  const chords: TheoryChord[] = [];
  const totalBeats = bars * 4;
  let beats = 0;
  let i = 0;
  while (beats < totalBeats) {
    const degree = pattern[i % pattern.length];
    // `scale` holds ABSOLUTE pitch classes (getScalePitchClasses root + interval),
    // so the root is the scale pc directly — NOT (keyOffset + scale[degree]),
    // which double-counts the key and produces out-of-key roots for any key but C.
    const root = ROOTS[scale[degree] % 12];
    const type = extendQuality(qualities[degree], complexity, rng);
    const dur = Math.min(4, totalBeats - beats);
    chords.push({ root, type, duration: dur });
    beats += dur;
    i++;
  }
  return chords;
}

/**
 * Tonic/subdominant/dominant functional walk. The body walks freely, but the
 * last 1–3 chords are a guaranteed cadential tail (ii→V→I, V→I, or just I)
 * and the opening chord is the tonic, so the progression actually resolves
 * instead of drifting aimlessly.
 */
function generateFunctionalProgression(
  scale: number[],
  qualities: string[],
  bars: number,
  complexity: number,
  rng: SeededRng
): TheoryChord[] {
  // Functional roles: 0=tonic(I,vi,iii), 1=subdominant(ii,IV), 2=dominant(V,vii).
  const roleDegrees: Record<number, number[]> = { 0: [0, 5, 2], 1: [1, 3], 2: [4, 6] };

  const chords: TheoryChord[] = [];
  const totalBeats = bars * 4;
  const totalChords = totalBeats / 4; // always an integer for these options
  const tailLen = Math.max(0, Math.min(3, totalChords - 1));

  // Cadential tail degrees (diatonic): ii → V → I, V → I, or just I.
  const tailDegrees = tailLen === 3 ? [1, 4, 0] : tailLen === 2 ? [4, 0] : tailLen === 1 ? [0] : [];

  let role = 0;
  for (let i = 0; i < totalChords - tailLen; i++) {
    // Open on the tonic; then a functional walk.
    const nextRole = i === 0 ? 0 : role === 0 ? rng.pick([1, 1, 2]) : role === 1 ? rng.pick([2, 2, 0]) : 0;
    const degree = nextRole === 0 && i === 0 ? 0 : rng.pick(roleDegrees[nextRole]);
    chords.push({
      root: ROOTS[scale[degree] % 12],
      type: extendQuality(qualities[degree], complexity, rng),
      duration: 4,
    });
    role = nextRole;
  }
  for (const degree of tailDegrees) {
    chords.push({
      root: ROOTS[scale[degree] % 12],
      type: extendQuality(qualities[degree], complexity, rng),
      duration: 4,
    });
  }

  // Defensive: if totalBeats wasn't a clean multiple of 4, absorb the remainder
  // into the final chord's duration so the sum still matches bars * 4.
  const beats = chords.reduce((s, c) => s + c.duration, 0);
  if (beats < totalBeats && chords.length > 0) {
    chords[chords.length - 1] = { ...chords[chords.length - 1], duration: chords[chords.length - 1].duration + (totalBeats - beats) };
  }
  return chords;
}

/** Extend a chord quality by `complexity` (0=triad, 1=7th, 2+=extended). */
function extendQuality(base: string, complexity: number, rng: SeededRng): string {
  if (complexity <= 0) {
    // Collapse to the plain triad of the same family.
    if (base === 'maj7') return 'maj';
    if (base === 'm7') return 'm';
    if (base === '7') return '7';
    if (base === 'm7b5') return 'dim';
    return base;
  }
  if (complexity >= 2) {
    const ext = rng.next() > 0.5;
    if (base === 'maj7') return ext ? 'maj9' : 'maj7';
    if (base === 'm7') return ext ? 'm9' : 'm7';
    if (base === '7') return ext ? '9' : '7';
  }
  return base;
}

export { CHORD_QUALITIES };

/**
 * Smart-randomizer style Monte Carlo progression generation: generate `trials`
 * candidate progressions (each seeded off the base seed so the whole run stays
 * deterministic), score them with `scoreProgression`, and return the best.
 *
 * `trials` defaults to 1, which degrades to plain `generateProgression` — so
 * existing callers and tests are unaffected. With trials > 1 the returned
 * progression is at least as good (by the quality rubric) as any single draw.
 */
export function generateBestProgression(opts: BestProgressionOptions): TheoryChord[] {
  const { key, scaleType = 'major', trials = 1 } = opts;
  const count = Math.max(1, Math.min(24, Math.floor(trials || 1)));

  // trials = 1 degrades to plain generation (exact same seed → exact same
  // progression), so existing callers / tests see no change.
  if (count === 1) return generateProgression(opts);

  const baseSeed =
    opts.seed ?? hashStringToInt(`${key}-${scaleType}-${opts.bars}-${opts.complexity}-${opts.mode}`);

  let best: TheoryChord[] = [];
  let bestScore = -Infinity;
  for (let t = 0; t < count; t++) {
    // Fold the trial index into the seed so each candidate explores a different
    // region of the random space (same fix as the Session Musician trialSeed).
    const trialSeed = hashStringToInt(`${baseSeed}:${t}`);
    const candidate = generateProgression({ ...opts, seed: trialSeed });
    const score = scoreProgression(candidate, key, scaleType);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}
