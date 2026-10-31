/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Field cleanup chain — the "make a phone capture usable" pass.
 *
 * Order matters and mirrors a hardware recorder front end:
 *
 *   1. DC block        — a DC step is not audio, and it eats headroom
 *   2. Low cut         — rumble, handling noise, wind (2nd-order Butterworth)
 *   3. De-click        — cable pops, screen taps, mouth clicks
 *   4. Spectral denoise— broadband room/preamp hiss, via STFT subtraction
 *   5. Gate            — with hysteresis + hold so it never chops an attack
 *   6. Fades           — raised-cosine edges so the slice cannot click
 *   7. Normalise       — deterministic peak target
 *
 * Every step is optional, deterministic (no RNG) and reports what it did, so
 * the UI can show "−42 dB of hiss removed" instead of silently mangling a take.
 */

import { fft, ifft } from '@soundtouchjs/stretch-phase-vocoder';
import { toDb, fromDb, type BufferAnalysis } from './analysis';

export interface CleanupParams {
  /** High-pass corner. Default 40 Hz (below a voice, above handling noise). */
  lowCutHz: number;
  dcBlock: boolean;
  deClick: boolean;
  /** Click detector sensitivity: 0..1, higher = more aggressive. Default 0.6. */
  deClickSensitivity: number;
  denoise: boolean;
  /** How far below the estimated noise floor a bin must sit. Default 8 dB. */
  denoiseReductionDb: number;
  gate: boolean;
  /** Gate threshold, dBFS. Default -48. */
  gateThresholdDb: number;
  /** Attenuation applied while the gate is shut. 1 = mute, 0.3 = expander. */
  gateRange: number;
  fadeInMs: number;
  fadeOutMs: number;
  normalize: boolean;
  /** Target peak for normalisation. Default -1 dBFS. */
  normalizePeakDb: number;
}

export const DEFAULT_CLEANUP: CleanupParams = {
  lowCutHz: 40,
  dcBlock: true,
  deClick: true,
  deClickSensitivity: 0.6,
  denoise: false,
  denoiseReductionDb: 8,
  gate: false,
  gateThresholdDb: -48,
  gateRange: 1,
  fadeInMs: 3,
  fadeOutMs: 12,
  normalize: false,
  normalizePeakDb: -1,
};

export interface CleanupReport {
  applied: string[];
  dcBefore: number;
  dcAfter: number;
  clicksRemoved: number;
  /** Estimated broadband noise floor before denoise, dBFS. */
  noiseFloorDb: number;
  /** Share of the buffer where the gate was open (1 = never gated). */
  gateOpenRatio: number;
  /** Gain applied by the normaliser, dB. */
  gainAppliedDb: number;
  /** True when normalisation had to back off to avoid clipping. */
  peakLimited: boolean;
}

export interface CleanupResult {
  samples: Float32Array;
  report: CleanupReport;
}

/** One-pole DC blocker is not enough for a DC *step*; subtract the mean. */
export function removeDcOffset(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i];
  const mean = sum / samples.length;
  for (let i = 0; i < samples.length; i++) samples[i] -= mean;
  return mean;
}

/** RBJ 2nd-order Butterworth high-pass, direct form I. */
export function lowCut(samples: Float32Array, sampleRate: number, hz: number): void {
  if (hz <= 0 || samples.length === 0) return;
  const nyquist = sampleRate / 2;
  const w0 = (2 * Math.PI * Math.min(hz, nyquist * 0.99)) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2); // Q = 1/√2 → Butterworth
  const b0 = (1 + cos) / 2;
  const b1 = -(1 + cos);
  const b2 = (1 + cos) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    samples[i] = y0;
  }
}

/**
 * Replace isolated spikes (jumps far larger than the local slope) with a
 * linear interpolation across the click. Returns how many samples were fixed.
 */
