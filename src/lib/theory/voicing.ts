/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Copied from the Session Musician music-theory engine (`theory/voicing.ts`).
 * Piano and bass voicing generation, plus the voice-leading cost function
 * that picks the smoothest-connecting voicing from a set of candidates.
 */

import { midi } from './pitch';

export type VoicingStyle = 'close' | 'drop2' | 'drop3' | 'rootless' | 'spread';

export interface Voicing {
  notes: number[]; // MIDI note numbers, low to high
  style: VoicingStyle;
  rootPc: number;
  bassNote: number; // MIDI note actually in the bass (may differ from root for slash chords)
}

/** Build close-position voicing: chord tones stacked in order starting near a target octave. */
function buildClosePosition(chordTonesPc: number[], rootPc: number, targetOctave: number): number[] {
  const rootIdx = chordTonesPc.indexOf(rootPc);
  const ordered = rootIdx >= 0
    ? [...chordTonesPc.slice(rootIdx), ...chordTonesPc.slice(0, rootIdx)]
    : chordTonesPc;

  const notes: number[] = [];
  let lastMidi = midi(ordered[0], targetOctave) - 12;
  for (const pc of ordered) {
    let m = midi(pc, targetOctave);
    while (m <= lastMidi) m += 12;
    notes.push(m);
    lastMidi = m;
  }
  return notes;
}

/** Drop the second-highest voice down an octave — classic 4-part comping voicing. */
function dropVoice(notes: number[], indexFromTop: number): number[] {
  if (notes.length < indexFromTop + 1) return notes;
  const sorted = [...notes].sort((a, b) => a - b);
  const idx = sorted.length - 1 - indexFromTop;
  sorted[idx] -= 12;
  return sorted.sort((a, b) => a - b);
}

/**
 * Rootless voicing (Bill Evans / jazz piano convention): omit the root
 * entirely, since a bass player or left hand covers it.
 */
function buildRootless(chordTonesPc: number[], rootPc: number, targetOctave: number): number[] {
  const withoutRoot = chordTonesPc.filter((pc) => pc !== rootPc);
  if (withoutRoot.length === 0) return buildClosePosition(chordTonesPc, rootPc, targetOctave);
  return buildClosePosition(withoutRoot, withoutRoot[0], targetOctave);
}

/** Spread voicing: wide intervals, root doubled an octave apart, open sound. */
function buildSpread(chordTonesPc: number[], rootPc: number, targetOctave: number): number[] {
  const close = buildClosePosition(chordTonesPc, rootPc, targetOctave);
  if (close.length < 3) return close;
  return close.map((n, i) => (i % 2 === 1 ? n + 12 : n)).sort((a, b) => a - b);
}

/**
 * Generate candidate voicings across all styles for a chord.
 * Caller picks the best via voice-leading cost against the previous voicing.
 */
export function generateVoicingCandidates(
  chordTonesPc: number[],
  rootPc: number,
  targetOctave = 4
): Voicing[] {
  const candidates: Voicing[] = [];

  const close = buildClosePosition(chordTonesPc, rootPc, targetOctave);
  candidates.push({ notes: close, style: 'close', rootPc, bassNote: close[0] });

  if (chordTonesPc.length >= 4) {
    const d2 = dropVoice(close, 1);
    candidates.push({ notes: d2, style: 'drop2', rootPc, bassNote: d2[0] });

    const d3 = dropVoice(close, 2);
    candidates.push({ notes: d3, style: 'drop3', rootPc, bassNote: d3[0] });
  }

  const rootless = buildRootless(chordTonesPc, rootPc, targetOctave);
  candidates.push({ notes: rootless, style: 'rootless', rootPc, bassNote: rootless[0] });

  const spread = buildSpread(chordTonesPc, rootPc, targetOctave);
  candidates.push({ notes: spread, style: 'spread', rootPc, bassNote: spread[0] });

  return candidates;
}

/**
 * Voice-leading cost between two voicings: total absolute semitone motion
 * across paired voices (nearest-neighbor pairing), penalized for voice
 * crossing and for losing common tones. Lower is smoother.
 */
export function voiceLeadingCost(prev: number[], next: number[]): number {
  if (prev.length === 0) return 0;

  const prevSorted = [...prev].sort((a, b) => a - b);
  const nextSorted = [...next].sort((a, b) => a - b);

  const len = Math.max(prevSorted.length, nextSorted.length);
  const pad = (arr: number[]) => {
    const out = [...arr];
    while (out.length < len) out.push(out[out.length - 1]);
    return out;
  };
  const a = pad(prevSorted);
  const b = pad(nextSorted);

  // Assign each voice in `a` (low to high) to its nearest still-unclaimed
  // note in `b`, greedily — preserves voice identity and makes crossing
  // well-defined (a voice's destination landing above a higher voice's).
  const claimed = new Array(len).fill(false);
  const destinations: number[] = [];
  for (let i = 0; i < len; i++) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let j = 0; j < len; j++) {
      if (claimed[j]) continue;
      const dist = Math.abs(a[i] - b[j]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
      }
    }
    claimed[bestIdx] = true;
    destinations.push(b[bestIdx]);
  }

  let totalMotion = 0;
  let commonTones = 0;
  for (let i = 0; i < len; i++) {
    const dist = Math.abs(a[i] - destinations[i]);
    totalMotion += dist;
    if (dist === 0) commonTones++;
  }

  let crossingPenalty = 0;
  for (let i = 0; i < len - 1; i++) {
    if (destinations[i] > destinations[i + 1]) crossingPenalty += 4;
  }

  const commonToneBonus = commonTones * 2;

  return totalMotion + crossingPenalty - commonToneBonus;
}

/** Pick the voicing candidate that voice-leads most smoothly from the previous voicing. */
export function pickBestVoicing(candidates: Voicing[], prevVoicing: Voicing | null): Voicing | null {
  if (candidates.length === 0) return null;
  if (!prevVoicing) {
    return candidates.find((c) => c.style === 'close') ?? candidates[0];
  }
  let best = candidates[0];
  let bestCost = Infinity;
  for (const c of candidates) {
    const cost = voiceLeadingCost(prevVoicing.notes, c.notes);
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return best;
}

// ---- Bass: register-locked, root/5th/passing-tone logic ----

export interface BassNote {
  midi: number;
  role: 'root' | 'fifth' | 'passing' | 'approach';
}

const BASS_OCTAVE = 2; // E2-ish register

/**
 * Generate a simple, register-correct bass note: root on the downbeat, with
 * an optional 5th or approach tone leading into the next chord's root.
 */
export function generateBassNote(
  rootPc: number,
  nextRootPc: number | null,
  beatPosition: 'downbeat' | 'approach'
): BassNote {
  const root = midi(rootPc, BASS_OCTAVE);

  if (beatPosition === 'downbeat' || nextRootPc === null) {
    return { midi: root, role: 'root' };
  }

  const nextRoot = midi(nextRootPc, BASS_OCTAVE);
  const diff = nextRoot - root;

  if (Math.abs(diff) <= 2 && diff !== 0) {
    const approachMidi = nextRoot - Math.sign(diff);
    return { midi: approachMidi, role: 'approach' };
  }

  const fifth = midi((rootPc + 7) % 12, BASS_OCTAVE);
  return { midi: fifth, role: 'fifth' };
}
