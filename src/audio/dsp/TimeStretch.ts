/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 5.2 — independent time-stretch & pitch-shift for an AudioBuffer.
 *
 * Wraps `@soundtouchjs/core` (SoundTouch) with the phase-vocoder stretch stage
 * so a buffer can be stretched in TIME without changing pitch, or shifted in
 * PITCH without changing time, or both — as a one-shot offline render into a
 * new AudioBuffer.
 *
 * The SoundTouch pipeline operates on interleaved stereo frames
 * (L, R, L, R, ...). `stretchSampleBuffer` converts to that layout, processes
 * every frame, and returns the de-interleaved output.
 */

import { SoundTouch } from '@soundtouchjs/core';
import { createPhaseVocoderFactory } from '@soundtouchjs/stretch-phase-vocoder';

export interface TimeStretchOptions {
  /**
   * Time factor. 1.0 = unchanged. 0.5 = half duration, 2.0 = double duration.
   * Pitch is preserved. Ignored when `pitchSemitones` only is wanted.
   */
  timeFactor?: number;
  /**
   * Pitch shift in semitones (-24..+24). Time is preserved when `timeFactor`
   * is omitted or 1.0.
   */
  pitchSemitones?: number;
  /**
   * FFT size for the phase vocoder. Larger = better low-frequency quality but
   * more CPU. Default 2048.
   */
  fftSize?: 512 | 1024 | 2048 | 4096;
  /** Overlap factor (2|4|8). Higher = smoother, more CPU. Default 4. */
  overlapFactor?: 2 | 4 | 8;
}

export interface TimeStretchResult {
  /** The newly rendered buffer (never the same reference as input). */
  buffer: AudioBuffer;
  /** Actual time factor achieved (≈ options.timeFactor for non-1 cases). */
  timeFactor: number;
  /** Actual semitone shift applied. */
  pitchSemitones: number;
}

/**
 * Stretch/pitch an AudioBuffer into a NEW AudioBuffer using the phase vocoder.
 * Pure offline DSP — no AudioContext needed, safe for unit tests.
 */
export function stretchSampleBuffer(
  input: AudioBuffer,
  options: TimeStretchOptions = {}
): TimeStretchResult {
  const { timeFactor = 1, pitchSemitones = 0, fftSize = 2048, overlapFactor = 4 } = options;

  const channels = input.numberOfChannels;
  const sampleRate = input.sampleRate;
  const frames = input.length;

  // Interleave into stereo frames (mono is duplicated to L/R for the pipeline).
  const interleaved = new Float32Array(frames * 2);
  const mono = channels === 1;
  const ch0 = input.getChannelData(0);
  const ch1 = channels > 1 ? input.getChannelData(1) : ch0;
  for (let i = 0; i < frames; i++) {
    interleaved[i * 2] = ch0[i];
    interleaved[i * 2 + 1] = mono ? ch0[i] : ch1[i];
  }

  const st = new SoundTouch({
    sampleRate,
    // Factory signature is positional: createPhaseVocoderFactory(fftSize, overlapFactor).
    stretchFactory: createPhaseVocoderFactory(fftSize, overlapFactor),
  });

  // Configure the pipeline: independent time vs pitch.
  //  - SoundTouch.pitch = 2^(semitones/12) shifts pitch AND derives the
  //    compensating stretch tempo (1/pitch) so duration stays constant.
  //  - The phase-vocoder stretch tempo > 1 = FASTER (shorter output), so to
  //    stretch by `timeFactor` we scale the compensating tempo by 1/timeFactor.
  const pitchMult = Math.pow(2, pitchSemitones / 12);
  st.pitch = pitchMult;
  if (timeFactor !== 1 && st.stretch) {
    st.stretch.tempo = (st.stretch.tempo || 1) / timeFactor;
  }

  // Feed all input frames, then keep processing until the pipeline drains.
  const outChunks: Float32Array[] = [];
  const MAX_OUT_FRAMES = frames * 4 + sampleRate * 2; // generous headroom for 4x stretch
  let produced = 0;

  st.inputBuffer.putSamples(interleaved, 0, frames);
  // The pipeline drains its tail even after the input is consumed, so we keep
  // pumping process() until several consecutive steps yield no new output.
  let zeroRuns = 0;
  for (let guard = 0; guard < 3000; guard++) {
    st.process();
    const avail = st.outputBuffer.frameCount;
    if (avail > 0) {
      const cap = Math.min(avail, Math.max(1, MAX_OUT_FRAMES - produced));
      const chunk = new Float32Array(cap * 2);
      st.outputBuffer.extract(chunk, 0, cap);
      st.outputBuffer.receive(cap);
      outChunks.push(chunk);
      produced += cap;
      zeroRuns = 0;
      if (produced >= MAX_OUT_FRAMES) break;
    } else {
      zeroRuns++;
      if (zeroRuns >= 6) break; // pipeline fully drained
    }
  }

  // `produced` is a count of STEREO frames (L,R pairs) — that equals the output
  // AudioBuffer length. Each frame contributes 2 interleaved floats.
  const totalFrames = Math.max(1, produced);
  const out = createOutputBuffer(channels, totalFrames, sampleRate);

  // De-interleave back into per-channel buffers.
  const outL = out.getChannelData(0);
  const outR = channels > 1 ? out.getChannelData(1) : null;
  let idx = 0;
  outer: for (const chunk of outChunks) {
    const n = Math.floor(chunk.length / 2);
    for (let i = 0; i < n; i++) {
      if (idx >= totalFrames) break outer;
      outL[idx] = chunk[i * 2];
      if (outR) outR[idx] = chunk[i * 2 + 1];
      idx++;
    }
  }

  return {
    buffer: out,
    timeFactor: pitchSemitones === 0 ? timeFactor : 1,
    pitchSemitones,
  };
}

/**
 * Convenience: stretch a buffer to a target DURATION (seconds). The time
 * factor is derived as `targetSec / input.duration`.
 */
export function stretchToDuration(input: AudioBuffer, targetSec: number, opts: Omit<TimeStretchOptions, 'timeFactor'> = {}): TimeStretchResult {
  const tf = Math.max(0.25, Math.min(4, targetSec / Math.max(0.001, input.duration)));
  return stretchSampleBuffer(input, { ...opts, timeFactor: tf });
}

/**
 * Create an output AudioBuffer. Uses the real `AudioBuffer` constructor when
 * available (browser); falls back to a structural equivalent (jsdom tests).
 */
function createOutputBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
  const ctor = (globalThis as { AudioBuffer?: new (init: { numberOfChannels: number; length: number; sampleRate: number }) => AudioBuffer }).AudioBuffer;
  if (ctor) {
    try {
      return new ctor({ numberOfChannels: channels, length, sampleRate });
    } catch { /* fall through */ }
  }
  const chans: Float32Array[] = [];
  for (let c = 0; c < channels; c++) chans.push(new Float32Array(length));
  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (i: number) => chans[i] ?? chans[0],
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}
