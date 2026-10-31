/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Onset slicing for field captures — one recording becomes many playable
 * one-shots.
 *
 * The detector is the shared spectral-flux core
 * (`src/audio/dsp/spectralFlux.ts`), the same one the desktop sample slicer
 * uses. Around it sit the decisions that make slices usable on a phone:
 *
 *  - every onset is padded backwards by `preRollMs` so the attack is never lost
 *    to hop quantization,
 *  - a gap is kept before the next onset so slices do not swallow each other's
 *    transient,
 *  - slices shorter than `minSliceMs` merge into the previous one, slices longer
 *    than `maxSliceMs` split deterministically,
 *  - trailing near-silence is trimmed and every slice gets an edge fade so it
 *    cannot click when triggered.
 */

import { computeFluxCurve, pickFluxOnsets, type FluxOnset, type FluxCurveOptions, type FluxPickOptions } from '../dsp/spectralFlux';
import { analyseSamples, toDb, type BufferAnalysis } from './analysis';

export interface SliceOptions extends FluxCurveOptions, FluxPickOptions {
  /** Audio kept before each onset so the attack survives. Default 10 ms. */
  preRollMs?: number;
  /** Slices shorter than this merge into the previous slice. Default 40 ms. */
  minSliceMs?: number;
  /** Slices longer than this split. Default 4000 ms. */
  maxSliceMs?: number;
  /** Silence kept before the next onset. Default 5 ms. */
  gapMs?: number;
  /** Samples below this (relative to the slice peak) are trimmed. Default -45. */
  tailFloorDb?: number;
  /** Edge fade applied to every slice. Default 3 ms. */
  fadeMs?: number;
  /** Hard cap on returned slices (strongest kept). 0 = unlimited. */
  maxSlices?: number;
}

const SLICE_DEFAULTS: Required<
  Pick<SliceOptions, 'preRollMs' | 'minSliceMs' | 'maxSliceMs' | 'gapMs' | 'tailFloorDb' | 'fadeMs' | 'maxSlices'>
> = {
  preRollMs: 10,
  minSliceMs: 40,
  maxSliceMs: 4000,
  gapMs: 5,
  tailFloorDb: -45,
  fadeMs: 3,
  maxSlices: 0,
};

export interface AudioSlice {
  index: number;
  startSample: number;
  endSample: number;
  startSec: number;
  durationMs: number;
  /** Normalized onset strength (0..1) that produced this slice. */
  onsetStrength: number;
  peak: number;
  rms: number;
  clipped: boolean;
  /** True when the slice is entirely below the silence floor. */
  silent: boolean;
  /** Analysis of exactly this slice's samples. */
  analysis: BufferAnalysis;
}

export interface SliceResult {
  slices: AudioSlice[];
  onsets: FluxOnset[];
  /** Slices dropped for being unusable, with the reason. */
  rejected: { startSample: number; reason: string }[];
}

const ms = (sampleRate: number, value: number): number => Math.max(0, Math.round((value / 1000) * sampleRate));

/**
 * Detect onsets and turn them into slices. Pure: same input and options give
 * the same slices, which is what lets a slice id stay stable across sessions.
 */
