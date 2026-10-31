/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 5.3 — onset detection for automatic sample slicing.
 *
 * Computes a spectral-flux curve over the buffer (FFT-based) and returns onset
 * times where the flux rises sharply above an adaptive threshold. This is the
 * "energy/onset detector, not silence-only" the roadmap asks for — it splits on
 * transients (kick hits, snare cracks, vocal chops) rather than on gaps of
 * silence.
 *
 * The DSP lives in `src/audio/dsp/spectralFlux.ts` so the mobile field slicer
 * runs the identical detector on raw Float32 samples.
 */

import { computeFluxCurve, pickFluxOnsets } from './dsp/spectralFlux';

export interface OnsetOptions {
  /** FFT window size (power of two, 512..4096). Larger = better low-freq. */
  frameSize?: number;
  /**
   * Sensitivity multiplier on the adaptive threshold. Lower = more onsets.
   * Typical 0.8–1.6. Default 1.0.
   */
  sensitivity?: number;
  /** Minimum gap between onsets in seconds (prevents double hits). */
  minGapSec?: number;
  /** Cap on the number of onsets returned (0 = unlimited). */
  maxOnsets?: number;
  /** Minimum onset strength relative to the strongest flux (0..1). */
  minStrength?: number;
  /** Sample channel index to analyze. Default 0. */
  channel?: number;
}

export interface OnsetHit {
  /** Time in seconds. */
  time: number;
  /** Normalized flux strength (0..1, relative to the peak flux). */
  strength: number;
  /** Sample index of the onset. */
  sampleIndex: number;
}

/**
 * Detect onsets in a buffer using spectral flux + adaptive thresholding.
 * Returns an array of onset times, sorted ascending, with `time === 0`
 * implicitly implied by the slice model (first slice always starts at 0).
 */
export function detectOnsets(buffer: AudioBuffer, options: OnsetOptions = {}): OnsetHit[] {
  const { frameSize = 1024, channel = 0 } = options;

  // getChannelData throws IndexSizeError for out-of-range channels — it never
  // returns undefined, so a `?? fallback` would be dead. Clamp instead.
  const safeChannel = Math.max(0, Math.min(buffer.numberOfChannels - 1, channel));
  const data = buffer.getChannelData(safeChannel);

  const curve = computeFluxCurve(data, { frameSize, hopSize: frameSize / 2 });
  return pickFluxOnsets(curve, buffer.sampleRate, options);
}
