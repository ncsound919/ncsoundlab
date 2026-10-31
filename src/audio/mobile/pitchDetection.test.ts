/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  centsBetween,
  detectPitchHz,
  detectRootFromSlices,
  foldToRange,
  hzToNote,
  nearestNoteHz,
  resample,
  tuneToRoot,
  yinPitch,
} from './pitchDetection';
import { noise, silence, tone } from '../../tests/mobileSignals';

const SR = 48000;

describe('yinPitch', () => {
  it('finds a 440 Hz tone', () => {
    const frame = tone(440, 0.05, SR, 0.6);
    const { hz, confidence } = yinPitch(frame, SR);
    expect(hz).toBeGreaterThan(430);
    expect(hz).toBeLessThan(450);
    expect(confidence).toBeGreaterThan(0.8);
  });

  it('finds a low E2', () => {
    const { hz } = yinPitch(tone(82.41, 0.1, SR, 0.6), SR);
    expect(Math.abs(hz - 82.41)).toBeLessThan(2);
  });

  it('reports nothing for silence or noise', () => {
    expect(yinPitch(silence(0.05, SR), SR).hz).toBe(0);
    const { confidence } = yinPitch(noise(0.05, SR, 0.3, 4), SR);
    expect(confidence).toBeLessThan(0.9);
  });
});

describe('detectPitchHz', () => {
  it('analyses several windows and reports a median', () => {
    const estimate = detectPitchHz(tone(220, 0.5, SR, 0.5), SR);
    expect(Math.abs(estimate.hz - 220)).toBeLessThan(4);
    expect(estimate.windows).toBeGreaterThan(1);
    expect(estimate.confidence).toBeGreaterThan(0.5);
  });

  it('handles a slice shorter than one window', () => {
    const estimate = detectPitchHz(tone(500, 0.01, SR, 0.5), SR);
    expect(estimate.hz).toBeGreaterThan(0);
    expect(estimate.windows).toBe(1);
  });

  it('returns zero when nothing is periodic', () => {
    expect(detectPitchHz(noise(0.4, SR, 0.3, 9), SR).hz).toBe(0);
  });
});

describe('notes', () => {
  it('maps A4 and its neighbours', () => {
    expect(hzToNote(440)).toMatchObject({ note: 'A', octave: 4, cents: 0 });
    expect(hzToNote(466.16)).toMatchObject({ note: 'A#', octave: 4 });
    expect(hzToNote(261.63)).toMatchObject({ note: 'C', octave: 4 });
    expect(hzToNote(0)).toMatchObject({ note: '—' });
  });

  it('reports cents away from the note', () => {
    const info = hzToNote(450);
    expect(info.note).toBe('A');
    expect(Math.abs(info.cents)).toBeGreaterThan(30);
    expect(Math.abs(info.cents)).toBeLessThanOrEqual(50);
  });

  it('snaps to the nearest equal-tempered frequency', () => {
    expect(nearestNoteHz(437)).toBeCloseTo(440, 1);
    expect(nearestNoteHz(0)).toBe(0);
  });

  it('measures cents between frequencies', () => {
    expect(centsBetween(440, 880)).toBeCloseTo(1200, 3);
    expect(centsBetween(0, 100)).toBe(0);
  });

  it('folds into a range by octaves', () => {
    expect(foldToRange(30, 55, 880)).toBeCloseTo(60, 5);
    expect(foldToRange(2000, 55, 880)).toBeCloseTo(1000 / 2, 5);
    expect(foldToRange(220, 55, 880)).toBe(220);
  });
});

describe('resample', () => {
  it('doubles pitch when the ratio is 2', () => {
    const source = tone(220, 0.5, SR, 0.5);
    const shifted = resample(source, 2);
    expect(shifted.length).toBe(Math.floor(source.length / 2));
    const estimate = detectPitchHz(shifted, SR);
    expect(Math.abs(estimate.hz - 440)).toBeLessThan(10);
  });

  it('returns a copy for a bad ratio', () => {
    const source = tone(220, 0.05, SR, 0.5);
    const copy = resample(source, 0);
    expect([...copy]).toEqual([...source]);
    expect(copy).not.toBe(source);
  });
});

describe('tuneToRoot', () => {
  it('nudges a flat take onto the root', () => {
    const source = tone(430, 0.5, SR, 0.5);
    const result = tuneToRoot(source, SR, 440);
    expect(result.detectedHz).toBeGreaterThan(425);
    expect(result.cents).toBeGreaterThan(30);
    expect(result.cents).toBeLessThan(50);
    expect(result.clamped).toBe(false);
    expect(Math.abs(detectPitchHz(result.samples, SR).hz - 440)).toBeLessThan(5);
  });

  it('clamps a transposition that would change the sound', () => {
    const result = tuneToRoot(tone(300, 0.5, SR, 0.5), SR, 440, { maxCents: 200 });
    expect(result.cents).toBe(200);
    expect(result.clamped).toBe(true);
  });

  it('passes through when no pitch or no root is available', () => {
    const silent = silence(0.2, SR);
    const result = tuneToRoot(silent, SR, 440);
    expect(result.ratio).toBe(1);
    expect(result.detectedHz).toBe(0);
    expect([...result.samples]).toEqual([...silent]);
    const noRoot = tuneToRoot(tone(220, 0.2, SR, 0.5), SR, 0);
    expect(noRoot.ratio).toBe(1);
  });

  it('honours a supplied detection instead of re-analysing', () => {
    // An octave of correction only happens when the caller widens the clamp.
    const result = tuneToRoot(tone(220, 0.3, SR, 0.5), SR, 220, {
      detectedHz: 440,
      maxCents: 1200,
    });
    expect(result.ratio).toBeCloseTo(0.5, 3);
    expect(result.cents).toBeCloseTo(-1200, 1);
  });
});

describe('detectRootFromSlices', () => {
  it('takes the median of confident slice pitches', () => {
    const root = detectRootFromSlices(
      [tone(110, 0.3, SR, 0.5), tone(110, 0.3, SR, 0.4), tone(220, 0.3, SR, 0.3)],
      SR
    );
    expect(root.hz).toBeCloseTo(110, 1);
    expect(root.confidence).toBeGreaterThan(0.5);
    expect(root.perSlice).toHaveLength(3);
  });

  it('returns zero when nothing is pitched', () => {
    const root = detectRootFromSlices([noise(0.3, SR, 0.2, 2)], SR);
    expect(root.hz).toBe(0);
    expect(root.confidence).toBe(0);
  });
});
