/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the pair builder.
 *
 *  - hidden_anchor cadence: every 5th pair (index 5, 10, 15, …)
 *  - exactly one attention_check per session
 *  - no `normal` pair with the same paramHash on both sides
 *  - seeded determinism: same sessionId => same queue
 */

import { describe, it, expect } from 'vitest';
import { buildPairsForBatch } from './pairBuilder';
import type { VariationDescriptor } from './types';

function makeVar(i: number): VariationDescriptor {
  return {
    paramHash: `var-${i}`,
    params: { x: i },
    seedId: 'seed-1',
    generation: i === 0 ? 0 : 1,
    origin: i === 0 ? 'seed' : 'evolve',
    renderDurationMs: 2000,
    createdAt: 0,
  };
}

function makeSeed(i = 0): VariationDescriptor {
  return {
    paramHash: `var-${i}`,
    params: { x: i },
    seedId: 'seed-1',
    generation: 0,
    origin: 'seed',
    renderDurationMs: 2000,
    createdAt: 0,
  };
}

describe('pairBuilder', () => {
  it('inserts a hidden_anchor every 5th pair (skips index 0)', () => {
    const batch = Array.from({ length: 12 }, (_, i) => makeVar(i));
    const seed = makeSeed(0);
    const queue = buildPairsForBatch('session-1', batch, 10, seed);
    const anchors = queue.filter((p) => p.kind === 'hidden_anchor');
    expect(anchors.length).toBe(1); // sessionLen 10 -> only index 5
    expect(anchors[0].indexInSession).toBe(5);
  });

  it('inserts exactly one attention_check at floor(sessionLen/2)', () => {
    const batch = Array.from({ length: 12 }, (_, i) => makeVar(i));
    const queue = buildPairsForBatch('session-1', batch, 10, makeSeed(0));
    const checks = queue.filter((p) => p.kind === 'attention_check');
    expect(checks.length).toBe(1);
    // Check is at floor(10/2)=5 but anchors take priority at 5, so check shifts
    // to the nearest free slot (4). Just verify it exists and A===B.
    expect(checks[0].a.paramHash).toBe(checks[0].b.paramHash);
    // The check must NOT be on an anchor slot.
    const anchorSet = new Set([5]);
    expect(anchorSet.has(checks[0].indexInSession)).toBe(false);
  });

  it('does not include normal pairs with identical paramHash', () => {
    const batch = Array.from({ length: 8 }, (_, i) => makeVar(i));
    const queue = buildPairsForBatch('session-1', batch, 10, makeSeed(0));
    for (const p of queue) {
      if (p.kind === 'normal') {
        expect(p.a.paramHash).not.toBe(p.b.paramHash);
      }
    }
  });

  it('produces the same queue for the same sessionId (seeded determinism)', () => {
    const batch = Array.from({ length: 10 }, (_, i) => makeVar(i));
    const q1 = buildPairsForBatch('session-X', batch, 10, makeSeed(0));
    const q2 = buildPairsForBatch('session-X', batch, 10, makeSeed(0));
    expect(q1.length).toBe(q2.length);
    for (let i = 0; i < q1.length; i++) {
      expect(q1[i].kind).toBe(q2[i].kind);
      expect(q1[i].a.paramHash).toBe(q2[i].a.paramHash);
      expect(q1[i].b.paramHash).toBe(q2[i].b.paramHash);
    }
  });

  it('returns fewer pairs when batch is smaller than sessionLen', () => {
    const batch = Array.from({ length: 3 }, (_, i) => makeVar(i));
    const queue = buildPairsForBatch('session-1', batch, 10, makeSeed(0));
    expect(queue.length).toBeLessThanOrEqual(10);
    expect(queue.length).toBeGreaterThan(0);
  });
});
