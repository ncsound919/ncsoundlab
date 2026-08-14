/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Progression quality scoring, metrics, and viability gates — adapted from the
 * Session Musician smart-randomizer's `scoreProgression` /
 * `getSectionHarmonicEnergy` and generalized for the soundlab theory engine.
 *
 * The smart randomizer works by "generate N candidates, score them against a
 * musicality rubric, keep the best". This module is that rubric: it lets the
 * Monte Carlo progression generator (and tests / the Theory panel) judge
 * whether a chord sequence is sonically viable rather than guessing.
 *
 * All functions are pure and deterministic (no RNG), so they are unit-testable
 * and safe to run in a sweep over keys × scales × modes.
 */

import { pitchClassOf, getScalePitchClasses, chordTonesForQuality, type ScaleType } from './pitch';
import {
  generateVoicingCandidates,
  pickBestVoicing,
  voiceLeadingCost,
  type Voicing,
} from './voicing';
import type { TheoryChord } from './progression';

/** Tonic pitch class of a key name (0..11). */
const tonicPc = (key: string): number => pitchClassOf(key);

/** Scale degree of a chord root relative to the key tonic (0..11 semitones). */
const degreeOf = (root: string, key: string): number =>
  (pitchClassOf(root) - tonicPc(key) + 12) % 12;

