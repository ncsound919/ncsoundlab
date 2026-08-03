/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure PCM <-> AAF payload helpers (Phase 4.5). Kept free of Web Audio types
 * so every function is unit-testable in jsdom.
 */

/** Base64-encode bytes in chunks (avoids call-stack overflow on big PCM). */
export function base64FromBytes(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decode a base64 string back into bytes. */
export function bytesFromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
}

/** Clamp a float sample to [-1, 1] and quantize to a 24-bit signed int. */
export function floatToInt24(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  const v = clamped < 0 ? Math.round(clamped * 0x800000) : Math.round(clamped * 0x7fffff);
  return v & 0xffffff;
}

/** Convert three little-endian bytes (at `offset`) into a float sample. */
export function int24ToFloat(b0: number, b1: number, b2: number): number {
  let v = b2 * 0x10000 + b1 * 0x100 + b0;
  if (v >= 0x800000) v -= 0x1000000; // sign-extend 24-bit two's complement
  return v / 0x800000;
}

/**
 * Interleave per-channel Float32 data into a single little-endian PCM buffer
 * at the given bit depth (16 or 24). `frames` is the number of frames per
 * channel; samples past the end are treated as silence.
 */
export function interleavePcm(
  channels: Float32Array[],
  frames: number,
  bits: 16 | 24
): Uint8Array {
  const bytesPerSample = bits / 8;
  const out = new Uint8Array(frames * channels.length * bytesPerSample);
  const view = new DataView(out.buffer);

  for (let c = 0; c < channels.length; c++) {
    const ch = channels[c];
    for (let i = 0; i < frames; i++) {
      const sample = ch[i] ?? 0;
      const offset = (i * channels.length + c) * bytesPerSample;
      if (bits === 16) {
        const v = Math.max(-32768, Math.min(32767, Math.round(sample * 0x8000)));
        view.setInt16(offset, v, true);
      } else {
        const v = floatToInt24(sample);
        view.setUint8(offset, v & 0xff);
        view.setUint8(offset + 1, (v >> 8) & 0xff);
        view.setUint8(offset + 2, (v >> 16) & 0xff);
      }
    }
  }
  return out;
}

/**
 * De-interleave a little-endian PCM buffer back into per-channel Float32 data.
 * Returns one Float32Array per channel; length = frames per channel.
 */
export function deinterleavePcm(
  pcm: Uint8Array,
  channels: number,
  bits: 16 | 24 | 32
): Float32Array[] {
  const bytesPerSample = Math.max(1, bits / 8);
  const frames = Math.floor(pcm.length / (channels * bytesPerSample));
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const result: Float32Array[] = [];

  for (let c = 0; c < channels; c++) {
    const data = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      const offset = (i * channels + c) * bytesPerSample;
      let sample = 0;
      if (bits === 16) {
        sample = view.getInt16(offset, true) / 0x8000;
      } else if (bits === 32) {
        sample = view.getInt32(offset, true) / 0x80000000;
      } else {
        sample = int24ToFloat(
          view.getUint8(offset),
          view.getUint8(offset + 1),
          view.getUint8(offset + 2)
        );
      }
      data[i] = sample;
    }
    result.push(data);
  }
  return result;
}

/**
 * Pad (or truncate) a PCM buffer to exactly `frames` per channel with silence.
 */
export function padPcmTo(
  pcm: Uint8Array,
  frames: number,
  channels: number,
  bytesPerSample: number
): Uint8Array {
  const target = frames * channels * bytesPerSample;
  const out = new Uint8Array(target);
  out.set(pcm.subarray(0, Math.min(pcm.length, target)));
  return out;
}
