/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pitch detection for field slices — "what note is this, and can it be tuned
 * to the kit root?"
 *
 * YIN (difference function → cumulative mean normalized difference → absolute
 * threshold → parabolic interpolation) rather than raw autocorrelation: YIN
 * does not report the octave error that plagues plain autocorrelation on
 * percussive material, which is exactly what a field slice is.
 *
 * Tuning is done by resampling. For a one-shot that is the correct trade: the
 * slice gets shorter or longer by a few percent and locks to the kit root.
 * Time-preserving stretch (SoundTouch) is for full-length loops, not one-shots.
 */

export interface PitchOptions {
  /** Lowest candidate frequency. Default 40 Hz. */
  minHz?: number;
  /** Highest candidate frequency. Default 2000 Hz. */
  maxHz?: number;
  /** YIN absolute threshold on the normalized difference. Default 0.15. */
  threshold?: number;
  /** Analysis window length in seconds. Default 50 ms. */
  windowSec?: number;
  /** How many windows to analyse across the slice. Default 4. */
  maxWindows?: number;
  /** Estimates below this clarity are ignored. Default 0.5. */
  minConfidence?: number;
}

export interface PitchEstimate {
  hz: number;
  /** 1 - normalized difference at the chosen lag (0..1). */
  confidence: number;
  /** How many windows produced a confident estimate. */
  windows: number;
}

const PITCH_DEFAULTS: Required<PitchOptions> = {
  minHz: 40,
  maxHz: 2000,
  threshold: 0.15,
  windowSec: 0.05,
  maxWindows: 4,
  minConfidence: 0.5,
};

/** Largest power of two ≤ value, clamped to the FFT-friendly 512..4096 range. */
function frameLength(sampleRate: number, windowSec: number): number {
  const wanted = Math.floor(sampleRate * windowSec);
  let size = 256;
  while (size * 2 <= wanted && size < 4096) size *= 2;
  return Math.max(256, Math.min(4096, size));
}

/**
 * YIN on one frame. Returns 0 Hz when the frame has no periodic content.
 */
export function yinPitch(
  frame: Float32Array,
  sampleRate: number,
  options: PitchOptions = {}
): { hz: number; confidence: number } {
  const opts = { ...PITCH_DEFAULTS, ...options };
  const n = frame.length;
  const tauMin = Math.max(2, Math.floor(sampleRate / opts.maxHz));
  const tauMax = Math.min(Math.floor(n / 2), Math.floor(sampleRate / opts.minHz));
  if (tauMax <= tauMin) return { hz: 0, confidence: 0 };

  // Difference function, integrated over the second half of the frame so every
  // lag is scored on the same amount of signal.
  const integrate = n - tauMax;
  if (integrate < 32) return { hz: 0, confidence: 0 };
  const diff = new Float64Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < integrate; j++) {
      const delta = frame[j] - frame[j + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // Cumulative mean normalized difference.
  const cmnd = new Float64Array(tauMax + 1);
  cmnd[tauMin] = 1;
  let running = 0;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    running += diff[tau];
    cmnd[tau] = running === 0 ? 1 : (diff[tau] * (tau - tauMin + 1)) / running;
  }

  // Pick the *dip*, not the shoulder of the dip.
  //
  // Plain "first lag below threshold" is a trap on tonal material: a pure tone's
  // normalized difference is already below 0.15 a few samples before the true
  // period, so the first crossing lands ~3% sharp (440 Hz reads as 428). Instead:
  // find the global minimum, then take the earliest local minimum that is close
  // to it. Earliest-with-near-global-value is the fundamental; the global minimum
  // alone can sit an octave down on material with strong even harmonics.
  let globalBest = Infinity;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmnd[tau] < globalBest) globalBest = cmnd[tau];
  }
  if (!Number.isFinite(globalBest) || globalBest > 0.5) return { hz: 0, confidence: 0 };

  const accept = Math.max(globalBest * 1.3, globalBest + 0.01);
  let bestTau = -1;
  for (let tau = tauMin + 1; tau < tauMax; tau++) {
    if (cmnd[tau] > accept) continue;
    const isLocalMin = cmnd[tau] <= cmnd[tau - 1] && cmnd[tau] <= cmnd[tau + 1];
    if (isLocalMin) {
      bestTau = tau;
      break;
    }
  }
  if (bestTau < 0) {
    // No clean local minimum (edge cases): fall back to the global minimum.
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cmnd[tau] === globalBest) {
        bestTau = tau;
        break;
      }
    }
  }
  if (bestTau < 0) return { hz: 0, confidence: 0 };

  // Parabolic interpolation around the chosen lag.
  let refinedTau = bestTau;
  if (bestTau > tauMin && bestTau < tauMax) {
    const a = cmnd[bestTau - 1];
    const b = cmnd[bestTau];
    const c = cmnd[bestTau + 1];
    const denom = 2 * (2 * b - a - c);
    if (Math.abs(denom) > 1e-12) refinedTau = bestTau + (c - a) / denom;
  }
  const hz = sampleRate / refinedTau;
  if (!Number.isFinite(hz) || hz < opts.minHz || hz > opts.maxHz) {
    return { hz: 0, confidence: 0 };
  }
  return { hz, confidence: Math.max(0, Math.min(1, 1 - cmnd[bestTau])) };
}

