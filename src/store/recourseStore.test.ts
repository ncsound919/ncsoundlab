/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recourseAvailable, useRecourseStore, type RecourseBridge } from './recourseStore';

const makeBridge = (): RecourseBridge => ({
  generate: vi.fn(),
  load: vi.fn(),
  toPattern: vi.fn(),
  useKey: vi.fn(),
  stylePrev: vi.fn(),
  styleNext: vi.fn(),
  modeNext: vi.fn(),
  barsNext: vi.fn(),
  seedDown: vi.fn(),
  seedUp: vi.fn(),
  seedRandom: vi.fn(),
  keyDown: vi.fn(),
  keyUp: vi.fn(),
  setParam: vi.fn(),
});

beforeEach(() => {
  useRecourseStore.getState().clearBridge();
});

describe('recourseStore', () => {
  it('registers and clears a bridge', () => {
    const bridge = makeBridge();
    useRecourseStore.getState().setBridge(bridge);
    expect(useRecourseStore.getState().bridge).toBe(bridge);
    expect(recourseAvailable()).toBe(true);
    useRecourseStore.getState().clearBridge();
    expect(recourseAvailable()).toBe(false);
  });

  it('runs known commands, ignores unknown, and is inert without a bridge', () => {
    expect(() => useRecourseStore.getState().runCommand('generate')).not.toThrow();
    const bridge = makeBridge();
    useRecourseStore.getState().setBridge(bridge);
    useRecourseStore.getState().runCommand('generate');
    useRecourseStore.getState().runCommand('seedRandom');
    useRecourseStore.getState().runCommand('nope');
    expect(bridge.generate).toHaveBeenCalled();
    expect(bridge.seedRandom).toHaveBeenCalled();
    expect(bridge.load).not.toHaveBeenCalled();
  });

  it('forwards continuous params', () => {
    const bridge = makeBridge();
    useRecourseStore.getState().setBridge(bridge);
    useRecourseStore.getState().setParam('seed', 42);
    expect(bridge.setParam).toHaveBeenCalledWith('seed', 42);
    useRecourseStore.getState().clearBridge();
    expect(() => useRecourseStore.getState().setParam('seed', 1)).not.toThrow();
  });
});
