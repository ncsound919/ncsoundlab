/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Copied/adapted from the Session Musician music-theory engine
 * (`sophisticationEngine.ts`). Applies a "sophistication level" to a chord
 * progression: upgrades plain chords to 7ths/9ths, inserts borrowed chords,
 * tritone subs, and cadential color at level 1–3. Deterministic — same input
 * always yields the same output.
 */

import { NOTE_MAP, SEMITONE_NAMES, getScalePitchClasses } from './pitch';
import type { TheoryChord } from './progression';

export type SophisticationLevel = 0 | 1 | 2 | 3;

export interface HarmonicContext {
  positionInSection: number;
  isTurnaround: boolean;
  isCadence: boolean;
  isPreChorus: boolean;
  functionalRole: 'T' | 'PD' | 'D';
  precedingChord: TheoryChord | null;
  followingChord: TheoryChord | null;
}

interface SophisticationRule {
  id: string;
  label: string;
  minLevel: SophisticationLevel;
  priority: number;
  appliesAt: (ctx: HarmonicContext) => boolean;
  transform: (chord: TheoryChord, ctx: HarmonicContext) => TheoryChord;
}

/** Transpose a chord's root by `semitones` (wraps to a sharp note name). */
export function transposeChord(chord: TheoryChord, semitones: number): TheoryChord {
  const pc = (NOTE_MAP[chord.root] ?? 0) + semitones;
  return { ...chord, root: SEMITONE_NAMES[((pc % 12) + 12) % 12] };
}

/** Root note of the `degree`-th scale degree (1-indexed) of a key. */
export function getScaleDegreeRoot(keyRoot: string, degree: number, isMinor: boolean): string {
  const scale = getScalePitchClasses(NOTE_MAP[keyRoot] ?? 0, isMinor ? 'natural_minor' : 'major');
  const idx = ((degree - 1) % 7 + 7) % 7;
  const pc = scale[idx] ?? 0;
  return SEMITONE_NAMES[pc];
}

const RULES: SophisticationRule[] = [
  {
    id: 'added-9-tonic-return',
    label: 'Added-9 on tonic return',
    minLevel: 1,
    priority: 0,
    appliesAt: (ctx) => ctx.functionalRole === 'T' && ctx.isCadence,
    transform: (chord) => ({ ...chord, type: chord.type.includes('min') ? 'm9' : 'maj9' }),
  },
  {
    id: 'secondary-dominant-prechorus-lift',
    label: 'Secondary dominant lift',
    minLevel: 2,
    priority: 10,
    appliesAt: (ctx) => ctx.isPreChorus && ctx.followingChord !== null,
    transform: (chord, ctx) => {
      const target = ctx.followingChord!.root;
      const domRoot = getScaleDegreeRoot(target, 5, false);
      return { ...chord, root: domRoot, type: '7' };
    },
  },
  {
    id: 'jazz-2-5-1',
    label: 'Jazz ii-V-I substitution',
    minLevel: 2,
    priority: 0,
    appliesAt: (ctx) => ctx.functionalRole === 'PD' && ctx.followingChord !== null && ctx.followingChord.type.includes('7'),
    transform: (chord) => ({ ...chord, type: 'm7' }),
  },
  {
    id: 'sus4-color',
    label: 'Sus4 color on tonic',
    minLevel: 2,
    priority: 0,
    appliesAt: (ctx) => ctx.functionalRole === 'T' && !ctx.isTurnaround && ctx.positionInSection > 0.1,
    transform: (chord) => (chord.type === 'maj' || chord.type === 'maj7' || chord.type === '') ? { ...chord, type: 'sus4' } : chord,
  },
  {
    id: 'lydian-color',
    label: 'maj7#11 lydian color',
    minLevel: 2,
    priority: 0,
    appliesAt: (ctx) => ctx.functionalRole === 'T' && ctx.positionInSection > 0.3 && ctx.positionInSection < 0.8,
    transform: (chord) => (chord.type === 'maj7' || chord.type === 'maj9') ? { ...chord, type: 'maj7#11' } : chord,
  },
  {
    id: 'altered-dominant',
    label: 'Altered dominant on V7',
    minLevel: 3,
    priority: 5,
    appliesAt: (ctx) => ctx.functionalRole === 'D' && ctx.isTurnaround,
    transform: (chord) => (chord.type === '7' || chord.type === '9' || chord.type === '13') ? { ...chord, type: '7alt' } : chord,
  },
  {
    id: 'tritone-sub',
    label: 'Tritone substitution (bII7)',
    minLevel: 3,
    priority: 0,
    appliesAt: (ctx) => ctx.functionalRole === 'D' && ctx.isTurnaround,
    transform: (chord) => transposeChord({ ...chord, type: '7' }, 6),
  },
  {
    id: 'dim-pass',
    label: 'Diminished passing chord',
    minLevel: 2,
    priority: 0,
    appliesAt: (ctx) => !ctx.isTurnaround && ctx.positionInSection > 0 && Math.round(ctx.positionInSection * 10) % 3 === 0,
    transform: (chord) => ({ ...chord, type: 'dim7' }),
  },
];

function inferRole(chord: TheoryChord, idx: number): HarmonicContext['functionalRole'] {
  if (idx === 0) return 'T';
  if (/^(7|9|13|7b9|7#9|7alt|7b5|7#5|13b9|7#11|dim|dim7)$/.test(chord.type)) return 'D';
  if (/^(maj|maj7|maj9|maj13|maj7#11|6|6\/9)$/.test(chord.type)) return 'T';
  return 'PD';
}

/**
 * Upgrade a chord progression by a sophistication level.
 * 0 = unchanged; 1 = subtle 9ths on cadences; 2 = secondary dominants,
 * sus4/lydian color, jazz ii-V; 3 = tritone subs, altered dominants, passes.
 */
export function applySophistication(chords: TheoryChord[], level: SophisticationLevel): TheoryChord[] {
  if (level === 0) return chords;

  return chords.map((chord, idx) => {
    const ctx: HarmonicContext = {
      positionInSection: chords.length > 1 ? idx / (chords.length - 1) : 0,
      isTurnaround: idx >= chords.length - 2,
      isCadence: /7$/.test(chord.type) || chord.type === 'maj' || chord.type === 'm',
      isPreChorus: idx > 0 && idx < chords.length / 2,
      functionalRole: inferRole(chord, idx),
      precedingChord: idx > 0 ? chords[idx - 1] : null,
      followingChord: idx < chords.length - 1 ? chords[idx + 1] : null,
    };

    const rule = RULES
      .filter((r) => r.minLevel <= level && r.appliesAt(ctx))
      .sort((a, b) => (b.minLevel - a.minLevel) || (b.priority - a.priority))[0];

    return rule ? rule.transform(chord, ctx) : chord;
  });
}

export { RULES };