/**
 * Analyse up to `maxWindows` evenly spaced windows and return the median of the
 * confident estimates. Windowing matters: a slice's first window is the attack,
 * where pitch is not yet periodic.
 */
export function detectPitchHz(
  samples: Float32Array,
  sampleRate: number,
  options: PitchOptions = {}
): PitchEstimate {
  const opts = { ...PITCH_DEFAULTS, ...options };
  const frame = frameLength(sampleRate, opts.windowSec);
  if (samples.length < frame) {
    // Short slice: analyse what there is (min 2 periods of the lowest candidate).
    const shortFrame = Math.max(64, Math.min(samples.length, frame));
    const result = yinPitch(samples.subarray(0, shortFrame), sampleRate, opts);
    return { ...result, windows: result.hz > 0 ? 1 : 0 };
  }
  const usable = samples.length - frame;
  const count = Math.max(1, opts.maxWindows);
  const estimates: number[] = [];
  let confidenceSum = 0;
  let confident = 0;
  for (let w = 0; w < count; w++) {
    const offset = Math.round((usable * w) / Math.max(1, count - 1));
    const result = yinPitch(samples.subarray(offset, offset + frame), sampleRate, opts);
    if (result.hz > 0 && result.confidence >= opts.minConfidence) {
      estimates.push(result.hz);
      confidenceSum += result.confidence;
      confident++;
    }
  }
  if (estimates.length === 0) return { hz: 0, confidence: 0, windows: 0 };
  estimates.sort((a, b) => a - b);
  const median =
    estimates.length % 2 === 1
      ? estimates[(estimates.length - 1) / 2]
      : (estimates[estimates.length / 2 - 1] + estimates[estimates.length / 2]) / 2;
  return {
    hz: median,
    confidence: confidenceSum / confident,
    windows: confident,
  };
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export interface NoteInfo {
  midi: number;
  note: string;
  octave: number;
  /** Deviation from the equal-tempered note, -50..+50. */
  cents: number;
}

/** Equal-tempered note for a frequency (A4 = 440 Hz). */
export function hzToNote(hz: number): NoteInfo {
  if (!Number.isFinite(hz) || hz <= 0) {
    return { midi: 0, note: '—', octave: 0, cents: 0 };
  }
  const midiFloat = 69 + 12 * Math.log2(hz / 440);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  return { midi, note: name, octave: Math.floor(midi / 12) - 1, cents };
}

/** Nearest frequency actually playable as an equal-tempered note. */
export function nearestNoteHz(hz: number): number {
  if (!Number.isFinite(hz) || hz <= 0) return 0;
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Cents between two frequencies (positive = b is sharper). */
export const centsBetween = (a: number, b: number): number =>
  a > 0 && b > 0 ? 1200 * Math.log2(b / a) : 0;

/**
 * Catmull-Rom resample by `ratio` (output length = input length / ratio).
 * Frequency content scales with `ratio`.
 */
export function resample(
  samples: Float32Array,
  ratio: number,
  maxOutputFrames = Infinity
): Float32Array {
  if (!Number.isFinite(ratio) || ratio <= 0) return Float32Array.from(samples);
  const outLength = Math.max(
    1,
    Math.min(Math.floor(samples.length / ratio), Math.floor(maxOutputFrames))
  );
  const out = new Float32Array(outLength);
  const last = samples.length - 1;
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const t = pos - i0;
    const x0 = samples[Math.max(0, i0 - 1)];
    const x1 = samples[Math.min(last, i0)];
    const x2 = samples[Math.min(last, i0 + 1)];
    const x3 = samples[Math.min(last, i0 + 2)];
    // Catmull-Rom (a = 0.5).
    const a0 = -0.5 * x0 + 1.5 * x1 - 1.5 * x2 + 0.5 * x3;
    const a1 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3;
    const a2 = -0.5 * x0 + 0.5 * x2;
    out[i] = a0 * t * t * t + a1 * t * t + a2 * t + x1;
  }
  return out;
}

export interface TuneResult {
  samples: Float32Array;
  /** Detected fundamental before tuning (0 when nothing periodic was found). */
  detectedHz: number;
  /** Pitch actually applied as a ratio (1 = untouched). */
  ratio: number;
  /** Cents moved, after clamping to `maxCents`. */
  cents: number;
  clamped: boolean;
}

/**
 * Tune a slice so its fundamental lands on `rootHz`. Clamped to `maxCents`
 * (default 200) so a slice is nudged into key instead of being transposed into
 * a different sound — anything further away is a musical decision, not a tuning
 * one, and the UI asks instead of doing it silently.
 */
export function tuneToRoot(
  samples: Float32Array,
  sampleRate: number,
  rootHz: number,
  options: PitchOptions & { maxCents?: number; detectedHz?: number } = {}
): TuneResult {
  const maxCents = options.maxCents ?? 200;
  const detected =
    options.detectedHz && options.detectedHz > 0
      ? options.detectedHz
      : detectPitchHz(samples, sampleRate, options).hz;
  if (detected <= 0 || rootHz <= 0) {
    return {
      samples: Float32Array.from(samples),
      detectedHz: detected,
      ratio: 1,
      cents: 0,
      clamped: false,
    };
  }
  const desired = centsBetween(detected, rootHz);
  const clamped = Math.max(-maxCents, Math.min(maxCents, desired));
  const ratio = Math.pow(2, clamped / 1200);
  return {
    samples: resample(samples, ratio),
    detectedHz: detected,
    ratio,
    cents: clamped,
    clamped: Math.abs(desired - clamped) > 0.5,
  };
}

export interface RootEstimate {
  hz: number;
  confidence: number;
  /** Per-slice estimates, in input order (0 Hz = not periodic). */
  perSlice: number[];
}

/**
 * Kit root from a set of slices: the median of the confident estimates, folded
 * into a singable range. Median, not mean, so one noisy slice cannot drag the
 * kit's root off-key.
 */
export function detectRootFromSlices(
  slices: Float32Array[],
  sampleRate: number,
  options: PitchOptions & { foldMinHz?: number; foldMaxHz?: number } = {}
): RootEstimate {
  const minHz = options.foldMinHz ?? 55;
  const maxHz = options.foldMaxHz ?? 880;
  const perSlice: number[] = [];
  const susceptible: number[] = [];
  for (const slice of slices) {
    const { hz, confidence } = detectPitchHz(slice, sampleRate, options);
    perSlice.push(hz);
    if (hz > 0 && confidence >= (options.minConfidence ?? 0.5)) {
      susceptible.push(foldToRange(hz, minHz, maxHz));
    }
  }
  if (susceptible.length === 0) return { hz: 0, confidence: 0, perSlice };
  susceptible.sort((a, b) => a - b);
  const median =
    susceptible.length % 2 === 1
      ? susceptible[(susceptible.length - 1) / 2]
      : (susceptible[susceptible.length / 2 - 1] + susceptible[susceptible.length / 2]) / 2;
  return {
    hz: median,
    confidence: susceptible.length / slices.length,
    perSlice,
  };
}

/** Octave-fold a frequency into [minHz, maxHz]. */
export function foldToRange(hz: number, minHz: number, maxHz: number): number {
  if (hz <= 0 || minHz <= 0 || maxHz <= minHz) return hz;
  let out = hz;
  while (out < minHz) out *= 2;
  while (out > maxHz) out /= 2;
  return out;
}
