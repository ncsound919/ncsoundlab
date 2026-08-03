/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/store/sequencerStore.ts` — per-pattern pad programs (Phase 6.1).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useSequencerStore, BANK_IDS } from './sequencerStore';
import { usePatternStore } from './patternStore';

describe('sequencerStore — per-pattern programs', () => {
  beforeEach(() => {
    const empty16 = () => Array.from({ length: 16 }, () => null);
    useSequencerStore.setState({
      programs: { A: empty16(), B: empty16(), C: empty16(), D: empty16() },
      patternPrograms: {
        A: { A: empty16(), B: empty16(), C: empty16(), D: empty16() },
        B: { A: empty16(), B: empty16(), C: empty16(), D: empty16() },
        C: { A: empty16(), B: empty16(), C: empty16(), D: empty16() },
        D: { A: empty16(), B: empty16(), C: empty16(), D: empty16() },
      },
      activeBank: 'A',
    });
    usePatternStore.setState({ activePatternId: 'A' });
  });

  it('setPatternProgramSlot writes into the active pattern and mirrors the flat view', () => {
    useSequencerStore.getState().setPatternProgramSlot('A', 'A', 0, 'layer-1');
    const s = useSequencerStore.getState();
    expect(s.patternPrograms.A.A[0]).toBe('layer-1');
    expect(s.programs.A[0]).toBe('layer-1');
  });

  it('does NOT mirror non-active pattern edits into the flat view', () => {
    useSequencerStore.getState().setPatternProgramSlot('B', 'A', 0, 'layer-x');
    const s = useSequencerStore.getState();
    expect(s.patternPrograms.B.A[0]).toBe('layer-x');
    expect(s.programs.A[0]).toBe(null);
  });

  it('activatePatternPrograms swaps the flat view to the target pattern', () => {
    useSequencerStore.getState().setPatternProgramSlot('A', 'B', 2, 'kick');
    useSequencerStore.getState().setPatternProgramSlot('B', 'B', 2, 'snare');
    useSequencerStore.getState().activatePatternPrograms('B');
    const s = useSequencerStore.getState();
    expect(s.programs.B[2]).toBe('snare');
    // Back to A restores its own mapping.
    useSequencerStore.getState().activatePatternPrograms('A');
    expect(useSequencerStore.getState().programs.B[2]).toBe('kick');
  });

  it('clearBank clears the flat view AND the active pattern program', () => {
    useSequencerStore.getState().setPatternProgramSlot('A', 'A', 0, 'kick');
    useSequencerStore.getState().clearBank('A');
    const s = useSequencerStore.getState();
    expect(s.programs.A[0]).toBe(null);
    expect(s.patternPrograms.A.A[0]).toBe(null);
  });

  it('prunePrograms removes invalid layer ids across all patterns', () => {
    useSequencerStore.getState().setPatternProgramSlot('A', 'A', 0, 'kick');
    useSequencerStore.getState().setPatternProgramSlot('B', 'C', 5, 'snare');
    useSequencerStore.getState().prunePrograms(new Set(['kick']));
    const s = useSequencerStore.getState();
    expect(s.programs.A[0]).toBe('kick');
    expect(s.patternPrograms.B.C[5]).toBe(null);
  });

  it('exposes four banks', () => {
    expect(BANK_IDS).toEqual(['A', 'B', 'C', 'D']);
  });
});
