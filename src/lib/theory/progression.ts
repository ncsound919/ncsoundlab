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

const ROOTS = NOTE_NAMES_SHARP;

/** Scale degree → diatonic chord quality (roman-numeral convention). */
const MAJOR_DEGREE_QUALITY = ['maj7', 'min7', 'min7', 'maj7', '7', 'min7', 'm7b5'];
const MINOR_DEGREE_QUALITY = ['min7', 'm7b5', 'maj7', 'min7', 'min7', 'maj7', '7'];

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
    return generateSectionProgression(key, scale, degreeQualities, bars, complexity, rng);
  }
  return generateFunctionalProgression(key, scale, degreeQualities, bars, complexity, rng);
}

/** Pattern-table progression (I–vi–IV–V, etc.) with cadential weighting. */
function generateSectionProgression(
  key: string,
  scale: number[],
  qualities: string[],
  bars: number,
  complexity: number,
  rng: SeededRng
): TheoryChord[] {
  const patterns: number[][] = [
    [0, 5, 3, 4], // I vi IV V
    [0, 5, 2, 4], // I vi ii V
    [3, 0, 4, 5], // IV I V vi
    [2, 4, 0, 0], // ii V I I
    [0, 3, 4, 5], // I IV V vi
  ];
  const pattern = rng.pick(patterns);
  const chords: TheoryChord[] = [];
  const totalBeats = bars * 4;
  let beats = 0;
  let i = 0;
  while (beats < totalBeats) {
    const degree = pattern[i % pattern.length];
    const root = ROOTS[(ROOTS.indexOf(key) + scale[degree]) % 12];
    const type = extendQuality(qualities[degree], complexity, rng);
    const dur = Math.min(4, totalBeats - beats);
    chords.push({ root, type, duration: dur });
    beats += dur;
    i++;
  }
  return chords;
}

/** Tonic/subdominant/dominant functional walk (V→I cadences favored). */
function generateFunctionalProgression(
  key: string,
  scale: number[],
  qualities: string[],
  bars: number,
  complexity: number,
  rng: SeededRng
): TheoryChord[] {
  // Functional roles: 0=tonic(I,vi,iii), 1=subdominant(ii,IV), 2=dominant(V,vii).
  const roles = [0, 1, 2];
  const roleDegrees: Record<number, number[]> = { 0: [0, 5, 2], 1: [1, 3], 2: [4, 6] };

  const chords: TheoryChord[] = [];
  const totalBeats = bars * 4;
  let beats = 0;
  let role = 0;
  while (beats < totalBeats) {
    // Prefer V→I, ii→V, IV→I movement.
    const nextRole = role === 0 ? rng.pick([1, 1, 2]) : role === 1 ? rng.pick([2, 2, 0]) : 0;
    const degrees = roleDegrees[nextRole];
    const degree = rng.pick(degrees);
    const root = ROOTS[(ROOTS.indexOf(key) + scale[degree]) % 12];
    const type = extendQuality(qualities[degree], complexity, rng);
    const dur = Math.min(4, totalBeats - beats);
    chords.push({ root, type, duration: dur });
    beats += dur;
    role = nextRole;
  }
  return chords;
}

/** Extend a chord quality by `complexity` (0=triad, 1=7th, 2+=extended). */
function extendQuality(base: string, complexity: number, rng: SeededRng): string {
  if (complexity <= 0) {
    // Collapse to the plain triad of the same family.
    if (base === 'maj7') return 'maj';
    if (base === 'min7') return 'm';
    if (base === '7') return '7';
    if (base === 'm7b5') return 'dim';
    return base;
  }
  if (complexity >= 2) {
    const ext = rng.next() > 0.5;
    if (base === 'maj7') return ext ? 'maj9' : 'maj7';
    if (base === 'min7') return ext ? 'm9' : 'm7';
    if (base === '7') return ext ? '9' : '7';
  }
  return base;
}

export { CHORD_QUALITIES };
