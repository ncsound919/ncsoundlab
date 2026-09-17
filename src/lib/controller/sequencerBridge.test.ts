/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  clearSequencerBridge,
  getSequencerBridge,
  hasSequencerBridge,
  setSequencerBridge,
  type SequencerBridge,
} from './sequencerBridge';

const makeBridge = (): SequencerBridge => ({
  getPadTune: vi.fn(() => ({})),
  getPadChoke: vi.fn(() => ({})),
  triggerLayer: vi.fn(),
  playNote: vi.fn(),
  stopNote: vi.fn(),
  getIsPlaying: vi.fn(() => false),
  togglePlay: vi.fn(),
  toggleRecord: vi.fn(),
  tapTempo: vi.fn(),
  setSwing: vi.fn(),
  getSelectedPad: vi.fn(() => 0),
  clearPad: vi.fn(),
  assignPad: vi.fn(),
  clearPattern: vi.fn(),
  quantizePattern: vi.fn(),
  humanizePattern: vi.fn(),
  applyGroove: vi.fn(),
  applyProgressionToPattern: vi.fn(),
});

describe('sequencerBridge', () => {
  it('starts empty and round-trips a registered bridge', () => {
    clearSequencerBridge();
    expect(getSequencerBridge()).toBeNull();
    expect(hasSequencerBridge()).toBe(false);
    const bridge = makeBridge();
    setSequencerBridge(bridge);
    expect(getSequencerBridge()).toBe(bridge);
    expect(hasSequencerBridge()).toBe(true);
    clearSequencerBridge();
    expect(getSequencerBridge()).toBeNull();
  });

  it('latest registration wins (fresh closures per render)', () => {
    const first = makeBridge();
    const second = makeBridge();
    setSequencerBridge(first);
    setSequencerBridge(second);
    expect(getSequencerBridge()).toBe(second);
    clearSequencerBridge();
  });
});
