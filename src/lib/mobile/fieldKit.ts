/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Field kit manifest — one JSON file per kit, plus the WAV files beside it.
 *
 * A kit is what the user actually carries between the field app and the
 * beatmaker: named slices, each pointing at its source take and carrying the
 * genome that reproduces its current sound, plus the round-robin groups evolved
 * from those takes. Genomes are stored as their serialized JSON so a kit is
 * self-describing and byte-stable.
 */

import { sanitiseTrackName } from '../../audio/stemExport';
import { deserializeGenome, serializeGenome, type Genome } from './genome';

export const FIELD_KIT_FORMAT = 'ncsoundlab-field-kit@1';

export interface KitSliceEntry {
  id: string;
  name: string;
  /** Take this slice was cut from. */
  sourceId: string;
  /** Slice index inside the take, when it came from the onset slicer. */
  sliceIndex?: number;
  genomeId: string;
  /** Serialized genome (a few hundred bytes). */
  genome: string;
  /** Variant this slice descends from, for the lineage view. */
  variantOf?: string;
  rootHz?: number;
  tags: string[];
}

export interface RoundRobinGroup {
  name: string;
  /** Slice ids in trigger order. */
  memberIds: string[];
}

export interface FieldKit {
  format: typeof FIELD_KIT_FORMAT;
  id: string;
  name: string;
  createdAt: string;
  place?: string;
  /** Kit root note (Hz) that slices are tuned to; 0 when undetected. */
  rootHz: number;
  slices: KitSliceEntry[];
  groups: RoundRobinGroup[];
  notes?: string;
}

export interface FieldKitInput {
  id: string;
  name: string;
  /** ISO timestamp from the caller — this module never reads the clock itself. */
  createdAt: string;
  place?: string;
  rootHz?: number;
  notes?: string;
}

/** Pure constructor: every field comes from the caller, so kits are reproducible. */
export function createFieldKit(input: FieldKitInput): FieldKit {
  return {
    format: FIELD_KIT_FORMAT,
    id: input.id,
    name: input.name,
    createdAt: input.createdAt,
    place: input.place,
    rootHz: input.rootHz ?? 0,
    slices: [],
    groups: [],
    notes: input.notes,
  };
}

export interface KitSliceInput {
  id: string;
  name: string;
  sourceId: string;
  genome: Genome;
  sliceIndex?: number;
  variantOf?: string;
  rootHz?: number;
  tags?: string[];
}

export function makeSliceEntry(input: KitSliceInput): KitSliceEntry {
  return {
    id: input.id,
    name: input.name,
    sourceId: input.sourceId,
    sliceIndex: input.sliceIndex,
    genomeId: input.genome.id,
    genome: serializeGenome(input.genome),
    variantOf: input.variantOf,
    rootHz: input.rootHz,
    tags: input.tags ?? [],
  };
}

/**
 * Add (or replace, by id) a slice. Pure. Group membership is untouched — a new
 * slice joins a round-robin group only when the caller asks for it, and a
 * replaced id stays where it was.
 */
export function addSlice(kit: FieldKit, entry: KitSliceEntry): FieldKit {
  const slices = kit.slices.filter((slice) => slice.id !== entry.id);
  slices.push(entry);
  return { ...kit, slices };
}

/** Replace the sound of an existing slice with an evolved genome. */
export function replaceSliceGenome(kit: FieldKit, sliceId: string, genome: Genome): FieldKit {
  return {
    ...kit,
    slices: kit.slices.map((slice) =>
      slice.id === sliceId
        ? { ...slice, genomeId: genome.id, genome: serializeGenome(genome), variantOf: slice.genomeId }
        : slice
    ),
  };
}

/**
 * Add a round-robin group. Members must already exist as slices; unknown ids are
 * dropped rather than written into a manifest that cannot be loaded.
 */
