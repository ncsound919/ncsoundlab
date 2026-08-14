/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/lib/theory/prng.ts` — the deterministic seeded PRNGs that feed
 * progression/voicing generation. Determinism is the contract: the same seed
 * must reproduce the exact same sequence, so generated theory stays stable
 * across saves/loads and test runs.
 */

import { describe, expect, it } from 'vitest';
import { createSeededRng, createSeededRandom, hashStringToInt } from './prng';

describe('createSeededRng', () => {
  it('produces values in [0, 1)', () => {
    const rng = createSeededRng(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('pick returns a member of the options array', () => {
    const rng = createSeededRng(7);
    const opts = ['C', 'G', 'D', 'A'];
    for (let i = 0; i < 200; i++) {
      expect(opts).toContain(rng.pick(opts));
    }
  });

  it('pick throws on an empty array', () => {
    const rng = createSeededRng(7);
    expect(() => rng.pick([])).toThrow();
  });

  it('pick is deterministic', () => {
    const a = createSeededRng(5);
    const b = createSeededRng(5);
    const seqA = Array.from({ length: 50 }, () => a.pick([1, 2, 3, 4, 5]));
    const seqB = Array.from({ length: 50 }, () => b.pick([1, 2, 3, 4, 5]));
    expect(seqA).toEqual(seqB);
  });
});

describe('createSeededRandom (xorshift)', () => {
  it('is deterministic and in [0, 1)', () => {
    const a = createSeededRandom(99);
    const b = createSeededRandom(99);
    for (let i = 0; i < 500; i++) {
      const va = a();
      expect(va).toBeGreaterThanOrEqual(0);
      expect(va).toBeLessThan(1);
      expect(va).toBe(b());
    }
  });

  it('differs across seeds', () => {
    expect(createSeededRandom(1)()).not.toBe(createSeededRandom(2)());
  });

  it('seed 0 is handled (>>> 0 keeps it unsigned)', () => {
    const r = createSeededRandom(0);
    for (let i = 0; i < 10; i++) {
      const v = r();
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('hashStringToInt', () => {
  it('is deterministic', () => {
    expect(hashStringToInt('ii-V-I')).toBe(hashStringToInt('ii-V-I'));
  });

  it('returns a uint32', () => {
    for (const s of ['', 'a', 'hello world', 'jazz-2-5-1', '🎹']) {
      const h = hashStringToInt(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(4294967295);
    }
  });

  it('collides rarely enough to distinguish common keys', () => {
    const keys = ['c', 'g', 'd', 'am', 'em', 'f', 'major', 'minor'];
    const seen = new Set(keys.map((k) => hashStringToInt(k)));
    expect(seen.size).toBe(keys.length);
  });
});
