/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for per-pad filter / send overrides.
 */

import { describe, it, expect } from 'vitest';
import { applyPadParams } from './padParams';
import { DEFAULT_ENVELOPE, DEFAULT_FX, type SoundLayer } from '../types';

const layer = (over: Partial<SoundLayer> = {}): SoundLayer => ({
  id: 'l1',
  name: 'Kick',
  type: 'sample',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: { ...DEFAULT_ENVELOPE },
  fx: { ...DEFAULT_FX },
  ...over,
});

describe('applyPadParams', () => {
  it('returns the same layer when no pad params are set', () => {
    const l = layer();
    expect(applyPadParams(l, { filter: {}, sendReverb: {}, sendDelay: {} })).toBe(l);
  });

  it('applies a low-pass filter override without mutating the source layer', () => {
    const l = layer();
    const out = applyPadParams(l, { filter: { l1: 1200 }, sendReverb: {}, sendDelay: {} });
    expect(out).not.toBe(l);
    expect(out.fx.filterFreq).toBe(1200);
    expect(out.fx.filterType).toBe('lowpass');
    expect(l.fx.filterFreq).toBe(DEFAULT_FX.filterFreq); // untouched
  });

  it('treats >= 20kHz as bypass', () => {
    const l = layer();
    expect(applyPadParams(l, { filter: { l1: 20000 }, sendReverb: {}, sendDelay: {} })).toBe(l);
  });

  it('applies reverb + delay sends and clamps them', () => {
    const out = applyPadParams(layer(), { filter: {}, sendReverb: { l1: 0.4 }, sendDelay: { l1: 2 } });
    expect(out.sends).toEqual({ reverb: 0.4, delay: 1 });
  });

  it('ignores params for other layers', () => {
    const l = layer();
    expect(applyPadParams(l, { filter: { other: 500 }, sendReverb: { other: 0.5 }, sendDelay: {} })).toBe(l);
  });
});
