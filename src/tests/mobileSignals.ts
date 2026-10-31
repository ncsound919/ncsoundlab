/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic signal generators for the field-engine tests. Lives under
 * `src/tests/` so it is excluded from the coverage gate (see vitest.config.ts).
 */

export interface Hit {
  atSec: number;
  freq: number;
  amp?: number;
  decaySec?: number;
}

const secondsToSamples = (seconds: number, sampleRate: number): number =>
  Math.max(0, Math.round(seconds * sampleRate));

export function silence(seconds: number, sampleRate: number): Float32Array {
  return new Float32Array(secondsToSamples(seconds, sampleRate));
}

export function tone(
  hz: number,
  seconds: number,
  sampleRate: number,
  amp = 0.5,
  phase = 0
): Float32Array {
  const n = secondsToSamples(seconds, sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = amp * Math.sin(2 * Math.PI * hz * (i / sampleRate) + phase);
  }
  return out;
}

/** Sum of harmonic partials — gives the analysis something to measure. */
export function harmonics(
  fundamentalHz: number,
  seconds: number,
  sampleRate: number,
  amp = 0.5
): Float32Array {
  const out = tone(fundamentalHz, seconds, sampleRate, amp);
  const partials: [number, number][] = [
    [2, 0.5],
    [3, 0.3],
    [5, 0.15],
  ];
  for (const [multiple, level] of partials) {
    const p = tone(fundamentalHz * multiple, seconds, sampleRate, amp * level);
    for (let i = 0; i < out.length; i++) out[i] += p[i];
  }
  return out;
}

/** Sharp-attack hits (a transient followed by an exponential decay). */
export function hits(spec: Hit[], seconds: number, sampleRate: number): Float32Array {
  const out = silence(seconds, sampleRate);
  for (const hit of spec) {
    const start = secondsToSamples(hit.atSec, sampleRate);
    const decay = hit.decaySec ?? 0.15;
    const n = Math.min(out.length - start, secondsToSamples(decay * 4, sampleRate));
    for (let i = 0; i < n; i++) {
      const env = Math.exp(-i / (sampleRate * decay));
      out[start + i] += (hit.amp ?? 0.8) * env * Math.sin((2 * Math.PI * hit.freq * i) / sampleRate);
    }
  }
  return out;
}

/** Seeded white noise (no Math.random, so tests are reproducible). */
export function noise(seconds: number, sampleRate: number, amp = 0.05, seed = 1): Float32Array {
  const n = secondsToSamples(seconds, sampleRate);
  const out = new Float32Array(n);
  let state = seed >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = amp * ((state / 4294967296) * 2 - 1);
  }
  return out;
}

/** Mix two buffers in place (first is modified). */
export function mixInto(target: Float32Array, other: Float32Array): Float32Array {
  for (let i = 0; i < Math.min(target.length, other.length); i++) target[i] += other[i];
  return target;
}

export function concat(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export const peakOf = (samples: Float32Array): number => {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  return peak;
};

export const rmsOf = (samples: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length > 0 ? Math.sqrt(sum / samples.length) : 0;
};
