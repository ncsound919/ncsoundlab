/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pre-roll ring buffer, take assembly and transient lock.
 *
 * Field recording lives or dies on the first 10–20 ms of a sound. Two places
 * would otherwise destroy it:
 *
 *  1. Capture — the tap on "record" lands *after* the sound started, so the
 *     engine keeps a rolling buffer of recent audio and writes it in front of
 *     the take. This is what every hardware field recorder does.
 *  2. Mutation — evolving a variant must not smear the attack, so variation is
 *     applied only after `transientLockMs`, and the original attack is blended
 *     back over a short crossfade.
 */

export interface PreRollOptions {
  /** Rolling window length. Default 1000 ms. */
  windowMs?: number;
}

/**
 * Fixed-size ring buffer of the most recent mono samples. `push` never
 * allocates once constructed, so it is safe to call from a capture loop.
 */
export class PreRollBuffer {
  private readonly ring: Float32Array;
  private readonly sampleRate: number;
  private written = 0;

  constructor(sampleRate: number, options: PreRollOptions = {}) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new Error(`PreRollBuffer needs a positive sample rate, got ${sampleRate}`);
    }
    this.sampleRate = sampleRate;
    const windowMs = options.windowMs ?? 1000;
    this.ring = new Float32Array(Math.max(1, Math.round((windowMs / 1000) * sampleRate)));
  }

  get capacity(): number {
    return this.ring.length;
  }

  /** Frames currently held (saturates at capacity). */
  get size(): number {
    return Math.min(this.written, this.ring.length);
  }

  push(samples: Float32Array): void {
    const n = samples.length;
    // Anything larger than the window can only contribute its own tail.
    const start = n > this.ring.length ? n - this.ring.length : 0;
    for (let i = start; i < n; i++) {
      this.ring[this.written % this.ring.length] = samples[i];
      this.written++;
    }
  }

  /** Copy the held audio, oldest sample first. */
  snapshot(): Float32Array {
    const size = this.size;
    const out = new Float32Array(size);
    const start = this.written - size;
    for (let i = 0; i < size; i++) {
      out[i] = this.ring[(start + i) % this.ring.length];
    }
    return out;
  }

  clear(): void {
    this.ring.fill(0);
    this.written = 0;
  }

  get sampleRateHz(): number {
    return this.sampleRate;
  }
}

export interface TakeAssemblerOptions {
  /** Hard cap on take length. Default 30 minutes. */
  maxSeconds?: number;
  /** Fade applied at the very start of the pre-roll lead-in. Default 1 ms. */
  leadInFadeMs?: number;
}

export interface AssembledTake {
  samples: Float32Array;
  sampleRate: number;
  /** How much pre-roll audio landed in front of the tap (frames). */
  preRollFrames: number;
  durationSec: number;
  /** True when the take hit `maxSeconds` and later audio was dropped. */
  truncated: boolean;
}

/**
 * Builds one take from the pre-roll window plus the streamed capture chunks.
 * `begin()` snapshots the ring so the sound that triggered the record survives.
 */
export class TakeAssembler {
  private readonly parts: Float32Array[] = [];
  private preRollFrames = 0;
  private totalFrames = 0;
  private truncated = false;
  private readonly limitFrames: number;

  constructor(
    private readonly preRoll: PreRollBuffer,
    private readonly sampleRate: number,
    options: TakeAssemblerOptions = {}
  ) {
    const maxSeconds = options.maxSeconds ?? 30 * 60;
    this.limitFrames = Math.round(maxSeconds * sampleRate);
    this.leadInFadeFrames = Math.max(
      1,
      Math.round(((options.leadInFadeMs ?? 1) / 1000) * sampleRate)
    );
  }

  private readonly leadInFadeFrames: number;

  begin(): void {
    this.parts.length = 0;
    this.truncated = false;
    this.totalFrames = 0;
    this.preRollFrames = 0;
    const held = this.preRoll.snapshot();
    if (held.length === 0) return;
    // A held buffer that starts mid-waveform needs a short fade, or playback
    // begins with a step. One that already starts near silence does not, and
    // fading it would ramp the first milliseconds up from zero — notching the
    // clean attack this buffer exists to preserve.
    if (Math.abs(held[0]) > 0.01) {
      const fade = Math.min(this.leadInFadeFrames, held.length);
      for (let i = 0; i < fade; i++) held[i] *= i / fade;
    }
    this.parts.push(held);
    this.preRollFrames = held.length;
    this.totalFrames = held.length;
  }

  append(chunk: Float32Array): void {
    if (this.totalFrames >= this.limitFrames) {
      this.truncated = true;
      return;
    }
    let data = chunk;
    if (this.totalFrames + data.length > this.limitFrames) {
      data = data.subarray(0, this.limitFrames - this.totalFrames);
      this.truncated = true;
    }
    if (data.length === 0) return;
    // Copy: the caller reuses its capture chunk buffer.
    this.parts.push(Float32Array.from(data));
    this.totalFrames += data.length;
  }

  finish(): AssembledTake {
    const samples = new Float32Array(this.totalFrames);
    let offset = 0;
    for (const part of this.parts) {
      samples.set(part, offset);
      offset += part.length;
    }
    return {
      samples,
      sampleRate: this.sampleRate,
      preRollFrames: this.preRollFrames,
      durationSec: this.totalFrames / this.sampleRate,
      truncated: this.truncated,
    };
  }
}

/** Frames protected from mutation at the start of a slice. */
export function transientLockSamples(sampleRate: number, lockMs = 15): number {
  return Math.max(0, Math.round((lockMs / 1000) * sampleRate));
}

/**
 * Blend the original attack back over a mutated buffer. The lock region is
 * untouched, and the hand-off uses a short linear crossfade so the seam does
 * not click.
 */
export function preserveTransient(
  source: Float32Array,
  mutated: Float32Array,
  lockSamples: number,
  sampleRate: number,
  crossfadeMs = 3
): Float32Array {
  const out = Float32Array.from(mutated);
  const frames = Math.min(source.length, out.length);
  const lock = Math.max(0, Math.min(lockSamples, frames));
  const crossfade = Math.max(1, Math.min(Math.round((crossfadeMs / 1000) * sampleRate), frames - lock || 1));
  for (let i = 0; i < frames; i++) {
    if (i < lock) {
      out[i] = source[i];
    } else if (i < lock + crossfade) {
      const t = (i - lock) / crossfade;
      out[i] = source[i] * (1 - t) + out[i] * t;
    }
  }
  return out;
}
