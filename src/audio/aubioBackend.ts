/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * aubio.js backend for the shared analysis layer.
 *
 * aubio provides the tempo and pitch detectors; onset detection keeps the
 * spectral-flux implementation in `src/audio/dsp/spectralFlux.ts` because the
 * aubio.js 0.2.1 `Onset` binding in the published build does not return a
 * usable per-frame onset flag (verified against a click track: `do()` returns
 * the descriptor once and 0 afterwards). The backend is therefore honest about
 * what is native and what is not.
 *
 * `aubiojs` is GPL-3.0-or-later; see NOTICE.md. Load it once at module scope so
 * the sync analysis helpers can stay synchronous.
 */

import aubioFactory from 'aubiojs';

export const aubio = await aubioFactory();

/** Mono mixdown used by the tempo detector. */
export function toMono(samples: Float32Array, channels = 1): Float32Array {
  if (channels <= 1) return samples;
  const frames = Math.floor(samples.length / channels);
  const mono = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += samples[f * channels + c];
    mono[f] = sum / channels;
  }
  return mono;
}

export interface AubioTempoResult {
  bpm: number;
  confidence: number;
}

/**
 * aubio tempo tracker. Feed mono frames of `hopSize`; the tracker keeps its
 * own history, so a whole buffer is processed in one pass.
 */
export function detectTempoAubio(
  samples: Float32Array,
  sampleRate: number,
  options: { bufferSize?: number; hopSize?: number; minBpm?: number; maxBpm?: number } = {}
): AubioTempoResult {
  const bufferSize = options.bufferSize ?? 1024;
  const hopSize = options.hopSize ?? 512;
  const tempo = new aubio.Tempo(bufferSize, hopSize, sampleRate);
  for (let offset = 0; offset + hopSize <= samples.length; offset += hopSize) {
    tempo.do(samples.subarray(offset, offset + hopSize));
  }
  const minBpm = options.minBpm ?? 60;
  const maxBpm = options.maxBpm ?? 200;
  const bpm = tempo.getBpm();
  const confidence = Math.max(0, Math.min(1, tempo.getConfidence()));
  if (!Number.isFinite(bpm) || bpm < minBpm || bpm > maxBpm) {
    return { bpm: 0, confidence: 0 };
  }
  return { bpm, confidence };
}

export interface AubioPitchResult {
  hz: number;
  confidence: number;
  windows: number;
}

/**
 * aubio pitch tracker over up to `maxWindows` evenly spaced windows. Median of
 * the confident estimates keeps a noisy attack from winning.
 *
 * A 4096-sample window is used at 44.1/48 kHz: it resolves 55 Hz (the lowest
 * field-slice root) without the octave errors a 1024-sample FFT shows there.
 */
export function detectPitchAubio(
  samples: Float32Array,
  sampleRate: number,
  options: {
    minHz?: number;
    maxHz?: number;
    maxWindows?: number;
    windowSec?: number;
    method?: string;
  } = {}
): AubioPitchResult {
  const minHz = options.minHz ?? 40;
  const maxHz = options.maxHz ?? 2000;
  const maxWindows = Math.max(1, options.maxWindows ?? 4);
  const windowSec = options.windowSec ?? 0.05;
  const wanted = Math.max(1024, Math.floor(sampleRate * windowSec));
  let bufferSize = 1024;
  while (bufferSize * 2 <= wanted && bufferSize < 8192) bufferSize *= 2;
  const hopSize = bufferSize / 2;
  if (samples.length < hopSize) return { hz: 0, confidence: 0, windows: 0 };

  const usable = samples.length - hopSize;
  const values: number[] = [];
  for (let w = 0; w < maxWindows; w++) {
    const offset = Math.round((usable * w) / Math.max(1, maxWindows - 1));
    const tracker = new aubio.Pitch(
      (options.method ?? 'yinfft') as never,
      bufferSize,
      hopSize,
      sampleRate
    );
    const hz = tracker.do(samples.subarray(offset, offset + hopSize));
    if (Number.isFinite(hz) && hz >= minHz && hz <= maxHz) values.push(hz);
  }
  if (values.length === 0) return { hz: 0, confidence: 0, windows: 0 };
  values.sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  // aubio exposes no confidence getter in the published binding. Report the
  // agreement across windows: 1.0 when every window agrees within 1%, falling
  // toward 0 when only one window produced a value.
  const tolerance = Math.max(1, median * 0.01);
  const agreeing = values.filter((v) => Math.abs(v - median) <= tolerance).length;
  return {
    hz: median,
    confidence: Math.min(1, agreeing / maxWindows),
    windows: values.length,
  };
}
