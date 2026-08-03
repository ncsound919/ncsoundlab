/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the mixer bus store (Phase 3.3).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useMixerStore } from './mixerStore';

describe('mixerStore', () => {
  beforeEach(() => {
    useMixerStore.getState().reset();
  });

  it('initialises with default reverb + delay buses', () => {
    const s = useMixerStore.getState();
    expect(s.buses.reverb).toBeDefined();
    expect(s.buses.delay).toBeDefined();
    expect(s.buses.reverb.gain).toBe(1);
    expect(s.buses.delay.gain).toBe(1);
  });

  it('setBus updates bus fields', () => {
    useMixerStore.getState().setBus('reverb', { gain: 0.5 });
    expect(useMixerStore.getState().buses.reverb.gain).toBe(0.5);
  });

  it('setBus preserves other fields when partially updating', () => {
    useMixerStore.getState().setBus('reverb', { pan: -0.3 });
    const b = useMixerStore.getState().buses.reverb;
    expect(b.pan).toBe(-0.3);
    expect(b.gain).toBe(1);
    expect(b.enabled).toBe(true);
  });

  it('setBus adds a new bus id', () => {
    useMixerStore.getState().setBus('chorus', { enabled: true, gain: 0.8, pan: 0 });
    expect(useMixerStore.getState().buses.chorus.gain).toBe(0.8);
  });

  it('reset restores defaults', () => {
    useMixerStore.getState().setBus('reverb', { gain: 0 });
    useMixerStore.getState().reset();
    expect(useMixerStore.getState().buses.reverb.gain).toBe(1);
  });
});
