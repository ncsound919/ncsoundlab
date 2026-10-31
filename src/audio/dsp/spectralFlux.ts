/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sample-domain spectral flux — the shared core behind
 * `src/audio/onsetDetection.ts` (desktop, AudioBuffer) and
 * `src/audio/mobile/onsetSlicer.ts` (mobile field capture, raw Float32Array).
 *
 * Kept free of Web Audio types so the same code path runs on a decoded
 * AudioBuffer and on the raw samples a native recorder hands back. One
 * implementation means a slice boundary sounds the same on both surfaces.
 */

import { fft } from '@soundtouchjs/stretch-phase-vocoder';

export interface FluxCurveOptions {
  /** FFT window size (power of two, 512..4096). Larger = better low-freq. */
  frameSize?: number;
  /** Hop between frames. Defaults to frameSize / 2 (50% overlap). */
  hopSize?: number;
}

export interface FluxCurve {
  /** Positive half-wave rectified spectral difference per frame (squared sum). */
  flux: Float32Array;
  frameSize: number;
  hopSize: number;
  /** Number of leading samples consumed by the first full frame. */
  frameCount: number;
}

export interface FluxPickOptions {
  /** Sensitivity multiplier on the adaptive threshold. Lower = more onsets. */
  sensitivity?: number;
  /** Minimum gap between onsets in seconds (prevents double hits). */
  minGapSec?: number;
  /** Cap on the number of onsets returned (0 = unlimited). */
  maxOnsets?: number;
  /** Minimum onset strength relative to the strongest flux (0..1). */
  minStrength?: number;
}

export interface FluxOnset {
  /** Time in seconds. */
  time: number;
  /** Normalized flux strength (0..1, relative to the peak flux). */
  strength: number;
  /** Sample index of the onset. */
  sampleIndex: number;
}

/**
 * Spectral flux over a mono sample buffer: the squared sum of the positive
 * magnitude differences between consecutive FFT frames. Sharp transients
 * (kick hits, snare cracks, door slams, a stick on a rail) spike here; steady
 * tone and room noise do not.
 */
export function computeFluxCurve(
  samples: Float32Array,
  options: FluxCurveOptions = {}
): FluxCurve {
  const frameSize = options.frameSize ?? 1024;
  const hopSize = options.hopSize ?? frameSize / 2;
  const bins = frameSize / 2;

  const flux = new Float32Array(
    samples.length >= frameSize ? Math.floor((samples.length - frameSize) / hopSize) + 1 : 0
  );
  const prevMag = new Float32Array(bins);
  const re = new Float32Array(frameSize);
  const im = new Float32Array(frameSize);

  let frameCount = 0;
  for (let offset = 0; offset + frameSize <= samples.length; offset += hopSize) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < frameSize; i++) re[i] = samples[offset + i];
    fft(re, im);
    let f = 0;
    for (let b = 0; b < bins; b++) {
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      const d = mag - prevMag[b];
      if (d > 0) f += d * d;
      prevMag[b] = mag;
    }
    flux[frameCount++] = f;
  }

  return { flux, frameSize, hopSize, frameCount };
}

/**
 * Pick onsets from a flux curve with an adaptive threshold (mean + k·σ) and
 * local-maximum peak picking, then enforce a minimum gap and optional strength
 * floor.
 */
export function pickFluxOnsets(
  curve: FluxCurve,
  sampleRate: number,
  options: FluxPickOptions = {}
): FluxOnset[] {
  const {
    sensitivity = 1.0,
    minGapSec = 0.02,
    maxOnsets = 0,
    minStrength = 0,
  } = options;

  const { flux, hopSize, frameCount } = curve;
  if (frameCount < 3) return [];

  let sum = 0;
  for (let i = 0; i < frameCount; i++) sum += flux[i];
  const mean = sum / frameCount;
  let variance = 0;
  for (let i = 0; i < frameCount; i++) variance += (flux[i] - mean) * (flux[i] - mean);
  variance /= frameCount;
  const threshold = mean + sensitivity * Math.sqrt(variance);

  const hits: FluxOnset[] = [];
  for (let i = 1; i < frameCount - 1; i++) {
    const v = flux[i];
    if (v <= threshold) continue;
    if (v < flux[i - 1] || v <= flux[i + 1]) continue; // not a local max
    const sampleIndex = i * hopSize;
    hits.push({ time: sampleIndex / sampleRate, strength: 0, sampleIndex });
  }
  if (hits.length === 0) return [];

  // Normalize strength relative to the peak flux. Iterate instead of
  // `Math.max(...flux)` — on long captures the spread would exceed the engine's
  // argument-count limit and throw "Maximum call stack size exceeded".
  let peakFlux = 0;
  for (let i = 0; i < frameCount; i++) if (flux[i] > peakFlux) peakFlux = flux[i];
  for (const h of hits) {
    h.strength = peakFlux > 0 ? flux[h.sampleIndex / hopSize] / peakFlux : 0;
  }

  hits.sort((a, b) => a.time - b.time);
  const filtered: FluxOnset[] = [];
  let lastTime = -Infinity;
  for (const h of hits) {
    if (h.time - lastTime < minGapSec) continue;
    if (h.strength < minStrength) continue;
    filtered.push(h);
    lastTime = h.time;
  }

  if (maxOnsets > 0 && filtered.length > maxOnsets) {
    return [...filtered]
      .sort((a, b) => b.strength - a.strength)
      .slice(0, maxOnsets)
      .sort((a, b) => a.time - b.time);
  }
  return filtered;
}

/**
 * Convenience: flux curve + peak picking in one call for callers that only
 * have samples (the mobile path).
 */
export function detectOnsetsInSamples(
  samples: Float32Array,
  sampleRate: number,
  options: FluxCurveOptions & FluxPickOptions = {}
): FluxOnset[] {
  const curve = computeFluxCurve(samples, options);
  return pickFluxOnsets(curve, sampleRate, options);
}