const isDominantType = (t: string): boolean =>
  /^(7|9|13|7b9|7#9|7#11|7b5|7#5|7b13|alt|9sus4|7sus4|13sus4|7#9#5)$/.test(t);

/**
 * Score the harmonic quality of a chord progression relative to a key.
 *
 * Rewards strong cadences and functional root motion (V→I, ii→V, IV→I, circle
 * of fifths), penalizes aimless root motion (thirds, tritones) and weak
 * structure (not starting/ending on tonic, no dominant). Returns a signed
 * score; higher is more "sonically viable". Mirrors the Session Musician
 * smart-randomizer rubric with corrected 4th/5th-root-motion handling.
 */
export function scoreProgression(chords: TheoryChord[], key: string, _scaleType: ScaleType = 'major'): number {
  if (chords.length < 2) return 0;

  let score = 0;

  for (let i = 0; i < chords.length - 1; i++) {
    const curr = degreeOf(chords[i].root, key);
    const next = degreeOf(chords[i + 1].root, key);

    // V → I (dominant to tonic)
    if (curr === 7 && next === 0) {
      score += 6;
      if (isDominantType(chords[i].type)) score += 2; // true dominant 7th resolves hardest
    }
    // IV → I (plagal / amen cadence)
    if (curr === 5 && next === 0) score += 4;
    // ii → V (pre-dominant to dominant)
    if (curr === 2 && next === 7) score += 3;

    // Root motion quality (cyclic semitone distance).
    const d = Math.min(Math.abs(curr - next), 12 - Math.abs(curr - next));
    if (d === 5 || d === 7) score += 2; // perfect 4th/5th (circle of fifths)
    else if (d === 1 || d === 2) score += 1; // stepwise (smooth)
    else if (d === 3 || d === 4 || d === 8 || d === 9) score -= 1; // thirds (weaker)
    else if (d === 6) score -= 2; // tritone (aimless)
  }

  // Structural anchors.
  if (degreeOf(chords[0].root, key) === 0) score += 2; // start on tonic
  const lastDegree = degreeOf(chords[chords.length - 1].root, key);
  if (lastDegree === 0) score += 3; // resolve to tonic
  else if (lastDegree === 7) score += 1; // half cadence on V
  if (chords.some((c) => degreeOf(c.root, key) === 7)) score += 1; // dominant present

  // Full cadential confirmation ii → V → I in the final three chords.
  if (chords.length >= 3) {
    const last3 = chords.slice(-3).map((c) => degreeOf(c.root, key));
    if (last3[0] === 2 && last3[1] === 7 && last3[2] === 0) score += 5;
  }

  return score;
}

/**
 * Harmonic energy/density of a progression (Session Musician
 * `getSectionHarmonicEnergy`): reward chord variety, extensions, altered tones.
 * Normalized per chord.
 */
export function progressionEnergy(chords: TheoryChord[]): number {
  if (chords.length === 0) return 0;
  const uniqueDensity = new Set(chords.map((c) => `${c.root}${c.type}`)).size;
  let energy = uniqueDensity * 0.3;
  for (const c of chords) {
    if (/7|9|11|13/.test(c.type)) energy += 1;
    if (/b5|#5|dim/.test(c.type)) energy += 2;
    if (/sus/.test(c.type)) energy += 0.5;
  }
  return energy / chords.length;
}

/**
 * Total voice-leading cost across the progression when voiced with the
 * engine's own voicing picker (0 = perfectly smooth). Cheap for the short
 * progressions the Theory panel generates.
 */
export function progressionVoiceLeading(chords: Array<{ root: string; type: string }>): number {
  let prev: Voicing | null = null;
  let total = 0;
  for (const c of chords) {
    const rootPc = pitchClassOf(c.root);
    const tones = chordTonesForQuality(rootPc, c.type);
    const candidates = generateVoicingCandidates(tones, rootPc, 4);
    const chosen = pickBestVoicing(candidates, prev);
    if (chosen) {
      if (prev) total += voiceLeadingCost(prev.notes, chosen.notes);
      prev = chosen;
    }
  }
  return total;
}

export interface ProgressionMetrics {
  score: number;
  uniqueChords: number;
  startsOnTonic: boolean;
  endsOnTonic: boolean;
  hasDominant: boolean;
  hasCadence: boolean;
  cadences: number;
  avgRootMotion: number;
  rootMotionScore: number;
  voiceLeadingCost: number;
  harmonicEnergy: number;
  inKeyRatio: number;
  longestRepeat: number;
}

/**
 * Full musicality report for a progression. Used by the Theory panel badge and
 * by the sweep tests to make sure the generator keeps producing viable output.
 */
export function progressionMetrics(
  chords: TheoryChord[],
  key: string,
  scaleType: ScaleType = 'major'
): ProgressionMetrics {
  const scale = new Set(getScalePitchClasses(tonicPc(key), scaleType));
  const degrees = chords.map((c) => degreeOf(c.root, key));
  const inKey = chords.filter((c) => scale.has(pitchClassOf(c.root))).length;

  let cadences = 0;
  let motionSum = 0;
  let motionPairs = 0;
  let rootMotionScore = 0;
  for (let i = 0; i < degrees.length - 1; i++) {
    const curr = degrees[i];
    const next = degrees[i + 1];
    if (curr === 7 && next === 0) cadences++;
    else if (curr === 5 && next === 0) cadences++;
    const d = Math.min(Math.abs(curr - next), 12 - Math.abs(curr - next));
    motionSum += d;
    motionPairs++;
    if (d === 5 || d === 7) rootMotionScore += 2;
    else if (d === 1 || d === 2) rootMotionScore += 1;
    else if (d === 3 || d === 4 || d === 8 || d === 9) rootMotionScore -= 1;
    else if (d === 6) rootMotionScore -= 2;
  }

  let longestRepeat = 1;
  let run = 1;
  for (let i = 1; i < chords.length; i++) {
    run = chords[i].root === chords[i - 1].root && chords[i].type === chords[i - 1].type ? run + 1 : 1;
    if (run > longestRepeat) longestRepeat = run;
  }

  return {
    score: scoreProgression(chords, key, scaleType),
    uniqueChords: new Set(chords.map((c) => `${c.root}${c.type}`)).size,
    startsOnTonic: degrees[0] === 0,
    endsOnTonic: degrees[degrees.length - 1] === 0,
    hasDominant: degrees.includes(7),
    hasCadence: cadences > 0,
    cadences,
    avgRootMotion: motionPairs > 0 ? motionSum / motionPairs : 0,
    rootMotionScore,
    voiceLeadingCost: progressionVoiceLeading(chords),
    harmonicEnergy: progressionEnergy(chords),
    inKeyRatio: chords.length > 0 ? inKey / chords.length : 0,
    longestRepeat,
  };
}

/**
 * Minimal sonic-viability gate for a progression:
 *  - at least two distinct chords (not a one-chord vamp),
 *  - mostly diatonic to the key,
 *  - resolves somewhere (a cadence or ending on the tonic),
 *  - no single chord dominating more than half the progression.
 */
export function isSonicallyViable(
  chords: TheoryChord[],
  key: string,
  scaleType: ScaleType = 'major'
): boolean {
  if (chords.length < 2) return false;
  const m = progressionMetrics(chords, key, scaleType);
  if (m.uniqueChords < 2) return false;
  if (m.inKeyRatio < 0.8) return false;
  if (!m.hasCadence && !m.endsOnTonic) return false;
  if (m.longestRepeat > Math.ceil(chords.length / 2)) return false;
  return true;
}
