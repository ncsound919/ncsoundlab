/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Genome renderer — turns (parameter vector + source take) into audio.
 *
 * This is the missing half of the variant system: `genome.ts` describes a
 * variant and `variantGrid.ts` needs to measure what a child sounds like, but
 * neither could hear anything until something rendered a genome. Everything
 * here is pure math on a Float32Array — no AudioContext, no DOM, no randomness
 * beyond the seeded generator — so a variant re-renders identically on any
 * device and a rendered variant can be verified by hash.
 *
 * Chain (each stage is in-place on a fixed-length buffer):
 *
 *   1. mix        recording layer + generated sub/body/noise/synth layers
 *   2. grain      seeded drop-and-replay of earlier grains
 *   3. pitch      resample by cents, padded back to the original length
 *   4. filter     RBJ low/high pass per filter type
 *   5. drive      tanh saturation blended by mix
 *   6. tremolo    LFO gain
 *   7. crush      bit reduction + sample-and-hold
 *   8. gain/fades level, then raised-cosine edges
 *   9. lock       the recorded attack is restored verbatim at the head
 */

import { mulberry32, deriveSeed, clampParams, type Genome, type Waveform, type LayerGene } from '../../lib/mobile/genome';
import { preserveTransient, transientLockSamples } from './preRoll';
import { applyFades } from './dspCleanup';
import { resample } from './pitchDetection';
export interface GenomeRenderOptions {
  sampleRate: number;
  /** The take (or slice) this variant is built from. */
  source: Float32Array;
  /** Safety cap on rendered length. Default 20 s. */
  maxSeconds?: number;
}

export interface GenomeRenderResult {
  samples: Float32Array;
  sampleRate: number;
  durationSec: number;
  /** Frames at the head copied verbatim from the source (transient lock). */
  lockedFrames: number;
  /** True when the source was longer than the cap and got truncated. */
  capped: boolean;
}

const clamp1 = (v: number): number => (v > 1 ? 1 : v < -1 ? -1 : v);

function waveValue(wave: Waveform, phase: number): number {
  const p = phase - Math.floor(phase);
  switch (wave) {
    case 'sine':
      return Math.sin(2 * Math.PI * p);
    case 'triangle':
      return 1 - 4 * Math.abs(p - 0.5);
    case 'saw':
      return 2 * p - 1;
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'noise':
      return 0; // supplied by the layer's RNG
    default:
      return Math.sin(2 * Math.PI * p);
  }
}

/**
 * Mix one generated layer into the buffer. Each layer gets its own RNG derived
 * from the genome seed and its index, so adding a layer never shifts the noise
 * another layer already produced.
 */
function mixGeneratedLayer(
  out: Float32Array,
  layer: LayerGene,
  sampleRate: number,
  rng: () => number
): void {
  const frames = out.length;
  if (frames === 0) return;
  const detune = Math.pow(2, (layer.detuneCents ?? 0) / 1200);
  const freqHz = Math.max(0.01, (layer.freqHz ?? 55) * detune);
  const decayFrames = Math.max(1, (layer.decayS ?? 0.5) * sampleRate);
  const phaseOffset = layer.phaseOffset ?? 0;
  const wave: Waveform = layer.waveform ?? (layer.kind === 'noise' ? 'noise' : 'sine');
  const amplitude = layer.weight;

  if (wave === 'noise') {
    for (let i = 0; i < frames; i++) {
      const env = Math.exp(-i / decayFrames);
      out[i] += (rng() * 2 - 1) * env * amplitude;
    }
    return;
  }
  for (let i = 0; i < frames; i++) {
    const env = Math.exp(-i / decayFrames);
    out[i] += waveValue(wave, phaseOffset + (freqHz * i) / sampleRate) * env * amplitude;
  }
}

/**
 * Granular scatter: with probability `scatter`, a grain is replaced by an
 * earlier grain of the same length. Replaying only *earlier* material keeps the
 * result causal — the attack can never be filled with sound that has not
 * happened yet.
 */
export function applyGrainScatter(
  samples: Float32Array,
  sampleRate: number,
  rng: () => number,
  options: { scatter: number; sizeMs: number }
): void {
  const scatter = Math.min(1, Math.max(0, options.scatter));
  if (scatter <= 0 || samples.length === 0) return;
  const grainFrames = Math.max(1, Math.round((options.sizeMs / 1000) * sampleRate));
  const grains = Math.floor(samples.length / grainFrames);
  if (grains < 2) return;
  const out = Float32Array.from(samples);
  for (let g = 1; g < grains; g++) {
    if (rng() >= scatter) continue;
    const donor = Math.floor(rng() * g);
    for (let i = 0; i < grainFrames; i++) {
      out[g * grainFrames + i] = samples[donor * grainFrames + i];
    }
  }
  samples.set(out);
}

