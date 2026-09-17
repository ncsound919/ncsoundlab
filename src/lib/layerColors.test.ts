/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { LAYER_PALETTE, layerColorFor, nextLayerColor, paletteColorAt } from './layerColors';

describe('layerColors', () => {
  it('wraps the palette in both directions', () => {
    expect(paletteColorAt(0)).toBe(LAYER_PALETTE[0]);
    expect(paletteColorAt(LAYER_PALETTE.length)).toBe(LAYER_PALETTE[0]);
    expect(paletteColorAt(LAYER_PALETTE.length + 2)).toBe(LAYER_PALETTE[2]);
    expect(paletteColorAt(-1)).toBe(LAYER_PALETTE[LAYER_PALETTE.length - 1]);
  });

  it('prefers a valid explicit colour', () => {
    expect(layerColorFor({ color: '#123456' }, 3)).toBe('#123456');
    expect(layerColorFor({ color: '#abc' }, 3)).toBe('#abc');
  });

  it('falls back to the position colour for missing/invalid values', () => {
    expect(layerColorFor(undefined, 4)).toBe(LAYER_PALETTE[4]);
    expect(layerColorFor({}, 0)).toBe(LAYER_PALETTE[0]);
    expect(layerColorFor({ color: 'red' }, 1)).toBe(LAYER_PALETTE[1]);
  });

  it('assigns the next colour from the existing count', () => {
    expect(nextLayerColor(0)).toBe(LAYER_PALETTE[0]);
    expect(nextLayerColor(LAYER_PALETTE.length)).toBe(LAYER_PALETTE[0]);
    expect(nextLayerColor(3)).toBe(LAYER_PALETTE[3]);
  });
});
