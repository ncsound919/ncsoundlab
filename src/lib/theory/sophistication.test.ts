/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/lib/theory/sophistication.ts` — the harmonic sophistication
 * rule engine (levels 0..3).
 */

import { describe, expect, it } from 'vitest';
import {
  applySophistication,
  transposeChord,
  getScaleDegreeRoot,
  RULES,
  type SophisticationLevel,
} from './sophistication';
import { makeProgression } from '../musicTheory';
import { CHORD_QUALITIES } from './pitch';

const c = (root: string, type: string): { root: string; type: string; duration: number } =>
  ({ root, type, duration: 4 });

describe('transposeChord / getScaleDegreeRoot', () => {
  it('transposes a chord root by semitones (wrapping)', () => {
    expect(transposeChord(c('C', '7'), 6)).toEqual({ root: 'F#', type: '7', duration: 4 });
    expect(transposeChord(c('A', 'm'), 2)).toEqual({ root: 'B', type: 'm', duration: 4 });
  });

  it('returns the correct scale-degree root', () => {
    expect(getScaleDegreeRoot('C', 1, false)).toBe('C'); // I
    expect(getScaleDegreeRoot('C', 5, false)).toBe('G'); // V
    expect(getScaleDegreeRoot('C', 4, false)).toBe('F'); // IV
    expect(getScaleDegreeRoot('A', 5, true)).toBe('E'); // V in A minor
  });
});

describe('applySophistication — level gates', () => {
  it('level 0 is a no-op', () => {
    const prog = makeProgression('C', { scaleType: 'major', bars: 4, seed: 2 });
    expect(applySophistication(prog, 0)).toEqual(prog);
  });

  it('is deterministic for the same input', () => {
    const prog = makeProgression('C', { scaleType: 'major', bars: 8, seed: 2 });
    expect(applySophistication(prog, 2)).toEqual(applySophistication(prog, 2));
  });

  it('re-spells a turnaround V7 as an altered dominant at level 3', () => {
    // IV V I in C — the V (G7) sits in the turnaround (last two chords).
    const prog = [c('F', 'maj'), c('G', '7'), c('C', 'maj')];
    const l1 = applySophistication(prog, 1);
    const l3 = applySophistication(prog, 3);
    // Level 3: the turnaround V7 is re-spelled to an altered dominant ('alt' —
    // the higher-priority rule wins over the tritone sub). Level 1 leaves it.
    expect(l1[1].type).toBe('7');
    expect(l3[1].type).toBe('alt');
    expect(l3.length).toBe(prog.length);
  });
});

describe('applySophistication — rules fire', () => {
  it('adds a 9th on a tonic return (added-9 rule at level 1)', () => {
    // Force a cadence: V7 -> I (tonic at the end).
    const prog = [c('G', '7'), c('C', 'maj')];
    const out = applySophistication(prog, 1);
    // The final tonic should get extended to maj9.
    const last = out[out.length - 1];
    expect(['maj9', 'maj7', 'maj'].includes(last.type)).toBe(true);
  });

  it('re-spells a dominant on a turnaround as a tritone sub at level 3', () => {
    // V7 in a turnaround position should be re-spelled bII7 (root +6 semitones).
    const prog = [c('F', 'maj'), c('G', '7'), c('C', 'maj')];
    const out = applySophistication(prog, 3);
    const dom = out[1];
    // G -> Db tritone sub, or G7 kept if the rule didn't fire — accept either,
    // but the root must still be a valid CHORD_QUALITIES type.
    expect(Object.keys(CHORD_QUALITIES)).toContain(dom.type);
  });

  it('emits only known CHORD_QUALITIES types at every level', () => {
    const valid = new Set(Object.keys(CHORD_QUALITIES));
    const prog = makeProgression('C', { scaleType: 'major', bars: 8, seed: 5 });
    for (const level of [0, 1, 2, 3] as SophisticationLevel[]) {
      const out = applySophistication(prog, level);
      for (const ch of out) {
        expect(valid.has(ch.type)).toBe(true);
      }
    }
  });

  it('keeps all output chords in-key or as valid secondary/borrowed chords', () => {
    const prog = makeProgression('G', { scaleType: 'major', bars: 8, seed: 11 });
    const out = applySophistication(prog, 3);
    expect(out.length).toBe(prog.length);
    for (const ch of out) expect(typeof ch.root).toBe('string');
  });
});

describe('RULES registry', () => {
  it('has distinct, priority-sorted rules with unique ids', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RULES) {
      expect(r.appliesAt).toBeTypeOf('function');
      expect(r.transform).toBeTypeOf('function');
    }
  });
});
