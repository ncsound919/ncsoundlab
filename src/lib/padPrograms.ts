/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 6.3 — named pad-program presets.
 *
 * A preset snapshots the four pad banks plus every per-pad param and the
 * global MPC settings. Slots and params are stored by LAYER NAME (stable
 * across reloads) rather than by ephemeral layer id; loading resolves names
 * against the current layers and reports anything that no longer exists, so a
 * preset never silently points at the wrong sound.
 *
 * Persistence helpers follow the `db.ts` convention: IndexedDB failures fall
 * back to empty results so the app keeps working offline/unsupported.
 */

import { db, type StoredPadProgram } from './db';
import { BANK_IDS, type BankId } from '../store/sequencerStore';
import type { SixteenLevelsMode, VelocityCurve } from '../components/MpcPadBank';

export type { StoredPadProgram };

export interface LayerRef {
  id: string;
  name: string;
}

/** Live (id-keyed) program state as held by the sequencer. */
export interface LiveProgramState {
  banks: Record<BankId, (string | null)[]>;
  swing: Record<string, number>;
  pocket: Record<string, number>;
  tune: Record<string, number>;
  choke: Record<string, number>;
  muted: Record<string, boolean>;
  level: Record<string, number>;
  sixteenLevels: boolean;
  sixteenLevelsMode: SixteenLevelsMode;
  globalSwing: number;
  fullLevel: boolean;
  velocityCurve: VelocityCurve;
  timeCorrect: number;
}

const idToName = (layers: LayerRef[]): Map<string, string> =>
  new Map(layers.map((l) => [l.id, l.name]));

const nameToId = (layers: LayerRef[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const l of layers) {
    if (!map.has(l.name)) map.set(l.name, l.id);
  }
  return map;
};

const remapKeys = (obj: Record<string, number>, map: Map<string, string>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) {
    const nk = map.get(k);
    if (nk !== undefined) out[nk] = v;
  }
  return out;
};

const remapBoolKeys = (obj: Record<string, boolean>, map: Map<string, string>): Record<string, boolean> => {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(obj)) {
    const nk = map.get(k);
    if (nk !== undefined) out[nk] = v;
  }
  return out;
};

/** Snapshot live id-keyed state into a name-keyed preset body. */
export function snapshotProgram(
  name: string,
  live: LiveProgramState,
  layers: LayerRef[]
): Omit<StoredPadProgram, 'id' | 'createdAt' | 'updatedAt'> {
  const names = idToName(layers);
  const banks = {} as Record<BankId, (string | null)[]>;
  for (const b of BANK_IDS) {
    banks[b] = (live.banks[b] ?? []).slice(0, 16).map((id) => (id ? (names.get(id) ?? null) : null));
    while (banks[b].length < 16) banks[b].push(null);
  }
  const remapNum = (o: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(o)) {
      const n = names.get(id);
      if (n !== undefined) out[n] = v;
    }
    return out;
  };
  const remapBool = (o: Record<string, boolean>) => {
    const out: Record<string, boolean> = {};
    for (const [id, v] of Object.entries(o)) {
      const n = names.get(id);
      if (n !== undefined) out[n] = v;
    }
    return out;
  };
  return {
    name: (name || '').trim() || 'Program',
    banks,
    swing: remapNum(live.swing),
    pocket: remapNum(live.pocket),
    tune: remapNum(live.tune),
    choke: remapNum(live.choke),
    muted: remapBool(live.muted),
    level: remapNum(live.level),
    sixteenLevels: live.sixteenLevels,
    sixteenLevelsMode: live.sixteenLevelsMode,
    globalSwing: live.globalSwing,
    fullLevel: live.fullLevel,
    velocityCurve: live.velocityCurve,
    timeCorrect: live.timeCorrect,
  };
}

export interface ResolvedProgram extends LiveProgramState {
  /** Layer names in the preset that no longer exist. */
  missing: string[];
}

/** Resolve a name-keyed preset against the current layers. */
export function resolveProgram(stored: StoredPadProgram, layers: LayerRef[]): ResolvedProgram {
  const ids = nameToId(layers);
  const missing: string[] = [];
  const banks = {} as Record<BankId, (string | null)[]>;
  for (const b of BANK_IDS) {
    banks[b] = (stored.banks[b] ?? []).slice(0, 16).map((name) => {
      if (!name) return null;
      const id = ids.get(name);
      if (id === undefined) {
        if (!missing.includes(name)) missing.push(name);
        return null;
      }
      return id;
    });
    while (banks[b].length < 16) banks[b].push(null);
  }
  return {
    banks,
    swing: remapKeys(stored.swing ?? {}, ids),
    pocket: remapKeys(stored.pocket ?? {}, ids),
    tune: remapKeys(stored.tune ?? {}, ids),
    choke: remapKeys(stored.choke ?? {}, ids),
    muted: remapBoolKeys(stored.muted ?? {}, ids),
    level: remapKeys(stored.level ?? {}, ids),
    sixteenLevels: !!stored.sixteenLevels,
    sixteenLevelsMode: stored.sixteenLevelsMode === 'tune' ? 'tune' : 'velocity',
    globalSwing: stored.globalSwing ?? 0,
    fullLevel: !!stored.fullLevel,
    velocityCurve: stored.velocityCurve ?? 'linear',
    timeCorrect: stored.timeCorrect ?? 1,
    missing,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function savePadProgram(
  body: Omit<StoredPadProgram, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const now = new Date().toISOString();
  const row: StoredPadProgram = {
    ...body,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  try {
    await db.padPrograms.put(row);
  } catch (err) {
    console.warn('Pad program save notice (offline/unsupported):', err);
  }
  return row.id;
}

export async function fetchPadPrograms(): Promise<StoredPadProgram[]> {
  try {
    const rows = await db.padPrograms.toArray();
    rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return rows;
  } catch (err) {
    console.warn('Pad program list notice (offline/unsupported):', err);
    return [];
  }
}

export async function deletePadProgram(id: string): Promise<void> {
  try {
    await db.padPrograms.delete(id);
  } catch (err) {
    console.warn('Pad program delete notice (offline/unsupported):', err);
  }
}
