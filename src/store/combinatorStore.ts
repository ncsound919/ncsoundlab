/**
 * @license SPDX-License-Identifier: Apache-2.0
 */
import { create } from 'zustand';
import type { CombinatorState, CombinatorSlot, ModRoute } from '../types';

function makeSlot(id: string): CombinatorSlot {
  return {
    id,
    moduleId: 'SATURATION',
    enabled: true,
    mix: 1,
    preGainDb: 0,
    postGainDb: 0,
    polarity: false,
    bands: { low: true, mid: true, high: true },
    crossovers: [200, 2000],
    params: {},
    motion: 'macro',
    motionParams: { depth: 1 },
    locked: false,
  };
}

const initialState: CombinatorState = {
  slots: [],
  routes: [],
  masterMix: 1,
  bpm: 120,
  tightMode: true,
  xyAssign: { x: '', y: '' },
  morphAmount: 0,
};

interface CombinatorStore extends CombinatorState {
  addSlot: (id?: string) => void;
  removeSlot: (id: string) => void;
  reorderSlots: (ids: string[]) => void;
  updateSlot: (id: string, updates: Partial<CombinatorSlot>) => void;
  setMotion: (id: string, motion: CombinatorSlot['motion']) => void;
  addRoute: (route: ModRoute) => void;
  removeRoute: (id: string) => void;
  updateRoute: (id: string, updates: Partial<ModRoute>) => void;
  setMasterMix: (v: number) => void;
  setBpm: (bpm: number) => void;
  setTightMode: (v: boolean) => void;
  setXyAssign: (a: CombinatorState['xyAssign']) => void;
  xyRecording: boolean;
  xyTrajectory: { t: number; x: number; y: number }[];
  startXYRecording: () => void;
  stopXYRecording: () => void;
  appendXYPoint: (x: number, y: number) => void;
  clearXYRecording: () => void;
  loadState: (s: CombinatorState) => void;
  reset: () => void;
}

export const useCombinatorStore = create<CombinatorStore>((set) => ({
  ...initialState,
  addSlot: (id) =>
    set((s) => ({ slots: [...s.slots, makeSlot(id ?? `slot-${s.slots.length + 1}`)] })),
  removeSlot: (id) => set((s) => ({ slots: s.slots.filter((x) => x.id !== id) })),
  reorderSlots: (ids) =>
    set((s) => {
      const map = new Map(s.slots.map((x) => [x.id, x]));
      const next = ids.map((id) => map.get(id)).filter(Boolean) as CombinatorSlot[];
      return { slots: next };
    }),
  updateSlot: (id, updates) =>
    set((s) => ({ slots: s.slots.map((x) => (x.id === id ? { ...x, ...updates } : x)) })),
  setMotion: (id, motion) =>
    set((s) => ({ slots: s.slots.map((x) => (x.id === id ? { ...x, motion } : x)) })),
  addRoute: (route) => set((s) => ({ routes: [...s.routes, route] })),
  removeRoute: (id) => set((s) => ({ routes: s.routes.filter((r) => r.id !== id) })),
  updateRoute: (id, updates) =>
    set((s) => ({ routes: s.routes.map((r) => (r.id === id ? { ...r, ...updates } : r)) })),
  setMasterMix: (v) => set({ masterMix: v }),
  setBpm: (bpm) => set({ bpm }),
  setTightMode: (v) => set({ tightMode: v }),
  setXyAssign: (a) => set({ xyAssign: a }),
  xyRecording: false,
  xyTrajectory: [],
  startXYRecording: () => set({ xyRecording: true, xyTrajectory: [] }),
  stopXYRecording: () => set({ xyRecording: false }),
  appendXYPoint: (x, y) =>
    set((s) => (s.xyRecording ? { xyTrajectory: [...s.xyTrajectory, { t: Date.now(), x, y }] } : {})),
  clearXYRecording: () => set({ xyTrajectory: [] }),
  loadState: (st) => set({ ...st }),
  reset: () => set({ ...initialState }),
}));
