/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MPC program state shared between the sections that build programs
 * (Sound Lab, Synth, Evolution, Chops) and the Beat Studio pad bank.
 *
 * Each bank (A/B/C/D) is its own 16-slot program referencing sound layers by id.
 */

import { create } from 'zustand';

export type BankId = 'A' | 'B' | 'C' | 'D';
export const BANK_IDS: BankId[] = ['A', 'B', 'C', 'D'];

export type Program = (string | null)[]; // 16 slots of layerId

const emptyProgram = (): Program => Array.from({ length: 16 }, () => null);

interface SequencerStore {
  programs: Record<BankId, Program>;
  activeBank: BankId;
  setBankProgram: (bank: BankId, layerIds: string[]) => void;
  setActiveBank: (bank: BankId) => void;
  clearBank: (bank: BankId) => void;
  prunePrograms: (validLayerIds: Set<string>) => void;
}

export const useSequencerStore = create<SequencerStore>((set) => ({
  programs: { A: emptyProgram(), B: emptyProgram(), C: emptyProgram(), D: emptyProgram() },
  activeBank: 'A',
  setBankProgram: (bank, layerIds) =>
    set((state) => {
      const slots = emptyProgram();
      layerIds.slice(0, 16).forEach((id, i) => {
        if (id) slots[i] = id;
      });
      return { programs: { ...state.programs, [bank]: slots } };
    }),
  setActiveBank: (bank) => set({ activeBank: bank }),
  clearBank: (bank) => set((state) => ({ programs: { ...state.programs, [bank]: emptyProgram() } })),
  prunePrograms: (validLayerIds) =>
    set((state) => {
      let changed = false;
      const programs: Record<BankId, Program> = { ...state.programs };
      for (const bank of BANK_IDS) {
        const slots = programs[bank].map((id) => (id && !validLayerIds.has(id) ? null : id));
        if (slots.some((s, i) => s !== programs[bank][i])) changed = true;
        programs[bank] = slots;
      }
      return changed ? { programs } : {};
    }),
}));
