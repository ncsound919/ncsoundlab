/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared sampling core — the TypeScript half of `nc.sample-edit.v1`
 * (`shared/contracts/sample-edit.v1.json`).
 *
 * The Kotlin implementation lives in
 * `shared/kotlin-core/.../sample/SampleEdit.kt`; both read the same parity
 * cases, so NC Sound Lab and NC Phone Beat trim, fade and strip silence with
 * one definition instead of three drifting ones.
 *
 * Audio is interleaved (frame-major) here, the same layout the Kotlin side and
 * the WAV codec use. `audioBufferToInterleaved` / `interleavedToAudioBuffer`
 * bridge the Web Audio buffer at the edges.
 */

export type FadeCurve = 'linear' | 'equal-power';

export interface Span {
  startFrame: number;
  endFrameExclusive: number;
}

export interface StripSettings {
  thresholdDb: number;
  minSilenceMs: number;
  minKeepMs: number;
  padMs: number;
}

export const DEFAULT_STRIP_SETTINGS: StripSettings = {
  thresholdDb: -45,
  minSilenceMs: 350,
  minKeepMs: 80,
  padMs: 10,
};

export const PEAK_REFERENCE_DB = -0.3;

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export function msToFrames(ms: number, sampleRate: number): number {
  return Math.max(0, Math.floor((Math.max(0, ms) / 1000) * sampleRate));
}

export function frameCount(samples: Float32Array, channels: number): number {
  return Math.floor(samples.length / Math.max(1, channels));
}

export function peak(
  samples: Float32Array,
  channels: number,
  startFrame = 0,
  endFrameExclusive = frameCount(samples, channels)
): number {
  const ch = Math.max(1, channels);
  const frames = frameCount(samples, ch);
  const from = Math.min(Math.max(0, startFrame), frames);
  const to = Math.min(Math.max(from, endFrameExclusive), frames);
  let p = 0;
  for (let i = from * ch; i < to * ch; i++) {
    const v = Math.abs(samples[i]);
    if (v > p) p = v;
  }
  return p;
}

export function normalize(
  samples: Float32Array,
  channels: number,
  targetPeakDb = PEAK_REFERENCE_DB
): Float32Array {
  const p = peak(samples, channels);
  const out = new Float32Array(samples.length);
  if (p <= 1e-9) {
    out.set(samples);
    return out;
  }
  const gain = dbToLinear(targetPeakDb) / p;
  for (let i = 0; i < samples.length; i++) {
    out[i] = clamp(samples[i] * gain);
  }
  return out;
}

export function applyGainDb(samples: Float32Array, db: number): Float32Array {
  const gain = dbToLinear(db);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = clamp(samples[i] * gain);
  return out;
}

export function fadeIn(
  samples: Float32Array,
  channels: number,
  frames: number,
  curve: FadeCurve = 'linear'
): Float32Array {
  const ch = Math.max(1, channels);
  const total = frameCount(samples, ch);
  const n = Math.min(Math.max(0, frames), total);
  const out = new Float32Array(samples);
  if (n === 0) return out;
  if (n === 1) {
    for (let c = 0; c < ch; c++) out[c] = 0;
    return out;
  }
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const gain = curve === 'linear' ? t : Math.sin(t * Math.PI * 0.5);
    for (let c = 0; c < ch; c++) out[i * ch + c] *= gain;
  }
  return out;
}

export function fadeOut(
  samples: Float32Array,
  channels: number,
  frames: number,
  curve: FadeCurve = 'linear'
): Float32Array {
  const ch = Math.max(1, channels);
  const total = frameCount(samples, ch);
  const n = Math.min(Math.max(0, frames), total);
  const out = new Float32Array(samples);
  if (n === 0) return out;
  if (n === 1) {
    for (let c = 0; c < ch; c++) out[(total - 1) * ch + c] = 0;
    return out;
  }
  const start = total - n;
  for (let i = start; i < total; i++) {
    const t = (i - start) / (n - 1);
    const gain = curve === 'linear' ? 1 - t : Math.cos(t * Math.PI * 0.5);
    for (let c = 0; c < ch; c++) out[i * ch + c] *= gain;
  }
  return out;
}

export function reverse(samples: Float32Array, channels: number): Float32Array {
  const ch = Math.max(1, channels);
  const frames = frameCount(samples, ch);
  const out = new Float32Array(samples.length);
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < ch; c++) out[(frames - 1 - f) * ch + c] = samples[f * ch + c];
  }
  return out;
}

export function trim(
  samples: Float32Array,
  channels: number,
  startFrame: number,
  endFrameExclusive: number
): Float32Array {
  const ch = Math.max(1, channels);
  const frames = frameCount(samples, ch);
  const from = Math.min(Math.max(0, startFrame), frames);
  const to = Math.min(Math.max(from, endFrameExclusive), frames);
  return samples.slice(from * ch, to * ch);
}

export function removeDcOffset(samples: Float32Array, channels: number): Float32Array {
  const ch = Math.max(1, channels);
  const frames = frameCount(samples, ch);
  const out = new Float32Array(samples.length);
  if (frames === 0) {
    out.set(samples);
    return out;
  }
  const means = new Float64Array(ch);
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < ch; c++) means[c] += samples[f * ch + c];
  }
  for (let c = 0; c < ch; c++) means[c] /= frames;
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] - means[i % ch];
  return out;
}

