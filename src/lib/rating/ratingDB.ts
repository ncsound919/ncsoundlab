/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * IndexedDB persistence for the rating loop.
 *
 * Uses a separate Dexie instance keyed on `ncs-rating-db` to avoid mixing
 * rating data with project/sound-kit data, and to keep the schema entirely
 * self-contained in this module.
 *
 * All functions follow the existing app pattern: try/catch, no throw, return
 * empty/undefined on failure so the app degrades gracefully in private browsing.
 */

import Dexie, { type Table } from 'dexie';
import type {
  EloStanding,
  RatingChoice,
  RatingSession,
} from './types';

// ── Dexie schema ──────────────────────────────────────────────────────────────

export class RatingDB extends Dexie {
  ratingSessions!: Table<RatingSession, string>;
  ratingChoices!: Table<RatingChoice & { aHash: string; bHash: string; kind: string }, string>;
  ratingElo!: Table<EloStanding, string>;

  constructor() {
    super('ncs-rating-db');
    this.version(1).stores({
      ratingSessions: 'sessionId, startedAt, seedId',
      // pairId is the primary key so a duplicate submit (double-click) is idempotent.
      // aHash + bHash + kind stored on the choice row for the replay path.
      ratingChoices: 'pairId, [sessionId+pairId], aHash, bHash',
      ratingElo: 'paramHash, seedId, rating',
    });
  }
}

export const ratingDB = new RatingDB();

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function saveRatingSession(session: RatingSession): Promise<void> {
  try {
    await ratingDB.ratingSessions.put(session);
  } catch (err) {
    console.warn('Rating session save notice:', err);
  }
}

export async function fetchRatingSessions(limit = 200): Promise<RatingSession[]> {
  try {
    const rows = await ratingDB.ratingSessions.orderBy('startedAt').reverse().limit(limit).toArray();
    return rows;
  } catch (err) {
    console.warn('Rating sessions fetch notice:', err);
    return [];
  }
}

// ── Choices ─────────────────────────────────────────────────────────────────

export async function saveRatingChoice(
  choice: RatingChoice & { aHash: string; bHash: string; kind: string },
): Promise<void> {
  try {
    await ratingDB.ratingChoices.put(choice);
  } catch (err) {
    console.warn('Rating choice save notice:', err);
  }
}

export async function fetchRatingChoicesBySession(sessionId: string): Promise<Array<RatingChoice & { aHash: string; bHash: string; kind: string }>> {
  try {
    return await ratingDB.ratingChoices
      .where('[sessionId+pairId]')
      .between([sessionId, ''], [sessionId, '\uffff'])
      .toArray();
  } catch (err) {
    console.warn('Rating choices fetch notice:', err);
    return [];
  }
}

export async function fetchAllRatingChoices(): Promise<Array<RatingChoice & { aHash: string; bHash: string; kind: string }>> {
  try {
    return await ratingDB.ratingChoices.orderBy('decidedAt').toArray();
  } catch (err) {
    console.warn('All rating choices fetch notice:', err);
    return [];
  }
}

// ── Elo standings ────────────────────────────────────────────────────────────

export async function saveEloStandings(standings: EloStanding[]): Promise<void> {
  try {
    const tx = ratingDB.transaction('rw', ratingDB.ratingElo, async () => {
      await ratingDB.ratingElo.clear();
      await ratingDB.ratingElo.bulkPut(standings);
    });
    await tx;
  } catch (err) {
    console.warn('Elo standings save notice:', err);
  }
}

export async function fetchEloStandings(): Promise<EloStanding[]> {
  try {
    return await ratingDB.ratingElo.orderBy('rating').reverse().toArray();
  } catch (err) {
    console.warn('Elo standings fetch notice:', err);
    return [];
  }
}

// ── Rebuild from choices (source of truth) ───────────────────────────────────

export async function rebuildStandingsFromChoices(): Promise<EloStanding[]> {
  const { replayChoices, standingsToArray } = await import('./elo');
  const choices = await fetchAllRatingChoices();
  if (choices.length === 0) return [];

  const seedMeta = new Map<string, { seedId: string; generation: number }>();
  for (const c of choices) {
    if (!seedMeta.has(c.aHash)) seedMeta.set(c.aHash, { seedId: c.aHash, generation: 0 });
    if (!seedMeta.has(c.bHash)) seedMeta.set(c.bHash, { seedId: c.bHash, generation: 0 });
  }

  const rebuilt = replayChoices(choices, seedMeta, Date.now());
  const array = standingsToArray(rebuilt);
  await saveEloStandings(array);
  return array;
}

// ── LRU trim (keep newest 200 sessions, cascade to orphan choices) ────────────

export async function trimRatingSessions(keep = 200): Promise<void> {
  try {
    const sessions = await ratingDB.ratingSessions.orderBy('startedAt').reverse().toArray();
    if (sessions.length <= keep) return;

    const toDelete = sessions.slice(keep).map((s) => s.sessionId);
    await ratingDB.transaction('rw', [ratingDB.ratingSessions, ratingDB.ratingChoices], async () => {
      // Cascade: delete orphan choices for removed sessions
      const allChoices = await ratingDB.ratingChoices.toArray();
      const keptSessions = new Set(sessions.slice(0, keep).map((s) => s.sessionId));
      const orphaned = allChoices.filter((c) => !keptSessions.has(c.sessionId));
      await ratingDB.ratingChoices.bulkDelete(orphaned.map((c) => c.pairId));
      await ratingDB.ratingSessions.bulkDelete(toDelete);
    });
  } catch (err) {
    console.warn('Rating session trim notice:', err);
  }
}