/** RBJ biquad low-pass, in place. */
export function lowPass(samples: Float32Array, sampleRate: number, hz: number): void {
  const freq = Math.min(Math.max(hz, 10), sampleRate * 0.49);
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const b0 = (1 - cos) / 2;
  const b1 = 1 - cos;
  const b2 = (1 - cos) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  applyBiquad(samples, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

/** RBJ biquad high-pass, in place. */
export function highPass(samples: Float32Array, sampleRate: number, hz: number): void {
  const freq = Math.min(Math.max(hz, 10), sampleRate * 0.49);
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const b0 = (1 + cos) / 2;
  const b1 = -(1 + cos);
  const b2 = (1 + cos) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  applyBiquad(samples, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

function applyBiquad(
  samples: Float32Array,
  b0: number,
  b1: number,
  b2: number,
  a1: number,
  a2: number
): void {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    samples[i] = y0;
  }
}

/** Bit reduction + sample-and-hold, in place. */
export function bitCrush(samples: Float32Array, bits: number, downsample: number): void {
  const clampedBits = Math.max(2, Math.min(32, Math.round(bits)));
  const hold = Math.max(1, Math.round(downsample));
  const levels = Math.pow(2, clampedBits - 1) - 1;
  let held = samples.length > 0 ? samples[0] : 0;
  for (let i = 0; i < samples.length; i++) {
    if (hold === 1 || i % hold === 0) {
      held = clamp1(Math.round(samples[i] * levels) / levels);
    }
    samples[i] = held;
  }
}

/** tanh saturation blended with the dry signal. */
export function drive(samples: Float32Array, amount: number, mix: number): void {
  if (amount <= 0 || mix <= 0) return;
  const gain = 1 + amount * 8;
  for (let i = 0; i < samples.length; i++) {
    const dry = samples[i];
    samples[i] = (1 - mix) * dry + mix * Math.tanh(dry * gain);
  }
}

/** Amplitude LFO. */
export function tremolo(samples: Float32Array, sampleRate: number, rateHz: number, depth: number): void {
  if (depth <= 0 || rateHz <= 0) return;
  for (let i = 0; i < samples.length; i++) {
    const lfo = 0.5 - 0.5 * Math.cos((2 * Math.PI * rateHz * i) / sampleRate);
    samples[i] *= 1 - depth * lfo;
  }
}

/** Pitch shift by cents, padded or cropped back to the original length. */
export function pitchShift(samples: Float32Array, cents: number): void {
  if (Math.abs(cents) < 0.01) return;
  const ratio = Math.pow(2, cents / 1200);
  const shifted = resample(samples, ratio);
  const out = new Float32Array(samples.length);
  out.set(shifted.subarray(0, Math.min(shifted.length, samples.length)));
  // Pad the tail with the last sample rather than silence, so a downward shift
  // does not end in a gap.
  const padValue = shifted.length > 0 ? shifted[shifted.length - 1] : 0;
  for (let i = shifted.length; i < out.length; i++) out[i] = padValue;
  samples.set(out);
}

/**
 * Render one variant. Returns a buffer the same length as the source (capped),
 * ready to audition, analyse or export.
 */
export function renderGenome(genome: Genome, options: GenomeRenderOptions): GenomeRenderResult {
  const { sampleRate, source } = options;
  const maxSeconds = options.maxSeconds ?? 20;
  const params = clampParams(genome.params);

  const frames = Math.max(1, Math.min(source.length, Math.round(maxSeconds * sampleRate)));
  const capped = source.length > frames;
  const view = source.subarray(0, frames);

  const out = new Float32Array(frames);
  const recordingWeight = params.layers.find((layer) => layer.kind === 'recording')?.weight ?? 1;
  // `?? 0` matters: a source shorter than the render window (including an empty
  // take) would otherwise write `undefined * weight` = NaN into the first
  // samples, which silences the whole buffer downstream.
  for (let i = 0; i < frames; i++) out[i] = (view[i] ?? 0) * recordingWeight;

  // Generated layers, each with its own seeded RNG.
  params.layers.forEach((layer, index) => {
    if (layer.kind === 'recording') return;
    mixGeneratedLayer(out, layer, sampleRate, mulberry32(deriveSeed(genome.seed, index + 1)));
  });

  applyGrainScatter(out, sampleRate, mulberry32(deriveSeed(genome.seed, 91)), params.grain);
  pitchShift(out, params.pitch.offsetCents);

  const type = params.filter.type;
  if (type === 'lowpass' || type === 'bandpass' || type === 'lohi') {
    lowPass(out, sampleRate, params.filter.highHz);
  }
  if (type === 'highpass' || type === 'bandpass' || type === 'lohi') {
    highPass(out, sampleRate, params.filter.lowHz);
  }

  drive(out, params.drive.amount, params.drive.mix);
  tremolo(out, sampleRate, params.tremolo.rateHz, params.tremolo.depth);
  bitCrush(out, params.crush.bits, params.crush.downsample);

  const gain = Math.pow(10, params.gainDb / 20);
  if (gain !== 1) {
    for (let i = 0; i < frames; i++) out[i] *= gain;
  }
  applyFades(out, sampleRate, params.fadeInMs, params.fadeOutMs);

  let lockedFrames = 0;
  if (params.transientLockEnabled && params.transientLockMs > 0 && frames > 0) {
    lockedFrames = Math.min(frames, transientLockSamples(sampleRate, params.transientLockMs));
    const restored = preserveTransient(
      view,
      out,
      lockedFrames,
      sampleRate,
      Math.max(1, transientLockSamples(sampleRate, 3))
    );
    out.set(restored.subarray(0, frames));
  }

  for (let i = 0; i < frames; i++) out[i] = clamp1(out[i]);

  return {
    samples: out,
    sampleRate,
    durationSec: frames / sampleRate,
    lockedFrames,
    capped,
  };
}