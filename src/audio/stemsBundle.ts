/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Stems bundle assembly (Phase 4.2).
 *
 * Pure helpers for the Pro Tools "Import As Session Tracks" bundle:
 * build a `Markers.csv` (per-beat markers + arrangement clip markers),
 * a `README.txt` documenting the import workflow, and a `BundleEntry`
 * type the consumer writes into a JSZip archive.
 */

import type { Arrangement } from '../types';
import { secondsToTimecode } from './stemExport';

export interface BundleEntry {
  /** Path inside the bundle (forward-slashes; no leading slash). */
  path: string;
  /** The file contents (binary for WAV blobs, UTF-8 text for csv/txt). */
  content: Uint8Array;
}

/**
 * Pro Tools "Markers from CSV" format. Columns:
 *   Name, Start, Length, Timecode, SampleRate, ...
 *
 * Start is in the user's chosen timecode base; we emit a 4-field
 * timecode string and let the user pick the fps on import.
 */
export interface MarkerRow {
  name: string;
  startSec: number;
  lengthSec?: number;
}

export const buildMarkersCsv = (rows: MarkerRow[], fps = 30): string => {
  const header = 'Name,Start,Length,Timecode';
  const lines = rows.map((r) => {
    const start = secondsToTimecode(r.startSec, fps);
    const length = secondsToTimecode(r.lengthSec ?? 0, fps);
    // Escape quotes (RFC 4180) and collapse newlines so a marker name can
    // never split the CSV row.
    const name = r.name.replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
    return `"${name}",${start},${length},${start}`;
  });
  return [header, ...lines].join('\n') + '\n';
};

/**
 * Beat-grid markers: emits one marker per beat of the song so Pro Tools
 * users get a free tempo grid on import. The first marker is named
 * "Beat 1" at `startBeatSec`; subsequent markers count up.
 */
export const buildBeatMarkers = (
  totalBeats: number,
  bpm: number,
  startBeatSec = 0,
  fps = 30,
  options?: { namePrefix?: string; barEvery?: number }
): MarkerRow[] => {
  const beatSec = 60 / bpm;
  const prefix = options?.namePrefix ?? 'Beat';
  const barEvery = options?.barEvery ?? 4;
  const rows: MarkerRow[] = [];
  for (let i = 0; i < totalBeats; i++) {
    const t = startBeatSec + i * beatSec;
    const name = i % barEvery === 0
      ? `${prefix} ${(i / barEvery) + 1}` // bar
      : `${prefix} ${i + 1}`;            // beat
    rows.push({ name, startSec: t, lengthSec: 0 });
  }
  return rows;
};

/**
 * Arrangement clip markers: one per clip showing where each pattern sits
 * in the song. Clips carry their own startBeat; we compute seconds from
 * the song's active BPM (single-BPM assumption for now; tempo maps
 * land in Phase 2.2 scheduler integration).
 */
export const buildArrangementMarkers = (
  arrangement: Arrangement,
  bpm: number,
  fps = 30
): MarkerRow[] => {
  const beatSec = 60 / bpm;
  return [...arrangement.clips]
    .sort((a, b) => a.startBeat - b.startBeat)
    .map((clip) => ({
      name: `Clip ${clip.patternId}`,
      startSec: clip.startBeat * beatSec,
      lengthSec: clip.beats * beatSec,
    }));
};

/**
 * The README Pro Tools users see inside the bundle. Plain text; no
 * markdown because Pro Tools users tend to view it in Finder.
 */
export const buildReadme = (songTitle: string, layout: { stemsDir: string }): string => {
  return [
    `${songTitle} — Pro Tools Import`,
    '',
    'This bundle was exported by NC Sound Lab. The stems folder is laid out so Pro Tools can',
    'auto-import each WAV as its own session track (File → Import → Audio → "Import As Session Tracks…").',
    '',
    'Layout:',
    `  ${layout.stemsDir}/<TrackName>_<Index>_Take<Take>.wav — per-layer stems`,
    '  Markers.csv — beat + clip markers (import via "Import Session Data → Markers from CSV")',
    '',
    'Recommended import steps:',
    '  1. Open or create a Pro Tools session at the same sample rate as the stems.',
    `  2. Drag the "${layout.stemsDir}" folder into the edit window; Pro Tools will create one track per stem.`,
    '  3. Import Markers.csv via the Import Session Data dialog to drop beat/bar markers on the timeline.',
    '  4. Adjust each stem\'s volume/pan to taste — they were bounced at -0.3 dBFS peak.',
    '',
    'If you need a single AAF file instead of stems, ask the NC Sound Lab desktop build to export',
    'one (it generates real AAFs).',
    '',
    '— NC Sound Lab',
  ].join('\n');
};

/**
 * Encode a UTF-8 string into a `Uint8Array` (for putting into a JSZip file).
 */
export const encodeUtf8 = (text: string): Uint8Array => {
  return new TextEncoder().encode(text);
};
