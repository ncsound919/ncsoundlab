/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Per-layer identity colours.
 *
 * Layers used to be indistinguishable except by name, so a producer had to read
 * every label to find the kick. Each layer now carries a stable colour that is
 * reused on rows, mixer strips, drum pads and the 3D space. Colour is assigned
 * by stack position (deterministic and collision-sparse) unless the layer
 * already stores an explicit `color`.
 */

/** Twelve hues chosen to stay distinct and legible on the dark UI. */
export const LAYER_PALETTE: readonly string[] = [
  '#38bdf8', // sky
  '#f472b6', // pink
  '#a78bfa', // violet
  '#34d399', // emerald
  '#fbbf24', // amber
  '#fb7185', // rose
  '#22d3ee', // cyan
  '#c084fc', // purple
  '#4ade80', // green
  '#f97316', // orange
  '#60a5fa', // blue
  '#e879f9', // fuchsia
];

/** Palette colour at an index, wrapping both directions. */
export function paletteColorAt(index: number): string {
  const i = ((Math.trunc(index) % LAYER_PALETTE.length) + LAYER_PALETTE.length) % LAYER_PALETTE.length;
  return LAYER_PALETTE[i];
}

const HEX = /^#[0-9a-f]{3,8}$/i;

/** A layer's colour: explicit when valid, otherwise derived from its position. */
export function layerColorFor(layer: { color?: string } | null | undefined, index: number): string {
  if (layer?.color && HEX.test(layer.color)) return layer.color;
  return paletteColorAt(index);
}

/** Next colour to assign to a newly created layer. */
export function nextLayerColor(existingCount: number): string {
  return paletteColorAt(existingCount);
}
