/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/lib/theory/voicing.ts` (ported from Session Musician engine).
 */

import { describe, expect, it } from 'vitest';
import {
  generateVoicingCandidates,
  voiceLeadingCost,
  pickBestVoicing,
  generateBassNote,
} from './voicing';
import { chordTonesForQuality, midi, NOTE_NAMES_SHARP } from './pitch';

describe('generateVoicingCandidates', () => {
  it('builds a Cmaj7 close voicing starting at the target octave', () => {
    const rootPc = 0; // C
    const tones = chordTonesForQuality(rootPc, 'maj7'); // [0,4,7,11]
    const candidates = generateVoicingCandidates(tones, rootPc, 4);
    const close = candidates.find((c) => c.style === 'close');
    expect(close).toBeDefined();
    // C4=60, E4=64, G4=67, B4=71
    expect(close!.notes).toEqual([60, 64, 67, 71]);
  });

  it('generates rootless and spread variants for 4+ tone chords', () => {
    const tones = chordTonesForQuality(9, 'm7'); // A minor7 [9,0,4,7]
    const candidates = generateVoicingCandidates(tones, 9, 4);
    expect(candidates.some((c) => c.style === 'rootless')).toBe(true);
    expect(candidates.some((c) => c.style === 'spread')).toBe(true);
    expect(candidates.some((c) => c.style === 'drop2')).toBe(true);
  });

  it('all candidates are ascending MIDI notes', () => {
    const tones = chordTonesForQuality(2, '9'); // D9
    const candidates = generateVoicingCandidates(tones, 2, 4);
    for (const c of candidates) {
      for (let i = 1; i < c.notes.length; i++) {
        expect(c.notes[i]).toBeGreaterThan(c.notes[i - 1]);
      }
    }
  });
});

describe('voiceLeadingCost', () => {
  it('rewards identical voicings (negative cost from common-tone bonus)', () => {
    // Identical voicings: 0 motion, but +2 per common tone is subtracted, so
    // the cost goes negative — the engine's "smoother is cheaper" convention.
    expect(voiceLeadingCost([60, 64, 67], [60, 64, 67])).toBeLessThan(0);
  });

  it('penalizes large motion more than small motion', () => {
    const small = voiceLeadingCost([60, 64, 67], [62, 65, 69]);
    const large = voiceLeadingCost([60, 64, 67], [48, 52, 55]);
    expect(large).toBeGreaterThan(small);
  });
});

describe('pickBestVoicing', () => {
  it('prefers close voicing when no previous context', () => {
    const tones = chordTonesForQuality(0, 'maj7');
    const candidates = generateVoicingCandidates(tones, 0, 4);
    const chosen = pickBestVoicing(candidates, null);
    expect(chosen?.style).toBe('close');
  });

  it('picks the smoothest candidate from a previous voicing', () => {
    const tones = chordTonesForQuality(0, 'maj7');
    const candidates = generateVoicingCandidates(tones, 0, 4);
    const prev = { notes: [60, 64, 67, 71], style: 'close' as const, rootPc: 0, bassNote: 60 };
    const chosen = pickBestVoicing(candidates, prev);
    expect(chosen).not.toBeNull();
    // The chosen voicing should minimize cost against prev.
    let bestCost = Infinity;
    for (const c of candidates) bestCost = Math.min(bestCost, voiceLeadingCost(prev.notes, c.notes));
    expect(voiceLeadingCost(prev.notes, chosen!.notes)).toBe(bestCost);
  });
});

describe('generateBassNote', () => {
  it('plays the root on the downbeat', () => {
    const b = generateBassNote(0, 5, 'downbeat');
    expect(b.role).toBe('root');
    expect(b.midi).toBe(midi(0, 2)); // C2 = 36
  });

  it('approaches the next root by step when close', () => {
    // F(5) → G(7): a whole-step apart, approach lands on G#/F#-ish step.
    const b = generateBassNote(5, 7, 'approach');
    expect(b.role).toBe('approach');
    expect(Math.abs(b.midi - midi(7, 2))).toBe(1);
  });

  it('uses a fifth when the next root is far', () => {
    const b = generateBassNote(0, 9, 'approach');
    expect(b.role).toBe('fifth');
    expect(b.midi).toBe(midi(7, 2)); // G2
  });

  it('round-trips root names for every pitch class', () => {
    for (let pc = 0; pc < 12; pc++) {
      const tones = chordTonesForQuality(pc, 'maj');
      expect(tones).toContain(pc);
      expect(NOTE_NAMES_SHARP[pc]).toBeTruthy();
    }
  });
});
