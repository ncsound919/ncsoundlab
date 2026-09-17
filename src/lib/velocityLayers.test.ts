/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for keygroup velocity-layer selection math.
 */

import { describe, it, expect } from 'vitest';
import {
  velocity01ToMidi,
  clampVelocityLayer,
  evenVelocityRanges,
  findVelocityLayer,
  selectVelocityLayer,
} from './velocityLayers';
import type { VelocityLayer } from '../types';

const vl = (id: string, min: number, max: number): VelocityLayer => ({
  id,
  minVelocity: min,
  maxVelocity: max,
  audioBuffer: { id } as unknown as AudioBuffer,
});

describe('velocity01ToMidi', () => {
  it('maps 0..1 to 1..127', () => {
    expect(velocity01ToMidi(1)).toBe(127);
    expect(velocity01ToMidi(0)).toBe(1);
    expect(velocity01ToMidi(0.5)).toBe(64);
    expect(velocity01ToMidi(NaN)).toBe(127);
  });
});

describe('clampVelocityLayer / evenVelocityRanges', () => {
  it('clamps and orders bounds', () => {
    expect(clampVelocityLayer(vl('a', 200, 5))).toMatchObject({ minVelocity: 5, maxVelocity: 127 });
  });

  it('produces contiguous equal bands covering 1..127', () => {
    const bands = evenVelocityRanges(4);
    expect(bands[0].minVelocity).toBe(1);
    expect(bands[bands.length - 1].maxVelocity).toBe(127);
    for (let i = 1; i < bands.length; i++) {
      expect(bands[i].minVelocity).toBe(bands[i - 1].maxVelocity + 1);
    }
  });
});

describe('findVelocityLayer', () => {
  const layers = [vl('soft', 1, 63), vl('hard', 64, 127)];

  it('returns the covering layer', () => {
    expect(findVelocityLayer(layers, 20)?.id).toBe('soft');
    expect(findVelocityLayer(layers, 100)?.id).toBe('hard');
    expect(findVelocityLayer(layers, 64)?.id).toBe('hard');
  });

  it('snaps a velocity that falls in a gap to the nearest layer', () => {
    const gapped = [vl('lo', 1, 40), vl('hi', 90, 127)];
    expect(findVelocityLayer(gapped, 50)?.id).toBe('lo');
    expect(findVelocityLayer(gapped, 80)?.id).toBe('hi');
  });

  it('returns undefined with no layers', () => {
    expect(findVelocityLayer([], 50)).toBeUndefined();
    expect(findVelocityLayer(undefined, 50)).toBeUndefined();
  });
});

describe('selectVelocityLayer', () => {
  it('returns the same layer when there is no stack', () => {
    const layer = { id: 'l1' } as never;
    expect(selectVelocityLayer(layer, 0.5)).toBe(layer);
  });

  it('swaps in the matching velocity sample without mutating the source', () => {
    const soft = { id: 'soft' } as unknown as AudioBuffer;
    const hard = { id: 'hard' } as unknown as AudioBuffer;
    const layer = {
      id: 'l1',
      audioBuffer: soft,
      velocityLayers: [
        { id: 'a', minVelocity: 1, maxVelocity: 63, audioBuffer: soft },
        { id: 'b', minVelocity: 64, maxVelocity: 127, audioBuffer: hard },
      ],
    } as never;
    expect(selectVelocityLayer(layer, 0.2).audioBuffer).toBe(soft);
    expect(selectVelocityLayer(layer, 1).audioBuffer).toBe(hard);
  });
});
