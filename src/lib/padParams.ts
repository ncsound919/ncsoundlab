/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Per-pad parameter overrides. The pad bank's filter / FX-send settings are
 * keyed by layer id and applied as one-shot overrides at trigger time, so a
 * pad edit never mutates the underlying layer's own sound design.
 */

import type { SoundLayer } from '../types';

export interface PadParamMaps {
  /** Per-layer low-pass cutoff in Hz (>= 20000 = bypass/off). */
  filter: Record<string, number>;
  /** Per-layer reverb send (0..1). */
  sendReverb: Record<string, number>;
  /** Per-layer delay send (0..1). */
  sendDelay: Record<string, number>;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

/**
 * Apply the pad's filter + send levels to a layer copy. Returns the SAME
 * reference when the pad has no overrides, so the common path allocates
 * nothing.
 */
export function applyPadParams(layer: SoundLayer, maps: PadParamMaps): SoundLayer {
  const filterHz = maps.filter[layer.id];
  const reverb = maps.sendReverb[layer.id];
  const delay = maps.sendDelay[layer.id];
  if (filterHz === undefined && reverb === undefined && delay === undefined) return layer;

  let next = layer;
  if (filterHz !== undefined && filterHz < 20000) {
    next = {
      ...next,
      fx: {
        ...next.fx,
        filterEnabled: true,
        filterType: 'lowpass',
        filterFreq: Math.max(20, Math.min(20000, filterHz)),
      },
    };
  }
  if (reverb !== undefined || delay !== undefined) {
    next = {
      ...next,
      sends: {
        ...(next.sends ?? {}),
        ...(reverb !== undefined ? { reverb: clamp01(reverb) } : {}),
        ...(delay !== undefined ? { delay: clamp01(delay) } : {}),
      },
    };
  }
  return next;
}
