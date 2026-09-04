/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the rating loop's pure logic.
 *
 * These tests are co-located with the modules they cover, matching the
 * repo's `*.test.ts` pattern.
 */

import { describe, it, expect } from 'vitest';
import {
  ELO_BASE,
  K_FACTOR,
  applyChoice,
  effectiveK,
  expectedScore,
  replayChoices,
  standingsToArray,
  type RatingChoiceWithHashes,
} from './elo';
import type { VariationDescriptor } from './types';

// ── elo.ts ──────────────────────────────────────────────────────────────────

function makeVar(hash: string, seedId = 'seed-1', generation = 0): VariationDescriptor {
  return {
    paramHash: hash,
    params: { x: hash },
    seedId,
    generation,
    origin: 'evolve',
    renderDurationMs: 1000,
    createdAt: 0,
  };
}

function makeChoice(
  pairId: string,
  sessionId: string,
  choice: 'A' | 'B',
  confidence: 1 | 2 | 3 = 2,
  skipped = false,
): RatingChoiceWithHashes {
  return {
    pairId,
    sessionId,
    choice,
    confidence,
    dimensions: { tags: [] },
    listenMsA: 600,
    listenMsB: 600,
    decidedAt: 0,
    elapsedMs: 1000,
    skipped: skipped ? true : undefined,
    aHash: 'h1',
    bHash: 'h2',
    kind: skipped ? 'skipped' : 'normal',
  };
}

describe('elo', () => {
  it('expectedScore returns 0.5 for equal ratings', () => {
    expect(expectedScore(ELO_BASE, ELO_BASE)).toBeCloseTo(0.5, 5);
  });

  it('expectedScore returns > 0.5 when A is stronger than B', () => {
    expect(expectedScore(1600, 1200)).toBeGreaterThan(0.5);
    expect(expectedScore(1600, 1200)).toBeCloseTo(0.909, 2);
  });

  it('effectiveK: confidence 1 -> K/2, 2/3 -> full K', () => {
    expect(effectiveK(1)).toBe(K_FACTOR * 0.5);
    expect(effectiveK(2)).toBe(K_FACTOR);
    expect(effectiveK(3)).toBe(K_FACTOR);
  });

  it('symmetric sum conservation: E_A + E_B is constant per match', () => {
    const standings = new Map();
    const seedMeta = new Map([
      ['h1', { seedId: 's1', generation: 0 }],
      ['h2', { seedId: 's1', generation: 0 }],
    ]);
    const before = (standings.get('h1')?.rating ?? ELO_BASE) + (standings.get('h2')?.rating ?? ELO_BASE);
    applyChoice(standings, makeChoice('p1', 'sess', 'A'), seedMeta, 1000);
    const after =
      standings.get('h1')!.rating + standings.get('h2')!.rating;
    expect(after).toBeCloseTo(before, 6);
  });

  it('confidence 1 produces a smaller rating change than confidence 3', () => {
    const seedMeta = new Map([
      ['h1', { seedId: 's1', generation: 0 }],
      ['h2', { seedId: 's1', generation: 0 }],
    ]);

    const s1 = new Map();
    applyChoice(s1, makeChoice('p1', 'sess', 'A', 1), seedMeta, 1000);
    const d1 = s1.get('h1')!.rating - ELO_BASE;

    const s2 = new Map();
    applyChoice(s2, makeChoice('p1', 'sess', 'A', 3), seedMeta, 1000);
    const d2 = s2.get('h1')!.rating - ELO_BASE;

    expect(Math.abs(d2)).toBeGreaterThan(Math.abs(d1));
  });

  it('skipped choices do NOT change ratings but DO increment exposures', () => {
    const seedMeta = new Map([
      ['h1', { seedId: 's1', generation: 0 }],
      ['h2', { seedId: 's1', generation: 0 }],
    ]);
    const standings = new Map();
    applyChoice(standings, makeChoice('p1', 'sess', 'A', 2, true), seedMeta, 1000);
    const a = standings.get('h1')!;
    const b = standings.get('h2')!;
    expect(a.rating).toBe(ELO_BASE);
    expect(b.rating).toBe(ELO_BASE);
    expect(a.exposures).toBe(1);
    expect(b.exposures).toBe(1);
  });

  it('replayChoices reproduces the live standings bit-for-bit', () => {
    const seedMeta = new Map([
      ['h1', { seedId: 's1', generation: 0 }],
      ['h2', { seedId: 's1', generation: 0 }],
      ['h3', { seedId: 's1', generation: 0 }],
    ]);
    const live = new Map();
    const choices: RatingChoiceWithHashes[] = [
      { ...makeChoice('p1', 'sess', 'A'), aHash: 'h1', bHash: 'h2', kind: 'normal' },
      { ...makeChoice('p2', 'sess', 'B'), aHash: 'h1', bHash: 'h3', kind: 'normal' },
      { ...makeChoice('p3', 'sess', 'A'), aHash: 'h2', bHash: 'h3', kind: 'normal' },
    ];
    for (const c of choices) {
      applyChoice(live, c, seedMeta, c.decidedAt);
    }

    const rebuilt = replayChoices(choices, seedMeta, 0);
    const liveArr = standingsToArray(live);
    const rebuiltArr = standingsToArray(rebuilt);
    expect(rebuiltArr.length).toBe(liveArr.length);
    for (let i = 0; i < liveArr.length; i++) {
      expect(rebuiltArr[i].paramHash).toBe(liveArr[i].paramHash);
      expect(rebuiltArr[i].rating).toBeCloseTo(liveArr[i].rating, 6);
      expect(rebuiltArr[i].wins).toBe(liveArr[i].wins);
      expect(rebuiltArr[i].losses).toBe(liveArr[i].losses);
    }
  });

  it('anchor and attention-check choices update exposures but not ratings', () => {
    const seedMeta = new Map([
      ['h1', { seedId: 's1', generation: 0 }],
      ['h2', { seedId: 's1', generation: 0 }],
    ]);
    const choices: RatingChoiceWithHashes[] = [
      { ...makeChoice('p1', 'sess', 'A'), aHash: 'h1', bHash: 'h2', kind: 'hidden_anchor' },
      // attention_check: same hash on both sides → both increments go to h1
      { ...makeChoice('p2', 'sess', 'A'), aHash: 'h1', bHash: 'h1', kind: 'attention_check' },
    ];
    const rebuilt = standingsToArray(replayChoices(choices, seedMeta, 0));
    const h1 = rebuilt.find((r) => r.paramHash === 'h1')!;
    const h2 = rebuilt.find((r) => r.paramHash === 'h2')!;
    expect(h1.rating).toBe(ELO_BASE);
    expect(h2.rating).toBe(ELO_BASE);
    // hidden_anchor (h1+h2) → h1 +1, h2 +1; attention_check (h1=h1) → h1 +1 (not +2 because same hash)
    expect(h1.exposures).toBe(2);
    expect(h2.exposures).toBe(1);
  });
});
