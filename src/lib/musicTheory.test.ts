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
  voiceChords,
  voicingSmoothness,
  makeProgression,
  progressionChords,
  sophisticateProgression,
  snapProgressionToScale,
  DEFAULT_SCALE_LOCK,
  DEFAULT_SPLIT,
  type KeyboardSplitSettings,
  type ScaleLockSettings,
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

describe('resolveScaleType fallback', () => {
  it('falls back to major for an unknown scale name', () => {
    expect(resolveScaleType('not-a-scale')).toBe('major');
  });
});

describe('voiceChords', () => {
  it('returns one voice set per chord with finite MIDI notes', () => {
    const voiced = voiceChords(
      [
        { root: 'C', type: 'maj7' },
        { root: 'A', type: 'm7' },
        { root: 'F', type: 'maj7' },
      ],
      4,
    );
    expect(voiced).toHaveLength(3);
    for (const v of voiced) {
      expect(Array.isArray(v.notes)).toBe(true);
      expect(v.notes.length).toBeGreaterThan(1);
      for (const n of v.notes) expect(Number.isFinite(n)).toBe(true);
    }
  });

  it('rewards common tones and penalizes distant voicings', () => {
    // Identical voicings keep all common tones → cost is negative (bonus).
    expect(voicingSmoothness([60, 64, 67], [60, 64, 67])).toBeLessThan(0);
    // A full octave displacement costs more than staying put.
    expect(voicingSmoothness([60, 64, 67], [72, 76, 79])).toBeGreaterThan(0);
  });
});

describe('makeProgression', () => {
  it('is deterministic for a given seed and produces the requested bar count', () => {
    const a = makeProgression('C', { scaleType: 'major', bars: 4, seed: 42 });
    const b = makeProgression('C', { scaleType: 'major', bars: 4, seed: 42 });
    expect(a).toHaveLength(4);
    expect(a.map((c) => `${c.root}${c.type}`)).toEqual(b.map((c) => `${c.root}${c.type}`));
  });

  it('supports Monte Carlo trials (>1) and still returns the requested bars', () => {
    const prog = makeProgression('F', { scaleType: 'minor', bars: 8, seed: 7, trials: 4 });
    expect(prog).toHaveLength(8);
  });

  it('progressionChords returns defensive copies', () => {
    const prog = makeProgression('G', { bars: 2, seed: 1 });
    const copy = progressionChords(prog);
    expect(copy).toHaveLength(prog.length);
    expect(copy[0]).not.toBe(prog[0]);
  });
});

describe('sophisticateProgression', () => {
  it('returns a chord list of the same length at every level', () => {
    const prog = makeProgression('C', { bars: 4, seed: 3 });
    for (const level of [0, 1, 2, 3] as const) {
      const out = sophisticateProgression(prog, level);
      expect(out).toHaveLength(prog.length);
    }
  });
});

describe('snapProgressionToScale', () => {
  const lock: ScaleLockSettings = { root: 'C', scaleName: 'major', enabled: true };

  it('is identity when the lock is off', () => {
    const prog = makeProgression('C', { bars: 2, seed: 5 });
    expect(snapProgressionToScale(prog, { ...lock, enabled: false })).toBe(prog);
  });

  it('rewrites out-of-scale roots into the locked scale', () => {
    const prog = [{ root: 'C#', type: 'maj7', duration: 4 }];
    const snapped = snapProgressionToScale(prog, lock);
    expect(snapped[0].root).not.toBe('C#');
    expect(snapped[0].type).toBe('maj7');
  });
});
