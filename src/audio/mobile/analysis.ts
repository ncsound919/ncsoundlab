/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Time + spectral feature extraction for field captures.
 *
 * This is the deterministic "look at the take before showing it to the user"
 * layer: clipping, DC offset, silence, attack time, tail length, spectral
 * centroid / rolloff, band balance and flux. Everything runs on a raw
 * Float32Array, so the same measurements apply to an Android capture buffer, a
 * decoded WAV slice and an offline-rendered variant — no AudioContext, no LLM.
 */

import { fft } from '@soundtouchjs/stretch-phase-vocoder';
import { computeFluxCurve } from '../dsp/spectralFlux';

export const toDb = (linear: number): number =>
  linear <= 1e-9 ? -180 : 20 * Math.log10(linear);

export const fromDb = (db: number): number => Math.pow(10, db / 20);

/** Frequency-band split used for "this is thin" style suggestions. */
export interface BandShares {
  /** 20–60 Hz. */
  sub: number;
  /** 60–250 Hz. */
  low: number;
  /** 250 Hz – 2 kHz. */
  mid: number;
  /** 2–6 kHz. */
  high: number;
  /** 6 kHz – Nyquist. */
  air: number;
}

export interface BufferAnalysis {
  /** Frames per channel (samples). */
  frames: number;
  durationSec: number;
  /** Absolute peak, linear and dBFS. */
  peak: number;
  peakDb: number;
  rms: number;
  rmsDb: number;
  /** peak / rms — a transient (drum hit) has a high crest factor. */
  crest: number;
  /** Mean sample value; anything sizeable is DC offset (bad mic/cable). */
  dcOffset: number;
  /** Share of samples at or above the clip threshold. */
  clippingRatio: number;
  /** Share of analysis frames below the silence floor. */
  silenceRatio: number;
  zeroCrossRate: number;
  /** Energy-weighted mean frequency (Hz). */
  centroidHz: number;
  /** Frequency below which `rolloffPct` of the energy sits (Hz). */
  rolloffHz: number;
  /** Mean positive spectral difference between frames. */
  fluxMean: number;
  bands: BandShares;
  /** Time from first significant sample to the peak (ms). */
  attackMs: number;
  /** Time from the peak until the tail falls below peak − 40 dB (s). */
  tailSec: number;
}

export interface AnalysisOptions {
  frameSize?: number;
  hopSize?: number;
  /** Frames quieter than this count as silence. Default -60 dBFS. */
  silenceDb?: number;
  /** Samples at or above this are counted as clipped. Default 0.999. */
  clipThreshold?: number;
  /** Rolloff fraction of total energy. Default 0.85. */
  rolloffPct?: number;
}

const DEFAULTS: Required<AnalysisOptions> = {
  frameSize: 1024,
  hopSize: 512,
  silenceDb: -60,
  clipThreshold: 0.999,
  rolloffPct: 0.85,
};

const BAND_EDGES: { key: keyof BandShares; lo: number; hi: number }[] = [
  { key: 'sub', lo: 20, hi: 60 },
  { key: 'low', lo: 60, hi: 250 },
  { key: 'mid', lo: 250, hi: 2000 },
  { key: 'high', lo: 2000, hi: 6000 },
  { key: 'air', lo: 6000, hi: Infinity },
];

/** Hann window cached per size — the STFT runs once per slice, per variant. */
const windowCache = new Map<number, Float32Array>();
function hann(size: number): Float32Array {
  const cached = windowCache.get(size);
  if (cached) return cached;
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  windowCache.set(size, w);
  return w;
}

/**
 * Analyze one buffer. Single pass for time-domain stats, STFT for spectral
 * stats; silent frames are excluded from the spectral averages so an analyzer
 * is not dragged toward 0 Hz by trailing noise.
 */
