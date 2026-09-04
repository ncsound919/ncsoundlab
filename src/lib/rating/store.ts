/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Rating session state machine + Zustand store.
 *
 * State machine: idle -> setup -> active -> summary -> idle
 *
 * The store is the source of truth for the in-session UI. All writes also
 * flow to IndexedDB via `ratingPersist.ts`. The analytics events fire from
 * here so every state transition is tracked (but NEVER the choice values).
 */

import { create } from 'zustand';
import type {
  Confidence,
  DimensionTag,
  DimensionTags,
  EloStanding,
  ParamHash,
  RatingChoice,
  RatingPair,
  RatingSession,
  VariationDescriptor,
} from './types';
import { applyChoice, replayChoices, standingsToArray, type RatingChoiceWithHashes } from './elo';
import { buildPairsForBatch } from './pairBuilder';
import { trackEvent } from '../analytics';

export type SessionPhase = 'idle' | 'setup' | 'active' | 'summary';

export interface RatingStoreState {
  // ── Phase ───────────────────────────────────────────────────────────────────
  phase: SessionPhase;

  // ── Session ────────────────────────────────────────────────────────────────
  session: RatingSession | null;
  queue: RatingPair[];
  currentIndex: number;
  seed: VariationDescriptor | null;

  // ── Listen tracking (reset per pair) ─────────────────────────────────────
  listenMsA: number;
  listenMsB: number;
  pairStartedAt: number;   // Date.now() when the pair became current
  sessionStartedAt: number; // Date.now() when the session started

  // ── Standings (in-memory snapshot, persisted from DB) ──────────────────────
  standings: EloStanding[];

  // ── Derived summary (built on endSession) ─────────────────────────────────
  summaryChoices: RatingChoice[];
  summaryElapsedMs: number;

  // ── Internal ───────────────────────────────────────────────────────────────
  /** Seed-id → { seedId, generation } lookup for Elo table construction. */
  _seedMeta: Map<ParamHash, { seedId: string; generation: number }>;
  /** Runtime standings map for incremental updates. */
  _standingsMap: Map<ParamHash, EloStanding>;
  /** Pending choice that the post-choice form fills in. */
  _pendingChoice: {
    pair: RatingPair;
    choice: 'A' | 'B';
    listenMsA: number;
    listenMsB: number;
    confidence: Confidence;
    dimensions: DimensionTags;
    elapsedMs: number;
  } | null;
}

interface RatingStoreActions {
  startSession: (opts: {
    batch: VariationDescriptor[];
    seed: VariationDescriptor;
    sessionLen: 10 | 20 | 40;
    source: RatingSession['source'];
    appVersion: string;
    /** Pre-loaded standings from IndexedDB. */
    priorStandings?: EloStanding[];
  }) => void;
  /** Called by the pair player to record accumulated listen time. */
  recordListenTime: (msA: number, msB: number) => void;
  /** Called by the pair player after the post-choice form is filled. */
  submitChoice: (choice: {
    pair: RatingPair;
    choice: 'A' | 'B';
    listenMsA: number;
    listenMsB: number;
    confidence: Confidence;
    dimensions: DimensionTags;
    elapsedMs: number;
  }) => void;
  /** Skip this pair (up to 2 per session). Returns true if skip was used. */
  attemptSkip: () => boolean;
  endSession: () => RatingSession;
  /** Load prior standings from DB on mount / when panel opens. */
  loadStandings: (standings: EloStanding[]) => void;
  /** Reset to idle (e.g., on explicit close). */
  reset: () => void;

  // ── Internal ─────────────────────────────────────────────────────────────
  _advancePair: () => void;
  _buildStandingsMap: (prior: EloStanding[]) => Map<ParamHash, EloStanding>;
}

const MAX_SKIPS = 2;

const initialState: RatingStoreState = {
  phase: 'idle',
  session: null,
  queue: [],
  currentIndex: 0,
  seed: null,
  listenMsA: 0,
  listenMsB: 0,
  pairStartedAt: 0,
  sessionStartedAt: 0,
  standings: [],
  summaryChoices: [],
  summaryElapsedMs: 0,
  _seedMeta: new Map(),
  _standingsMap: new Map(),
  _pendingChoice: null,
};