export function nearestZeroCrossing(
  samples: Float32Array,
  channels: number,
  frame: number,
  windowFrames = 256
): number {
  const ch = Math.max(1, channels);
  const frames = frameCount(samples, ch);
  if (frames < 2) return 0;
  const requested = Math.min(Math.max(0, frame), frames - 1);
  const from = Math.max(0, requested - windowFrames);
  const to = Math.min(frames - 1, requested + windowFrames);
  let best = requested;
  let bestDistance = Number.MAX_SAFE_INTEGER;
  for (let i = from; i < to; i++) {
    const a = monoAt(samples, ch, i);
    const b = monoAt(samples, ch, i + 1);
    if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) {
      const distance = Math.abs(i - requested);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
  }
  return best;
}

/**
 * Spans of audio to keep after strip silence. Mirrors the Kotlin
 * `SampleEdit.keepSpans`: silent runs shorter than `minSilenceMs` stay audio,
 * specks shorter than `minKeepMs` are dropped, surviving spans are padded,
 * clamped and merged. All-silent input returns an empty list.
 */
export function keepSpans(
  samples: Float32Array,
  channels: number,
  sampleRate: number,
  settings: StripSettings = DEFAULT_STRIP_SETTINGS,
  startFrame = 0,
  endFrameExclusive = frameCount(samples, channels)
): Span[] {
  const ch = Math.max(1, channels);
  const frames = frameCount(samples, ch);
  const rangeStart = Math.min(Math.max(0, startFrame), frames);
  const rangeEnd = Math.min(Math.max(rangeStart, endFrameExclusive), frames);
  if (frames === 0 || sampleRate <= 0 || rangeEnd <= rangeStart) return [];

  const threshold = dbToLinear(settings.thresholdDb);
  const minSilence = msToFrames(settings.minSilenceMs, sampleRate);
  const minKeep = msToFrames(settings.minKeepMs, sampleRate);
  const pad = msToFrames(settings.padMs, sampleRate);

  const loud = new Uint8Array(rangeEnd - rangeStart);
  let anyLoud = false;
  for (let f = rangeStart; f < rangeEnd; f++) {
    let isLoud = false;
    for (let c = 0; c < ch; c++) {
      if (Math.abs(samples[f * ch + c]) > threshold) {
        isLoud = true;
        break;
      }
    }
    loud[f - rangeStart] = isLoud ? 1 : 0;
    if (isLoud) anyLoud = true;
  }
  if (!anyLoud) return [];

  const raw: Span[] = [];
  let i = 0;
  while (i < loud.length) {
    if (!loud[i]) {
      i++;
      continue;
    }
    const start = i;
    while (i < loud.length && loud[i]) i++;
    raw.push({ startFrame: rangeStart + start, endFrameExclusive: rangeStart + i });
  }

  const merged: Span[] = [];
  for (const span of raw) {
    const last = merged[merged.length - 1];
    if (last && span.startFrame - last.endFrameExclusive < minSilence) {
      last.endFrameExclusive = span.endFrameExclusive;
    } else {
      merged.push({ ...span });
    }
  }

  const padded: Span[] = [];
  for (const span of merged) {
    if (span.endFrameExclusive - span.startFrame < minKeep) continue;
    const a = Math.max(rangeStart, span.startFrame - pad);
    const b = Math.min(rangeEnd, span.endFrameExclusive + pad);
    const last = padded[padded.length - 1];
    if (last && a <= last.endFrameExclusive) {
      last.endFrameExclusive = Math.max(last.endFrameExclusive, b);
    } else {
      padded.push({ startFrame: a, endFrameExclusive: b });
    }
  }
  return padded;
}

/**
 * Concatenate kept spans into one buffer, in span order. Used by the Sound Lab
 * destructive Strip Silence: the gaps disappear from the sample itself.
 */
export function concatSpans(samples: Float32Array, channels: number, spans: Span[]): Float32Array {
  const ch = Math.max(1, channels);
  const frames = frameCount(samples, ch);
  const safe = spans.filter(
    (s) => s.endFrameExclusive > s.startFrame && s.startFrame < frames && s.endFrameExclusive > 0
  );
  if (safe.length === 0) return new Float32Array(0);
  const totalFrames = safe.reduce((sum, s) => sum + (s.endFrameExclusive - s.startFrame), 0);
  const out = new Float32Array(totalFrames * ch);
  let write = 0;
  for (const span of safe) {
    const from = Math.max(0, span.startFrame) * ch;
    const to = Math.min(frames, span.endFrameExclusive) * ch;
    out.set(samples.subarray(from, to), write);
    write += to - from;
  }
  return out;
}

/** Interleaved samples from a Web Audio buffer, in frame-major order. */
export function audioBufferToInterleaved(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  const out = new Float32Array(buffer.length * channels);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let f = 0; f < buffer.length; f++) out[f * channels + c] = data[f];
  }
  return out;
}

/** Rebuild a Web Audio buffer from interleaved samples. */
export function interleavedToAudioBuffer(
  context: BaseAudioContext,
  samples: Float32Array,
  channels: number,
  sampleRate = context.sampleRate
): AudioBuffer {
  const ch = Math.max(1, channels);
  const frames = frameCount(samples, ch);
  const buffer = context.createBuffer(ch, frames, sampleRate);
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(c);
    for (let f = 0; f < frames; f++) data[f] = samples[f * ch + c];
  }
  return buffer;
}

function monoAt(samples: Float32Array, channels: number, frame: number): number {
  let sum = 0;
  const base = frame * channels;
  for (let c = 0; c < channels; c++) sum += samples[base + c];
  return sum;
}

function clamp(x: number): number {
  return Math.max(-1, Math.min(1, x));
}