export function analyseSamples(
  samples: Float32Array,
  sampleRate: number,
  options: AnalysisOptions = {}
): BufferAnalysis {
  const opts = { ...DEFAULTS, ...options };
  const frames = samples.length;

  let peak = 0;
  let sum = 0;
  let sumSquares = 0;
  let clipped = 0;
  let zeroCrossings = 0;
  let prev = 0;
  for (let i = 0; i < frames; i++) {
    const v = samples[i];
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a >= opts.clipThreshold) clipped++;
    sum += v;
    sumSquares += v * v;
    if ((v >= 0 && prev < 0) || (v < 0 && prev >= 0)) zeroCrossings++;
    prev = v;
  }
  const rms = frames > 0 ? Math.sqrt(sumSquares / frames) : 0;
  const dcOffset = frames > 0 ? sum / frames : 0;

  // Attack: first sample crossing -40 dBFS, then the time to the peak.
  const attackFloor = fromDb(-40);
  let firstAbove = -1;
  let peakIndex = 0;
  let peakSeen = 0;
  let lastAbove = -1;
  const tailFloor = peak * fromDb(-40);
  for (let i = 0; i < frames; i++) {
    const a = Math.abs(samples[i]);
    if (firstAbove < 0 && a >= attackFloor) firstAbove = i;
    if (a > peakSeen) {
      peakSeen = a;
      peakIndex = i;
    }
    if (a >= tailFloor) lastAbove = i;
  }
  const attackMs =
    firstAbove >= 0 && peakIndex >= firstAbove
      ? ((peakIndex - firstAbove) / sampleRate) * 1000
      : 0;
  const tailSec = lastAbove > peakIndex ? (lastAbove - peakIndex) / sampleRate : 0;

  // STFT for spectral character.
  const curve = computeFluxCurve(samples, {
    frameSize: opts.frameSize,
    hopSize: opts.hopSize,
  });
  const bins = opts.frameSize / 2;
  const binHz = sampleRate / opts.frameSize;
  const window = hann(opts.frameSize);
  const frameLaid = new Float32Array(opts.frameSize);
  const re = new Float32Array(opts.frameSize);
  const im = new Float32Array(opts.frameSize);
  const meanMag = new Float64Array(bins);
  let activeFrames = 0;
  let silentFrames = 0;
  let fluxSum = 0;

  for (let f = 0; f < curve.frameCount; f++) {
    const offset = f * curve.hopSize;
    let frameEnergy = 0;
    for (let i = 0; i < opts.frameSize; i++) {
      const s = samples[offset + i] ?? 0;
      frameEnergy += s * s;
      frameLaid[i] = s * window[i];
    }
    const frameRms = Math.sqrt(frameEnergy / opts.frameSize);
    if (toDb(frameRms) < opts.silenceDb) {
      silentFrames++;
      continue;
    }
    activeFrames++;
    fluxSum += curve.flux[f];
    re.set(frameLaid);
    im.fill(0);
    fft(re, im);
    for (let b = 0; b < bins; b++) {
      meanMag[b] += Math.sqrt(re[b] * re[b] + im[b] * im[b]);
    }
  }

  let centroidHz = 0;
  let rolloffHz = 0;
  const bands: BandShares = { sub: 0, low: 0, mid: 0, high: 0, air: 0 };
  if (activeFrames > 0) {
    let magSum = 0;
    let weighted = 0;
    let energySum = 0;
    const bandEnergy: Record<keyof BandShares, number> = {
      sub: 0,
      low: 0,
      mid: 0,
      high: 0,
      air: 0,
    };
    for (let b = 0; b < bins; b++) {
      const mag = meanMag[b] / activeFrames;
      meanMag[b] = mag;
      const power = mag * mag;
      const hz = b * binHz;
      magSum += mag;
      weighted += hz * mag;
      energySum += power;
      for (const band of BAND_EDGES) {
        if (hz >= band.lo && hz < band.hi) {
          bandEnergy[band.key] += power;
          break;
        }
      }
    }
    centroidHz = magSum > 0 ? weighted / magSum : 0;
    let cumulative = 0;
    for (let b = 0; b < bins; b++) {
      cumulative += meanMag[b] * meanMag[b];
      if (cumulative >= energySum * opts.rolloffPct) {
        rolloffHz = b * binHz;
        break;
      }
    }
    const total = energySum > 0 ? energySum : 1;
    for (const band of BAND_EDGES) bands[band.key] = bandEnergy[band.key] / total;
  }

  const totalFrames = curve.frameCount > 0 ? curve.frameCount : 1;
  return {
    frames,
    durationSec: frames / sampleRate,
    peak,
    peakDb: toDb(peak),
    rms,
    rmsDb: toDb(rms),
    crest: rms > 0 ? peak / rms : 0,
    dcOffset,
    clippingRatio: frames > 0 ? clipped / frames : 0,
    silenceRatio: silentFrames / totalFrames,
    zeroCrossRate: frames > 0 ? zeroCrossings / frames : 0,
    centroidHz,
    rolloffHz,
    fluxMean: activeFrames > 0 ? fluxSum / activeFrames : 0,
    bands,
    attackMs,
    tailSec,
  };
}

