/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 6.2 — persisted chop sessions ("slice maps").
 *
 * A chop map is the durable half of the MPC "chop → program → sequence" loop:
 * slice markers + per-slice gain/tune/key/stretch/name, plus the source audio
 * (base64 WAV) so the map reloads standalone — either back into the sample
 * editor or straight onto pads as a program. List queries return metadata-only
 * rows (audio stripped); `fetchChopMap` re-fetches the full row by id.
 *
 * All persistence helpers follow the `db.ts` convention: they swallow
 * IndexedDB failures (private browsing, unsupported environments) and fall
 * back to empty results so the app keeps working.
 */

import { db, type StoredChopMap, type StoredSliceMeta } from './db';
import { slicesFromMarkers } from './chopLogic';

export type { StoredChopMap, StoredSliceMeta };

/**
 * Normalize a source name into the match key used for auto-loading a saved
 * map when the same sample is reopened: basename without extension, lowercase.
 */
export function chopSourceKey(sourceName: string): string {
  const base = String(sourceName || '').split(/[\\/]/).pop() || '';
  return base.replace(/\.[^.]+$/, '').trim().toLowerCase() || 'sample';
}

/** One pad slot described by a chop map (pure — no AudioBuffer needed). */
export interface ChopMapSlot {
  padIndex: number;
  name: string;
  start: number;
  end: number;
  gain: number;
  tune: number;
  key?: string;
}

/**
 * Map a chop map's slices to pad slots 0..N-1. Pure — shared by the sample
 * editor's "send to pads" path and tests.
 */
export function chopMapSlots(
  map: Pick<StoredChopMap, 'markers' | 'meta'>,
  baseName: string
): ChopMapSlot[] {
  return slicesFromMarkers(map.markers).map((s, i) => {
    const m = map.meta[s.start.toFixed(4)];
    return {
      padIndex: i,
      name: m?.name || `${baseName}_CHOP_${String(i + 1).padStart(2, '0')}`,
      start: s.start,
      end: s.end,
      gain: m?.gain ?? 1,
      tune: m?.tune ?? 0,
      ...(m?.key ? { key: m.key } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export interface SaveChopMapInput {
  /** When set, the existing row is updated instead of creating a new one. */
  id?: string;
  name: string;
  sourceName: string;
  sourceKey: string;
  markers: number[];
  meta: Record<string, StoredSliceMeta>;
  defaultCount: number;
  sourceData?: string;
  sourceMeta?: { sampleRate: number; channels: number; length: number };
  programBank?: string | null;
  sentAt?: string | null;
}

/** Upsert a chop map. Returns the row id (a fresh one when `id` is absent). */
export async function saveChopMap(input: SaveChopMapInput): Promise<string> {
  const now = new Date().toISOString();
  const id = input.id || crypto.randomUUID();
  const existing = input.id ? await fetchChopMap(input.id) : undefined;
  const row: StoredChopMap = {
    id,
    name: (input.name || '').trim() || 'Chops',
    sourceName: input.sourceName,
    sourceKey: input.sourceKey,
    markers: [...input.markers],
    meta: { ...input.meta },
    defaultCount: input.defaultCount,
    // Preserve previously stored audio / program stamp unless replaced.
    ...(existing?.sourceData && input.sourceData === undefined ? { sourceData: existing.sourceData } : {}),
    ...(input.sourceData !== undefined ? { sourceData: input.sourceData } : {}),
    ...(existing?.sourceMeta && input.sourceMeta === undefined ? { sourceMeta: existing.sourceMeta } : {}),
    ...(input.sourceMeta !== undefined ? { sourceMeta: input.sourceMeta } : {}),
    programBank: input.programBank !== undefined ? input.programBank : existing?.programBank ?? null,
    sentAt: input.sentAt !== undefined ? input.sentAt : existing?.sentAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  try {
    await db.chopMaps.put(row);
  } catch (err) {
    console.warn('Chop map save notice (offline/unsupported):', err);
  }
  return id;
}

function stripAudio(row: StoredChopMap): StoredChopMap {
  const { sourceData: _data, ...meta } = row;
  return meta;
}

/** Metadata-only list (audio stripped), newest first. */
export async function fetchChopMaps(): Promise<StoredChopMap[]> {
  try {
    const rows = await db.chopMaps.toArray();
    rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return rows.map(stripAudio);
  } catch (err) {
    console.warn('Chop map list notice (offline/unsupported):', err);
    return [];
  }
}

/** Full row (with source audio) by id. */
export async function fetchChopMap(id: string): Promise<StoredChopMap | undefined> {
  try {
    return await db.chopMaps.get(id);
  } catch (err) {
    console.warn('Chop map fetch notice (offline/unsupported):', err);
    return undefined;
  }
}

/** Most recently updated full map for a source key (for auto-load on reopen). */
export async function fetchChopMapForSource(sourceKey: string): Promise<StoredChopMap | undefined> {
  try {
    const rows = await db.chopMaps.where('sourceKey').equals(sourceKey).toArray();
    rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return rows[0];
  } catch (err) {
    console.warn('Chop map source fetch notice (offline/unsupported):', err);
    return undefined;
  }
}

export async function deleteChopMap(id: string): Promise<void> {
  try {
    await db.chopMaps.delete(id);
  } catch (err) {
    console.warn('Chop map delete notice (offline/unsupported):', err);
  }
}

/** Stamp a map as "sent to pads" (the program side of the chop→program loop). */
export async function stampChopMapSent(id: string, bank: string): Promise<void> {
  try {
    await db.chopMaps.update(id, {
      programBank: bank,
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Chop map stamp notice (offline/unsupported):', err);
  }
}
