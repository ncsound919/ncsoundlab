/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { samplerAvailable, useSamplerStore, type SamplerBridge } from './samplerStore';

const makeBridge = (): SamplerBridge => ({
  reverse: vi.fn(),
  normalize: vi.fn(),
  invert: vi.fn(),
  crop: vi.fn(),
  fadeIn: vi.fn(),
  fadeOut: vi.fn(),
  glitch: vi.fn(),
  preview: vi.fn(),
  stop: vi.fn(),
  setParam: vi.fn(),
  pad: vi.fn(),
});

beforeEach(() => {
  useSamplerStore.getState().clearBridge();
});

describe('samplerStore', () => {
  it('registers and clears a bridge', () => {
    const bridge = makeBridge();
    useSamplerStore.getState().setBridge(bridge, 'Kick');
    expect(useSamplerStore.getState().bridge).toBe(bridge);
    expect(useSamplerStore.getState().layerName).toBe('Kick');
    expect(samplerAvailable()).toBe(true);
    useSamplerStore.getState().clearBridge();
    expect(samplerAvailable()).toBe(false);
  });

  it('runs known commands through the bridge and ignores unknown ones', () => {
    const bridge = makeBridge();
    useSamplerStore.getState().setBridge(bridge, 'Kick');
    useSamplerStore.getState().runCommand('reverse');
    useSamplerStore.getState().runCommand('fadeOut');
    useSamplerStore.getState().runCommand('nope');
    expect(bridge.reverse).toHaveBeenCalled();
    expect(bridge.fadeOut).toHaveBeenCalled();
    expect(bridge.normalize).not.toHaveBeenCalled();
  });

  it('is inert without a bridge', () => {
    expect(() => {
      useSamplerStore.getState().runCommand('reverse');
      useSamplerStore.getState().setParam('zoom', 8);
      useSamplerStore.getState().triggerPad(0, 1);
    }).not.toThrow();
  });

  it('forwards params and pad triggers', () => {
    const bridge = makeBridge();
    useSamplerStore.getState().setBridge(bridge, 'Kick');
    useSamplerStore.getState().setParam('zoom', 8);
    useSamplerStore.getState().triggerPad(2, 0.7);
    expect(bridge.setParam).toHaveBeenCalledWith('zoom', 8);
    expect(bridge.pad).toHaveBeenCalledWith(2, 0.7);
  });
});