/**
 * Distance between two analyses, 0 (identical character) .. 1+. Used to keep a
 * variant grid diverse instead of showing eight near-clones.
 */
export function spectralDistance(a: BufferAnalysis, b: BufferAnalysis): number {
  const logCentroid =
    Math.abs(Math.log2((a.centroidHz + 50) / (b.centroidHz + 50))) / 6; // 6 octaves ≈ 1
  const logRolloff = Math.abs(Math.log2((a.rolloffHz + 100) / (b.rolloffHz + 100))) / 6;
  const duration =
    Math.abs(Math.log2((a.durationSec + 0.01) / (b.durationSec + 0.01))) / 4;
  const crest = Math.min(1, Math.abs(a.crest - b.crest) / 8);
  let bandSum = 0;
  for (const band of BAND_EDGES) bandSum += Math.abs(a.bands[band.key] - b.bands[band.key]);
  const bands = Math.min(1, bandSum / 1.5);
  return 0.32 * logCentroid + 0.18 * logRolloff + 0.2 * duration + 0.12 * crest + 0.18 * bands;
}

export function isNearDuplicate(
  a: BufferAnalysis,
  b: BufferAnalysis,
  tolerance = 0.12
): boolean {
  return spectralDistance(a, b) < tolerance;
}

export interface SubLayerSuggestion {
  suggest: boolean;
  /** Where the sub layer should sit (Hz). */
  hz: number;
  reason: string;
  /** Suggested layer weight for the genome (0..1). */
  weight: number;
}

/**
 * "This is thin, add sub" — the spectral-centroid suggestion the plan asks for,
 * expressed as numbers the genome can consume instead of prose.
 */
export function suggestSubLayer(
  analysis: BufferAnalysis,
  opts: { fundamentalHz?: number } = {}
): SubLayerSuggestion {
  const lowEnd = analysis.bands.sub + analysis.bands.low;
  const fundamental = opts.fundamentalHz ?? 0;
  const hz = fundamental > 60 ? fundamental / 2 : 55;
  if (analysis.peak <= 0) {
    return { suggest: false, hz, reason: 'silent capture', weight: 0 };
  }
  if (lowEnd >= 0.35) {
    return {
      suggest: false,
      hz,
      reason: `low end already present (${(lowEnd * 100).toFixed(0)}% of energy)`,
      weight: 0,
    };
  }
  if (analysis.centroidHz < 300) {
    return {
      suggest: false,
      hz,
      reason: `dark source (centroid ${analysis.centroidHz.toFixed(0)} Hz) — sub would muddy it`,
      weight: 0,
    };
  }
  const weight = Math.max(0.15, Math.min(0.6, (0.35 - lowEnd) * 1.6));
  return {
    suggest: true,
    hz: Math.round(hz * 10) / 10,
    reason: `thin low end (${(lowEnd * 100).toFixed(0)}% below 250 Hz, centroid ${analysis.centroidHz.toFixed(0)} Hz)`,
    weight: Math.round(weight * 100) / 100,
  };
}

