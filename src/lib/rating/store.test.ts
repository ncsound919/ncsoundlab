/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coverage for the rating session state machine in
 * `src/lib/rating/store.ts` (`useRatingStore`), previously at ~5%:
 * start → listen → submit/skip → auto-advance → summary, plus standings
 * loading, reset, skip-cap enforcement, and the no-session guards.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useRatingStore } from './store';
import type { VariationDescriptor } from './types';

let counter = 0;

function makeVariation(over: Partial<VariationDescriptor> = {}): VariationDescriptor {
  counter += 1;
  return {
    paramHash: `hash-${counter}`,
    params: { cutoff: 1000 + counter },
    seedId: `seed-${counter}`,
    generation: 0,
    origin: 'evolve',
    renderDurationMs: 4000,
    createdAt: Date.now(),
    ...over,
  };
}

function startTen() {
  const seed = makeVariation({ seedId: 'seed-0', paramHash: 'hash-seed' });
  const batch = Array.from({ length: 6 }, () => makeVariation());
  useRatingStore.getState().startSession({
    batch,
    seed,
    sessionLen: 10,
    source: 'manual',
    appVersion: 'test-1.0',
  });
  return useRatingStore.getState();
}

function submitCurrent(choice: 'A' | 'B' = 'A') {
  const s = useRatingStore.getState();
  const pair = s.queue[s.currentIndex];
  s.submitChoice({
    pair,
    choice,
    listenMsA: 1500,
    listenMsB: 1200,
    confidence: 2,
    dimensions: { tags: [] },
    elapsedMs: 3000,
  });
}