export const useRatingStore = create<RatingStoreState & RatingStoreActions>((set, get) => ({
  ...initialState,

  startSession({ batch, seed, sessionLen, source, appVersion, priorStandings = [] }) {
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    const session: RatingSession = {
      sessionId,
      schemaVersion: 1,
      appVersion,
      startedAt: now,
      source,
      seedId: seed.seedId,
      plannedPairs: sessionLen,
      completedPairs: 0,
      skippedPairs: 0,
      ratingSystem: 'elo_v1_k32',
      contextLatencyHint: 'playback',
    };

    const queue = buildPairsForBatch(sessionId, batch, sessionLen, seed, priorStandings);

    const seedMeta = new Map<ParamHash, { seedId: string; generation: number }>();
    batch.forEach((v) => seedMeta.set(v.paramHash, { seedId: v.seedId, generation: v.generation }));
    seedMeta.set(seed.paramHash, { seedId: seed.seedId, generation: seed.generation });

    const smap = get()._buildStandingsMap(priorStandings);

    trackEvent('rating_session_started', {
      source,
      planned_pairs: sessionLen,
      seed_id_kind: seed.origin,
    });

    set({
      phase: 'active',
      session,
      queue,
      currentIndex: 0,
      seed,
      listenMsA: 0,
      listenMsB: 0,
      pairStartedAt: now,
      sessionStartedAt: now,
      standings: standingsToArray(smap),
      summaryChoices: [],
      summaryElapsedMs: 0,
      _seedMeta: seedMeta,
      _standingsMap: smap,
      _pendingChoice: null,
    });
  },

  recordListenTime(msA, msB) {
    set({ listenMsA: msA, listenMsB: msB });
  },

  submitChoice(choice) {
    const { session, queue, currentIndex, _standingsMap, _seedMeta, listenMsA, listenMsB } = get();
    if (!session) return;

    const { pair, confidence, dimensions, elapsedMs } = choice;
    const ratingChoice: RatingChoice = {
      pairId: pair.pairId,
      sessionId: session.sessionId,
      choice: choice.choice,
      confidence,
      dimensions,
      listenMsA: choice.listenMsA,
      listenMsB: choice.listenMsB,
      decidedAt: Date.now(),
      elapsedMs,
    };

    // Incremental Elo update (normal pairs only)
    if (pair.kind === 'normal') {
      const extended: RatingChoiceWithHashes = {
        ...ratingChoice,
        aHash: pair.a.paramHash,
        bHash: pair.b.paramHash,
        kind: 'normal',
      };
      applyChoice(_standingsMap, extended, _seedMeta, Date.now());
      set({ standings: standingsToArray(_standingsMap) });
      set({ standings: standingsToArray(_standingsMap) });
    }

    const updatedSession: RatingSession = {
      ...session,
      completedPairs: session.completedPairs + 1,
    };

    trackEvent('rating_pair_submitted', {
      kind: pair.kind,
      index_in_session: currentIndex,
      has_tags: dimensions.tags.length > 0,
    });

    set({
      session: updatedSession,
      summaryChoices: [...get().summaryChoices, ratingChoice],
      _pendingChoice: null,
    });

    get()._advancePair();
  },

  attemptSkip() {
    const { session, queue, currentIndex, _standingsMap, _seedMeta } = get();
    if (!session || session.skippedPairs >= MAX_SKIPS) return false;

    const pair = queue[currentIndex];
    const now = Date.now();
    const skipChoice: RatingChoice = {
      pairId: pair.pairId,
      sessionId: session.sessionId,
      choice: 'A', // placeholder; skipped pairs have no winner
      confidence: 2,
      dimensions: { tags: [] },
      listenMsA: get().listenMsA,
      listenMsB: get().listenMsB,
      decidedAt: now,
      elapsedMs: now - get().pairStartedAt,
      skipped: true,
    };

    // Bump exposures only (no rating change)
    if (pair.kind === 'normal') {
      const aMeta = _seedMeta.get(pair.a.paramHash) ?? { seedId: pair.a.seedId, generation: pair.a.generation };
      const bMeta = _seedMeta.get(pair.b.paramHash) ?? { seedId: pair.b.seedId, generation: pair.b.generation };
      const aRow = _standingsMap.get(pair.a.paramHash);
      const bRow = _standingsMap.get(pair.b.paramHash);
      if (aRow) { aRow.exposures += 1; aRow.lastSeenAt = now; }
      if (bRow) { bRow.exposures += 1; bRow.lastSeenAt = now; }
      set({ standings: standingsToArray(_standingsMap) });
    }

    const updatedSession: RatingSession = {
      ...session,
      skippedPairs: session.skippedPairs + 1,
    };

    trackEvent('rating_pair_submitted', {
      kind: pair.kind,
      index_in_session: currentIndex,
      has_tags: false,
    });

    set({
      session: updatedSession,
      summaryChoices: [...get().summaryChoices, skipChoice],
    });

    get()._advancePair();
    return true;
  },

  endSession() {
    const { session, summaryChoices, sessionStartedAt } = get();
    if (!session) throw new Error('No active session');

    const endedSession: RatingSession = {
      ...session,
      endedAt: Date.now(),
      completedPairs: session.completedPairs,
    };

    const elapsedMs = Date.now() - sessionStartedAt;

    trackEvent('rating_session_completed', {
      completed: session.completedPairs,
      skipped: session.skippedPairs,
      duration_s: Math.round(elapsedMs / 1000),
    });

    set({
      phase: 'summary',
      session: endedSession,
      summaryElapsedMs: elapsedMs,
    });

    return endedSession;
  },

  loadStandings(standings) {
    const smap = get()._buildStandingsMap(standings);
    set({ standings: standingsToArray(smap), _standingsMap: smap });
  },

  reset() {
    set(initialState);
  },

  _advancePair() {
    const { queue, currentIndex, listenMsA, listenMsB } = get();
    const next = currentIndex + 1;
    if (next >= queue.length) {
      get().endSession();
    } else {
      set({
        currentIndex: next,
        listenMsA: 0,
        listenMsB: 0,
        pairStartedAt: Date.now(),
      });
    }
  },

  _buildStandingsMap(prior: EloStanding[]): Map<ParamHash, EloStanding> {
    const m = new Map<ParamHash, EloStanding>();
    for (const s of prior) m.set(s.paramHash, { ...s });
    return m;
  },
}));
