/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  FIELD_META_FORMAT,
  buildFieldMeta,
  coverArtParams,
  describeFieldMeta,
  formatTakeName,
  hashString,
  seedCoverArt,
  takeSeed,
  withGenome,
} from './fieldMeta';

describe('seedCoverArt', () => {
  it('is a place slug plus the calendar day', () => {
    expect(seedCoverArt('Biscayne Bay', '2026-10-27T14:05:00Z')).toBe('biscayne-bay_20261027');
  });

  it('handles an empty place and a missing date', () => {
    expect(seedCoverArt('', '')).toBe('unknown_nodate');
    expect(seedCoverArt('!!', '2026-01-02')).toBe('unknown_20260102');
  });
});

describe('hashString / takeSeed', () => {
  it('is stable and well distributed enough to differ by id', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(takeSeed('1', 'here', '2026-01-01T00:00:00Z')).toBe(
      takeSeed('1', 'here', '2026-01-01T00:00:00Z')
    );
    expect(takeSeed('1', 'here', 'x')).not.toBe(takeSeed('2', 'here', 'x'));
  });
});

describe('coverArtParams', () => {
  it('is deterministic for a seed', () => {
    expect(coverArtParams('biscayne-bay_20261027')).toEqual(coverArtParams('biscayne-bay_20261027'));
  });

  it('differs between seeds', () => {
    expect(coverArtParams('a_1')).not.toEqual(coverArtParams('b_2'));
  });

  it('produces three hex colours and sane numbers', () => {
    const art = coverArtParams('miami_20260101', '2026-01-01T03:00:00Z');
    expect(art.palette).toHaveLength(3);
    for (const colour of art.palette) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
    expect(art.bands).toBeGreaterThanOrEqual(3);
    expect(art.bands).toBeLessThan(10);
    expect(art.saturation).toBeGreaterThan(0);
    expect(art.saturation).toBeLessThanOrEqual(1);
    expect(art.lightness).toBeGreaterThan(0);
    expect(art.lightness).toBeLessThanOrEqual(0.6);
  });

  it('gives a night take a deeper cover than a dawn take at the same place', () => {
    const dawn = coverArtParams('miami_20260101', '2026-01-01T05:00:00Z');
    const night = coverArtParams('miami_20260101', '2026-01-01T23:00:00Z');
    // Deep = dark = lower lightness.
    expect(night.lightness).toBeLessThan(dawn.lightness);
  });

  it('copes without a timestamp', () => {
    expect(coverArtParams('x_1', '').bands).toBeGreaterThan(0);
  });
});

describe('makeTakeName / buildFieldMeta', () => {
  it('builds a readable take name', () => {
    expect(formatTakeName('Biscayne Bay', '2026-10-27T14:05:00Z')).toBe('Biscayne Bay 20261027-1405 #1');
    expect(formatTakeName('Biscayne Bay', '2026-10-27T14:05:00Z', 3)).toBe('Biscayne Bay 20261027-1405 #3');
    // No timestamp, no empty stamp segment.
    expect(formatTakeName('', '')).toBe('field #1');
    expect(formatTakeName('Pier', '2026-02-02')).toBe('Pier 20260202 #1');
  });

  it('fills in every derived field', () => {
    const meta = buildFieldMeta({
      id: 'take-1',
      place: 'Biscayne Bay',
      timeISO: '2026-10-27T14:05:00Z',
      sampleRateHz: 48000,
      durationSec: 12.5,
    });
    expect(meta.format).toBe(FIELD_META_FORMAT);
    expect(meta.name).toBe('Biscayne Bay 20261027-1405 #1');
    expect(meta.coverArtSeed).toBe('biscayne-bay_20261027');
    expect(meta.seed).toBe(takeSeed('take-1', 'Biscayne Bay', '2026-10-27T14:05:00Z'));
    expect(meta.genomeIds).toEqual([]);
    expect(meta.tags).toEqual([]);
  });

  it('accepts explicit overrides', () => {
    const meta = buildFieldMeta({
      id: 'take-2',
      place: 'Pier',
      timeISO: '2026-02-02T01:00:00Z',
      name: 'Pier metal clang',
      sampleRateHz: 44100,
      tags: ['metal', 'one-shot'],
      rootHz: 165.2,
      device: '44.1 kHz · mono · 32-bit float · UNPROCESSED',
    });
    expect(meta.name).toBe('Pier metal clang');
    expect(meta.tags).toEqual(['metal', 'one-shot']);
    expect(meta.rootHz).toBe(165.2);
  });
});

describe('withGenome', () => {
  it('appends a variant once', () => {
    const meta = buildFieldMeta({ id: 't', place: 'x', timeISO: '2026-01-01T00:00:00Z', sampleRateHz: 48000 });
    const once = withGenome(meta, 'g-1');
    const twice = withGenome(once, 'g-1');
    expect(once.genomeIds).toEqual(['g-1']);
    expect(twice).toBe(once);
    expect(withGenome(once, 'g-2').genomeIds).toEqual(['g-1', 'g-2']);
  });
});

describe('describeFieldMeta', () => {
  it('summarises the take', () => {
    const meta = withGenome(
      buildFieldMeta({
        id: 't',
        place: 'Pier',
        timeISO: '2026-01-01T00:00:00Z',
        sampleRateHz: 48000,
        durationSec: 3.25,
        rootHz: 110,
      }),
      'g-1'
    );
    const text = describeFieldMeta(meta);
    expect(text).toMatch(/Pier/);
    expect(text).toMatch(/3\.3s/);
    expect(text).toMatch(/48\.0 kHz/);
    expect(text).toMatch(/1 variant/);
  });

  it('says variants plural, and survives missing fields', () => {
    const meta = withGenome(
      withGenome(buildFieldMeta({ id: 't', place: '', timeISO: '', sampleRateHz: 44100 }), 'a'),
      'b'
    );
    expect(describeFieldMeta(meta)).toMatch(/2 variants/);
    expect(describeFieldMeta(meta)).toMatch(/unknown place/);
  });
});
