/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 5.3 — onset detection for automatic sample slicing.
 *
 * Computes a spectral-flux curve over the buffer (FFT-based, via the radix-2
 * FFT shipped with @soundtouchjs/stretch-phase-vocoder) and returns onset times
 * where the flux rises sharply above an adaptive threshold. This is the
 * "energy/onset detector, not silence-only" the roadmap asks for — it splits on
 * transients (kick hits, snare cracks, vocal chops) rather than on gaps of
 * silence.
 */

import { fft } from '@soundtouchjs/stretch-phase-vocoder';

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
  const {
    frameSize = 1024,
    sensitivity = 1.0,
    minGapSec = 0.02,
    maxOnsets = 0,
    minStrength = 0,
    channel = 0,
  } = options;

  const sr = buffer.sampleRate;
  const data = buffer.getChannelData(channel) ?? buffer.getChannelData(0);
  const hop = frameSize / 2; // 50% overlap for a smooth flux curve
  const bins = frameSize / 2;

  // Spectral flux: positive half-wave difference of spectral magnitude between
  // consecutive FFT frames.
  const flux: number[] = [];
  const prevMag = new Float32Array(bins);
  const re = new Float32Array(frameSize);
  const im = new Float32Array(frameSize);

  for (let offset = 0; offset + frameSize <= data.length; offset += hop) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < frameSize; i++) re[i] = data[offset + i];
    fft(re, im);
    let f = 0;
    for (let b = 0; b < bins; b++) {
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      const d = mag - prevMag[b];
      if (d > 0) f += d * d;
      prevMag[b] = mag;
    }
    flux.push(f);
  }

  if (flux.length < 3) return [];

  // Adaptive threshold: mean + k * std-dev. Sharp transients exceed it.
  const mean = flux.reduce((a, b) => a + b, 0) / flux.length;
  let variance = 0;
  for (const f of flux) variance += (f - mean) * (f - mean);
  variance /= flux.length;
  const std = Math.sqrt(variance);
  const threshold = mean + sensitivity * std;

  // Find peaks (local maxima) above the threshold.
  const hits: OnsetHit[] = [];
  for (let i = 1; i < flux.length - 1; i++) {
    const v = flux[i];
    if (v <= threshold) continue;
    if (v < flux[i - 1] || v <= flux[i + 1]) continue; // not a local max
    const sampleIndex = i * hop;
    hits.push({ time: sampleIndex / sr, strength: 0, sampleIndex });
  }

  if (hits.length === 0) return [];

  // Normalize strength relative to peak flux.
  const peakFlux = Math.max(...flux);
  for (const h of hits) {
    h.strength = peakFlux > 0 ? flux[h.sampleIndex / hop] / peakFlux : 0;
  }

  // Enforce min gap + optional strength floor.
  hits.sort((a, b) => a.time - b.time);
  const filtered: OnsetHit[] = [];
  let lastTime = -Infinity;
  for (const h of hits) {
    if (h.time - lastTime < minGapSec) continue;
    if (h.strength < minStrength) continue;
    filtered.push(h);
    lastTime = h.time;
  }

  if (maxOnsets > 0 && filtered.length > maxOnsets) {
    // Keep the strongest maxOnsets.
    return [...filtered]
      .sort((a, b) => b.strength - a.strength)
      .slice(0, maxOnsets)
      .sort((a, b) => a.time - b.time);
  }
  return filtered;
}
