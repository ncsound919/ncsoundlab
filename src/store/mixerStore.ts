/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mixer bus store (Phase 3.3).
 *
 * Holds the global FX send/return bus configuration. The audio engine reads
 * from this store to drive per-layer send taps and bus return gains. The
 * shape matches `SerializedBuses` so it can be persisted directly via the
 * project serializer.
 */

import { create } from 'zustand';
import type { SerializedBuses, SerializedBusConfig } from '../lib/projectFormat';
import { DEFAULT_BUSES } from '../lib/projectFormat';
import type { LayerSends } from '../types';

interface MixerStore {
  buses: SerializedBuses;
  /**
   * Per-layer FX send levels (Phase 3.3). Indexed by layer id; each entry maps
   * a bus id → 0..1 send gain. This is the engine's source of truth for send
   * taps. When a layer is loaded from a project, the layer's own `sends` field
   * is merged here so both paths agree.
   */
  layerSends: Record<string, LayerSends>;
  setBus: (id: string, updates: Partial<SerializedBusConfig>) => void;
  setBuses: (buses: SerializedBuses) => void;
  setLayerSend: (layerId: string, busId: string, level: number) => void;
  setLayerSends: (layerId: string, sends: LayerSends | undefined) => void;
  getLayerSend: (layerId: string, busId: string) => number;
  reset: () => void;
}

const sendKey = (layerId: string, busId: string) => `${layerId}::${busId}`;

export const useMixerStore = create<MixerStore>((set, get) => ({
  buses: JSON.parse(JSON.stringify(DEFAULT_BUSES)),
  layerSends: {},
  setBus: (id, updates) =>
    set((s) => {
      const current = s.buses[id] ?? { enabled: true, gain: 1, pan: 0 };
      return {
        buses: { ...s.buses, [id]: { ...current, ...updates } },
      };
    }),
  setBuses: (buses) => set({ buses }),
  setLayerSend: (layerId, busId, level) =>
    set((s) => {
      const current: LayerSends = s.layerSends[layerId] ?? {};
      const clamped = Math.max(0, Math.min(1, level));
      return {
        layerSends: {
          ...s.layerSends,
          [layerId]: { ...current, [busId]: clamped },
        },
      };
    }),
  setLayerSends: (layerId, sends) =>
    set((s) => {
      if (!sends || Object.keys(sends).length === 0) {
        const { [layerId]: _removed, ...rest } = s.layerSends;
        return { layerSends: rest };
      }
      return { layerSends: { ...s.layerSends, [layerId]: { ...sends } } };
    }),
  getLayerSend: (layerId, busId) => {
    const entry = get().layerSends[layerId];
    if (!entry) return 0;
    return entry[busId] ?? 0;
  },
  reset: () => set({ buses: JSON.parse(JSON.stringify(DEFAULT_BUSES)), layerSends: {} }),
}));
