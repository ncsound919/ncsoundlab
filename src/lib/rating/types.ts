/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Rating loop data model (v1).
 *
 * - All values are JSON-serializable so the export envelope in
 *   `ratingExport.ts` is a flat JSON file.
 * - `ParamHash` is the stable identity for a sound: two variations with the
 *   same params share a hash, and the Elo table keys on it, so re-rendering
 *   the same patch accumulates rating instead of duplicating rows.
 * - Anchors (hidden seed) and attention checks (both sides identical) are
 *   persisted as first-class records so the offline analysis can read them,
 *   but `elo.ts` excludes them from rating updates.
 */

export type ParamHash = string; // SHA-256(hex)[:16] of the canonical params JSON

export type Origin = 'evolve' | 'seed' | 'hand_tuned';

export type DimensionTag =
  | 'knock'            // transient punch / attack
  | 'warmth'           // low-mid body
  | 'movement'         // modulation/evolution over the loop
  | 'character'        // distinctiveness vs generic
  | 'usable_in_beat';  // would keep it in a track as-is

export interface VariationDescriptor {
  paramHash: ParamHash;
  params: Record<string, number | string | boolean>;
  seedId: string;
  generation: number;          // 0 = seed, 1+ = evolve depth
  origin: Origin;
  renderDurationMs: number;   // loop length used for listen-gating math
  createdAt: number;          // epoch ms
}

export type PairKind = 'normal' | 'hidden_anchor' | 'attention_check';

export interface RatingPair {
  pairId: string;            // crypto.randomUUID()
  sessionId: string;
  indexInSession: number;    // 0-based
  kind: PairKind;
  a: VariationDescriptor;
  b: VariationDescriptor;
  insertedAt: number;
}

export type RatingChoiceValue = 'A' | 'B';
export type Confidence = 1 | 2 | 3;

export interface DimensionTags {
  tags: DimensionTag[];
  note?: string;             // <= 200 chars, optional
}

export interface RatingChoice {
  pairId: string;
  sessionId: string;
  choice: RatingChoiceValue; // present for both normal & attention_check & hidden_anchor
                            // (anchors/checks are recorded but excluded from Elo)
  confidence: Confidence;     // default 2
  dimensions: DimensionTags;
  listenMsA: number;
  listenMsB: number;
  decidedAt: number;
  elapsedMs: number;
  skipped?: true;            // if true, choice is absent (see note above)
  attentionPassed?: boolean;  // true iff listenMsA + listenMsB >= gating on the
                             //   one pair where A === B (attention_check)
}

export type SessionSource = 'evolution_panel' | 'compare_engine' | 'manual';
export type RatingSystemVersion = 'elo_v1_k32';

export interface RatingSession {
  sessionId: string;
  schemaVersion: 1;
  appVersion: string;
  startedAt: number;
  endedAt?: number;
  source: SessionSource;
  seedId: string;
  plannedPairs: number;
  completedPairs: number;
  skippedPairs: number;
  ratingSystem: RatingSystemVersion;
  /** 'playback' or 'interactive' — the AudioContext latencyHint used during
   *  the session. Affects how reproducible a judgment is on a different device. */
  contextLatencyHint: string;
  outputDeviceLabel?: string;
}

export interface EloStanding {
  paramHash: ParamHash;
  rating: number;            // 1200 base
  wins: number;
  losses: number;
  exposures: number;         // total times played (win+loss+skip-against-this)
  lastSeenAt: number;
  seedId: string;
  generation: number;
}
