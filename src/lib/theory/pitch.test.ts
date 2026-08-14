/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/lib/theory/pitch.ts` — the pitch/scale/chord-quality
 * primitives the whole music-theory engine is built on.
 */

import { describe, expect, it } from 'vitest';
import {
  NOTE_NAMES_SHARP,
  NOTE_NAMES_FLAT,
  KEYS,
  pitchClassOf,
  noteName,
  midi,
  midiToPitchClass,
  midiToOctave,
  midiToNoteName,
  midiToFreq,
  noteToMidi,
  transposePitchClass,
  pitchClassDistance,
  getScalePitchClasses,
  isDiatonicToKey,
  chordTonesForQuality,
  essentialChordTonesForQuality,
  isDominantQuality,
  isMajorQuality,
  isMinorQuality,
  chordTonesAsMidi,
  type ScaleType,
} from './pitch';

describe('note naming & parsing', () => {
  it('has 12 chromatic names in both conventions', () => {
    expect(NOTE_NAMES_SHARP).toHaveLength(12);
    expect(NOTE_NAMES_FLAT).toHaveLength(12);
    expect(KEYS).toHaveLength(12);
    expect(new Set(KEYS).size).toBe(12);
  });

  it('parses natural, sharp, and flat note names to pitch classes', () => {
    expect(pitchClassOf('C')).toBe(0);
    expect(pitchClassOf('F#')).toBe(6);
    expect(pitchClassOf('Bb')).toBe(10);
    expect(pitchClassOf('E')).toBe(4);
  });

  it('strips octave digits from note names', () => {
    expect(pitchClassOf('C#4')).toBe(1);
    expect(pitchClassOf('Eb3')).toBe(3);
  });

  it('throws on unknown note names', () => {
    expect(() => pitchClassOf('H')).toThrow();
  });

  it('round-trips MIDI numbers and note names', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('C3')).toBe(48);
    expect(noteToMidi('C#3')).toBe(49);
    expect(midiToNoteName(60)).toBe('C4');
    expect(midiToNoteName(69)).toBe('A4');
    expect(midiToFreq(69)).toBeCloseTo(440, 6);
  });

  it('converts pitch class/octave to MIDI and back', () => {
    expect(midi(0, 4)).toBe(60);
    expect(midi(9, 4)).toBe(69);
    expect(midiToPitchClass(60)).toBe(0);
    expect(midiToOctave(60)).toBe(4);
  });
});

describe('transposition & distance', () => {
  it('transposes pitch classes with wraparound', () => {
    expect(transposePitchClass(9, 4)).toBe(1); // A + 4 = C#
    expect(transposePitchClass(0, -2)).toBe(10); // C - 2 = Bb
  });

  it('computes directed pitch-class distance', () => {
    expect(pitchClassDistance(0, 7)).toBe(7); // C -> G
    expect(pitchClassDistance(7, 0)).toBe(5); // G -> C
    expect(pitchClassDistance(0, 0)).toBe(0);
  });
});

describe('scales', () => {
  it('returns the 7 C-major pitch classes', () => {
    expect(getScalePitchClasses(0, 'major')).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it('shifts with the key root', () => {
    expect(getScalePitchClasses(2, 'major')).toEqual([2, 4, 6, 7, 9, 11, 1]);
  });

  it('covers every scale type with 7 notes and no duplicates', () => {
    const types: ScaleType[] = [
      'major', 'natural_minor', 'harmonic_minor', 'melodic_minor',
      'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian',
    ];
    for (const t of types) {
      const pcs = getScalePitchClasses(0, t);
      expect(pcs).toHaveLength(7);
      expect(new Set(pcs).size).toBe(7);
    }
  });

  it('modal fingerprints are distinct (dorian b3/b7, lydian #4)', () => {
    expect(getScalePitchClasses(0, 'dorian')).toContain(3); // b3
    expect(getScalePitchClasses(0, 'lydian')).toContain(6); // #4
    expect(getScalePitchClasses(0, 'locrian')).toContain(6); // b5
  });

  it('isDiatonicToKey works', () => {
    expect(isDiatonicToKey(0, 0, 'major')).toBe(true); // C in C
    expect(isDiatonicToKey(1, 0, 'major')).toBe(false); // C# not in C
    expect(isDiatonicToKey(7, 0, 'major')).toBe(true); // G in C
  });
});

describe('chord qualities', () => {
  it('computes chord tones for common qualities', () => {
    expect(chordTonesForQuality(0, '')).toEqual([0, 4, 7]); // major
    expect(chordTonesForQuality(0, 'm')).toEqual([0, 3, 7]); // minor
    expect(chordTonesForQuality(0, 'maj7')).toEqual([0, 4, 7, 11]);
    expect(chordTonesForQuality(0, '7')).toEqual([0, 4, 7, 10]);
    expect(chordTonesForQuality(0, 'm7b5')).toEqual([0, 3, 6, 10]);
  });

  it('falls back to a major triad for unknown qualities', () => {
    expect(chordTonesForQuality(0, 'not-a-quality')).toEqual([0, 4, 7]);
  });

  it('essential tones are a subset of the chord tones', () => {
    const tones = chordTonesForQuality(0, '9');
    const essential = essentialChordTonesForQuality(0, '9');
    for (const e of essential) expect(tones).toContain(e);
    expect(essential.length).toBeGreaterThanOrEqual(3);
  });

  it('renders chord tones in MIDI across the octave', () => {
    const m = chordTonesAsMidi(0, 'maj7', 4);
    expect(m).toEqual([60, 64, 67, 71]);
  });
});

describe('quality predicates', () => {
  it('classifies dominant qualities', () => {
    for (const q of ['7', '9', '13', '7b9', '7#9', 'alt', '7sus4']) {
      expect(isDominantQuality(q)).toBe(true);
    }
    expect(isDominantQuality('maj7')).toBe(false);
  });

  it('classifies major and minor qualities', () => {
    expect(isMajorQuality('maj7')).toBe(true);
    expect(isMajorQuality('add9')).toBe(true);
    expect(isMinorQuality('m9')).toBe(true);
    expect(isMinorQuality('dim7')).toBe(true);
    expect(isMajorQuality('m7')).toBe(false);
    expect(isMinorQuality('maj7')).toBe(false);
  });
});

describe('noteName', () => {
  it('prefers flat or sharp spellings', () => {
    expect(noteName(1)).toBe('Db'); // default preferFlat
    expect(noteName(1, false)).toBe('C#');
    expect(noteName(6)).toBe('Gb');
    expect(noteName(6, false)).toBe('F#');
  });
});
