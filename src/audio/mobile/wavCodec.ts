/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * WAV container for field captures and kit exports.
 *
 * The Android recorder hands back 32-bit float PCM (AudioRecord's
 * `ENCODING_PCM_FLOAT`) or 24-bit PCM; the field kit exports both. The PCM body
 * is produced by the existing quantizers in `src/audio/aafPcm.ts` so there is
 * exactly one 16/24-bit quantiser in the codebase; this module owns the RIFF
 * header, 32-bit float and parsing.
 */

import { interleavePcm, deinterleavePcm } from '../aafPcm';

export type WavSampleFormat = 'float32' | 'int32' | 'int24' | 'int16';

export interface WavFormatInfo {
  formatTag: number;
  bitsPerSample: number;
  bytesPerSample: number;
}

export const WAV_FORMATS: Record<WavSampleFormat, WavFormatInfo> = {
  float32: { formatTag: 3, bitsPerSample: 32, bytesPerSample: 4 },
  int32: { formatTag: 1, bitsPerSample: 32, bytesPerSample: 4 },
  int24: { formatTag: 1, bitsPerSample: 24, bytesPerSample: 3 },
  int16: { formatTag: 1, bitsPerSample: 16, bytesPerSample: 2 },
};

export interface WavEncodeOptions {
  /** Sample format. Default 'float32' (lossless for capture). */
  format?: WavSampleFormat;
}

/** Bytes a WAV of this length will occupy, header included. */
export function wavByteSize(
  frames: number,
  channels: number,
  format: WavSampleFormat = 'float32'
): number {
  return 44 + frames * channels * WAV_FORMATS[format].bytesPerSample;
}

/** Recording throughput, for the storage preflight. */
export function bytesPerSecond(
  channels: number,
  sampleRate: number,
  format: WavSampleFormat = 'float32'
): number {
  return channels * sampleRate * WAV_FORMATS[format].bytesPerSample;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/**
 * Encode channels into a RIFF/WAVE file. 16/24-bit go through the shared
 * quantizer (TPDF dithered); 32-bit float and 32-bit int are written directly
 * so a capture round-trip is bit-exact.
 */
export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
  options: WavEncodeOptions = {}
): Uint8Array {
  const format = options.format ?? 'float32';
  const info = WAV_FORMATS[format];
  const frames = channels.reduce((max, ch) => Math.max(max, ch.length), 0);
  const frameCount = frames;
  const dataBytes = frameCount * channels.length * info.bytesPerSample;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, info.formatTag, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels.length * info.bytesPerSample, true);
  view.setUint16(32, channels.length * info.bytesPerSample, true);
  view.setUint16(34, info.bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  const body = out.subarray(44);
  if (format === 'int16' || format === 'int24') {
    body.set(interleavePcm(channels, frameCount, format === 'int16' ? 16 : 24));
    return out;
  }
  const bodyView = new DataView(body.buffer, body.byteOffset, body.byteLength);
  for (let i = 0; i < frameCount; i++) {
    for (let c = 0; c < channels.length; c++) {
      const sample = channels[c][i] ?? 0;
      const offset = (i * channels.length + c) * 4;
      if (format === 'float32') {
        bodyView.setFloat32(offset, sample, true);
      } else {
        const clamped = Math.max(-1, Math.min(1, sample));
        bodyView.setInt32(offset, Math.round(clamped * 0x7fffffff), true);
      }
    }
  }
  return out;
}

/** Mono convenience wrapper — what the field recorder actually calls. */
export function encodeWavMono(
  samples: Float32Array,
  sampleRate: number,
  options: WavEncodeOptions = {}
): Uint8Array {
  return encodeWav([samples], sampleRate, options);
}

export interface DecodedWav {
  channels: Float32Array[];
  sampleRate: number;
  frames: number;
  format: WavSampleFormat | 'unknown';
  dataOffset: number;
  dataBytes: number;
}

const formatFromTags = (formatTag: number, bits: number): WavSampleFormat | 'unknown' => {
  if (formatTag === 3 && bits === 32) return 'float32';
  if (formatTag !== 1) return 'unknown';
  if (bits === 16) return 'int16';
  if (bits === 24) return 'int24';
  if (bits === 32) return 'int32';
  return 'unknown';
};

/**
 * Parse a WAV file: walks the chunk list instead of assuming a 44-byte header,
 * because Android and desktop writers both like to add `LIST`/`fact` chunks.
 */
export function decodeWav(bytes: Uint8Array | ArrayBuffer): DecodedWav {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buffer.byteLength < 44) throw new Error('WAV too short');
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const tag = (offset: number): string =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a RIFF/WAVE file');

  let offset = 12;
  let formatTag = 1;
  let bits = 16;
  let channelCount = 1;
  let sampleRate = 48000;
  let dataOffset = -1;
  let dataBytes = 0;
  while (offset + 8 <= buffer.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === 'fmt ') {
      formatTag = view.getUint16(body, true);
      channelCount = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      if (formatTag === 0xfffe && size >= 40) {
        // WAVE_FORMAT_EXTENSIBLE: the real tag is the first two bytes of the GUID.
        formatTag = view.getUint16(body + 24, true);
      }
    } else if (id === 'data') {
      dataOffset = body;
      dataBytes = Math.min(size, buffer.byteLength - body);
      break;
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }
  if (dataOffset < 0) throw new Error('WAV has no data chunk');
  if (channelCount < 1 || channelCount > 8) throw new Error(`Unsupported channel count ${channelCount}`);

  const format = formatFromTags(formatTag, bits);
  if (format === 'unknown') {
    throw new Error(`Unsupported WAV encoding (tag ${formatTag}, ${bits} bits)`);
  }
  const info = WAV_FORMATS[format];
  const frames = Math.floor(dataBytes / (channelCount * info.bytesPerSample));
  const data = buffer.subarray(dataOffset, dataOffset + frames * channelCount * info.bytesPerSample);

  let channels: Float32Array[];
  if (format === 'float32' || format === 'int32') {
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    channels = Array.from({ length: channelCount }, () => new Float32Array(frames));
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < channelCount; c++) {
        const at = (i * channelCount + c) * 4;
        channels[c][i] =
          format === 'float32'
            ? dataView.getFloat32(at, true)
            : dataView.getInt32(at, true) / 0x80000000;
      }
    }
  } else {
    channels = deinterleavePcm(data, channelCount, format === 'int16' ? 16 : 24);
  }
  return { channels, sampleRate, frames, format, dataOffset, dataBytes };
}

/** Decode to a single mono buffer (averaging channels) — the slicer's input. */
export function decodeWavMono(bytes: Uint8Array | ArrayBuffer): {
  samples: Float32Array;
  sampleRate: number;
  format: DecodedWav['format'];
} {
  const decoded = decodeWav(bytes);
  if (decoded.channels.length === 1) {
    return { samples: decoded.channels[0], sampleRate: decoded.sampleRate, format: decoded.format };
  }
  const mono = new Float32Array(decoded.frames);
  for (const channel of decoded.channels) {
    for (let i = 0; i < decoded.frames; i++) mono[i] += channel[i] / decoded.channels.length;
  }
  return { samples: mono, sampleRate: decoded.sampleRate, format: decoded.format };
}
