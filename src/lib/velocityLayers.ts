/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Keygroup-style velocity layers: pick which sample a trigger plays based on
 * its velocity. Pure and dependency-free so the selection math is unit-tested
 * without an AudioContext.
 */

import type { SoundLayer, VelocityLayer } from '../types';

/** Clamp a 0..1 velocity to an inclusive MIDI velocity range (1..127). */
export function velocity01ToMidi(velocity01: number): number {
  const v = Number.isFinite(velocity01) ? velocity01 : 1;
  return Math.max(1, Math.min(127, Math.round(v * 127)));
}

/** Clamp a velocity layer's bounds into 1..127 (min <= max). */
export function clampVelocityLayer(layer: VelocityLayer): VelocityLayer {
  const min = Math.max(1, Math.min(127, Math.round(layer.minVelocity)));
  const max = Math.max(1, Math.min(127, Math.round(layer.maxVelocity)));
  return { ...layer, minVelocity: Math.min(min, max), maxVelocity: Math.max(min, max) };
}

/**
 * Distribute N layers into contiguous, equal velocity bands across 1..127.
 * Used by the "even split" action and when appending a new layer.
 */
export function evenVelocityRanges(count: number): { minVelocity: number; maxVelocity: number }[] {
  const n = Math.max(1, Math.floor(count));
  const span = 127;
  return Array.from({ length: n }, (_, i) => {
    const min = Math.floor((i * span) / n) + 1;
    const max = Math.floor(((i + 1) * span) / n);
    return { minVelocity: min, maxVelocity: Math.max(min, max) };
  });
}

/**
 * Pick the velocity layer covering `midi`. Layers are searched in range order;
 * a velocity that falls in a gap snaps to the nearest layer so a hit is never
 * silent just because the user left a hole between bands.
 */
export function findVelocityLayer(layers: VelocityLayer[] | undefined, midi: number): VelocityLayer | undefined {
  if (!layers || layers.length === 0) return undefined;
  const sorted = [...layers].map(clampVelocityLayer).sort((a, b) => a.minVelocity - b.minVelocity);
  const exact = sorted.find((l) => midi >= l.minVelocity && midi <= l.maxVelocity);
  if (exact) return exact;
  // Nearest by distance to the band.
  let best = sorted[0];
  let bestDist = Infinity;
  for (const l of sorted) {
    const dist = midi < l.minVelocity ? l.minVelocity - midi : midi - l.maxVelocity;
    if (dist < bestDist) {
      bestDist = dist;
      best = l;
    }
  }
  return best;
}

/**
 * Resolve a trigger velocity (0..1) into the layer that should sound. Returns
 * the SAME layer reference when there is no velocity stack, so the common path
 * allocates nothing.
 */
export function selectVelocityLayer(layer: SoundLayer, velocity01: number): SoundLayer {
  const layers = layer.velocityLayers;
  if (!layers || layers.length === 0) return layer;
  const picked = findVelocityLayer(layers, velocity01ToMidi(velocity01));
  if (!picked) return layer;
  return { ...layer, audioBuffer: picked.audioBuffer };
}
