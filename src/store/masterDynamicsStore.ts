/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Master dynamics + sidechain store (Phase 3.5).
 *
 * Holds the user-facing master compressor / limiter settings and the
 * sidechain routing configuration. Persisted as part of the project
 * document. The audio engine reads from this store and applies the values
 * to its master dynamics nodes; sidechain routes are installed once on
 * AudioContext resume.
 */

import { create } from 'zustand';

export interface MasterDynamicsSettings {
  /** Threshold in dB. Negative values start compression below unity. */
  thresholdDb: number;
  /** Compression ratio. 1.0 = bypass; 20.0 = limiter. */
  ratio: number;
  /** Attack time in seconds. */
  attackSec: number;
  /** Release time in seconds. */
  releaseSec: number;
  /** Makeup gain in dB applied after compression. */
  makeupDb: number;
  /** Master compressor enable. */
  enabled: boolean;
}

export const DEFAULT_MASTER_DYNAMICS: MasterDynamicsSettings = {
  thresholdDb: -0.5,
  ratio: 20,
  attackSec: 0.002,
  releaseSec: 0.1,
  makeupDb: 0,
  enabled: true,
};

/**
 * A sidechain route ducks one bus when another source rises. `source` is a
 * layer id (or 'master'); `target` is the bus id to duck.
 */
export interface SidechainRoute {
  id: string;
  source: string; // layer id or 'master'
  target: string; // bus id ('reverb' / 'delay' / ...)
  /** 0..1 — how much to duck at full source energy. */
  amount: number;
  /** Attack/release in seconds. */
  attackSec: number;
  releaseSec: number;
  enabled: boolean;
}

interface MasterDynamicsStore {
  settings: MasterDynamicsSettings;
  sidechains: SidechainRoute[];
  setSettings: (s: Partial<MasterDynamicsSettings>) => void;
  addSidechain: (route: Omit<SidechainRoute, 'id'>) => string;
  updateSidechain: (id: string, partial: Partial<SidechainRoute>) => void;
  removeSidechain: (id: string) => void;
  reset: () => void;
}

export const useMasterDynamicsStore = create<MasterDynamicsStore>((set) => ({
  settings: { ...DEFAULT_MASTER_DYNAMICS },
  sidechains: [],
  setSettings: (partial) =>
    set((s) => ({ settings: { ...s.settings, ...partial } })),
  addSidechain: (route) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `sc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    set((s) => ({ sidechains: [...s.sidechains, { id, ...route }] }));
    return id;
  },
  updateSidechain: (id, partial) =>
    set((s) => ({
      sidechains: s.sidechains.map((r) => (r.id === id ? { ...r, ...partial } : r)),
    })),
  removeSidechain: (id) =>
    set((s) => ({ sidechains: s.sidechains.filter((r) => r.id !== id) })),
  reset: () => set({ settings: { ...DEFAULT_MASTER_DYNAMICS }, sidechains: [] }),
}));

export interface SidechainDuckNodes {
  /** AnalyserNode tapped from the source — the envelope follower reads this. */
  analyser: AnalyserNode;
  /** GainNode that the envelope follower scales 0..1. */
  gain: GainNode;
  /** Dispose all internal nodes and listeners. */
  dispose: () => void;
}
