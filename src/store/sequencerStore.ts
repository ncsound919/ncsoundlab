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
import { usePatternStore } from './patternStore';

export type BankId = 'A' | 'B' | 'C' | 'D';
export const BANK_IDS: BankId[] = ['A', 'B', 'C', 'D'];

export type Program = (string | null)[]; // 16 slots of layerId

const emptyProgram = (): Program => Array.from({ length: 16 }, () => null);

/** Per-pattern program maps (Phase 6.1 — pads follow the active pattern). */
export type PatternPrograms = Record<string, Record<BankId, Program>>;

const emptyPatternPrograms = (): PatternPrograms => ({
  A: { A: emptyProgram(), B: emptyProgram(), C: emptyProgram(), D: emptyProgram() },
  B: { A: emptyProgram(), B: emptyProgram(), C: emptyProgram(), D: emptyProgram() },
  C: { A: emptyProgram(), B: emptyProgram(), C: emptyProgram(), D: emptyProgram() },
  D: { A: emptyProgram(), B: emptyProgram(), C: emptyProgram(), D: emptyProgram() },
});

interface SequencerStore {
  /** Legacy flat programs (back-compat / derived from active pattern). */
  programs: Record<BankId, Program>;
  /** Per-pattern programs — pads follow the active pattern (Phase 6.1). */
  patternPrograms: PatternPrograms;
  activeBank: BankId;
  setBankProgram: (bank: BankId, layerIds: string[]) => void;
  setActiveBank: (bank: BankId) => void;
  clearBank: (bank: BankId) => void;
  prunePrograms: (validLayerIds: Set<string>) => void;
  /** Phase 6.1 — sync the flat `programs` view to a pattern's program map. */
  activatePatternPrograms: (patternId: string) => void;
  /** Phase 6.1 — write a single slot for the active pattern's active bank. */
  setPatternProgramSlot: (patternId: string, bank: BankId, index: number, layerId: string | null) => void;
  setPatternProgram: (patternId: string, bank: BankId, layerIds: string[]) => void;
  setPatternProgramsAll: (map: PatternPrograms) => void;
}

export const useSequencerStore = create<SequencerStore>((set, get) => ({
  programs: { A: emptyProgram(), B: emptyProgram(), C: emptyProgram(), D: emptyProgram() },
  patternPrograms: emptyPatternPrograms(),
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

  clearBank: (bank) =>
    set((state) => {
      // Clear both the flat view and the active pattern's program.
      const patternId = usePatternStore.getState().activePatternId;
      const patternPrograms = { ...state.patternPrograms };
      const pat = patternPrograms[patternId];
      if (pat) patternPrograms[patternId] = { ...pat, [bank]: emptyProgram() };
      return {
        programs: { ...state.programs, [bank]: emptyProgram() },
        patternPrograms,
      };
    }),

  prunePrograms: (validLayerIds) =>
    set((state) => {
      let changed = false;
      const programs: Record<BankId, Program> = { ...state.programs };
      for (const bank of BANK_IDS) {
        const slots = programs[bank].map((id) => (id && !validLayerIds.has(id) ? null : id));
        if (slots.some((s, i) => s !== programs[bank][i])) changed = true;
        programs[bank] = slots;
      }
      const patternPrograms: PatternPrograms = {};
      for (const [pid, banks] of Object.entries(state.patternPrograms)) {
        patternPrograms[pid] = { ...banks };
        for (const bank of BANK_IDS) {
          const slots = patternPrograms[pid][bank].map((id) => (id && !validLayerIds.has(id) ? null : id));
          if (slots.some((s, i) => s !== patternPrograms[pid][bank][i])) changed = true;
          patternPrograms[pid][bank] = slots;
        }
      }
      return changed ? { programs, patternPrograms } : {};
    }),

  activatePatternPrograms: (patternId) =>
    set((state) => {
      const pat = state.patternPrograms[patternId];
      if (!pat) return {};
      return { programs: { A: pat.A.slice(), B: pat.B.slice(), C: pat.C.slice(), D: pat.D.slice() } };
    }),

  setPatternProgramSlot: (patternId, bank, index, layerId) =>
    set((state) => {
      const pat = state.patternPrograms[patternId] ?? {
        A: emptyProgram(), B: emptyProgram(), C: emptyProgram(), D: emptyProgram(),
      };
      const prog = (pat[bank] ?? emptyProgram()).slice();
      prog[index] = layerId;
      const nextPat = { ...pat, [bank]: prog };
      const patternPrograms = { ...state.patternPrograms, [patternId]: nextPat };
      // Keep the flat view in sync when editing the active pattern.
      if (patternId === usePatternStore.getState().activePatternId) {
        return { patternPrograms, programs: { A: nextPat.A.slice(), B: nextPat.B.slice(), C: nextPat.C.slice(), D: nextPat.D.slice() } };
      }
      return { patternPrograms };
    }),

  setPatternProgram: (patternId, bank, layerIds) =>
    set((state) => {
      const slots = emptyProgram();
      layerIds.slice(0, 16).forEach((id, i) => { if (id) slots[i] = id; });
      const pat = state.patternPrograms[patternId] ?? {
        A: emptyProgram(), B: emptyProgram(), C: emptyProgram(), D: emptyProgram(),
      };
      const nextPat = { ...pat, [bank]: slots };
      const patternPrograms = { ...state.patternPrograms, [patternId]: nextPat };
      if (patternId === usePatternStore.getState().activePatternId) {
        return { patternPrograms, programs: { A: nextPat.A.slice(), B: nextPat.B.slice(), C: nextPat.C.slice(), D: nextPat.D.slice() } };
      }
      return { patternPrograms };
    }),

  setPatternProgramsAll: (map) => set({ patternPrograms: map }),
}));

