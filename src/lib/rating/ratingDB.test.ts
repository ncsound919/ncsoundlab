/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coverage for `src/lib/rating/ratingDB.ts` (IndexedDB persistence for the
 * rating loop), previously at ~5%: session/choice/elo CRUD, the rebuild path
 * (real `elo.ts` replay), LRU trimming with orphan cascade, and the graceful
 * warn-and-return-empty failure mode. Dexie is replaced with a tiny fake so
 * no IndexedDB is needed; per-test table doubles mirror `db.extra.test.ts`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('dexie', () => {
  class MockDexie {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    version(_n: number) {
      return { stores: () => {} };
    }
    // Overridden per test via (ratingDB as any).transaction.
    transaction(...args: unknown[]) {
      const fn = args[args.length - 1] as () => Promise<unknown>;
      return fn();
    }
  }
  return { default: MockDexie };
});

import {
  ratingDB,
  saveRatingSession,
  fetchRatingSessions,
  saveRatingChoice,
  fetchRatingChoicesBySession,
  fetchAllRatingChoices,
  saveEloStandings,
  fetchEloStandings,
  rebuildStandingsFromChoices,
  trimRatingSessions,
} from './ratingDB';
import type { RatingSession } from './types';

const makeSession = (over: Partial<RatingSession> = {}): RatingSession => ({
  sessionId: 'sess-1',
  schemaVersion: 1,
  appVersion: 'test-1.0',
  startedAt: 1000,
  source: 'manual',
  seedId: 'seed-1',
  plannedPairs: 10,
  completedPairs: 0,
  skippedPairs: 0,
  ratingSystem: 'elo_v1_k32',
  contextLatencyHint: 'playback',
  ...over,
});

const makeChoice = (over: Record<string, unknown> = {}) => ({
  pairId: 'pair-1',
  sessionId: 'sess-1',
  choice: 'A',
  confidence: 2,
  dimensions: { tags: [] },
  listenMsA: 1000,
  listenMsB: 1000,
  decidedAt: 2000,
  elapsedMs: 3000,
  aHash: 'hash-a',
  bHash: 'hash-b',
  kind: 'normal',
  ...over,
});

/** orderBy(field).reverse().limit(n).toArray() / .reverse().toArray() / .toArray() */
const makeOrderByTable = (rows: unknown[] = []) => {
  const toArray = vi.fn().mockResolvedValue(rows);
  const reverse = vi.fn(() => ({ limit: vi.fn(() => ({ toArray })), toArray }));
  return { put: vi.fn(), bulkPut: vi.fn(), bulkDelete: vi.fn(), clear: vi.fn(), toArray, orderBy: vi.fn(() => ({ reverse, toArray })) };
};

const makeWhereTable = (rows: unknown[] = []) => ({
  put: vi.fn(),
  bulkPut: vi.fn(),
  bulkDelete: vi.fn(),
  clear: vi.fn(),
  toArray: vi.fn().mockResolvedValue(rows),
  orderBy: vi.fn(() => ({ reverse: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(rows) })), toArray: vi.fn().mockResolvedValue(rows) })),
  where: vi.fn(() => ({ between: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(rows) })) })),
});

describe('ratingDB sessions', () => {
  beforeEach(() => {
    (ratingDB as any).ratingSessions = makeOrderByTable();
    (ratingDB as any).ratingChoices = makeWhereTable();
    (ratingDB as any).ratingElo = makeOrderByTable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saveRatingSession puts the session', async () => {
    await saveRatingSession(makeSession());
    expect((ratingDB as any).ratingSessions.put).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'sess-1' }),
    );
  });

  it('saveRatingSession warns instead of throwing when put fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (ratingDB as any).ratingSessions.put.mockRejectedValue(new Error('quota'));
    await expect(saveRatingSession(makeSession())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('fetchRatingSessions returns newest-first rows', async () => {
    (ratingDB as any).ratingSessions = makeOrderByTable([makeSession({ sessionId: 's2' })]);
    const rows = await fetchRatingSessions(50);
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe('s2');
  });

  it('fetchRatingSessions returns [] on failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (ratingDB as any).ratingSessions.orderBy.mockImplementation(() => {
      throw new Error('no db');
    });
    expect(await fetchRatingSessions()).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});

describe('ratingDB choices', () => {
  beforeEach(() => {
    (ratingDB as any).ratingSessions = makeOrderByTable();
    (ratingDB as any).ratingChoices = makeWhereTable();
    (ratingDB as any).ratingElo = makeOrderByTable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saveRatingChoice puts the choice row', async () => {
    await saveRatingChoice(makeChoice() as never);
    expect((ratingDB as any).ratingChoices.put).toHaveBeenCalledWith(
      expect.objectContaining({ pairId: 'pair-1', aHash: 'hash-a' }),
    );
  });

  it('saveRatingChoice warns instead of throwing when put fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (ratingDB as any).ratingChoices.put.mockRejectedValue(new Error('quota'));
    await expect(saveRatingChoice(makeChoice() as never)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('fetchRatingChoicesBySession queries the compound index', async () => {
    (ratingDB as any).ratingChoices = makeWhereTable([makeChoice()]);
    const rows = await fetchRatingChoicesBySession('sess-1');
    expect(rows).toHaveLength(1);
    expect((ratingDB as any).ratingChoices.where).toHaveBeenCalledWith('[sessionId+pairId]');
  });

  it('fetchRatingChoicesBySession returns [] on failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (ratingDB as any).ratingChoices.where.mockImplementation(() => {
      throw new Error('no db');
    });
    expect(await fetchRatingChoicesBySession('sess-1')).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('fetchAllRatingChoices returns rows ordered by decidedAt', async () => {
    (ratingDB as any).ratingChoices = makeWhereTable([makeChoice(), makeChoice({ pairId: 'pair-2' })]);
    expect(await fetchAllRatingChoices()).toHaveLength(2);
  });

  it('fetchAllRatingChoices returns [] on failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (ratingDB as any).ratingChoices.orderBy.mockImplementation(() => {
      throw new Error('no db');
    });
    expect(await fetchAllRatingChoices()).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});

