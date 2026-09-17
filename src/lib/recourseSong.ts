/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Recourse song bridge.
 *
 * Recourse's composer exposes a read-only, CORS-open endpoint that returns the
 * generated chord progression + key/BPM and either a SoundLab-playable piece
 * (loop mode) or the arrangement sections (arr mode):
 *
 *   GET /api/recourse/compose/song.json?style=&seed=&bars=&mode=&key=&major=
 *
 * This module builds the URL, fetches + validates the payload, and converts
 * Recourse chord labels into SoundLab `TheoryChord`s so a progression can be
 * voiced/stamped by the app's own theory engine.
 */

import type { TheoryChord } from './theory/progression';
import type { RecoursePiece } from './recourseBridge';
import { DEFAULT_RECOURSE_BASE, RECOURSE_STYLES } from './recourseEvolution';

export interface RecourseSongSection {
  name?: string;
  bars?: number;
  [key: string]: unknown;
}

export interface RecourseSong {
  mode: 'loop' | 'arr';
  style: string;
  seed: number;
  bars: number;
  bpm: number;
  /** e.g. "Cm" / "F#". */
  key: string;
  keyPc: number;
  major: boolean;
  chords: string[];
  events: number;
  sections?: RecourseSongSection[];
  /** Present in loop mode — directly loadable into SoundLab. */
  piece?: RecoursePiece;
}

export interface RecourseSongRequest {
  style: string;
  seed: number;
  bars?: number;
  mode?: 'loop' | 'arr';
  /** Pitch class 0..11 (omit to let Recourse choose). */
  key?: number;
  major?: boolean;
}

/** Build the read-only song URL. */
export function recourseSongUrl(base: string, req: RecourseSongRequest): string {
  const root = (base || DEFAULT_RECOURSE_BASE).replace(/\/+$/, '');
  const query = new URLSearchParams({
    style: req.style,
    seed: String(req.seed),
    bars: String(req.bars ?? 8),
    mode: req.mode ?? 'loop',
  });
  if (typeof req.key === 'number') query.set('key', String(req.key));
  if (typeof req.major === 'boolean') query.set('major', String(req.major));
  return `${root}/api/recourse/compose/song.json?${query.toString()}`;
}

function isSong(x: unknown): x is RecourseSong {
  if (!x || typeof x !== 'object') return false;
  const s = x as RecourseSong;
  return Array.isArray(s.chords) && typeof s.bpm === 'number' && typeof s.key === 'string';
}

/** Fetch + validate a song payload. Throws on transport/shape errors. */
export async function fetchRecourseSong(url: string): Promise<RecourseSong> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Recourse song fetch failed: HTTP ${res.status}`);
  const data: unknown = await res.json();
  if (!isSong(data)) throw new Error('Response is not a recourse song payload');
  return data;
}

/** List the composer's supported styles (falls back to the known set). */
export async function fetchRecourseStyles(base: string): Promise<string[]> {
  const root = (base || DEFAULT_RECOURSE_BASE).replace(/\/+$/, '');
  try {
    const res = await fetch(`${root}/api/recourse/compose/styles`, { cache: 'no-store' });
    if (!res.ok) return [...RECOURSE_STYLES];
    const data = (await res.json()) as { styles?: unknown };
    if (Array.isArray(data?.styles) && data.styles.every((s) => typeof s === 'string')) {
      return data.styles as string[];
    }
  } catch {
    /* offline — fall back */
  }
  return [...RECOURSE_STYLES];
}

/** Split a label like `F#m7b5` into root `F#` + quality `m7b5`. */
export function parseChordLabel(label: string): { root: string; quality: string } {
  const match = /^([A-Ga-g][#b]?)(.*)$/.exec(String(label).trim());
  if (!match) return { root: 'C', quality: '' };
  return { root: match[1], quality: match[2] };
}

/** Convert Recourse chord labels into SoundLab progression chords. */
export function chordLabelsToProgression(labels: readonly string[], beatsPerChord = 4): TheoryChord[] {
  return labels.map((label) => {
    const { root, quality } = parseChordLabel(label);
    return { root, type: quality, duration: beatsPerChord };
  });
}
