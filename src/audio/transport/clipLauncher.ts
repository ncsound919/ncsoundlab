/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Clip launching (Tier 2, honest edition): audio loops are rendered
 * tempo-matched OFFLINE to the pattern loop — there is no real-time
 * time-stretch in the browser — and re-rendered when the BPM changes. Clips
 * loop via `AudioBufferSourceNode.loop` over the whole rendered buffer.
 *
 * This module holds the pure timing math (launch-quantize boundaries);
 * rendering uses `stretchToDuration` and playback lives in `ClipLauncher`.
 */

export interface ClipSpec {
  id: string;
  name: string;
}

/**
 * Next loop boundary at or after `positionSec`, in seconds. A position
 * exactly on the grid launches immediately (no extra bar of waiting).
 */
export function nextLoopBoundarySec(positionSec: number, loopLengthSec: number): number {
  const loop = Math.max(0.01, loopLengthSec);
  const pos = Math.max(0, positionSec);
  // Math.max first: ceil of a tiny negative is -0, which breaks Object.is/time math.
  return Math.max(0, Math.ceil(pos / loop - 1e-6)) * loop;
}

/** Milliseconds from `nowSec` until `targetSec` (never negative). */
export function msUntil(targetSec: number, nowSec: number): number {
  return Math.max(0, (targetSec - nowSec) * 1000);
}

/** Display length of a clip loop in bars (16 steps = 1 bar at 4/4). */
export function loopBars(stepLength: number): number {
  return Math.max(1, Math.round(stepLength / 16));
}

export interface ClipLaunchPlan {
  /** Delay before the launch fires, in ms (0 = immediately). */
  startDelayMs: number;
  /** Slots the launch replaces when it fires (empty in legato mode). */
  stopIndices: number[];
}

/**
 * Decide when a clip launch fires and which playing clips it replaces.
 *
 * - Quantized launches fire at the next loop boundary; free launches fire now.
 * - Legato keeps every playing clip alive (clips layer instead of replacing);
 *   otherwise the launch replaces all other playing clips at the launch point
 *   — not at press time — so a quantized launch never leaves a silent gap.
 */
export function planClipLaunch(opts: {
  target: number;
  playing: number[];
  legato: boolean;
  quantize: boolean;
  positionSec: number;
  loopLengthSec: number;
}): ClipLaunchPlan {
  const delay = opts.quantize
    ? msUntil(nextLoopBoundarySec(opts.positionSec, opts.loopLengthSec), opts.positionSec)
    : 0;
  return {
    startDelayMs: delay <= 1 ? 0 : delay,
    stopIndices: opts.legato ? [] : opts.playing.filter((i) => i !== opts.target),
  };
}
