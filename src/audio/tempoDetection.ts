/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * BPM detection + tempo alignment (Phase 4.4).
 *
 * Pure helpers for detecting the tempo of an audio buffer via onset
 * autocorrelation, and for snapping the current project's tempo to the
 * detected value. Designed to run in a Web Worker for long references,
 * but works fine on the main thread for songs under ~10 minutes.
 */

import type { Arrangement } from '../types';

export interface BPMDetection {
  /** Most likely tempo in BPM (60..200 range). */
  bpm: number;
  /** 0..1 — relative strength of the best autocorrelation peak. */
  confidence: number;
  /** Optional alternative candidates in descending order. */
  candidates?: number[];
}

export interface BPMDetectionOptions {
  /** BPM range to search. Default 60..200. */
  minBpm?: number;
  maxBpm?: number;
  /** Energy-envelope window size in samples. Default 1024. */
  windowSize?: number;
  /** Maximum lag in samples (derived from minBpm otherwise). */
  maxLag?: number;
}

const DEFAULT_OPTIONS: Required<BPMDetectionOptions> = {
  minBpm: 60,
  maxBpm: 200,
  windowSize: 512,
  maxLag: 0, // overridden by minBpm default
};

/**
 * Compute RMS energy per window (frames). Mono mixdown first.
 * Returns a Float32Array of length ~ floor(samples / windowSize).
 */
export const computeEnergyEnvelope = (
  buffer: AudioBuffer,
  windowSize = 1024
): Float32Array => {
  const len = buffer.length;
  const channels = buffer.numberOfChannels;
  const ch0 = buffer.getChannelData(0);
  const ch1 = channels > 1 ? buffer.getChannelData(1) : null;
  const numWindows = Math.max(1, Math.floor(len / windowSize));
  const env = new Float32Array(numWindows);
  for (let w = 0; w < numWindows; w++) {
    let sumSquares = 0;
    const start = w * windowSize;
    const end = Math.min(start + windowSize, len);
    for (let i = start; i < end; i++) {
      const mono = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
      sumSquares += mono * mono;
    }
    env[w] = Math.sqrt(sumSquares / Math.max(1, end - start));
  }
  return env;
};

/**
 * Convert an energy envelope to a positive-only "onset strength" curve
 * by taking frame-to-frame positive differences (half-wave rectified
 * derivative). Smoothed with a 5-tap moving average to suppress
 * sub-onset noise — important for sharp transient signals (clicks,
 * snares) where the residual energy spreads across many windows and
 * would otherwise bias the autocorrelation toward longer lags.
 */
export const onsetStrength = (env: Float32Array): Float32Array => {
  const out = new Float32Array(env.length);
  for (let i = 1; i < env.length; i++) {
    out[i] = Math.max(0, env[i] - env[i - 1]);
  }
  // 5-tap smoothing — peakier onsets, fewer spurious peaks at 2× lag.
  const smoothed = new Float32Array(env.length);
  for (let i = 2; i < out.length - 2; i++) {
    smoothed[i] = (out[i - 2] + 2 * out[i - 1] + 4 * out[i] + 2 * out[i + 1] + out[i + 2]) / 10;
  }
  // Edge fallback.
  smoothed[0] = out[0];
  smoothed[1] = out[1];
  smoothed[out.length - 1] = out[out.length - 1];
  smoothed[out.length - 2] = out[out.length - 2];
  return smoothed;
};

/**
 * Autocorrelation at `lag` for an onset curve. Returns the normalised
 * score (Pearson-style, 0..1). Negative lags are not meaningful; we
 * only accept positive integer lags.
 */
export const autocorrelation = (
  onset: Float32Array,
  lag: number
): number => {
  const n = onset.length;
  if (lag <= 0 || lag >= n) return 0;
  let sumXY = 0;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  const count = n - lag;
  for (let i = 0; i < count; i++) {
    const x = onset[i];
    const y = onset[i + lag];
    sumXY += x * y;
    sumX += x;
    sumY += y;
    sumXX += x * x;
    sumYY += y * y;
  }
  const denom = Math.sqrt(Math.max(1e-12, (sumXX - sumX * sumX / count) * (sumYY - sumY * sumY / count)));
  return denom > 0 ? (sumXY - sumX * sumY / count) / denom : 0;
};

/**
 * Convert a BPM value to a lag (in frames of the energy envelope).
 * Assumes the energy envelope's frame rate = sampleRate / windowSize.
 */
