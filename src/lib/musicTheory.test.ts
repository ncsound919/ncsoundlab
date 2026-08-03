/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/lib/musicTheory.ts` (Phase 6.2) — built on the Session
 * Musician music-theory engine primitives (`theory/pitch.ts`).
 */

import { describe, expect, it } from 'vitest';
import {
  scalePitchClasses,
  snapToScale,
  chordFromRoot,
  resolveSplit,
  resolveScaleType,
  DEFAULT_SCALE_LOCK,
  DEFAULT_CHORD_MODE,
  DEFAULT_SPLIT,
  type KeyboardSplitSettings,
} from './musicTheory';

describe('scalePitchClasses', () => {
  it('returns C major pitch classes {0,2,4,5,7,9,11}', () => {
    const s = scalePitchClasses('C', 'major');
    expect(s.has(0)).toBe(true); // C
    expect(s.has(2)).toBe(true); // D
    expect(s.has(4)).toBe(true); // E
    expect(s.has(5)).toBe(true); // F
    expect(s.has(7)).toBe(true); // G
    expect(s.has(9)).toBe(true); // A
    expect(s.has(11)).toBe(true); // B
    expect(s.size).toBe(7);
  });

  it('handles a sharp root (F# major = 6 sharps)', () => {
    const s = scalePitchClasses('F#', 'major');
    expect(s.has(6)).toBe(true); // F#
    expect(s.size).toBe(7);
  });

  it('resolves friendly aliases like minor → natural_minor', () => {
    expect(resolveScaleType('minor')).toBe('natural_minor');
    expect(resolveScaleType('Major')).toBe('major');
  });
});

describe('snapToScale', () => {
  const lock = { ...DEFAULT_SCALE_LOCK, root: 'C', scaleName: 'major', enabled: true };

  it('passes through notes already in scale', () => {
    expect(snapToScale(60, lock)).toBe(60); // C4
    expect(snapToScale(64, lock)).toBe(64); // E4
  });

  it('snaps out-of-scale notes to the nearest in-scale pitch class', () => {
    expect(snapToScale(61, lock)).toBe(60); // C# → C
    expect(snapToScale(63, lock)).toBe(62); // D# → D
  });

  it('is disabled (identity) when lock is off', () => {
    const off = { ...DEFAULT_SCALE_LOCK, enabled: false };
    expect(snapToScale(61, off)).toBe(61);
  });

  it('snaps across octave boundaries consistently', () => {
    expect(snapToScale(72 + 1, lock)).toBe(72 + 0); // C6 + 1 → C6
  });
});

describe('chordFromRoot', () => {
  it('builds a C major triad from quality ""', () => {
    const chord = chordFromRoot(60, { ...DEFAULT_SCALE_LOCK, enabled: false }, '');
    expect(chord).toContain(60); // C
    expect(chord).toContain(64); // E
    expect(chord).toContain(67); // G
  });

  it('builds a C major 7 from quality "maj7"', () => {
    const chord = chordFromRoot(60, { ...DEFAULT_SCALE_LOCK, enabled: false }, 'maj7');
    expect(chord).toEqual([60, 64, 67, 71]);
  });

  it('snaps chord tones into the locked scale (C major → in-key)', () => {
    // A minor triad rooted at A(57) with C-major lock stays [57,60,64].
    const chord = chordFromRoot(57, { ...DEFAULT_SCALE_LOCK, root: 'C', scaleName: 'major', enabled: true }, 'm');
    expect(chord).toEqual([57, 60, 64]);
  });
});

describe('resolveSplit', () => {
  const split: KeyboardSplitSettings = {
    ...DEFAULT_SPLIT,
    enabled: true,
    splitNote: 60,
    lowerLayerId: 'bass',
    upperLayerId: 'lead',
  };

  it('routes below split to lower, at/above to upper', () => {
    expect(resolveSplit(48, split)).toBe('lower');
    expect(resolveSplit(59, split)).toBe('lower');
    expect(resolveSplit(60, split)).toBe('upper');
    expect(resolveSplit(72, split)).toBe('upper');
  });

  it('returns null when disabled or no layers assigned', () => {
    expect(resolveSplit(72, { ...split, enabled: false })).toBe(null);
    expect(resolveSplit(72, { ...split, lowerLayerId: null, upperLayerId: null })).toBe(null);
  });
});
