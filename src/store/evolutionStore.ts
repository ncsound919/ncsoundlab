/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Evolution Engine bridge store.
 *
 * The Evolution panel keeps its generation settings (mode / FX option) and the
 * variation list in local component state. This store lets the controller's
 * `section:evolution:*` actions drive that panel while it is mounted: the panel
 * registers a bridge, the host calls through it, and the controller's own
 * "selected variation" index lives here. No bridge (panel closed) means the
 * section actions are inert no-ops.
 */

import { create } from 'zustand';
import type { EvolutionMode, FXEvolutionOption } from '../lib/evolutionEngine';

export const EVOLUTION_MODES: EvolutionMode[] = ['mutations', 'melodic', 'kit'];
export const EVOLUTION_FX: FXEvolutionOption[] = ['mutate', 'freeze', 'fx_only'];

export interface EvolutionBridge {
  /** Set the generation mode (Mutations / Melodic / Kit). */
  setMode(mode: EvolutionMode): void;
  /** Set the FX mutation option (Mutate / Freeze / FX only). */
  setFx(fx: FXEvolutionOption): void;
  /** Fire a new generation with the panel's current mode + FX option. */
  reEvolve(): void;
  /** Preview the variation at `index` (or stop when out of range). */
  playVariation(index: number): void;
  /** Stop any running preview. */
  stopPlayback(): void;
  /** Add the variation at `index` to the layer stack. */
  addVariation(index: number): void;
  /** Save the variation at `index` to the active kit. */
  saveVariationToKit(index: number): void;
  /** Discard the variation at `index`. */
  discardVariation(index: number): void;
  /** How many variations currently exist. */
  variationCount(): number;
}

interface EvolutionStore {
  bridge: EvolutionBridge | null;
  /** Variation index the controller acts on (set by a section knob). */
  selectedIndex: number;
  setBridge: (bridge: EvolutionBridge) => void;
  clearBridge: () => void;
  selectIndex: (index: number) => void;
}

export const useEvolutionStore = create<EvolutionStore>((set) => ({
  bridge: null,
  selectedIndex: 0,
  setBridge: (bridge) => set({ bridge }),
  clearBridge: () => set({ bridge: null }),
  selectIndex: (index) => set({ selectedIndex: Math.max(0, Math.floor(index)) }),
}));

/** True while the Evolution panel is mounted and driving its bridge. */
export const evolutionAvailable = (): boolean => useEvolutionStore.getState().bridge !== null;
