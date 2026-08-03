/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Copied from the Session Musician music-theory engine (`utils/prng.ts`).
 * Deterministic PRNG helpers so progression/voicing generation is
 * reproducible given the same seed (important for the theory generator).
 */

export interface SeededRng {
  next(): number;
  pick<T>(options: T[]): T;
}

/** Simple deterministic LCG. */
export function createSeededRng(seed: number): SeededRng {
  let state = seed;

  return {
    next: () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    },
    pick: <T>(options: T[]): T => {
      if (options.length === 0) throw new Error('Cannot pick from an empty array');
      state = (state * 1664525 + 1013904223) >>> 0;
      const index = Math.floor((state / 4294967296) * options.length);
      return options[index];
    },
  };
}

/** djb2-style string hash → 32-bit unsigned int. */
export function hashStringToInt(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

/** Xorshift-style higher-quality PRNG (0..1). */
export function createSeededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return function seededRandom() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
