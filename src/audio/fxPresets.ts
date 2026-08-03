/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * FX-chain preset model + storage (Phase 3.6).
 *
 * A preset is a named snapshot of either a master rack module chain or a
 * single layer's FX settings. Presets are stored:
 *
 * - in IndexedDB (`fxPresets` table) so they survive a cache clear;
 * - optionally embedded inside a `.nsl` project document (Phase 3.6);
 * - mirrored to localStorage as a fallback when IndexedDB is unavailable
 *   (private browsing, restrictive cookies).
 *
 * The store does not own the FX engine. It exposes a CRUD + import/export
 * API that the existing PresetBrowser / LayerPresetBrowser consume.
 */

import type { RackModule } from '../types';

export type PresetTarget =
  | { kind: 'master-rack' }
  | { kind: 'layer-fx'; layerId?: string };

export interface FXChainPreset {
  id: string;
  name: string;
  description?: string;
  target: PresetTarget;
  modules?: RackModule[];
  fxSettings?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const PRESETS_LOCALSTORAGE_KEY = 'soundlab_fx_presets_v1';

const sanitizeModule = (m: any): RackModule | null => {
  if (!m || typeof m !== 'object') return null;
  if (typeof m.id !== 'string' || typeof m.type !== 'string') return null;
  return {
    id: m.id,
    type: m.type,
    enabled: m.enabled !== false,
    settings: m.settings && typeof m.settings === 'object' ? { ...m.settings } : {},
    ...(typeof m.parallelGain === 'number' ? { parallelGain: m.parallelGain } : {}),
    ...(typeof m.parallelPan === 'number' ? { parallelPan: m.parallelPan } : {}),
    ...(typeof m.parallelMute === 'boolean' ? { parallelMute: m.parallelMute } : {}),
    ...(typeof m.parallelSolo === 'boolean' ? { parallelSolo: m.parallelSolo } : {}),
  };
};

export const sanitizePreset = (raw: any): FXChainPreset | null => {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const targetKind = raw.target?.kind;
  let target: PresetTarget;
  if (targetKind === 'master-rack') {
    target = { kind: 'master-rack' };
  } else if (targetKind === 'layer-fx') {
    target = { kind: 'layer-fx', ...(typeof raw.target.layerId === 'string' ? { layerId: raw.target.layerId } : {}) };
  } else {
    return null;
  }
  return {
    id: raw.id,
    name: raw.name,
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    target,
    ...(Array.isArray(raw.modules)
      ? {
          modules: raw.modules
            .map(sanitizeModule)
            .filter((m: RackModule | null): m is RackModule => m !== null),
        }
      : {}),
    ...(raw.fxSettings && typeof raw.fxSettings === 'object'
      ? { fxSettings: { ...raw.fxSettings } }
      : {}),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
};

/**
 * localStorage-backed preset list. Returns an empty array on failure
 * (private browsing, quota) so callers never crash.
 */
export const loadAllPresets = (): FXChainPreset[] => {
  try {
    const raw = localStorage.getItem(PRESETS_LOCALSTORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizePreset).filter((p: FXChainPreset | null): p is FXChainPreset => p !== null);
  } catch {
    return [];
  }
};

export const saveAllPresets = (presets: FXChainPreset[]): void => {
  try {
    localStorage.setItem(PRESETS_LOCALSTORAGE_KEY, JSON.stringify(presets));
  } catch (err) {
    console.warn('FX preset save failed (localStorage quota?):', err);
  }
};

export const addPreset = (preset: FXChainPreset): FXChainPreset[] => {
  const all = loadAllPresets();
  const next = [preset, ...all.filter((p) => p.id !== preset.id)];
  saveAllPresets(next);
  return next;
};

export const removePreset = (id: string): FXChainPreset[] => {
  const next = loadAllPresets().filter((p) => p.id !== id);
  saveAllPresets(next);
  return next;
};

/**
 * Helper to capture a master rack chain into a preset.
 */
export const captureMasterRackPreset = (
  name: string,
  modules: RackModule[],
  description?: string
): FXChainPreset => {
  const now = new Date().toISOString();
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p-${Date.now()}`,
    name,
    ...(description ? { description } : {}),
    target: { kind: 'master-rack' },
    modules: modules.map((m) => ({
      id: m.id,
      type: m.type,
      enabled: m.enabled !== false,
      settings: { ...m.settings },
      ...(typeof m.parallelGain === 'number' ? { parallelGain: m.parallelGain } : {}),
      ...(typeof m.parallelPan === 'number' ? { parallelPan: m.parallelPan } : {}),
      ...(typeof m.parallelMute === 'boolean' ? { parallelMute: m.parallelMute } : {}),
      ...(typeof m.parallelSolo === 'boolean' ? { parallelSolo: m.parallelSolo } : {}),
    })),
    createdAt: now,
    updatedAt: now,
  };
};
