/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 6.1 — QWERTY pad performance key-mapping.
 *
 * Maps a configurable band of keyboard keys to the 16 MPC pads (default
 * `z s x d c v g b h n j m , . /`). Holding Shift+key is a 16-levels-style
 * velocity (further down = harder); plain keypress uses a default velocity.
 *
 * The mapping is pure + testable; the UI wires the returned pad index to the
 * MPC pad trigger.
 */

/** Default 16-key band for pad performance. */
export const DEFAULT_PAD_KEYS = [
  'z', 's', 'x', 'd', 'c', 'v', 'g', 'b',
  'h', 'n', 'j', 'm', ',', '.', '/', "'",
] as const;

export interface PadKeyResult {
  /** Pad index 0..15, or null when the key is not bound. */
  padIndex: number | null;
  /** Velocity 0..1 derived from the 16-levels Y position (0..15). */
  velocity: number;
  /** Whether Shift was held (16-levels mode). */
  shiftHeld: boolean;
  /** True when the key should be consumed (was a pad trigger). */
  consumed: boolean;
}

const VELOCITY_PER_LEVEL = 1 / 15;

/**
 * Resolve a keydown to a pad trigger.
 *
 * @param key      The `e.key` value (lowercased).
 * @param keys     The 16-key band (default `DEFAULT_PAD_KEYS`).
 * @param shift    Whether Shift is held — enables 16-levels velocity.
 * @param level    0..15 velocity level (from pointer-Y or a fixed default).
 */
export function resolvePadKey(
  key: string,
  keys: readonly string[] = DEFAULT_PAD_KEYS,
  shift = false,
  level = 15
): PadKeyResult {
  const k = String(key).toLowerCase();
  const idx = keys.indexOf(k);
  if (idx === -1) {
    return { padIndex: null, velocity: 0, shiftHeld: shift, consumed: false };
  }
  const clampedLevel = Math.max(0, Math.min(15, level));
  const velocity = shift ? Math.max(0.1, 1 - clampedLevel * VELOCITY_PER_LEVEL) : 1;
  return { padIndex: idx, velocity, shiftHeld: shift, consumed: true };
}

/**
 * Build the 16-level velocity from a pointer Y position within a 0..1 space
 * (0 = top/hardest, 1 = bottom/softest).
 */
export function velocityFromPointerY(ratio: number): number {
  const clamped = Math.max(0, Math.min(1, ratio));
  return Math.max(0.1, 1 - clamped);
}