export function addRoundRobinGroup(kit: FieldKit, name: string, memberIds: string[]): FieldKit {
  const known = new Set(kit.slices.map((slice) => slice.id));
  const members = memberIds.filter((id) => known.has(id));
  if (members.length === 0) return kit;
  const groups = kit.groups.filter((group) => group.name !== name);
  groups.push({ name, memberIds: members });
  return { ...kit, groups };
}

/** Every variant genome in the kit, deserialized and in slice order. */
export function kitGenomes(kit: FieldKit): { slice: KitSliceEntry; genome: Genome | null }[] {
  return kit.slices.map((slice) => ({ slice, genome: deserializeGenome(slice.genome) }));
}

export const totalVariants = (kit: FieldKit): number => kit.slices.length;

/** Pretty-printed manifest JSON — the file that ships inside the kit. */
export function kitManifestJson(kit: FieldKit, options: { pretty?: boolean } = {}): string {
  return JSON.stringify(kit, null, options.pretty === false ? undefined : 2);
}

export function parseKitManifest(json: string): FieldKit | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  if (record.format !== FIELD_KIT_FORMAT) return null;
  if (typeof record.id !== 'string' || !Array.isArray(record.slices)) return null;
  const slices = record.slices
    .map((raw) => {
      if (!raw || typeof raw !== 'object') return null;
      const r = raw as Record<string, unknown>;
      if (typeof r.id !== 'string') return null;
      if (typeof r.sourceId !== 'string') return null;
      if (typeof r.genome !== 'string') return null;
      const genomeId = typeof r.genomeId === 'string' ? r.genomeId : '';
      const name = typeof r.name === 'string' ? r.name : r.id;
      const tags =
        Array.isArray(r.tags) && r.tags.every((t) => typeof t === 'string')
          ? (r.tags as string[])
          : [];
      return {
        id: r.id,
        name,
        sourceId: r.sourceId,
        sliceIndex: typeof r.sliceIndex === 'number' ? r.sliceIndex : undefined,
        genomeId,
        genome: r.genome,
        variantOf: typeof r.variantOf === 'string' ? r.variantOf : undefined,
        rootHz: typeof r.rootHz === 'number' ? r.rootHz : undefined,
        tags,
      } as KitSliceEntry;
    })
    .filter((entry): entry is KitSliceEntry => entry !== null);
  const groups = Array.isArray(record.groups)
    ? record.groups
        .map((raw) => {
          if (!raw || typeof raw !== 'object') return null;
          const r = raw as Record<string, unknown>;
          if (typeof r.name !== 'string' || !Array.isArray(r.memberIds)) return null;
          const memberIds = r.memberIds.filter((m): m is string => typeof m === 'string');
          return { name: r.name, memberIds };
        })
        .filter((g): g is RoundRobinGroup => g !== null)
    : [];
  return {
    format: FIELD_KIT_FORMAT,
    id: record.id,
    name: typeof record.name === 'string' ? record.name : record.id,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
    place: typeof record.place === 'string' ? record.place : undefined,
    rootHz: typeof record.rootHz === 'number' ? record.rootHz : 0,
    slices,
    groups,
    notes: typeof record.notes === 'string' ? record.notes : undefined,
  };
}

/** Pro Tools-safe kit and slice file names, reusing the stem naming rules. */
export function kitFileName(kit: FieldKit): string {
  return `${sanitiseTrackName(kit.name)}.ncfield.json`;
}

export function sliceFileName(entry: KitSliceEntry, index: number): string {
  return `${sanitiseTrackName(entry.name)}_${String(index + 1).padStart(2, '0')}.wav`;
}

/** One-line summary for the kit list. */
export function describeKit(kit: FieldKit): string {
  const groups = kit.groups.length;
  return `${kit.slices.length} slice${kit.slices.length === 1 ? '' : 's'} · ${groups} round-robin group${groups === 1 ? '' : 's'}${kit.rootHz ? ` · root ${kit.rootHz.toFixed(1)} Hz` : ''}`;
}
