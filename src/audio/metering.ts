/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Real-time audio metering helpers (Phase 3.1).
 *
 * Wraps the standard Web Audio `AnalyserNode` into a compact `MeterReading`
 * API (peak amplitude + RMS over the current frame, both linear in [0..1])
 * that the UI can consume without leaking AnalyserNode plumbing into every
 * component.
 *
 * The mixer and master bus call `computeMeterLevel(analyser)` from a
 * `requestAnimationFrame` loop and feed the result into a meter bar or
 * state value. Tested without Web Audio — a `MockAnalyserNode` shim with
 * a deterministic byte/float stream is used to verify the math.
 */

export interface MeterReading {
  /** Peak amplitude in this frame (linear 0..1, where 1 = 0 dBFS). */
  peak: number;
  /** RMS amplitude in this frame (linear 0..1). */
  rms: number;
  /** Peak in dBFS, clamped to -100 when silence. */
  peakDb: number;
  /** RMS in dBFS, clamped to -100 when silence. */
  rmsDb: number;
}

export interface AnalyserLike {
  fftSize: number;
  getFloatTimeDomainData: (target: Float32Array) => void;
}

const MIN_DB = -100;

/**
 * Compute peak + RMS over the analyser's current time-domain frame. The
 * caller passes the analyser (or anything that quacks like one) and a
 * scratch buffer it owns; the buffer is allocated once and reused on each
 * call to avoid GC churn.
 */
export const computeMeterLevel = (
  analyser: AnalyserLike | null | undefined,
  scratch: Float32Array
): MeterReading => {
  if (!analyser) return { peak: 0, rms: 0, peakDb: MIN_DB, rmsDb: MIN_DB };
  const size = analyser.fftSize || scratch.length;
  if (scratch.length < size) {
    // Caller's buffer too small — caller should size it once at fftSize.
  }
  const view = scratch.length >= size ? scratch.subarray(0, size) : scratch;
  try {
    analyser.getFloatTimeDomainData(view as Float32Array);
  } catch {
    return { peak: 0, rms: 0, peakDb: MIN_DB, rmsDb: MIN_DB };
  }
  let peak = 0;
  let sumSquares = 0;
  for (let i = 0; i < view.length; i++) {
    const v = view[i];
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
    sumSquares += v * v;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, view.length));
  return {
    peak: clamp01(peak),
    rms: clamp01(rms),
    peakDb: ampToDb(peak),
    rmsDb: ampToDb(rms),
  };
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Convert a linear amplitude (0..1, where 1 = 0 dBFS) to dBFS. Values <= 0
 * are clamped to `MIN_DB`.
 */
export const ampToDb = (amp: number): number => {
  if (!Number.isFinite(amp) || amp <= 0) return MIN_DB;
  return 20 * Math.log10(amp);
};

/**
 * Convert dBFS back to linear amplitude.
 */
export const dbToAmp = (db: number): number => {
  if (!Number.isFinite(db)) return 0;
  return Math.pow(10, db / 20);
};

/**
 * Recommended scratch buffer size based on an analyser's fftSize. Callers
 * usually want fftSize = 1024 (≈21ms at 48kHz) for a fast meter.
 */
export const makeScratchBuffer = (fftSize = 1024): Float32Array => new Float32Array(fftSize);
