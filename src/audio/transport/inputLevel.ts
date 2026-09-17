/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Input-level measurement for threshold (auto-record) gating. Pure math over
 * time-domain samples plus a thin reader over an AnalyserNode-like, so the
 * dBFS computation is unit-testable without a microphone.
 */

/** Minimal AnalyserNode surface needed for level measurement. */
export interface TimeDomainAnalyser {
  fftSize: number;
  getFloatTimeDomainData(array: Float32Array): void;
}

/** RMS of time-domain samples (-1..1) expressed in dBFS. Silence → -Infinity. */
export function rmsDbFromFloatSamples(samples: ArrayLike<number>): number {
  const n = samples.length;
  if (n === 0) return Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    sum += s * s;
  }
  const rms = Math.sqrt(sum / n);
  if (!(rms > 0)) return Number.NEGATIVE_INFINITY;
  return 20 * Math.log10(rms);
}

/**
 * Current input level in dBFS from an analyser's time-domain data, or null
 * when the analyser is missing / throws. Never throws.
 */
export function analyserLevelDb(analyser: TimeDomainAnalyser | null | undefined): number | null {
  if (!analyser) return null;
  try {
    const size = Math.max(1, analyser.fftSize || 2048);
    const data = new Float32Array(size);
    analyser.getFloatTimeDomainData(data);
    return rmsDbFromFloatSamples(data);
  } catch {
    return null;
  }
}

/** True when a measured level meets an (optional) dBFS threshold. */
export function meetsThreshold(levelDb: number | null, thresholdDb?: number): boolean {
  if (thresholdDb === undefined || thresholdDb === null) return true;
  if (levelDb === null || Number.isNaN(levelDb)) return false;
  return levelDb >= thresholdDb;
}
