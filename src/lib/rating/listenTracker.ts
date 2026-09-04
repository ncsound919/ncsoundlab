/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Accumulates playback ms per side (A/B) across crossfade switches.
 *
 * - Each side has a cumulative counter.
 * - When the user switches, we stop accumulating for the old side and resume
 *   for the new side on the next animation frame.
 * - Resets on `reset()` per pair.
 *
 * The 60%-of-renderDurationMs gate is computed against these totals in the
 * UI; this module only owns the time math, not the policy.
 */

export type Side = 'A' | 'B';

export interface ListenTracker {
  /** Call on each animation frame with `currentMs = performance.now()`. */
  tick: (currentMs: number) => void;
  /** Mark which side is currently being heard. */
  setActive: (side: Side) => void;
  /** Reset to zero for a new pair. */
  reset: (currentMs: number) => void;
  /** Current cumulative playback ms for A. */
  msA: () => number;
  /** Current cumulative playback ms for B. */
  msB: () => number;
}

export function createListenTracker(): ListenTracker {
  let msA = 0;
  let msB = 0;
  let active: Side | null = null;
  let lastTickMs: number | null = null;

  function addDelta(currentMs: number) {
    if (lastTickMs == null) {
      lastTickMs = currentMs;
      return;
    }
    const dt = currentMs - lastTickMs;
    lastTickMs = currentMs;
    if (dt < 0 || dt > 1000) return; // ignore implausibly large jumps (tab idle, etc.)
    if (active === 'A') msA += dt;
    else if (active === 'B') msB += dt;
  }

  return {
    tick(currentMs) { addDelta(currentMs); },
    setActive(side) {
      // Switch side on the next tick — flush current delta to the old side first.
      // We approximate by resetting lastTickMs so the next call doesn't attribute
      // any elapsed time to the wrong side.
      lastTickMs = null;
      active = side;
    },
    reset(currentMs) {
      msA = 0;
      msB = 0;
      active = null;
      lastTickMs = currentMs;
    },
    msA: () => msA,
    msB: () => msB,
  };
}

/** Computes gating status — both sides heard at least 60% of renderDurationMs. */
export function hasMetListenGate(
  listenMsA: number,
  listenMsB: number,
  renderDurationMs: number,
  gatePct = 0.6,
): { ready: boolean; pctA: number; pctB: number; gate: number } {
  const gate = renderDurationMs * gatePct;
  return {
    ready: listenMsA >= gate && listenMsB >= gate,
    pctA: renderDurationMs > 0 ? listenMsA / renderDurationMs : 1,
    pctB: renderDurationMs > 0 ? listenMsB / renderDurationMs : 1,
    gate,
  };
}