export function sliceOnsets(
  samples: Float32Array,
  sampleRate: number,
  options: SliceOptions = {}
): SliceResult {
  const opts = { ...SLICE_DEFAULTS, ...options };
  const curve = computeFluxCurve(samples, options);
  const onsets = pickFluxOnsets(curve, sampleRate, options);

  if (onsets.length === 0) {
    // Nothing transient: the whole capture is one slice when it has signal —
    // still subject to the length cap, or a two-minute ambience would arrive as
    // a single unusable slice.
    const analysis = analyseSamples(samples, sampleRate);
    if (toDb(analysis.peak) < -50) {
      return { slices: [], onsets: [], rejected: [{ startSample: 0, reason: 'SILENT' }] };
    }
    const parts = splitLong([{ start: 0, end: samples.length, strength: 0 }], ms(sampleRate, opts.maxSliceMs));
    const slices = parts
      .map((part, index) => buildSlice(samples, sampleRate, part.start, part.end, index, 0, opts))
      .filter((slice) => !slice.silent);
    return { slices, onsets, rejected: [] };
  }

  const preRoll = ms(sampleRate, opts.preRollMs);
  const gap = ms(sampleRate, opts.gapMs);

  const bounds: { start: number; end: number; strength: number }[] = [];
  for (let i = 0; i < onsets.length; i++) {
    const onset = onsets[i];
    const start = Math.max(0, onset.sampleIndex - preRoll);
    const next = onsets[i + 1];
    const end = next ? Math.max(start + 1, next.sampleIndex - gap) : samples.length;
    // Onsets picked on a half-overlapped flux curve can land a few samples
    // apart; merging here keeps the returned list monotonic.
    const previous = bounds[bounds.length - 1];
    if (previous && start <= previous.start) {
      previous.end = Math.max(previous.end, end);
      previous.strength = Math.max(previous.strength, onset.strength);
      continue;
    }
    bounds.push({ start, end, strength: onset.strength });
  }
  // The lead-in before the first onset is material too — it is the ambience or
  // pickup that gives context, so it becomes its own slice when it has signal.
  if (bounds.length > 0 && bounds[0].start > 0) {
    const leadIn = analyseSamples(samples.subarray(0, bounds[0].start), sampleRate);
    if (toDb(leadIn.peak) > -50) {
      bounds.unshift({ start: 0, end: bounds[0].start, strength: 0 });
    }
  }

  const merged = mergeShort(bounds, ms(sampleRate, opts.minSliceMs));
  const split = splitLong(merged, ms(sampleRate, opts.maxSliceMs));

  const slices: AudioSlice[] = [];
  const rejected: { startSample: number; reason: string }[] = [];
  for (const bound of split) {
    const slice = buildSlice(
      samples,
      sampleRate,
      bound.start,
      Math.min(bound.end, samples.length),
      slices.length,
      bound.strength,
      opts
    );
    if (slice.silent) {
      rejected.push({ startSample: bound.start, reason: 'SILENT' });
      continue;
    }
    if (slice.durationMs < opts.minSliceMs / 2) {
      rejected.push({ startSample: bound.start, reason: 'TOO_SHORT' });
      continue;
    }
    slices.push({ ...slice, index: slices.length });
  }

  if (opts.maxSlices > 0 && slices.length > opts.maxSlices) {
    const kept = [...slices]
      .sort((a, b) => b.onsetStrength - a.onsetStrength)
      .slice(0, opts.maxSlices)
      .sort((a, b) => a.startSample - b.startSample)
      .map((slice, index) => ({ ...slice, index }));
    return { slices: kept, onsets, rejected };
  }
  return { slices, onsets, rejected };
}

export interface EvenSliceOptions {
  /** Samples below this (relative to each part's peak) are trimmed. Default -45. */
  tailFloorDb?: number;
  /** Search window for snapping a part boundary to a zero crossing. Default 4 ms. */
  snapMs?: number;
}

/**
 * Chop the take into `count` equal parts.
 *
 * The detector above is the musical choice when a take has distinct hits;
 * equal chopping is the predictable one when the user already knows how many
 * pieces they want (finger drumming, a loop, a spoken phrase). Boundaries snap
 * to the nearest zero crossing so a cut does not add a click, then each part is
 * trimmed and measured exactly like an onset slice.
 */
export function sliceEvenly(
  samples: Float32Array,
  sampleRate: number,
  count: number,
  options: EvenSliceOptions = {}
): AudioSlice[] {
  const parts = Math.max(2, Math.min(32, Math.round(count)));
  if (samples.length < parts) return [];

  const snapWindow = Math.max(1, Math.round(((options.snapMs ?? 4) / 1000) * sampleRate));
  const tailFloorDb = options.tailFloorDb ?? -45;

  const snapToZero = (target: number): number => {
    const lower = Math.max(1, target - snapWindow);
    const upper = Math.min(samples.length - 1, target + snapWindow);
    let best = target;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = lower; i <= upper; i++) {
      const previous = samples[i - 1];
      const current = samples[i];
      if ((previous >= 0 && current < 0) || (previous < 0 && current >= 0)) {
        const distance = Math.abs(i - target);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }
    }
    return best;
  };

  // Monotonic boundaries, snapped to zero crossings, with the take's own ends
  // pinned so every sample belongs to exactly one part.
  const boundaries: number[] = [0];
  for (let i = 1; i < parts; i++) {
    const target = Math.round((i * samples.length) / parts);
    const snapped = snapToZero(target);
    const previous = boundaries[boundaries.length - 1];
    boundaries.push(Math.max(previous + 1, Math.min(samples.length - 1, snapped)));
  }
  boundaries.push(samples.length);

  const slices: AudioSlice[] = [];
  for (let i = 0; i < parts; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (end - start < 2) continue;
    const trimmed = trimEdges(samples.subarray(start, end), { tailFloorDb });
    const startSample = start + trimmed.start;
    const endSample = start + trimmed.end;
    if (endSample - startSample < 2) continue;
    const analysis = analyseSamples(samples.subarray(startSample, endSample), sampleRate);
    if (toDb(analysis.peak) < -50) continue;
    slices.push({
      index: slices.length,
      startSample,
      endSample,
      startSec: startSample / sampleRate,
      durationMs: ((endSample - startSample) / sampleRate) * 1000,
      onsetStrength: 0,
      peak: analysis.peak,
      rms: analysis.rms,
      clipped: analysis.clippingRatio > 0.001,
      silent: false,
      analysis,
    });
  }
  return slices;
}

