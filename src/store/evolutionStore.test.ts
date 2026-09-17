/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EVOLUTION_FX,
  EVOLUTION_MODES,
  evolutionAvailable,
  useEvolutionStore,
  type EvolutionBridge,
} from './evolutionStore';

const makeBridge = (): EvolutionBridge => ({
  setMode: vi.fn(),
  setFx: vi.fn(),
  reEvolve: vi.fn(),
  playVariation: vi.fn(),
  stopPlayback: vi.fn(),
  addVariation: vi.fn(),
  saveVariationToKit: vi.fn(),
  discardVariation: vi.fn(),
  variationCount: vi.fn(() => 3),
});

beforeEach(() => {
  useEvolutionStore.getState().clearBridge();
  useEvolutionStore.getState().selectIndex(0);
});

describe('evolutionStore', () => {
  it('exposes the generation lists in a stable order', () => {
    expect(EVOLUTION_MODES).toEqual(['mutations', 'melodic', 'kit']);
    expect(EVOLUTION_FX).toEqual(['mutate', 'freeze', 'fx_only']);
  });

  it('registers and clears a bridge', () => {
    expect(evolutionAvailable()).toBe(false);
    const bridge = makeBridge();
    useEvolutionStore.getState().setBridge(bridge);
    expect(useEvolutionStore.getState().bridge).toBe(bridge);
    expect(evolutionAvailable()).toBe(true);
    useEvolutionStore.getState().clearBridge();
    expect(evolutionAvailable()).toBe(false);
  });

  it('clamps the selected variation index to a non-negative integer', () => {
    useEvolutionStore.getState().selectIndex(4.7);
    expect(useEvolutionStore.getState().selectedIndex).toBe(4);
    useEvolutionStore.getState().selectIndex(-2);
    expect(useEvolutionStore.getState().selectedIndex).toBe(0);
  });

  it('is inert without a bridge', () => {
    expect(() => {
      const b = useEvolutionStore.getState().bridge;
      b?.reEvolve();
      b?.playVariation(0);
    }).not.toThrow();
  });
});
