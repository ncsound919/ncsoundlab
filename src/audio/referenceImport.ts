/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reference-track import (Phase 4.3).
 *
 * Pure helpers for importing an external audio file (AAC, M4A, MP3, WAV,
 * FLAC, OGG) and turning it into a decoded AudioBuffer. The actual
 * `decodeAudioData` call needs a `BaseAudioContext`, so the consumer
 * supplies one (typically `audioEngine.getContext()` or any Offline
 * AudioContext for tests).
 */

export interface ReferenceTrackMeta {
  name: string;
  /** Source sample rate from the file header (Hz). */
  sourceSampleRate: number;
  /** Duration in seconds after decode. */
  durationSec: number;
  /** Number of channels (1 = mono, 2 = stereo). */
  channels: number;
  /** Size in bytes (file size). */
  sizeBytes: number;
  /** Import timestamp (ISO 8601). */
  importedAt: string;
  /** Best-effort format label from the file extension. */
  formatLabel: string;
}

const FORMAT_LABELS: Record<string, string> = {
  'audio/mp4': 'AAC (.m4a)',
  'audio/x-m4a': 'AAC (.m4a)',
  'audio/aac': 'AAC (.aac)',
  'audio/mpeg': 'MP3',
  'audio/mp3': 'MP3',
  'audio/wav': 'WAV',
  'audio/x-wav': 'WAV',
  'audio/wave': 'WAV',
  'audio/flac': 'FLAC',
  'audio/x-flac': 'FLAC',
  'audio/ogg': 'OGG',
  'audio/webm': 'WebM',
};

/**
 * Map a file extension to a human label. Used when the browser reports
 * an empty MIME type (common with .m4a AAC files).
 */
const EXTENSION_LABELS: Record<string, string> = {
  m4a: 'AAC (.m4a)',
  aac: 'AAC (.aac)',
  mp3: 'MP3',
  wav: 'WAV',
  flac: 'FLAC',
  ogg: 'OGG',
  oga: 'OGG',
  webm: 'WebM',
};

/**
 * Acceptable MIME prefixes — the actual `decodeAudioData` accepts a wide
 * range but we sanity-check at import time so the user gets a clear
 * error message for unsupported formats.
 */
export const ACCEPTED_AUDIO_PREFIXES = ['audio/'];

/**
 * Best-effort label for a file. Returns one of the format-specific
 * labels or falls back to `Unknown (.<ext>)`.
 */
export const describeAudioFile = (file: File): string => {
  const mime = file.type.toLowerCase();
  if (FORMAT_LABELS[mime]) return FORMAT_LABELS[mime];
  const dotIndex = file.name.lastIndexOf('.');
  // No `.` at all (e.g. "noext") → unknown audio, no extension.
  if (dotIndex === -1 || dotIndex === file.name.length - 1) {
    return 'Unknown audio';
  }
  const ext = file.name.slice(dotIndex + 1).toLowerCase();
  if (EXTENSION_LABELS[ext]) return EXTENSION_LABELS[ext];
  return `Unknown (.${ext})`;
};

/**
 * Validate that the browser will likely accept this file. Throws an
 * Error with a user-facing message if the format is unsupported.
 */
export const assertAudioFileAccepted = (file: File): void => {
  const mime = file.type.toLowerCase();
  if (mime && mime.startsWith('audio/')) return;
  const dotIndex = file.name.lastIndexOf('.');
  if (dotIndex !== -1 && dotIndex < file.name.length - 1) {
    const ext = file.name.slice(dotIndex + 1).toLowerCase();
    if (EXTENSION_LABELS[ext]) return;
  }
  throw new Error(
    `Unsupported audio file: "${file.name}". Drop a WAV, MP3, AAC (.m4a/.aac), FLAC or OGG file.`
  );
};

/**
 * Read a `File` into an `ArrayBuffer` ready for `decodeAudioData`. The
 * helper is split out so tests can supply a pre-built buffer and exercise
 * the rest of the pipeline.
 */
export const readFileToArrayBuffer = async (file: File): Promise<ArrayBuffer> =>
  await file.arrayBuffer();

/**
 * Decode a file's contents into an `AudioBuffer` using the supplied
 * context. Combines the validation + decode in one helper.
 */
export const decodeAudioFile = async (
  context: BaseAudioContext,
  file: File
): Promise<AudioBuffer> => {
  assertAudioFileAccepted(file);
  const arrayBuffer = await readFileToArrayBuffer(file);
  // decodeAudioData copies the input on Chrome/Firefox/Safari; some
  // implementations detach it. Either way we don't reuse the buffer.
  return await context.decodeAudioData(arrayBuffer);
};

/**
 * Build a `ReferenceTrackMeta` from a decoded buffer + the original
 * file. The caller supplies the `importedAt` timestamp (typically
 * `new Date().toISOString()`).
 */
export const buildReferenceTrackMeta = (
  file: File,
  buffer: AudioBuffer,
  importedAt: string
): ReferenceTrackMeta => ({
  name: file.name,
  sourceSampleRate: buffer.sampleRate,
  durationSec: buffer.duration,
  channels: buffer.numberOfChannels,
  sizeBytes: file.size,
  importedAt,
  formatLabel: describeAudioFile(file),
});

/**
 * Helper: convert a sample-rate and bit-depth into a label suitable
 * for the reference panel (e.g. "44.1 kHz / 16-bit"). The bit depth is
 * inferred from the file extension when unknown — `.wav` is 16-bit,
   `.flac` is variable, `.m4a` is AAC (lossy). This is best-effort and
 * purely cosmetic.
 */
export const formatReferenceQuality = (
  meta: ReferenceTrackMeta
): string => {
  const kHz = (meta.sourceSampleRate / 1000).toFixed(1);
  const channelWord = meta.channels === 1 ? 'mono' : meta.channels === 2 ? 'stereo' : `${meta.channels}ch`;
  return `${kHz} kHz · ${channelWord} · ${meta.formatLabel}`;
};
