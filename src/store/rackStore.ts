import { create } from 'zustand';
import { RackModule, ModuleType } from '../types';
import { DEFAULT_EQ_SETTINGS } from '../audio/dsp/AdvancedParametricEQ';
import { DEFAULT_COMPRESSOR_SETTINGS } from '../audio/dsp/AdvancedCompressor';

interface HistoryState {
  past: RackModule[][];
  future: RackModule[][];
}

interface RackStore {
  modules: RackModule[];
  history: HistoryState;
  activeAbState: 'A' | 'B';
  snapshotA: RackModule[];
  snapshotB: RackModule[];
  routingMode: 'serial' | 'parallel';
  zeroLatency: boolean;

  setModules: (modules: RackModule[]) => void;
  addModule: (type: ModuleType) => void;
  removeModule: (id: string) => void;
  duplicateModule: (id: string) => void;
  updateModule: (id: string, updates: Partial<RackModule>) => void;

  undo: () => void;
  redo: () => void;

  switchToA: () => void;
  switchToB: () => void;
  copyToA: () => void;
  copyToB: () => void;

  setRoutingMode: (mode: 'serial' | 'parallel') => void;
  setZeroLatency: (enabled: boolean) => void;
}

const getDefaultSettings = (type: ModuleType) => {
  switch (type) {
    case 'eq':
      return DEFAULT_EQ_SETTINGS;
    case 'compressor':
      return DEFAULT_COMPRESSOR_SETTINGS;
    case 'limiter':
      return { threshold: -1, release: 100, ceiling: -0.1 };
    case 'clipper':
      return { threshold: -3, ceil: -0.1, knee: 50 };
    case 'saturator':
      return { drive: 12, mix: 100, tone: 50 };
    case 'tape':
      return { drive: 3, bias: 50, wowFlutter: 15 };
    case 'exciter':
      return { amount: 35, freq: 4000, mix: 50 };
    case 'delay':
      return { mix: 30, time: 350, feedback: 40 };
    case 'reverb':
      return { mix: 25, decay: 2.5, preDelay: 20 };
    case 'chorus':
      return { mix: 40, rate: 1.2, depth: 50 };
    case 'flanger':
      return { rate: 0.5, depth: 70, feedback: 50 };
    case 'phaser':
      return { rate: 0.8, depth: 80, feedback: 40 };
    case 'tremolo':
      return { rate: 4, depth: 60, shape: 'sine' };
    case 'imager':
      return { width: 130, midGain: 0, sideGain: 0 };
    default:
      return {};
  }
};

export const useRackStore = create<RackStore>((set, get) => ({
  modules: [],
  history: { past: [], future: [] },
  activeAbState: 'A',
  snapshotA: [],
  snapshotB: [],
  routingMode: 'serial',
  zeroLatency: false,

  setModules: (newModules) => {
    const { modules, history } = get();
    set({
      modules: newModules,
      history: {
        past: [...history.past.slice(-20), modules],
        future: [],
      },
    });
  },

  addModule: (type) => {
    const { modules, setModules } = get();
    const newModule: RackModule = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      enabled: true,
      settings: getDefaultSettings(type),
    };
    setModules([...modules, newModule]);
  },

  removeModule: (id) => {
    const { modules, setModules } = get();
    setModules(modules.filter((m) => m.id !== id));
  },

  duplicateModule: (id) => {
    const { modules, setModules } = get();
    const target = modules.find((m) => m.id === id);
    if (!target) return;
    const duplicated: RackModule = {
      ...JSON.parse(JSON.stringify(target)),
      id: Math.random().toString(36).substring(2, 9),
    };
    const index = modules.findIndex((m) => m.id === id);
    const updated = [...modules];
    updated.splice(index + 1, 0, duplicated);
    setModules(updated);
  },

  updateModule: (id, updates) => {
    const { modules } = get();
    set({
      modules: modules.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    });
  },

  undo: () => {
    const { modules, history } = get();
    if (history.past.length === 0) return;
    const previous = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, history.past.length - 1);
    set({
      modules: previous,
      history: {
        past: newPast,
        future: [modules, ...history.future],
      },
    });
  },

  redo: () => {
    const { modules, history } = get();
    if (history.future.length === 0) return;
    const next = history.future[0];
    const newFuture = history.future.slice(1);
    set({
      modules: next,
      history: {
        past: [...history.past.slice(-20), modules],
        future: newFuture,
      },
    });
  },

  switchToA: () => {
    const { activeAbState, modules, snapshotA } = get();
    if (activeAbState === 'A') return;
    set({
      snapshotB: modules,
      modules: snapshotA,
      activeAbState: 'A',
    });
  },

  switchToB: () => {
    const { activeAbState, modules, snapshotB } = get();
    if (activeAbState === 'B') return;
    set({
      snapshotA: modules,
      modules: snapshotB,
      activeAbState: 'B',
    });
  },

  copyToA: () => {
    const { modules } = get();
    set({ snapshotA: JSON.parse(JSON.stringify(modules)) });
  },

  copyToB: () => {
    const { modules } = get();
    set({ snapshotB: JSON.parse(JSON.stringify(modules)) });
  },

  setRoutingMode: (routingMode) => set({ routingMode }),
  setZeroLatency: (zeroLatency) => set({ zeroLatency }),
}));