describe('useRatingStore', () => {
  beforeEach(() => {
    useRatingStore.getState().reset();
  });

  it('starts idle with empty state', () => {
    const s = useRatingStore.getState();
    expect(s.phase).toBe('idle');
    expect(s.session).toBeNull();
    expect(s.queue).toEqual([]);
    expect(s.standings).toEqual([]);
  });

  it('startSession builds a 10-pair queue and enters active phase', () => {
    const s = startTen();
    expect(s.phase).toBe('active');
    expect(s.session).not.toBeNull();
    expect(s.session!.plannedPairs).toBe(10);
    expect(s.session!.completedPairs).toBe(0);
    expect(s.session!.source).toBe('manual');
    expect(s.queue).toHaveLength(10);
    expect(s.currentIndex).toBe(0);
    expect(s.seed).not.toBeNull();
  });

  it('startSession seeds prior standings into the snapshot', () => {
    const seed = makeVariation({ seedId: 'seed-0', paramHash: 'hash-seed' });
    const batch = Array.from({ length: 6 }, () => makeVariation());
    useRatingStore.getState().startSession({
      batch,
      seed,
      sessionLen: 10,
      source: 'manual',
      appVersion: 'test-1.0',
      priorStandings: [
        {
          paramHash: batch[0].paramHash,
          rating: 1400,
          wins: 3,
          losses: 1,
          exposures: 4,
          lastSeenAt: Date.now(),
          seedId: batch[0].seedId,
          generation: 0,
        },
      ],
    });
    const s = useRatingStore.getState();
    expect(s.standings.find((r) => r.paramHash === batch[0].paramHash)?.rating).toBe(1400);
  });

  it('recordListenTime stores per-pair listen accumulation', () => {
    startTen();
    useRatingStore.getState().recordListenTime(2100, 900);
    const s = useRatingStore.getState();
    expect(s.listenMsA).toBe(2100);
    expect(s.listenMsB).toBe(900);
  });

  it('submitChoice records the choice, bumps completedPairs and advances', () => {
    startTen();
    submitCurrent('A');
    const s = useRatingStore.getState();
    expect(s.session!.completedPairs).toBe(1);
    expect(s.currentIndex).toBe(1);
    expect(s.summaryChoices).toHaveLength(1);
    expect(s.summaryChoices[0].choice).toBe('A');
    // Listen accumulators reset for the next pair.
    expect(s.listenMsA).toBe(0);
    expect(s.listenMsB).toBe(0);
  });

  it('submitChoice on a normal pair updates the in-memory standings', () => {
    startTen();
    // Find a normal pair (anchors/checks skip Elo updates) and jump to it.
    const s0 = useRatingStore.getState();
    const normalIdx = s0.queue.findIndex((p) => p.kind === 'normal');
    expect(normalIdx).toBeGreaterThanOrEqual(0);
    useRatingStore.setState({ currentIndex: normalIdx });
    const before = new Map(
      useRatingStore.getState().standings.map((r) => [r.paramHash, r.rating] as const),
    );
    const s = useRatingStore.getState();
    s.submitChoice({
      pair: s.queue[s.currentIndex],
      choice: 'B',
      listenMsA: 1000,
      listenMsB: 1000,
      confidence: 2,
      dimensions: { tags: ['knock'] },
      elapsedMs: 2500,
    });
    const after = useRatingStore.getState().standings;
    // At least one row must exist now and differ from the pre-submit snapshot
    // (fresh 1200 rows move ±16 on a B win at equal rating).
    expect(after.length).toBeGreaterThan(0);
    const changed = after.some((r) => before.get(r.paramHash) !== r.rating) || before.size === 0;
    expect(changed).toBe(true);
  });

  it('submitChoice is a no-op without an active session', () => {
    const s = useRatingStore.getState();
    expect(() =>
      s.submitChoice({
        pair: undefined as never,
        choice: 'A',
        listenMsA: 0,
        listenMsB: 0,
        confidence: 2,
        dimensions: { tags: [] },
        elapsedMs: 0,
      }),
    ).not.toThrow();
    expect(useRatingStore.getState().summaryChoices).toEqual([]);
  });

  it('attemptSkip consumes a skip and advances; the third skip is refused', () => {
    startTen();
    expect(useRatingStore.getState().attemptSkip()).toBe(true);
    expect(useRatingStore.getState().session!.skippedPairs).toBe(1);
    expect(useRatingStore.getState().currentIndex).toBe(1);
    // The skipped placeholder is recorded in the summary.
    expect(useRatingStore.getState().summaryChoices[0].skipped).toBe(true);

    expect(useRatingStore.getState().attemptSkip()).toBe(true);
    expect(useRatingStore.getState().session!.skippedPairs).toBe(2);
    expect(useRatingStore.getState().attemptSkip()).toBe(false);
    expect(useRatingStore.getState().session!.skippedPairs).toBe(2);
  });

  it('attemptSkip without a session returns false', () => {
    expect(useRatingStore.getState().attemptSkip()).toBe(false);
  });

  it('submitting the whole queue auto-ends the session into summary', () => {
    startTen();
    for (let i = 0; i < 10; i++) {
      const s = useRatingStore.getState();
      if (s.phase !== 'active') break;
      submitCurrent(i % 2 === 0 ? 'A' : 'B');
    }
    const s = useRatingStore.getState();
    expect(s.phase).toBe('summary');
    expect(s.session!.endedAt).toBeDefined();
    expect(s.summaryChoices.length).toBeGreaterThan(0);
    expect(s.summaryElapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('endSession throws without an active session', () => {
    expect(() => useRatingStore.getState().endSession()).toThrow('No active session');
  });

  it('loadStandings replaces the standings snapshot', () => {
    startTen();
    useRatingStore.getState().loadStandings([
      {
        paramHash: 'hash-x',
        rating: 1500,
        wins: 5,
        losses: 0,
        exposures: 5,
        lastSeenAt: Date.now(),
        seedId: 'seed-x',
        generation: 1,
      },
    ]);
    const s = useRatingStore.getState();
    expect(s.standings).toHaveLength(1);
    expect(s.standings[0].rating).toBe(1500);
  });

  it('reset returns the store to idle', () => {
    startTen();
    submitCurrent();
    useRatingStore.getState().reset();
    const s = useRatingStore.getState();
    expect(s.phase).toBe('idle');
    expect(s.session).toBeNull();
    expect(s.queue).toEqual([]);
    expect(s.currentIndex).toBe(0);
    expect(s.summaryChoices).toEqual([]);
  });
});
