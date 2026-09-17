/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Recourse composer bridge store.
 *
 * `RecourseComposerPanel` registers a bridge of composer actions while it is
 * mounted; the controller's `recourse:*` actions call through it. With no bridge
 * (panel not mounted) the actions are inert rather than throwing.
 */

import { create } from 'zustand';

export type RecourseParam = 'styleIndex' | 'seed' | 'keyIndex' | 'barsIndex' | 'mode';

export interface RecourseBridge {
  generate(): void;
  load(): void;
  toPattern(): void;
  useKey(): void;
  stylePrev(): void;
  styleNext(): void;
  modeNext(): void;
  barsNext(): void;
  seedDown(): void;
  seedUp(): void;
  seedRandom(): void;
  keyDown(): void;
  keyUp(): void;
  /** Continuous control (knobs/faders): map a value onto the current UI. */
  setParam(param: RecourseParam, value: number): void;
}

const COMMANDS: Record<string, keyof RecourseBridge> = {
  generate: 'generate',
  load: 'load',
  toPattern: 'toPattern',
  useKey: 'useKey',
  stylePrev: 'stylePrev',
  styleNext: 'styleNext',
  modeNext: 'modeNext',
  barsNext: 'barsNext',
  seedDown: 'seedDown',
  seedUp: 'seedUp',
  seedRandom: 'seedRandom',
  keyDown: 'keyDown',
  keyUp: 'keyUp',
};

interface RecourseStore {
  bridge: RecourseBridge | null;
  setBridge: (bridge: RecourseBridge) => void;
  clearBridge: () => void;
  runCommand: (cmd: string) => void;
  setParam: (param: RecourseParam, value: number) => void;
}

export const useRecourseStore = create<RecourseStore>((set, get) => ({
  bridge: null,

  setBridge: (bridge) => set({ bridge }),
  clearBridge: () => set({ bridge: null }),

  runCommand: (cmd) => {
    const bridge = get().bridge;
    if (!bridge) return;
    const method = COMMANDS[cmd];
    if (method) (bridge[method] as () => void)();
  },

  setParam: (param, value) => get().bridge?.setParam(param, value),
}));

/** Whether the composer panel is currently mounted. */
export const recourseAvailable = (): boolean => useRecourseStore.getState().bridge !== null;