export type IssueCode =
  | 'CLIPPED'
  | 'DC_OFFSET'
  | 'SILENT'
  | 'TOO_SHORT'
  | 'LONG_TAIL'
  | 'NOISY_FLOOR';

export interface AnalysisIssue {
  code: IssueCode;
  severity: 'reject' | 'warn';
  message: string;
}

export interface AutoFilterThresholds {
  /** Max share of clipped samples before a take is rejected. Default 0.001. */
  maxClipping?: number;
  /** Max |DC offset| before a take is rejected. Default 0.01. */
  maxDcOffset?: number;
  /** Peak below this dBFS is treated as an empty take. Default -50. */
  minPeakDb?: number;
  /** Slice shorter than this is rejected. Default 30 ms. */
  minDurationMs?: number;
  /** Tail longer than this ratio of the slice is flagged. Default 0.9. */
  maxTailRatio?: number;
}

const FILTER_DEFAULTS: Required<AutoFilterThresholds> = {
  maxClipping: 0.001,
  maxDcOffset: 0.01,
  minPeakDb: -50,
  minDurationMs: 30,
  maxTailRatio: 0.9,
};

/**
 * Deterministic pre-view filter: reject clipped, DC-offset, silent and
 * too-short takes, and warn about tails that swamp the transient.
 */
export function autoFilterIssues(
  analysis: BufferAnalysis,
  thresholds: AutoFilterThresholds = {}
): AnalysisIssue[] {
  const t = { ...FILTER_DEFAULTS, ...thresholds };
  const issues: AnalysisIssue[] = [];
  if (analysis.peakDb < t.minPeakDb) {
    issues.push({
      code: 'SILENT',
      severity: 'reject',
      message: `peak ${analysis.peakDb.toFixed(1)} dBFS is below the ${t.minPeakDb} dBFS floor`,
    });
    return issues; // nothing else is meaningful on an empty take
  }
  if (analysis.clippingRatio > t.maxClipping) {
    issues.push({
      code: 'CLIPPED',
      severity: 'reject',
      message: `${(analysis.clippingRatio * 100).toFixed(2)}% of samples are clipped`,
    });
  }
  if (Math.abs(analysis.dcOffset) > t.maxDcOffset) {
    issues.push({
      code: 'DC_OFFSET',
      severity: 'reject',
      message: `DC offset ${analysis.dcOffset.toFixed(4)} exceeds ${t.maxDcOffset}`,
    });
  }
  if (analysis.durationSec * 1000 < t.minDurationMs) {
    issues.push({
      code: 'TOO_SHORT',
      severity: 'reject',
      message: `${(analysis.durationSec * 1000).toFixed(0)} ms is shorter than ${t.minDurationMs} ms`,
    });
  }
  const tailRatio = analysis.durationSec > 0 ? analysis.tailSec / analysis.durationSec : 0;
  if (tailRatio > t.maxTailRatio) {
    issues.push({
      code: 'LONG_TAIL',
      severity: 'warn',
      message: `tail runs ${(tailRatio * 100).toFixed(0)}% of the slice — transient may be buried`,
    });
  }
  if (analysis.silenceRatio > 0.7) {
    issues.push({
      code: 'NOISY_FLOOR',
      severity: 'warn',
      message: `${(analysis.silenceRatio * 100).toFixed(0)}% of frames are near silence`,
    });
  }
  return issues;
}

export const isRejected = (issues: AnalysisIssue[]): boolean =>
  issues.some((i) => i.severity === 'reject');