export const bpmToLag = (
  bpm: number,
  sampleRate: number,
  windowSize: number
): number => {
  if (bpm <= 0) return 0;
  const framesPerBeat = (sampleRate * 60) / (bpm * windowSize);
  return Math.round(framesPerBeat);
};

/**
 * Top-level: detect BPM from an AudioBuffer. Searches the autocorrelation
 * function across the configured BPM range and returns the strongest peak.
 * Assumes beat-level onsets (most common for kick/snare-driven music).
 *
 * The algorithm tries two interpretations of the autocorrelation peak:
 *   - "best lag = one beat"  (direct conversion)
 *   - "best lag = half a beat" (× 2 conversion)
 * and picks the interpretation whose BPM falls in the musically common
 * range (90..170 BPM by default). This avoids the failure mode where a
 * sharp-onset track has a stronger 2× harmonic peak.
 */
export const detectBpm = (
  buffer: AudioBuffer,
  options: BPMDetectionOptions = {}
): BPMDetection => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const maxBpm = opts.maxBpm;
  const minBpm = opts.minBpm;
  const windowSize = opts.windowSize;
  const env = computeEnergyEnvelope(buffer, windowSize);
  const onset = onsetStrength(env);
  // Search a wider range (down to 0.5× minBpm) so we can find half-beat peaks.
  const minLag = Math.max(1, bpmToLag(maxBpm * 2, buffer.sampleRate, windowSize));
  const maxLag = Math.min(
    onset.length - 2,
    opts.maxLag > 0 ? opts.maxLag : bpmToLag(minBpm, buffer.sampleRate, windowSize)
  );

  if (minLag >= maxLag) {
    return { bpm: 120, confidence: 0 };
  }

  // Score every candidate lag.
  const scores: { lag: number; score: number }[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    scores.push({ lag, score: autocorrelation(onset, lag) });
  }
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  // Try the top candidates as either "1× lag = one beat" or "2× lag =
  // one beat". Prefer candidates whose BPM lands in a common range.
  const COMMON_BPM_MIN = 70;
  const COMMON_BPM_MAX = 180;
  const candidates: { bpm: number; lag: number; score: number; mul: number }[] = [];
  for (const s of scores.slice(0, 20)) {
    for (const mul of [1, 2]) {
      const bpm = (mul * 60 * buffer.sampleRate) / (s.lag * windowSize);
      if (bpm >= minBpm && bpm <= maxBpm * 2) {
        candidates.push({ bpm, lag: s.lag, score: s.score, mul });
      }
    }
  }
  if (candidates.length === 0) {
    return { bpm: 120, confidence: 0 };
  }

  // Score each candidate: prefer common range; break ties by autocorr score.
  let chosen = candidates[0];
  for (const c of candidates) {
    const inCommon = c.bpm >= COMMON_BPM_MIN && c.bpm <= COMMON_BPM_MAX;
    const chosenInCommon = chosen.bpm >= COMMON_BPM_MIN && chosen.bpm <= COMMON_BPM_MAX;
    if (inCommon && !chosenInCommon) {
      chosen = c;
    } else if (inCommon === chosenInCommon && c.score > chosen.score) {
      chosen = c;
    }
  }

  // Confidence: top candidate's autocorr score, clamped.
  const confidence = Math.max(0, Math.min(1, chosen.score));

  // Top 5 candidate BPMs for the UI to offer as alternatives.
  const topCandidates = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((c) => Math.round(c.bpm * 10) / 10);

  return {
    bpm: Math.round(chosen.bpm * 10) / 10,
    confidence,
    candidates: topCandidates,
  };
};

/**
 * Snap the current song's tempo to a reference BPM. Mutates the
 * arrangement's tempoMap (single point at beat 0) and the active
 * pattern's BPM. Returns the new BPM on success.
 *
 * Caller is expected to pass a project reference (with arrangement +
 * a setBpm action from patternStore). The function doesn't import
 * stores directly to keep this module pure / testable.
 */
export interface TempoSnapInput {
  bpm: number;
  /** Called to update the active pattern's BPM. */
  setPatternBpm: (bpm: number) => void;
  /** Called to update the arrangement's tempoMap (single point at 0). */
  setArrangementTempo: (tempoMap: Arrangement['tempoMap']) => void;
}

export const snapProjectToReferenceBpm = (
  input: TempoSnapInput
): number => {
  const safeBpm = Math.max(40, Math.min(300, Math.round(input.bpm)));
  input.setPatternBpm(safeBpm);
  input.setArrangementTempo([{ tick: 0, bpm: safeBpm }]);
  return safeBpm;
};
