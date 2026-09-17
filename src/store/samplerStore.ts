/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sampler bridge store.
 *
 * The sampler editor lives in the Sound Lab stage, but the MIDI controller
 * lives in Beat Studio. This store is the seam: `SamplerUnit` registers a
 * bridge of sampler operations while it is mounted, and the controller's
 * `sample:*` actions call through it. No bridge (sampler closed) means the
 * sampler actions are inert rather than throwing.
 */

import { create } from 'zustand';

export type SamplerParam =
  | 'zoom'
  | 'amp'
  | 'selStart'
  | 'selEnd'
  | 'selLength'
  | 'selCenter'
  | 'pitch'
  | 'gain';

/** Operations the mounted sampler editor exposes to the controller. */
export interface SamplerBridge {
  reverse(): void;
  normalize(): void;
  invert(): void;
  crop(): void;
  fadeIn(): void;
  fadeOut(): void;
  glitch(): void;
  preview(): void;
  stop(): void;
  setParam(param: SamplerParam, value: number): void;
  /** Trigger the loaded sample chromatically from a pad (0..15). */
  pad(index: number, velocity01: number): void;
}

const COMMANDS: Record<string, keyof SamplerBridge> = {
  reverse: 'reverse',
  normalize: 'normalize',
  invert: 'invert',
  crop: 'crop',
  fadeIn: 'fadeIn',
  fadeOut: 'fadeOut',
  glitch: 'glitch',
  preview: 'preview',
  stop: 'stop',
};

interface SamplerStore {
  bridge: SamplerBridge | null;
  layerName: string | null;
  setBridge: (bridge: SamplerBridge, layerName: string) => void;
  clearBridge: () => void;
  /** Run a one-shot sampler command (reverse / normalize / … / preview / stop). */
  runCommand: (cmd: string) => void;
  setParam: (param: SamplerParam, value: number) => void;
  triggerPad: (index: number, velocity01: number) => void;
}

export const useSamplerStore = create<SamplerStore>((set, get) => ({
  bridge: null,
  layerName: null,

  setBridge: (bridge, layerName) => set({ bridge, layerName }),
  clearBridge: () => set({ bridge: null, layerName: null }),

  runCommand: (cmd) => {
    const bridge = get().bridge;
    if (!bridge) return;
    const method = COMMANDS[cmd];
    if (method) (bridge[method] as () => void)();
  },

  setParam: (param, value) => get().bridge?.setParam(param, value),
  triggerPad: (index, velocity01) => get().bridge?.pad(index, velocity01),
}));

/** Whether a sampler editor is currently mounted (for UI messaging). */
export const samplerAvailable = (): boolean => useSamplerStore.getState().bridge !== null;