export function deClick(
  samples: Float32Array,
  sampleRate: number,
  options: { sensitivity?: number } = {}
): number {
  const sensitivity = options.sensitivity ?? 0.6;
  if (samples.length < 8) return 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak <= 0) return 0;
  // Threshold as a fraction of peak: sensitivity 1 ≈ 15% discontinuity, 0.6 ≈ 35%.
  const threshold = peak * (0.5 - 0.35 * Math.min(1, Math.max(0, sensitivity)));
  const span = Math.max(2, Math.round((0.0005 * sampleRate) / 1)); // ~0.5 ms
  let fixed = 0;
  for (let i = 1; i < samples.length - 1; i++) {
    const before = samples[i] - samples[i - 1];
    const after = samples[i + 1] - samples[i];
    if (Math.abs(before) < threshold || Math.abs(after) < threshold) continue;
    if (Math.sign(before) === Math.sign(after)) continue; // a slope change, not a click
    const start = Math.max(0, i - span);
    const end = Math.min(samples.length - 1, i + span);
    const from = samples[start];
    const to = samples[end];
    const steps = end - start;
    for (let k = 1; k < steps; k++) {
      samples[start + k] = from + ((to - from) * k) / steps;
    }
    fixed++;
    i = end;
  }
  return fixed;
}

/**
 * Spectral denoise: STFT subtraction against a noise profile learned from the
 * quietest frames of the take.
 *
 * Two details matter more than the subtraction formula:
 *
 *  - The signal is zero-padded by one frame on each side. Hann² does not sum to
 *    a constant at 50% overlap (it varies 0.5..1.0), so a buffer-edge sample
 *    covered by a single window would be divided by a near-zero weight and
 *    explode. With padding, every real sample is covered by the full set of
 *    windows and the weighted overlap-add is an exact inverse.
 *  - The noise profile comes from the *quietest frames*, not the per-bin minimum.
 *    A per-bin minimum is the signal itself on steady material, so subtracting it
 *    eats steady tones. Selecting quiet frames is what a noise profile means.
 */
export function spectralDenoise(
  samples: Float32Array,
  sampleRate: number,
  options: { reductionDb?: number; frameSize?: number; floor?: number } = {}
): number {
  const reductionDb = options.reductionDb ?? 8;
  const frameSize = options.frameSize ?? 1024;
  const floor = options.floor ?? 0.02;
  const hop = frameSize / 2;
  if (samples.length < frameSize * 2 || reductionDb <= 0) return toDb(0);

  const bins = frameSize / 2;
  const window = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frameSize);
  }

  const pad = frameSize;
  const padded = new Float32Array(samples.length + pad * 2);
  padded.set(samples, pad);
  const frameCount = Math.floor((padded.length - frameSize) / hop) + 1;

  const specRe: Float32Array[] = [];
  const specIm: Float32Array[] = [];
  const energies = new Float64Array(frameCount);

  for (let f = 0; f < frameCount; f++) {
    const offset = f * hop;
    const re = new Float32Array(frameSize);
    const im = new Float32Array(frameSize);
    let energy = 0;
    for (let i = 0; i < frameSize; i++) {
      const v = padded[offset + i] * window[i];
      energy += v * v;
      re[i] = v;
    }
    energies[f] = energy;
    fft(re, im);
    specRe.push(re);
    specIm.push(im);
  }

  // Noise profile: mean magnitude over the quietest fifth of the frames (at
  // least one frame). Those are the pre-transient and between-hit moments.
  const order = Array.from({ length: frameCount }, (_, index) => index).sort(
    (a, b) => energies[a] - energies[b]
  );
  const noiseFrames = Math.max(1, Math.round(frameCount * 0.2));

  // A denoiser needs noise-only frames to learn from. On steady material (a
  // held tone, a drone, a sustained pad) the quietest frames are as loud as the
  // average, so subtracting the profile would eat the signal itself. Return
  // untouched and let the caller report "denoise skipped" (noiseFloorDb 0).
  let energySum = 0;
  for (let f = 0; f < frameCount; f++) energySum += energies[f];
  let quietSum = 0;
  for (let k = 0; k < noiseFrames; k++) quietSum += energies[order[k]];
  const meanEnergy = energySum / frameCount;
  if (meanEnergy <= 0 || quietSum / noiseFrames > meanEnergy * 0.5) return 0;
  const noise = new Float64Array(bins);
  for (let k = 0; k < noiseFrames; k++) {
    const re = specRe[order[k]];
    const im = specIm[order[k]];
    for (let b = 0; b < bins; b++) {
      noise[b] += Math.sqrt(re[b] * re[b] + im[b] * im[b]) / noiseFrames;
    }
  }

  const oversubtract = fromDb(reductionDb);
  for (let f = 0; f < frameCount; f++) {
    const re = specRe[f];
    const im = specIm[f];
    for (let b = 0; b < bins; b++) {
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      if (mag <= 1e-12) continue;
      const target = mag - oversubtract * noise[b];
      // Spectral floor: never notch a bin completely, or the residual rings as
      // "musical noise" between hits.
      const gain = target <= 0 ? floor : Math.max(floor, Math.min(1, target / mag));
      re[b] *= gain;
      im[b] *= gain;
      // Mirror the conjugate half so the inverse transform stays real.
      const mirror = frameSize - b;
      if (mirror > bins && mirror < frameSize) {
        re[mirror] = re[b];
        im[mirror] = -im[b];
      }
    }
    ifft(re, im);
    for (let i = 0; i < frameSize; i++) re[i] *= window[i];
    specRe[f] = re;
  }

  const out = new Float32Array(padded.length);
  const norm = new Float32Array(padded.length);
  for (let f = 0; f < frameCount; f++) {
    const offset = f * hop;
    const frame = specRe[f];
    for (let i = 0; i < frameSize; i++) {
      out[offset + i] += frame[i];
      norm[offset + i] += window[i] * window[i];
    }
  }
  for (let i = 0; i < samples.length; i++) {
    const weight = norm[i + pad];
    samples[i] = weight > 1e-3 ? out[i + pad] / weight : samples[i];
  }

  let noiseSum = 0;
  for (let b = 0; b < bins; b++) noiseSum += noise[b];
  return toDb(noiseSum / bins) - 20 * Math.log10(frameSize / 4);
}