describe('ratingDB elo standings', () => {
  beforeEach(() => {
    (ratingDB as any).ratingSessions = makeOrderByTable();
    (ratingDB as any).ratingChoices = makeWhereTable();
    (ratingDB as any).ratingElo = makeOrderByTable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saveEloStandings clears then bulk-puts inside a transaction', async () => {
    const standings = [
      { paramHash: 'h1', rating: 1216, wins: 1, losses: 0, exposures: 1, lastSeenAt: 1, seedId: 's', generation: 0 },
    ];
    await saveEloStandings(standings as never);
    expect((ratingDB as any).ratingElo.clear).toHaveBeenCalled();
    expect((ratingDB as any).ratingElo.bulkPut).toHaveBeenCalledWith(standings);
  });

  it('saveEloStandings warns instead of throwing on failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (ratingDB as any).transaction = vi.fn().mockRejectedValue(new Error('locked'));
    await expect(saveEloStandings([])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    delete (ratingDB as any).transaction;
  });

  it('fetchEloStandings returns rows; [] on failure', async () => {
    (ratingDB as any).ratingElo = makeOrderByTable([
      { paramHash: 'h1', rating: 1216, wins: 1, losses: 0, exposures: 1, lastSeenAt: 1, seedId: 's', generation: 0 },
    ]);
    expect((await fetchEloStandings())).toHaveLength(1);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (ratingDB as any).ratingElo.orderBy.mockImplementation(() => {
      throw new Error('no db');
    });
    expect(await fetchEloStandings()).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('rebuildStandingsFromChoices returns [] when there are no choices', async () => {
    (ratingDB as any).ratingChoices = makeWhereTable([]);
    expect(await rebuildStandingsFromChoices()).toEqual([]);
    expect((ratingDB as any).ratingElo.bulkPut).not.toHaveBeenCalled();
  });

  it('rebuildStandingsFromChoices replays choices into standings and persists them', async () => {
    (ratingDB as any).ratingChoices = makeWhereTable([
      makeChoice({ pairId: 'p1', aHash: 'hash-a', bHash: 'hash-b', choice: 'A' }),
      makeChoice({ pairId: 'p2', aHash: 'hash-a', bHash: 'hash-b', choice: 'B' }),
    ]);
    const rebuilt = await rebuildStandingsFromChoices();
    expect(rebuilt).toHaveLength(2);
    // Elo is zero-sum: A-then-B splits the pair 1-1, so the ratings sum to
    // 2 * base (the second game is played at unequal ratings, so neither
    // row lands exactly on 1200). Each side has 1 win / 1 loss / 2 exposures.
    expect(rebuilt.reduce((sum, r) => sum + r.rating, 0)).toBeCloseTo(2400, 5);
    for (const row of rebuilt) {
      expect(row.wins).toBe(1);
      expect(row.losses).toBe(1);
      expect(row.exposures).toBe(2);
    }
    expect((ratingDB as any).ratingElo.bulkPut).toHaveBeenCalledWith(rebuilt);
  });
});

describe('ratingDB trimRatingSessions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when under the keep limit', async () => {
    const sessions = [makeSession({ sessionId: 's1', startedAt: 3 }), makeSession({ sessionId: 's2', startedAt: 2 })];
    (ratingDB as any).ratingSessions = makeOrderByTable(sessions);
    (ratingDB as any).ratingChoices = makeWhereTable([]);
    await trimRatingSessions(200);
    expect((ratingDB as any).ratingSessions.bulkDelete).not.toHaveBeenCalled();
  });

  it('deletes old sessions and cascades orphan choices when over the limit', async () => {
    const sessions = [
      makeSession({ sessionId: 'keep-1', startedAt: 300 }),
      makeSession({ sessionId: 'keep-2', startedAt: 200 }),
      makeSession({ sessionId: 'drop-1', startedAt: 100 }),
    ];
    const choices = [
      makeChoice({ pairId: 'c1', sessionId: 'keep-1' }),
      makeChoice({ pairId: 'c2', sessionId: 'drop-1' }),
    ];
    (ratingDB as any).ratingSessions = makeOrderByTable(sessions);
    (ratingDB as any).ratingChoices = makeWhereTable(choices);
    await trimRatingSessions(2);
    expect((ratingDB as any).ratingSessions.bulkDelete).toHaveBeenCalledWith(['drop-1']);
    expect((ratingDB as any).ratingChoices.bulkDelete).toHaveBeenCalledWith(['c2']);
  });

  it('warns instead of throwing on failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (ratingDB as any).ratingSessions = {
      orderBy: vi.fn(() => {
        throw new Error('no db');
      }),
    };
    await expect(trimRatingSessions()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
