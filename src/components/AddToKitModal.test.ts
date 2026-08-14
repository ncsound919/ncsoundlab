/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the pure form helpers in `src/components/AddToKitModal.tsx`:
 * `normalizeName`, `parseTags`, and `validateSampleForm`.
 */

import { describe, expect, it } from 'vitest';
import { normalizeName, parseTags, validateSampleForm } from './AddToKitModal';

describe('normalizeName', () => {
  it('converts whitespace runs to single underscores', () => {
    expect(normalizeName('my  sample   name')).toBe('MY_SAMPLE_NAME');
    expect(normalizeName('hello world')).toBe('HELLO_WORLD');
  });

  it('strips characters outside [A-Za-z0-9_#-]', () => {
    expect(normalizeName('Cake!! @#$%')).toBe('CAKE_#');
    // # and - are preserved (part of the safe set), ! and % are stripped.
    expect(normalizeName('snare-fx#1!')).toBe('SNARE-FX#1');
  });

  it('deduplicates underscores and trims leading/trailing ones', () => {
    expect(normalizeName('a___b')).toBe('A_B');
    expect(normalizeName('__kick__')).toBe('KICK');
    expect(normalizeName('  spaced  ')).toBe('SPACED');
  });

  it('uppercases everything', () => {
    expect(normalizeName('kick snare')).toBe('KICK_SNARE');
  });

  it('returns empty string for input with no valid chars', () => {
    expect(normalizeName('!!!')).toBe('');
    expect(normalizeName('')).toBe('');
  });
});

describe('parseTags', () => {
  it('splits, trims, and drops empties', () => {
    expect(parseTags('dark, analog , punchy, , cinematic')).toEqual([
      'dark',
      'analog',
      'punchy',
      'cinematic',
    ]);
  });

  it('deduplicates repeated tags', () => {
    expect(parseTags('dark, dark, punchy, dark')).toEqual(['dark', 'punchy']);
  });

  it('caps the number of tags at 12', () => {
    const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`).join(', ');
    expect(parseTags(tags)).toHaveLength(12);
  });

  it('returns an empty array for empty input', () => {
    expect(parseTags('')).toEqual([]);
    expect(parseTags('   , ,  ')).toEqual([]);
  });
});

describe('validateSampleForm', () => {
  const base = {
    sampleName: 'Kick',
    selectedKitId: 'kit-1',
    newKitTitle: 'My Kit',
    bpm: 120,
    creator: 'Echosmith Sound Lab',
  };

  it('returns no errors for a valid form', () => {
    expect(validateSampleForm(base, [])).toEqual({});
  });

  it('requires a sample name', () => {
    const errors = validateSampleForm({ ...base, sampleName: '' }, []);
    expect(errors.sampleName).toBe('Sample name is required.');
  });

  it('rejects sample names shorter than 3 valid characters', () => {
    // "ab" is only 2 chars; "!" is stripped entirely.
    expect(validateSampleForm({ ...base, sampleName: 'ab' }, []).sampleName).toBe(
      'Use at least 3 valid characters.'
    );
    expect(validateSampleForm({ ...base, sampleName: '!' }, []).sampleName).toBe(
      'Sample name is required.'
    );
  });

  it('requires a new kit title only when creating a new kit', () => {
    expect(validateSampleForm({ ...base, selectedKitId: 'new', newKitTitle: '' }, []).newKitTitle).toBe(
      'New kit title is required.'
    );
    // Existing kit → no newKitTitle error even if blank.
    expect(validateSampleForm({ ...base, selectedKitId: 'kit-1', newKitTitle: '' }, [])).not.toHaveProperty(
      'newKitTitle'
    );
  });

  it('validates the BPM range', () => {
    expect(validateSampleForm({ ...base, bpm: 19 }, []).bpm).toBe('BPM must be between 20 and 300.');
    expect(validateSampleForm({ ...base, bpm: 301 }, []).bpm).toBe('BPM must be between 20 and 300.');
    expect(validateSampleForm({ ...base, bpm: 20 }, [])).not.toHaveProperty('bpm');
    expect(validateSampleForm({ ...base, bpm: 300 }, [])).not.toHaveProperty('bpm');
  });

  it('requires a creator name', () => {
    expect(validateSampleForm({ ...base, creator: '   ' }, []).creator).toBe(
      'Creator name is required.'
    );
  });

  it('flags more than 12 tags', () => {
    const manyTags = Array.from({ length: 13 }, (_, i) => `tag${i}`);
    expect(validateSampleForm(base, manyTags).tags).toBe('Use 12 tags or fewer.');
  });
});