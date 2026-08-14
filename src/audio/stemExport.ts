/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Stem export helpers (Phase 4.1).
 *
 * Pure helpers for naming + format options used by per-layer stem
 * rendering and Pro Tools import. The actual audio render lives in the
 * audio engine; this module only owns the file-shape concerns (filename
 * sanitisation, layout conventions, sampling-rate / bit-depth
 * validation).
 */

export type StemSampleRate = 44100 | 48000 | 96000;
export type StemBitDepth = 16 | 24 | 32;

export interface StemExportOptions {
  sampleRate?: StemSampleRate;
  bitDepth?: StemBitDepth;
  /** Include send levels in the rendered stem (default true). */
  includeSends?: boolean;
  /** Master-prefix used in the bundle (default 'Stem'). */
  prefix?: string;
}

export const DEFAULT_STEM_OPTIONS: Required<StemExportOptions> = {
  sampleRate: 48000,
  bitDepth: 24,
  includeSends: true,
  prefix: 'Stem',
};

/**
 * Pro Tools auto-imports files whose base name maps to a track name. We
 * sanitise layer names so they read as track names: letters, digits, dash
 * and underscore; leading non-letters trimmed; collapsed to single dashes.
 */
export const sanitiseTrackName = (raw: string): string => {
  if (!raw) return 'Untitled';
  // Replace whitespace and unsupported characters with dashes.
  const replaced = raw.replace(/[^A-Za-z0-9_-]+/g, '-');
  // Trim leading dashes / digits so the track name starts with a letter
  // (Pro Tools is happier with names that begin with a letter).
  const trimmed = replaced.replace(/^[-0-9]+/, '');
  // Collapse repeated dashes.
  const collapsed = trimmed.replace(/-+/g, '-').replace(/^-|-$/g, '');
  return collapsed || 'Untitled';
};

/**
 * Build a Pro Tools-friendly filename: `<sanitised-name>_<index>_<take>.wav`.
 * The leading zero-padded index lets Pro Tools auto-sort tracks; the take
 * suffix matches the standard `Take01`/`Take02` convention so the user
 * can paste-multiple takes into the same session later.
 */
export const buildStemFilename = (
  layerName: string,
  index: number,
  take: number,
  _options: StemExportOptions = {}
): string => {
  const name = sanitiseTrackName(layerName);
  const idx = String(index + 1).padStart(2, '0');
  const tk = `Take${String(take).padStart(2, '0')}`;
  return `${name}_${idx}_${tk}.wav`;
};

/**
 * Build the Pro Tools "Import As Session Tracks" friendly bundle
 * directory layout (see Phase 4.2 for the consumer).
 *
 * Returns a flat list of `{ path, content }` entries that the caller can
 * write into a JSZip archive:
 *
 *   <song>/<song>_Master.wav
 *   <song>/<song>_Stems/<track>_<idx>_Take<tk>.wav
 *   <song>/Markers.csv
 *   <song>/README.txt
 *
 * `stems` and `master` are populated by the caller — the helper only
 * returns the path layout, not the audio.
 */
export interface StemBundleLayout {
  rootDir: string;
  stemsDir: string;
  masterFilename: string;
  markersFilename: string;
  readmeFilename: string;
}

export const buildStemBundleLayout = (songTitle: string): StemBundleLayout => {
  const root = sanitiseTrackName(songTitle) || 'Project';
  return {
    rootDir: root,
    stemsDir: `${root}/Stems`,
    masterFilename: `${root}_Master.wav`,
    markersFilename: `${root}/Markers.csv`,
    readmeFilename: `${root}/README.txt`,
  };
};

/**
 * Validate / coerce a sample-rate and bit-depth option. Returns the
 * supported option or the default.
 */
export const sanitizeStemOptions = (
  raw: StemExportOptions | undefined
): Required<StemExportOptions> => {
  const merged: Required<StemExportOptions> = {
    ...DEFAULT_STEM_OPTIONS,
    ...(raw ?? {}),
  };
  if (![44100, 48000, 96000].includes(merged.sampleRate)) {
    merged.sampleRate = 48000;
  }
  if (![16, 24, 32].includes(merged.bitDepth)) {
    merged.bitDepth = 24;
  }
  return merged;
};

/**
 * Format a duration in seconds as a Pro Tools-friendly timecode
 * `HH:MM:SS:FF` (FF = frame index at the chosen fps). Used by the
 * Markers.csv exporter in Phase 4.2.
 */
export const secondsToTimecode = (
  seconds: number,
  fps = 30
): string => {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const totalFrames = Math.round(seconds * fps);
  const ff = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
};