/**
 * Downward expander with hysteresis, hold and smooth gain — i.e. a gate that
 * does not chop transients. `thresholdDb` opens the gate, `thresholdDb - 6`
 * closes it, and `holdMs` keeps it open across the body of a decaying hit.
 */
export function gate(
  samples: Float32Array,
  sampleRate: number,
  options: {
    thresholdDb?: number;
    attackMs?: number;
    holdMs?: number;
    releaseMs?: number;
    range?: number;
  } = {}
): number {
  const thresholdDb = options.thresholdDb ?? -48;
  const attackMs = options.attackMs ?? 1;
  const holdMs = options.holdMs ?? 60;
  const releaseMs = options.releaseMs ?? 150;
  const range = options.range ?? 1;
  if (samples.length === 0) return 1;

  const openThreshold = fromDb(thresholdDb);
  const closeThreshold = fromDb(thresholdDb - 6);
  const attackCoef = Math.exp(-1 / Math.max(1, (attackMs / 1000) * sampleRate));
  const releaseCoef = Math.exp(-1 / Math.max(1, (releaseMs / 1000) * sampleRate));
  const holdFrames = Math.round((holdMs / 1000) * sampleRate);

  let envelope = 0;
  let holdCounter = 0;
  let open = false;
  let gain = 1;
  let openFrames = 0;

  for (let i = 0; i < samples.length; i++) {
    const rectified = Math.abs(samples[i]);
    // Peak follower: instant rise, exponential fall.
    envelope = rectified > envelope ? rectified : rectified + (envelope - rectified) * releaseCoef;

    if (envelope >= openThreshold) {
      open = true;
      holdCounter = holdFrames;
    } else if (open) {
      if (envelope < closeThreshold) {
        if (holdCounter > 0) holdCounter--;
        else open = false;
      }
    }

    const target = open ? 1 : 1 - range;
    if (target > gain) gain = target + (gain - target) * attackCoef;
    else gain = target + (gain - target) * releaseCoef;
    if (open) openFrames++;
    samples[i] *= gain;
  }
  return openFrames / samples.length;
}

/** Raised-cosine edge fades (in place). */
export function applyFades(
  samples: Float32Array,
  sampleRate: number,
  fadeInMs: number,
  fadeOutMs: number
): void {
  const fadeIn = Math.min(Math.round((fadeInMs / 1000) * sampleRate), samples.length);
  const fadeOut = Math.min(Math.round((fadeOutMs / 1000) * sampleRate), samples.length - fadeIn);
  for (let i = 0; i < fadeIn; i++) {
    samples[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeIn);
  }
  for (let i = 0; i < fadeOut; i++) {
    samples[samples.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeOut);
  }
}

