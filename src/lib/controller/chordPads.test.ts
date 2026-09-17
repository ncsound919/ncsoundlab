/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  applyInversion,
  applySpread,
  chordPadAt,
  chordPadTiming,
  DEFAULT_CHORD_SETTINGS,
  diatonicQualities,
  noteLabel,
} from './chordPads';

const settings = { ...DEFAULT_CHORD_SETTINGS };

describe('diatonicQualities', () => {
  it('returns roman-numeral-correct triads', () => {
    expect(diatonicQualities('major')).toEqual(['', 'm', 'm', '', '', 'm', 'dim']);
    expect(diatonicQualities('minor')).toEqual(['m', 'dim', '', 'm', 'm', '', '']);
  });

  it('returns 7th qualities when asked', () => {
    expect(diatonicQualities('major', true)).toEqual(['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5']);
  });

  it('handles modes and harmonic minor', () => {
    expect(diatonicQualities('dorian')[1]).toBe('m');
    expect(diatonicQualities('harmonic minor')[2]).toBe('aug');
    expect(diatonicQualities('nonsense')).toEqual(diatonicQualities('major'));
  });
});

describe('applyInversion', () => {
  it('moves the lowest notes up an octave', () => {
    expect(applyInversion([60, 64, 67], 0)).toEqual([60, 64, 67]);
    expect(applyInversion([60, 64, 67], 1)).toEqual([64, 67, 72]);
    expect(applyInversion([60, 64, 67], 9)).toEqual([67, 72, 76]);
  });
});

describe('applySpread', () => {
  it('keeps close voicing below the threshold', () => {
    expect(applySpread([60, 64, 67], 0.4)).toEqual([60, 64, 67]);
  });

  it('opens every second voice above the threshold', () => {
    expect(applySpread([60, 64, 67], 1)).toEqual([60, 67, 76]);
  });
});

describe('chordPadAt', () => {
  it('spells the tonic triad of the key', () => {
    const pad = chordPadAt(settings, 0);
    expect(pad.root).toBe('C');
    expect(pad.quality).toBe('m');
    expect(pad.notes).toEqual([60, 63, 67]);
  });

  it('walks the scale degrees and octaves', () => {
    expect(chordPadAt({ ...settings, scale: 'major' }, 1)).toMatchObject({ root: 'D', quality: 'm', notes: [62, 65, 69] });
    expect(chordPadAt({ ...settings, scale: 'major' }, 7)).toMatchObject({ octaveShift: 1, notes: [72, 76, 79] });
  });

  it('supports 7th chords', () => {
    const pad = chordPadAt({ ...settings, scale: 'major', seventh: true }, 0);
    expect(pad.quality).toBe('maj7');
    expect(pad.notes).toEqual([60, 64, 67, 71]);
  });

  it('transposes for other keys', () => {
    const pad = chordPadAt({ ...settings, key: 'F', scale: 'major' }, 0);
    expect(pad.notes).toEqual([65, 69, 72]);
  });

  it('normalizes out-of-range pad indices', () => {
    expect(chordPadAt(settings, 16)).toEqual(chordPadAt(settings, 0));
    expect(chordPadAt(settings, -1)).toEqual(chordPadAt(settings, 15));
  });
});

describe('chordPadTiming', () => {
  it('offsets each note by the strum time', () => {
    const { notes, offsetsMs } = chordPadTiming({ ...settings, strumMs: 20 }, 0);
    expect(notes).toHaveLength(3);
    expect(offsetsMs).toEqual([0, 20, 40]);
  });

  it('uses zero offsets for block chords', () => {
    expect(chordPadTiming(settings, 0).offsetsMs).toEqual([0, 0, 0]);
  });
});

describe('noteLabel', () => {
  it('format MIDI as note names', () => {
    expect(noteLabel(60)).toBe('C4');
    expect(noteLabel(61)).toBe('C#4');
  });
});
