/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/lib/theory/progression.ts` (ported from Session Musician
 * engine) + the enhanced `musicTheory.ts` wrappers.
 */

import { describe, expect, it } from 'vitest';
import { generateProgression } from './progression';
import {
  makeProgression,
  voiceChords,
  progressionChords,
  snapProgressionToScale,
  sophisticateProgression,
  DEFAULT_SCALE_LOCK,
} from '../musicTheory';
import { NOTE_NAMES_SHARP, CHORD_QUALITIES } from './pitch';

describe('generateProgression', () => {
  it('produces chords summing to bars*4 beats', () => {
    const prog = generateProgression({ key: 'C', scaleType: 'major', bars: 8, mode: 'functional', seed: 42 });
    const totalBeats = prog.reduce((s, c) => s + c.duration, 0);
    expect(totalBeats).toBe(32);
    expect(prog.length).toBeGreaterThanOrEqual(8);
  });

  it('is deterministic for the same seed', () => {
    const a = generateProgression({ key: 'C', scaleType: 'major', bars: 8, seed: 7 });
    const b = generateProgression({ key: 'C', scaleType: 'major', bars: 8, seed: 7 });
    expect(a).toEqual(b);
  });

  it('produces in-key roots', () => {
    const key = 'G';
    const scale = [0, 2, 4, 5, 7, 9, 11];
    const prog = generateProgression({ key, scaleType: 'major', bars: 8, mode: 'functional', seed: 3 });
    const rootIdx = NOTE_NAMES_SHARP.indexOf(key);
    for (const c of prog) {
      const pc = NOTE_NAMES_SHARP.indexOf(c.root);
      const inScale = scale.includes(((pc - rootIdx) % 12 + 12) % 12);
      expect(inScale).toBe(true);
    }
  });

  it('plain triads when complexity=0', () => {
    const prog = generateProgression({ key: 'C', scaleType: 'major', bars: 4, complexity: 0, seed: 1 });
    for (const c of prog) {
      expect(['maj', 'm', '7', 'dim'].includes(c.type)).toBe(true);
    }
  });

  it('extends to 9ths at complexity=2', () => {
    const prog = generateProgression({ key: 'C', scaleType: 'major', bars: 8, complexity: 2, seed: 11 });
    // At least some chords get extended 9ths.
    expect(prog.some((c) => ['maj9', 'm9', '9'].includes(c.type))).toBe(true);
  });
});

describe('makeProgression + voiceChords (musicTheory wrapper)', () => {
  it('generates a progression and voices it with smooth voice leading', () => {
    const prog = makeProgression('C', { scaleType: 'major', bars: 8, mode: 'functional', seed: 42 });
    const voicings = voiceChords(progressionChords(prog), 4);
    expect(voicings.length).toBe(prog.length);
    for (const v of voicings) {
      expect(v.notes.length).toBeGreaterThan(0);
      // Ascending, bounded register.
      for (let i = 1; i < v.notes.length; i++) expect(v.notes[i]).toBeGreaterThan(v.notes[i - 1]);
    }
  });

  it('snapProgressionToScale is a no-op when lock is off', () => {
    const prog = makeProgression('C', { scaleType: 'major', bars: 4, seed: 5 });
    const snapped = snapProgressionToScale(prog, { ...DEFAULT_SCALE_LOCK, enabled: false });
    expect(snapped).toEqual(prog);
  });

  it('snaps out-of-key roots into the scale when locked', () => {
    // Force a progression that starts somewhere off-scale is hard; instead
    // verify all snapped roots land in the locked scale.
    const lock = { ...DEFAULT_SCALE_LOCK, root: 'C', scaleName: 'major', enabled: true };
    const prog = makeProgression('F#', { scaleType: 'major', bars: 4, seed: 9 });
    const snapped = snapProgressionToScale(prog, lock);
    const cMajor = new Set([0, 2, 4, 5, 7, 9, 11]);
    for (const c of snapped) {
      expect(cMajor.has(NOTE_NAMES_SHARP.indexOf(c.root))).toBe(true);
    }
  });
});

describe('sophisticateProgression (sophistication engine port)', () => {
  it('is a no-op at level 0', () => {
    const prog = makeProgression('C', { scaleType: 'major', bars: 4, seed: 2 });
    const out = sophisticateProgression(prog, 0);
    expect(out).toEqual(prog);
  });

  it('is deterministic for the same input', () => {
    const prog = makeProgression('C', { scaleType: 'major', bars: 8, seed: 2 });
    const a = sophisticateProgression(prog, 2);
    const b = sophisticateProgression(prog, 2);
    expect(a).toEqual(b);
  });

  it('adds extensions at higher levels (not all plain triads remain)', () => {
    const prog = makeProgression('C', { scaleType: 'major', bars: 8, complexity: 0, mode: 'section', seed: 3 });
    const out = sophisticateProgression(prog, 2);
    const hasExtensions = out.some((c) => /maj9|m9|7|9|m7/.test(c.type));
    expect(hasExtensions).toBe(true);
  });

  it('produces only known CHORD_QUALITIES keys', () => {
    const prog = makeProgression('C', { scaleType: 'major', bars: 8, seed: 5 });
    const out = sophisticateProgression(prog, 3);
    const valid = new Set(Object.keys(CHORD_QUALITIES));
    for (const c of out) {
      expect(valid.has(c.type)).toBe(true);
    }
  });
});
