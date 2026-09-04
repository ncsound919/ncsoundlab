/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Online Elo update for the rating loop.
 *
 * Rule: standard online Elo with a flat K-factor of 32 in v1
 * (`ratingSystem: 'elo_v1_k32'`). Confidence on a choice scales K: 0.5x for
 * confidence=1 (coin-flip), 1.0x for confidence=2 and 3. A cheap proxy for
 * vote entropy without a Bayesian model.
 *
 * Only `normal` pair choices update ratings. Hidden anchors and attention
 * checks are excluded (they measure the rater, not the sound), but their
 * raw choices are still stored.
 *
 * Determinism: the update is a pure function of inputs in the order received,
 * and `replayChoices()` rebuilds the table bit-for-bit from the raw choices
 * (used as the rebuild test).
 */

import type {
  Confidence,
  EloStanding,
  ParamHash,
  RatingChoice,
} from './types';

export const ELO_BASE = 1200;
export const K_FACTOR = 32;

export type EloChoiceKind = 'normal' | 'hidden_anchor' | 'attention_check' | 'skipped';

export interface RatingChoiceWithHashes extends RatingChoice {
  aHash: ParamHash;
  bHash: ParamHash;
  kind: EloChoiceKind | string;
}

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function effectiveK(confidence: Confidence): number {
  if (confidence === 1) return K_FACTOR * 0.5;
  return K_FACTOR;
}

function getOrCreate(
  standings: Map<ParamHash, EloStanding>,
  hash: ParamHash,
  seedIdByHash: Map<ParamHash, { seedId: string; generation: number }>,
  now: number,
): EloStanding {
  let row = standings.get(hash);
  if (!row) {
    const meta = seedIdByHash.get(hash) ?? { seedId: 'unknown', generation: 0 };
    row = {
      paramHash: hash,
      rating: ELO_BASE,
      wins: 0,
      losses: 0,
      exposures: 0,
      lastSeenAt: now,
      seedId: meta.seedId,
      generation: meta.generation,
    };
    standings.set(hash, row);
  }
  return row;
}

function bumpExposures(
  standings: Map<ParamHash, EloStanding>,
  aHash: ParamHash,
  bHash: ParamHash,
  seedIdByHash: Map<ParamHash, { seedId: string; generation: number }>,
  now: number,
): void {
  const a = getOrCreate(standings, aHash, seedIdByHash, now);
  a.exposures += 1;
  a.lastSeenAt = now;
  if (aHash !== bHash) {
    const b = getOrCreate(standings, bHash, seedIdByHash, now);
    b.exposures += 1;
    b.lastSeenAt = now;
  }
}

/**
 * Apply a single choice to the standings map (returns the updated rows).
 *
 * For `normal` choices: rating updates + exposures.
 * For anchor / attention_check / skipped: exposures only.
 */
export function applyChoice(
  standings: Map<ParamHash, EloStanding>,
  choice: RatingChoiceWithHashes,
  seedIdByHash: Map<ParamHash, { seedId: string; generation: number }>,
  now: number,
): { aHash: ParamHash; bHash: ParamHash; updated: boolean; dRatingA: number; dRatingB: number } {
  const { aHash, bHash, kind } = choice;
  if (kind !== 'normal' || choice.skipped) {
    bumpExposures(standings, aHash, bHash, seedIdByHash, now);
    return { aHash, bHash, updated: false, dRatingA: 0, dRatingB: 0 };
  }
  const a = getOrCreate(standings, aHash, seedIdByHash, now);
  const b = getOrCreate(standings, bHash, seedIdByHash, now);
  const eA = expectedScore(a.rating, b.rating);
  const eB = 1 - eA;
  const k = effectiveK(choice.confidence);
  const sA = choice.choice === 'A' ? 1 : 0;
  const sB = 1 - sA;
  const dA = k * (sA - eA);
  const dB = k * (sB - eB);
  a.rating += dA;
  b.rating += dB;
  a.exposures += 1;
  b.exposures += 1;
  a.lastSeenAt = now;
  b.lastSeenAt = now;
  if (sA === 1) { a.wins += 1; b.losses += 1; } else { b.wins += 1; a.losses += 1; }
  return { aHash, bHash, updated: true, dRatingA: dA, dRatingB: dB };
}

/**
 * Replay the full choices list in insertion order over a fresh standings map.
 * This is the rebuild path and the determinism test (must match live table).
 */
export function replayChoices(
  rawChoices: RatingChoiceWithHashes[],
  seedIdByHash: Map<ParamHash, { seedId: string; generation: number }>,
  now: number,
): Map<ParamHash, EloStanding> {
  const standings = new Map<ParamHash, EloStanding>();
  for (const c of rawChoices) {
    applyChoice(standings, c, seedIdByHash, now);
  }
  return standings;
}

/**
 * Convert the internal map to the persistence shape (sorted by rating desc,
 * then exposures desc, for stable snapshots).
 */
export function standingsToArray(standings: Map<ParamHash, EloStanding>): EloStanding[] {
  return [...standings.values()].sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (b.exposures !== a.exposures) return b.exposures - a.exposures;
    return a.paramHash.localeCompare(b.paramHash);
  });
}
