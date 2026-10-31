/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Field metadata — where a take came from, and the seed that draws its cover.
 *
 * Field recordings are remembered by place and time, so both are captured and
 * both feed a deterministic seed. "Deterministic" matters: the same take must
 * draw the same cover on every device and after every reinstall, which rules
 * out anything time-of-render dependent.
 */

import { deriveSeed } from './genome';

export const FIELD_META_FORMAT = 'ncsoundlab-field-meta@1';

export interface FieldMeta {
  id: string;
  name: string;
  /** Free-text place, e.g. "Biscayne Bay". */
  place: string;
  lat?: number;
  lon?: number;
  /** ISO 8601 timestamp of the take. */
  timeISO: string;
  /** Seed for this take's root genome. */
  seed: number;
  /** Stable string the cover art is drawn from. */
  coverArtSeed: string;
  /** Genome ids belonging to this take, in creation order. */
  genomeIds: string[];
  /** Kit root this take was detected at (Hz), when known. */
  rootHz?: number;
  sampleRateHz: number;
  durationSec?: number;
  tags: string[];
  notes?: string;
  /** Capture path description, e.g. "48.0 kHz · mono · 32-bit float · UNPROCESSED". */
  device?: string;
  format: typeof FIELD_META_FORMAT;
}

/** `place` slug + calendar day — the stable, human-readable seed. */
export function seedCoverArt(place: string, timeISO: string): string {
  const slug = (place || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';
  const day = (timeISO.split('T')[0] || '').replace(/-/g, '');
  return `${slug}_${day || 'nodate'}`;
}

/** FNV-1a over a string — small, stable, no crypto dependency. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Seed for a take: id + place + time, so it is stable and unique enough. */
export function takeSeed(id: string, place: string, timeISO: string): number {
  return deriveSeed(hashString(`${id}|${place}|${timeISO}`), hashString(id) || 1);
}

export interface CoverArtParams {
  hue: number;
  saturation: number;
  lightness: number;
  /** Number of bands/blobs the cover draws. */
  bands: number;
  rotation: number;
  /** 0..1 — how hard the cover's contrast is pushed. */
  contrast: number;
  /** Three hex colours, drawn from the hue. */
  palette: string[];
}

const hslToHex = (h: number, s: number, l: number): string => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  const toHex = (v: number): string =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
};

/**
 * Cover-art parameters from the seed. Place and time set the hue, the time of
 * day sets the lightness, and the hour sets the contrast — a dawn recording is
 * pale, a night one is deep.
 */
export function coverArtParams(coverArtSeed: string, timeISO = ''): CoverArtParams {
  const hash = hashString(coverArtSeed);
  const rng = (salt: number): number => (deriveSeed(hash, salt) % 1000) / 1000;
  const hour = Number.parseInt((timeISO.split('T')[1] ?? '').slice(0, 2), 10);
  const hourFraction = Number.isFinite(hour) ? hour / 24 : rng(7);
  const hue = Math.round(rng(1) * 360);
  const saturation = 0.35 + rng(2) * 0.45;
  const lightness = 0.18 + (1 - hourFraction) * 0.12 + rng(3) * 0.1;
  return {
    hue,
    saturation: Number(saturation.toFixed(3)),
    lightness: Number(Math.min(0.6, lightness).toFixed(3)),
    bands: 3 + Math.floor(rng(4) * 6),
    rotation: Math.round(rng(5) * 360),
    contrast: Number((0.3 + rng(6) * 0.6).toFixed(3)),
    palette: [
      hslToHex(hue, saturation, lightness),
      hslToHex(hue + 25, Math.min(1, saturation + 0.1), Math.min(0.85, lightness + 0.22)),
      hslToHex(hue + 200, saturation * 0.8, Math.min(0.9, lightness + 0.4)),
    ],
  };
}

export interface FieldMetaInput {
  id: string;
  place: string;
  timeISO: string;
  name?: string;
  lat?: number;
  lon?: number;
  sampleRateHz: number;
  durationSec?: number;
  genomeIds?: string[];
  rootHz?: number;
  tags?: string[];
  notes?: string;
  device?: string;
}

export function formatTakeName(place: string, timeISO: string, index = 1): string {
  const day = (timeISO.split('T')[0] ?? '').replace(/-/g, '');
  const time = (timeISO.split('T')[1] ?? '').slice(0, 5).replace(':', '');
  const slug = (place || 'field').trim().replace(/\s+/g, ' ').slice(0, 24) || 'field';
  const stamp = day && time ? `${day}-${time}` : day;
  // Only include a timestamp when there is one: "field #1", not "field -0000 #1".
  return [slug, stamp, `#${index}`].filter(Boolean).join(' ');
}

export function buildFieldMeta(input: FieldMetaInput): FieldMeta {
  const coverArtSeed = seedCoverArt(input.place, input.timeISO);
  return {
    id: input.id,
    name: input.name ?? formatTakeName(input.place, input.timeISO),
    place: input.place,
    lat: input.lat,
    lon: input.lon,
    timeISO: input.timeISO,
    seed: takeSeed(input.id, input.place, input.timeISO),
    coverArtSeed,
    genomeIds: input.genomeIds ?? [],
    rootHz: input.rootHz,
    sampleRateHz: input.sampleRateHz,
    durationSec: input.durationSec,
    tags: input.tags ?? [],
    notes: input.notes,
    device: input.device,
    format: FIELD_META_FORMAT,
  };
}

/** Attach a new variant to a take, keeping the id list unique and ordered. */
export function withGenome(meta: FieldMeta, genomeId: string): FieldMeta {
  if (meta.genomeIds.includes(genomeId)) return meta;
  return { ...meta, genomeIds: [...meta.genomeIds, genomeId] };
}

/** One-line description for the kit list. */
export function describeFieldMeta(meta: FieldMeta): string {
  const parts = [meta.place || 'unknown place'];
  const duration = meta.durationSec !== undefined ? `${meta.durationSec.toFixed(1)}s` : null;
  if (duration) parts.push(duration);
  parts.push(`${(meta.sampleRateHz / 1000).toFixed(1)} kHz`);
  if (meta.rootHz) parts.push(`root ${meta.rootHz.toFixed(1)} Hz`);
  parts.push(`${meta.genomeIds.length} variant${meta.genomeIds.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