interface Bound {
  start: number;
  end: number;
  strength: number;
}

/** Fold undersized slices into the previous slice (or the next, for the first). */
export function mergeShort(bounds: Bound[], minSamples: number): Bound[] {
  const out: Bound[] = [];
  for (const bound of bounds) {
    if (out.length > 0 && bound.end - bound.start < minSamples) {
      const previous = out[out.length - 1];
      previous.end = Math.max(previous.end, bound.end);
      previous.strength = Math.max(previous.strength, bound.strength);
      continue;
    }
    out.push({ ...bound });
  }
  if (out.length > 1 && out[0].end - out[0].start < minSamples) {
    const [first, ...rest] = out;
    rest[0] = { ...rest[0], start: first.start, strength: Math.max(rest[0].strength, first.strength) };
    return rest;
  }
  return out;
}

/** Split overlong slices at exact multiples of `maxSamples`. */
export function splitLong(bounds: Bound[], maxSamples: number): Bound[] {
  const out: Bound[] = [];
  for (const bound of bounds) {
    const length = bound.end - bound.start;
    if (length <= maxSamples) {
      out.push({ ...bound });
      continue;
    }
    const parts = Math.ceil(length / maxSamples);
    for (let p = 0; p < parts; p++) {
      const start = bound.start + p * maxSamples;
      const end = Math.min(bound.end, start + maxSamples);
      out.push({ start, end, strength: p === 0 ? bound.strength : 0 });
    }
  }
  return out;
}

function buildSlice(
  samples: Float32Array,
  sampleRate: number,
  start: number,
  end: number,
  index: number,
  onsetStrength: number,
  opts: typeof SLICE_DEFAULTS
): AudioSlice {
  const region = samples.subarray(start, end);
  const trimmed = trimEdges(region, { tailFloorDb: opts.tailFloorDb });
  const trimmedStart = start + trimmed.start;
  const trimmedEnd = start + trimmed.end;
  const view = samples.subarray(trimmedStart, trimmedEnd);
  const analysis = analyseSamples(view, sampleRate);
  return {
    index,
    startSample: trimmedStart,
    endSample: trimmedEnd,
    startSec: trimmedStart / sampleRate,
    durationMs: ((trimmedEnd - trimmedStart) / sampleRate) * 1000,
    onsetStrength,
    peak: analysis.peak,
    rms: analysis.rms,
    clipped: analysis.clippingRatio > 0.001,
    silent: toDb(analysis.peak) < -50,
    // Fades are applied by `cutSlice`, not here: these numbers describe the
    // recorded material, not the rendered one-shot.
    analysis,
  };
}

export interface TrimOptions {
  /** Samples below peak + this dB are treated as silence. Default -45. */
  tailFloorDb?: number;
}

/**
 * Trim leading and trailing near-silence while keeping at least one sample.
 * The attack is preserved because the threshold is relative to the slice peak.
 */
export function trimEdges(
  samples: Float32Array,
  options: TrimOptions = {}
): { start: number; end: number } {
  const floorDb = options.tailFloorDb ?? -45;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak <= 0) return { start: 0, end: samples.length };
  const floor = peak * Math.pow(10, floorDb / 20);
  let start = 0;
  while (start < samples.length && Math.abs(samples[start]) < floor) start++;
  let end = samples.length;
  while (end > start && Math.abs(samples[end - 1]) < floor) end--;
  if (start >= end) return { start: 0, end: samples.length };
  return { start, end };
}

/** Copy one slice out of the capture, with click-free edge fades. */
export function cutSlice(
  samples: Float32Array,
  slice: Pick<AudioSlice, 'startSample' | 'endSample'>,
  sampleRate: number,
  fadeMs = 3
): Float32Array {
  const out = Float32Array.from(samples.subarray(slice.startSample, slice.endSample));
  applyEdgeFades(out, sampleRate, fadeMs);
  return out;
}

/** Symmetric linear edge fades, in place. No-op when the slice is too short. */
export function applyEdgeFades(samples: Float32Array, sampleRate: number, fadeMs = 3): void {
  const requested = Math.max(0, Math.round((fadeMs / 1000) * sampleRate));
  if (requested === 0) return;
  // Never fade more than a quarter of the slice from each end: on a very short
  // one-shot a full-length fade would attenuate the sound itself, not just the
  // edges. Below four samples there is nothing meaningful to fade.
  const n = Math.min(requested, Math.floor(samples.length / 4));
  if (n < 1) return;
  for (let i = 0; i < n; i++) {
    const g = i / n;
    samples[i] *= g;
    samples[samples.length - 1 - i] *= g;
  }
}
