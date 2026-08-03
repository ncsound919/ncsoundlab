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

interface MixerStore {
  buses: SerializedBuses;
  setBus: (id: string, updates: Partial<SerializedBusConfig>) => void;
  setBuses: (buses: SerializedBuses) => void;
  setLayerSend: (layerId: string, busId: string, level: number) => void;
  /** Layer send levels are stored on each layer; this is a UI-only helper. */
  getLayerSend: (layerId: string, busId: string) => number;
  reset: () => void;
}

const sendKey = (layerId: string, busId: string) => `${layerId}::${busId}`;

export const useMixerStore = create<MixerStore>((set, get) => ({
  buses: JSON.parse(JSON.stringify(DEFAULT_BUSES)),
  setBus: (id, updates) =>
    set((s) => {
      const current = s.buses[id] ?? { enabled: true, gain: 1, pan: 0 };
      return {
        buses: { ...s.buses, [id]: { ...current, ...updates } },
      };
    }),
  setBuses: (buses) => set({ buses }),
  setLayerSend: (layerId, busId, level) => {
    if (typeof window === 'undefined') return;
    // Layer sends are read by the audio engine via the layer's own
    // `sends` field — we don't keep a parallel store entry here.
    void layerId;
    void busId;
    void level;
  },
  getLayerSend: (_layerId, _busId) => 0,
  reset: () => set({ buses: JSON.parse(JSON.stringify(DEFAULT_BUSES)) }),
}));

export const SEND_KEY_SEPARATOR = '::';
export const makeSendKey = sendKey;
