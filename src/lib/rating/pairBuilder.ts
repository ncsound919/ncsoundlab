/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Builds the session queue: blind pairs with anchors and attention checks.
 *
 * Determinism: all randomness comes from a seeded mulberry32 PRNG keyed on the
 * sessionId so a session can be reproduced from the sessionId alone.
 *
 * Rules:
 *  1. hidden_anchor every 5th position (skips index 0).
 *  2. Exactly one attention_check at floor(sessionLen/2). A and B are the
 *     same variation (same paramHash).
 *  3. Remaining slots are `normal` pairs, drawn from the batch.
 *  4. A/B side is randomized per pair.
 *  5. No `normal` pair with the same paramHash on both sides.
 */

import type {
  EloStanding,
  PairKind,
  ParamHash,
  RatingPair,
  VariationDescriptor,
} from './types';
import { ELO_BASE } from './elo';

export interface PairBuilderOptions {
  batch: VariationDescriptor[];
  seed: VariationDescriptor;
  sessionLen: number;
  standings?: EloStanding[];
}

function audibleDiff(a: VariationDescriptor, b: VariationDescriptor): boolean {
  if (a.paramHash === b.paramHash) return false;
  if (a.origin !== b.origin) return true;
  if (a.seedId !== b.seedId) return true;
  // Both same seed+origin but different hash — must differ in params.
  return a.paramHash !== b.paramHash;
}

function strToU32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — fast, deterministic, good distribution for shuffle + pairing. */
function makePrng(seed: string): () => number {
  let s = strToU32(seed);
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fisherYates<T>(arr: T[], prng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getElo(hash: ParamHash, standings?: EloStanding[]): number {
  return standings?.find((s) => s.paramHash === hash)?.rating ?? ELO_BASE;
}

function makePair(
  sessionId: string,
  index: number,
  kind: PairKind,
  a: VariationDescriptor,
  b: VariationDescriptor,
): RatingPair {
  return {
    pairId: crypto.randomUUID(),
    sessionId,
    indexInSession: index,
    kind,
    a,
    b,
    insertedAt: Date.now(),
  };
}

/**
 * Build all C(n, 2) audible-different pairs from the batch and shuffle.
 * Excludes the seed's own pair with itself.
 */
function buildNormalSlots(prng: () => number, batch: VariationDescriptor[]): Array<{ a: VariationDescriptor; b: VariationDescriptor }> {
  const raw: Array<{ a: VariationDescriptor; b: VariationDescriptor }> = [];
  for (let i = 0; i < batch.length; i++) {
    for (let j = i + 1; j < batch.length; j++) {
      if (audibleDiff(batch[i], batch[j])) {
        raw.push({ a: batch[i], b: batch[j] });
      }
    }
  }
  return fisherYates(raw, prng);
}

function anchorIndices(sessionLen: number): number[] {
  // Skip index 0 (first pair is never an anchor).
  const out: number[] = [];
  for (let i = 5; i < sessionLen; i += 5) out.push(i);
  return out;
}

/** Find the nearest free slot in [0, sessionLen) that is not in `taken`. */
function findFreeSlot(preferred: number, taken: Set<number>, sessionLen: number): number {
  for (let d = 0; d < sessionLen; d++) {
    const down = preferred - d;
    if (down >= 0 && down < sessionLen && !taken.has(down)) return down;
    const up = preferred + d;
    if (up >= 0 && up < sessionLen && !taken.has(up)) return up;
  }
  return preferred; // fallback (shouldn't happen)
}

/**
 * Build the full rating queue for a session.
 *
 * Deterministic: same sessionId + batch + sessionLen + seed + standings
 * always produces the same pair order.
 */
export function buildPairsForBatch(
  sessionId: string,
  batch: VariationDescriptor[],
  sessionLen: number,
  seed: VariationDescriptor,
  standings?: EloStanding[],
): RatingPair[] {
  if (batch.length < 2 && batch.every((b) => b.paramHash === seed.paramHash)) return [];

  const prng = makePrng(sessionId);
  const normalSlots = buildNormalSlots(prng, batch);
  // Sort the rest of the batch by Elo to bias the strong-vs-weak pairing
  // (top-half vs bottom-half) without breaking shuffle determinism.
  const ranked = [...batch].sort(
    (a, b) => getElo(b.paramHash, standings) - getElo(a.paramHash, standings),
  );
  const top = ranked.slice(0, Math.ceil(ranked.length / 2));
  const bottom = ranked.slice(Math.ceil(ranked.length / 2));

  // 60% strong-vs-weak pairings; the rest pull from the shuffled normalSlots.
  const swCount = Math.floor(normalSlots.length * 0.6);
  let topIdx = 0;
  let bottomIdx = 0;
  const pairs: RatingPair[] = [];

  const checkIndex = Math.floor(sessionLen / 2);
  const anchors = anchorIndices(sessionLen);
  const seedChallengers = fisherYates(
    batch.filter((v) => v.paramHash !== seed.paramHash),
    prng,
  );
  let seedChallengerIdx = 0;

  const anchorSet = new Set(anchors);
  const checkIndexEffective = anchorSet.has(checkIndex)
    ? findFreeSlot(checkIndex, anchorSet, sessionLen)
    : checkIndex;

  for (let i = 0; i < sessionLen; i++) {
    if (i === checkIndexEffective) {
      pairs.push(makePair(sessionId, i, 'attention_check', seed, seed));
      continue;
    }
    if (anchorSet.has(i)) {
      const challenger = seedChallengers[seedChallengerIdx % Math.max(1, seedChallengers.length)];
      seedChallengerIdx++;
      pairs.push(makePair(sessionId, i, 'hidden_anchor', seed, challenger));
      continue;
    }
    // Normal slot
    let chosen: { a: VariationDescriptor; b: VariationDescriptor } | undefined;
    if (pairs.filter((p) => p.kind === 'normal').length < swCount) {
      // Pick strong-vs-weak (but only if audible)
      outer: for (let t = 0; t < top.length; t++) {
        for (let bot = 0; bot < bottom.length; bot++) {
          const a = top[(topIdx + t) % top.length];
          const b = bottom[(bottomIdx + bot) % bottom.length];
          if (audibleDiff(a, b)) { chosen = { a, b }; break outer; }
        }
      }
      topIdx++;
      bottomIdx++;
    }
    if (!chosen) {
      chosen = normalSlots.shift();
    }
    if (!chosen) break; // exhausted

    const abSwap = prng() < 0.5;
    pairs.push(
      makePair(
        sessionId,
        i,
        'normal',
        abSwap ? chosen.b : chosen.a,
        abSwap ? chosen.a : chosen.b,
      ),
    );
  }

  return pairs;
}