/** Peak-normalise in place; returns the gain in dB and whether it backed off. */
export function normalisePeak(
  samples: Float32Array,
  targetPeakDb: number
): { gainDb: number; limited: boolean } {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak <= 0) return { gainDb: 0, limited: false };
  const target = fromDb(targetPeakDb);
  const gain = target / peak;
  if (Math.abs(1 - gain) < 1e-4) return { gainDb: 0, limited: false };
  let limited = false;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] * gain;
    if (v > 1 || v < -1) limited = true;
    samples[i] = v > 1 ? 1 : v < -1 ? -1 : v;
  }
  return { gainDb: toDb(gain), limited };
}

/**
 * Run the chain. The input buffer is not modified — a copy is returned, so the
 * original capture stays the master (never destroy what cannot be re-recorded).
 */
export function applyCleanup(
  samples: Float32Array,
  sampleRate: number,
  params: Partial<CleanupParams> = {}
): CleanupResult {
  const p = { ...DEFAULT_CLEANUP, ...params };
  const out = Float32Array.from(samples);
  const report: CleanupReport = {
    applied: [],
    dcBefore: 0,
    dcAfter: 0,
    clicksRemoved: 0,
    noiseFloorDb: 0,
    gateOpenRatio: 1,
    gainAppliedDb: 0,
    peakLimited: false,
  };

  let sum = 0;
  for (let i = 0; i < out.length; i++) sum += out[i];
  report.dcBefore = out.length > 0 ? sum / out.length : 0;

  if (p.dcBlock) {
    removeDcOffset(out);
    report.applied.push('DC block');
  }
  if (p.lowCutHz > 0) {
    lowCut(out, sampleRate, p.lowCutHz);
    report.applied.push(`Low cut ${p.lowCutHz} Hz`);
  }
  if (p.deClick) {
    const fixed = deClick(out, sampleRate, { sensitivity: p.deClickSensitivity });
    report.clicksRemoved = fixed;
    if (fixed > 0) report.applied.push(`De-click (${fixed})`);
  }
  if (p.denoise) {
    report.noiseFloorDb = spectralDenoise(out, sampleRate, {
      reductionDb: p.denoiseReductionDb,
    });
    // noiseFloorDb 0 means the take had no noise-only frames, so denoise was
    // skipped rather than allowed to eat steady material.
    if (report.noiseFloorDb !== 0) report.applied.push(`Denoise ${p.denoiseReductionDb} dB`);
  }
  if (p.gate) {
    report.gateOpenRatio = gate(out, sampleRate, {
      thresholdDb: p.gateThresholdDb,
      range: p.gateRange,
    });
    report.applied.push(`Gate ${p.gateThresholdDb} dBFS`);
  }
  applyFades(out, sampleRate, p.fadeInMs, p.fadeOutMs);
  report.applied.push(`Fades ${p.fadeInMs}/${p.fadeOutMs} ms`);
  if (p.normalize) {
    const { gainDb, limited } = normalisePeak(out, p.normalizePeakDb);
    report.gainAppliedDb = gainDb;
    report.peakLimited = limited;
    report.applied.push(`Normalise ${p.normalizePeakDb} dBFS`);
  }

  sum = 0;
  for (let i = 0; i < out.length; i++) sum += out[i];
  report.dcAfter = out.length > 0 ? sum / out.length : 0;
  return { samples: out, report };
}

/**
 * Derive sensible cleanup settings from what the take actually looks like:
 * a dark, quiet capture needs less low cut and a lower gate; a hissy one needs
 * denoise. Deterministic — this is not a model, it is thresholds.
 */
export function suggestCleanupParams(analysis: BufferAnalysis): Partial<CleanupParams> {
  const lowEnd = analysis.bands.sub + analysis.bands.low;
  const suggestion: Partial<CleanupParams> = {
    lowCutHz: lowEnd > 0.45 ? 60 : lowEnd > 0.25 ? 40 : 25,
    deClick: analysis.crest > 6,
    denoise: analysis.silenceRatio > 0.25,
    normalize: analysis.peakDb < -6,
  };
  if (analysis.silenceRatio > 0.4) {
    // Noisy room: gate just above where the noise sits, and expand rather than
    // mute so breaths and decays stay musical.
    suggestion.gate = true;
    suggestion.gateThresholdDb = Math.max(-60, Math.round(analysis.rmsDb - 6));
    suggestion.gateRange = 0.35;
  } else {
    suggestion.gate = false;
  }
  return suggestion;
}
