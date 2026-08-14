/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Project document format — the versioned, fully-serializable representation
 * of a NC Sound Lab session (layers + sample audio + patterns + pads + chain +
 * master). Captured into a single self-contained JSON document for `.nsl`
 * file export/import, IndexedDB persistence, and crash-recovery snapshots.
 *
 * Phase 0.1 of the Workstation Roadmap. The schema is additive — future phases
 * extend the document with new optional fields rather than mutating existing
 * ones, so old saved projects keep loading.
 */

import type {
  SoundLayer,
  Pattern,
  PatternCell,
  RackModule,
} from '../types';
import type { BankId, Program } from '../store/sequencerStore';
import type { PatternId } from '../store/patternStore';
import { audioBufferToBase64, base64ToAudioBuffer } from './audioUtils';

export const PROJECT_FORMAT_TAG = 'ncsoundlab-project';
export const PROJECT_FILE_EXTENSION = '.nsl';
export const PROJECT_SCHEMA_VERSION = 1;

export interface ProjectSongChain {
  order: string[];
}

/**
 * SoundLayer with its non-serializable AudioBuffer stripped out and sample
 * audio embedded as a base64-encoded WAV string (16-bit PCM) on the optional
 * `sampleData` field.
 *
 * For synth layers (no AudioBuffer), `sampleData` is omitted.
 */
export type SerializedLayer = Omit<SoundLayer, 'audioBuffer' | 'analysis'> & {
  sampleData?: string;
  /** Channel count and sample rate captured at encode time so re-decode is exact. */
  sampleMeta?: { sampleRate: number; channels: number; length: number };
};

export interface SerializedPattern {
  id: PatternId;
  name: string;
  layerRows: Record<string, PatternCell[]>;
  timeSignature: [number, number];
  stepLength: 16 | 32;
  swing: number;
  bpm: number;
}

export interface SerializedRackState {
  modules: RackModule[];
}

export interface SerializedArrangementClip {
  id: string;
  patternId: string;
  startBeat: number;
  beats: number;
  loops: number;
  muted: boolean;
  color?: string;
}

export interface SerializedTempoPoint {
  tick: number;
  bpm: number;
}

export interface SerializedAutomationPoint {
  tick: number;
  value: number;
}

export interface SerializedAutomationLane {
  id: string;
  target: string;
  min: number;
  max: number;
  points: SerializedAutomationPoint[];
}

export type SerializedAutomationLanes = Record<string, SerializedAutomationLane[]>;

export interface SerializedBusConfig {
  enabled: boolean;
  gain: number;
  pan: number;
  options?: Record<string, number>;
}

export type SerializedBuses = Record<string, SerializedBusConfig>;

export interface ArrangementSerialized {
  totalBeats: number;
  clips: SerializedArrangementClip[];
  tempoMap?: SerializedTempoPoint[];
}

export interface ProjectDocument {
  format: typeof PROJECT_FORMAT_TAG;
  schemaVersion: number;
  appVersion: string;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;

  bpm: number;
  timeSignature: [number, number];
  globalSwing: number;

  masterLevel: number;
  masterRack: SerializedRackState;

  layers: SerializedLayer[];
  patterns: Record<PatternId, SerializedPattern>;
  activePatternId: PatternId;
  songChain: ProjectSongChain;
  /**
   * Phase 2.1 — arrangement timeline. Optional in v1 (older docs without it
   * fall back to `songChain`). Saved projects from prior commits are
   * forward-compatible.
   */
  arrangement?: ArrangementSerialized;

  /**
   * Phase 2.3 — per-layer automation lanes. Optional. Older docs default to
   * an empty record.
   */
  automation?: SerializedAutomationLanes;

  /**
   * Phase 3.3 — global FX send/return bus configuration. Optional. Older
   * docs default to `{ reverb: { enabled: true, gain: 1, pan: 0 }, delay: {
   * enabled: true, gain: 1, pan: 0 } }`.
   */
  buses?: SerializedBuses;

  programs: Record<BankId, Program>;
  activeBank: BankId;
  /**
   * Phase 6.1 — per-pattern pad programs. Optional; older docs default to the
   * flat `programs` map for every pattern.
   */
  patternPrograms?: Record<string, Record<BankId, Program>>;
}

/**
 * Loose intermediate shape used during deserialization before migration +
 * hydration. Migration functions normalize this into a `ProjectDocument`.
 */
export type RawProjectDocument = {
  format?: unknown;
  schemaVersion?: unknown;
  [key: string]: unknown;
};

export interface SerializeProjectInput {
  id?: string;
  title: string;
  appVersion: string;
  layers: SoundLayer[];
  patterns: Record<PatternId, Pattern>;
  activePatternId: PatternId;
  songChain: { order: string[] };
  arrangement?: ArrangementSerialized;
  automation?: SerializedAutomationLanes;
  buses?: SerializedBuses;
  programs: Record<BankId, Program>;
  activeBank: BankId;
  /** Phase 6.1 — per-pattern pad programs (optional). */
  patternPrograms?: Record<string, Record<BankId, Program>>;
  bpm: number;
  timeSignature: [number, number];
  globalSwing?: number;
  masterLevel: number;
  masterRack: SerializedRackState;
  createdAt?: string;
  updatedAt?: string;
}

const PROJECT_MIME = 'application/json';

const stripLayerForSerialization = async (layer: SoundLayer): Promise<SerializedLayer> => {
  const { audioBuffer, analysis, ...rest } = layer;
  if (!audioBuffer) {
    return { ...rest };
  }
  const sampleData = await audioBufferToBase64(audioBuffer, 16);
  return {
    ...rest,
    sampleData,
    sampleMeta: {
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      length: audioBuffer.length,
    },
  };
};

/**
 * Encode a session into a versioned project document. Sample audio is
 * embedded as base64 WAV; synth layers omit `sampleData`.
 */
export async function serializeProject(input: SerializeProjectInput): Promise<ProjectDocument> {
  const now = new Date().toISOString();
  const layers = await Promise.all(input.layers.map(stripLayerForSerialization));
  const patterns: Record<PatternId, SerializedPattern> = {
    A: serializePattern(input.patterns.A),
    B: serializePattern(input.patterns.B),
    C: serializePattern(input.patterns.C),
    D: serializePattern(input.patterns.D),
  };
  return {
    format: PROJECT_FORMAT_TAG,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    appVersion: input.appVersion,
    id: input.id ?? (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    title: input.title,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    bpm: input.bpm,
    timeSignature: input.timeSignature,
    globalSwing: input.globalSwing ?? 0,
    masterLevel: input.masterLevel,
    masterRack: { modules: input.masterRack.modules.map((m) => ({ ...m, settings: { ...m.settings } })) },
    layers,
    patterns,
    activePatternId: input.activePatternId,
    songChain: { order: [...input.songChain.order] },
    ...(input.arrangement ? { arrangement: input.arrangement } : {}),
    ...(input.automation ? { automation: input.automation } : {}),
    ...(input.buses ? { buses: input.buses } : {}),
    programs: clonePrograms(input.programs),
    activeBank: input.activeBank,
    ...(input.patternPrograms ? { patternPrograms: clonePatternPrograms(input.patternPrograms) } : {}),
  };
}

function clonePatternPrograms(map: Record<string, Record<BankId, Program>>): Record<string, Record<BankId, Program>> {
  const out: Record<string, Record<BankId, Program>> = {};
  for (const [pid, banks] of Object.entries(map)) {
    out[pid] = { A: banks.A?.slice(), B: banks.B?.slice(), C: banks.C?.slice(), D: banks.D?.slice() };
  }
  return out;
}

function serializePattern(p: Pattern): SerializedPattern {
  const layerRows: Record<string, PatternCell[]> = {};
  for (const [k, row] of Object.entries(p.layerRows)) {
    layerRows[k] = row.map((c) => ({ ...c }));
  }
  return {
    id: p.id as PatternId,
    name: p.name,
    layerRows,
    timeSignature: [...p.timeSignature] as [number, number],
    stepLength: p.stepLength,
    swing: p.swing,
    bpm: p.bpm,
  };
}

function clonePrograms(programs: Record<BankId, Program>): Record<BankId, Program> {
  return {
    A: programs.A.slice(),
    B: programs.B.slice(),
    C: programs.C.slice(),
    D: programs.D.slice(),
  };
}

export interface DeserializeProjectResult {
  document: ProjectDocument;
  layers: SoundLayer[];
  patterns: Record<PatternId, Pattern>;
  programs: Record<BankId, Program>;
  patternPrograms?: Record<string, Record<BankId, Program>>;
  arrangement: ArrangementSerialized | null;
  automation: SerializedAutomationLanes;
  buses: SerializedBuses;
}

/**
 * Deserialize a raw parsed JSON object into a hydrated project: patterns and
 * programs are returned as-is; layers have their `audioBuffer` rehydrated
 * from `sampleData` via the provided `BaseAudioContext`.
 */
export async function deserializeProject(
  context: BaseAudioContext,
  raw: unknown
): Promise<DeserializeProjectResult> {
  const document = migrate(raw);
  const layers: SoundLayer[] = await Promise.all(
    document.layers.map((layer) => rehydrateLayer(context, layer))
  );
  const patterns: Record<PatternId, Pattern> = {
    A: revivePattern(document.patterns.A),
    B: revivePattern(document.patterns.B),
    C: revivePattern(document.patterns.C),
    D: revivePattern(document.patterns.D),
  };
  return {
    document,
    layers,
    patterns,
    programs: clonePrograms(document.programs),
    patternPrograms: document.patternPrograms ? clonePatternPrograms(document.patternPrograms) : undefined,
    arrangement: document.arrangement ?? null,
    automation: document.automation ?? {},
    buses: document.buses ?? sanitizeBuses(null),
  };
}

async function rehydrateLayer(context: BaseAudioContext, layer: SerializedLayer): Promise<SoundLayer> {
  const { sampleData, sampleMeta, ...rest } = layer;
  if (!sampleData) {
    return { ...(rest as SoundLayer) };
  }
  const audioBuffer = await base64ToAudioBuffer(context, sampleData);
  return { ...(rest as SoundLayer), audioBuffer };
}

function revivePattern(p: SerializedPattern): Pattern {
  const layerRows: Record<string, PatternCell[]> = {};
  for (const [k, row] of Object.entries(p.layerRows)) {
    layerRows[k] = row.map((c) => ({ ...c }));
  }
  return {
    id: p.id,
    name: p.name,
    layerRows,
    timeSignature: [...p.timeSignature] as [number, number],
    stepLength: p.stepLength,
    swing: p.swing,
    bpm: p.bpm,
  };
}

/**
 * Apply any version-to-version migrations to bring an unknown parsed object up
 * to the current `PROJECT_SCHEMA_VERSION`. Throws when the document is not
 * recognizable.
 */
export function migrate(raw: unknown): ProjectDocument {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid project document: expected an object');
  }
  const obj = raw as RawProjectDocument;
  if (obj.format !== PROJECT_FORMAT_TAG) {
    throw new Error(`Invalid project document: format "${String(obj.format)}" is not recognized`);
  }
  const version = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 0;
  let doc: ProjectDocument;
  if (version === PROJECT_SCHEMA_VERSION) {
    doc = normalizeV1(obj);
  } else if (version < PROJECT_SCHEMA_VERSION) {
    // No older schemas defined yet — only v1 exists. Future migrations go here.
    throw new Error(`Unsupported project schemaVersion ${version}; expected ${PROJECT_SCHEMA_VERSION}`);
  } else {
    throw new Error(`Project was saved by a newer app version (schemaVersion ${version}); please update the app`);
  }
  return doc;
}

function normalizeV1(obj: RawProjectDocument): ProjectDocument {
  const layers = Array.isArray(obj.layers) ? (obj.layers as SerializedLayer[]) : [];
  const patternsRaw = (obj.patterns ?? {}) as Record<string, SerializedPattern>;
  const programsRaw = (obj.programs ?? {}) as Record<string, Program>;
  const songChainRaw = (obj.songChain ?? { order: [] }) as ProjectSongChain;
  const masterRackRaw = (obj.masterRack ?? { modules: [] }) as SerializedRackState;
  const arrangementRaw = (obj.arrangement ?? null) as ArrangementSerialized | null;
  return {
    format: PROJECT_FORMAT_TAG,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    appVersion: typeof obj.appVersion === 'string' ? obj.appVersion : 'unknown',
    id: typeof obj.id === 'string' ? obj.id : `p-${Date.now()}`,
    title: typeof obj.title === 'string' ? obj.title : 'Untitled Project',
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString(),
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
    bpm: numberOr(obj.bpm, 120),
    timeSignature: sanitizeTimeSignature(obj.timeSignature),
    globalSwing: numberOr(obj.globalSwing, 0),
    masterLevel: numberOr(obj.masterLevel, 0.8),
    masterRack: {
      modules: Array.isArray(masterRackRaw.modules)
        ? masterRackRaw.modules.map((m: RackModule) => ({ ...m, settings: { ...(m.settings as Record<string, unknown>) } }))
        : [],
    },
    layers,
    patterns: {
      A: ensurePatternShape(patternsRaw.A, 'A'),
      B: ensurePatternShape(patternsRaw.B, 'B'),
      C: ensurePatternShape(patternsRaw.C, 'C'),
      D: ensurePatternShape(patternsRaw.D, 'D'),
    },
    activePatternId: sanitizePatternId(obj.activePatternId),
    songChain: {
      order: (() => {
        const rawOrder = Array.isArray(songChainRaw.order) ? songChainRaw.order : [];
        const filtered = rawOrder.filter((id) => id === 'A' || id === 'B' || id === 'C' || id === 'D') as PatternId[];
        return filtered.length > 0 ? filtered : (['A', 'B', 'C', 'D'] as PatternId[]);
      })(),
    },
    arrangement: arrangementRaw && Array.isArray(arrangementRaw.clips) ? {
      totalBeats: Math.max(0, numberOr(arrangementRaw.totalBeats, 0)),
      clips: arrangementRaw.clips.map((c) => ({
        id: typeof c.id === 'string' ? c.id : `c-${Math.random().toString(36).slice(2)}`,
        patternId: ['A', 'B', 'C', 'D'].includes(c.patternId) ? c.patternId : 'A',
        startBeat: Math.max(0, numberOr(c.startBeat, 0)),
        beats: Math.max(0, numberOr(c.beats, 0)),
        loops: Math.max(1, Math.floor(numberOr(c.loops, 1))),
        muted: (c.muted as unknown) === true || (c.muted as unknown) === 1 || (c.muted as unknown) === 'true',
        ...(typeof c.color === 'string' ? { color: c.color } : {}),
      })),
      tempoMap: Array.isArray(arrangementRaw.tempoMap)
        ? arrangementRaw.tempoMap
            .map((p) => ({ tick: Math.max(0, numberOr(p.tick, 0)), bpm: Math.max(20, Math.min(300, numberOr(p.bpm, 120))) }))
            .sort((a, b) => a.tick - b.tick)
        : [],
    } : undefined,
    programs: {
      A: Array.isArray(programsRaw.A) ? programsRaw.A.slice() : Array.from({ length: 16 }, () => null),
      B: Array.isArray(programsRaw.B) ? programsRaw.B.slice() : Array.from({ length: 16 }, () => null),
      C: Array.isArray(programsRaw.C) ? programsRaw.C.slice() : Array.from({ length: 16 }, () => null),
      D: Array.isArray(programsRaw.D) ? programsRaw.D.slice() : Array.from({ length: 16 }, () => null),
    },
    activeBank: sanitizeBankId(obj.activeBank),
    automation: sanitizeAutomationLanes(obj.automation),
    buses: sanitizeBuses(obj.buses),
    ...(obj.patternPrograms && typeof obj.patternPrograms === 'object'
      ? { patternPrograms: sanitizePatternPrograms(obj.patternPrograms) }
      : {}),
  };
}

function sanitizePatternPrograms(value: unknown): Record<string, Record<BankId, Program>> {
  const out: Record<string, Record<BankId, Program>> = {};
  if (!value || typeof value !== 'object') return out;
  for (const [pid, banks] of Object.entries(value as Record<string, unknown>)) {
    if (!banks || typeof banks !== 'object') continue;
    const b = banks as Record<string, unknown>;
    out[pid] = {
      A: sanitizeProgram(b.A),
      B: sanitizeProgram(b.B),
      C: sanitizeProgram(b.C),
      D: sanitizeProgram(b.D),
    };
  }
  return out;
}

function sanitizeProgram(value: unknown): Program {
  if (!Array.isArray(value)) return Array.from({ length: 16 }, () => null);
  const slots = value.slice(0, 16).map((id) => (typeof id === 'string' ? id : null));
  while (slots.length < 16) slots.push(null);
  return slots;
}

export const DEFAULT_BUSES: SerializedBuses = {
  reverb: { enabled: true, gain: 1, pan: 0 },
  delay: { enabled: true, gain: 1, pan: 0 },
};

export function sanitizeBuses(value: unknown): SerializedBuses {
  const base: SerializedBuses = {};
  for (const [id, cfg] of Object.entries(DEFAULT_BUSES)) {
    base[id] = { ...cfg };
  }
  if (!value || typeof value !== 'object') return base;
  for (const [busId, rawBus] of Object.entries(value as Record<string, unknown>)) {
    if (!rawBus || typeof rawBus !== 'object') continue;
    const b = rawBus as Record<string, unknown>;
    base[busId] = {
      enabled: b.enabled !== false,
      gain: Math.max(0, Math.min(2, numberOr(b.gain, 1))),
      pan: Math.max(-1, Math.min(1, numberOr(b.pan, 0))),
      ...(b.options && typeof b.options === 'object'
        ? { options: Object.fromEntries(Object.entries(b.options as Record<string, unknown>).map(([k, v]) => [k, numberOr(v, 0)])) }
        : {}),
    };
  }
  return base;
}

function sanitizeAutomationLanes(value: unknown): SerializedAutomationLanes {
  if (!value || typeof value !== 'object') return {};
  const out: SerializedAutomationLanes = {};
  for (const [layerId, rawLanes] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(rawLanes)) continue;
    out[layerId] = rawLanes.map((lane: any, idx: number) => ({
      id: typeof lane?.id === 'string' ? lane.id : `${layerId}-auto-${idx}`,
      target: typeof lane?.target === 'string' ? lane.target : String(lane?.target ?? 'volume'),
      min: numberOr(lane?.min, 0),
      max: numberOr(lane?.max, 1),
      points: Array.isArray(lane?.points)
        ? lane.points
            .map((p: any) => ({
              tick: Math.max(0, numberOr(p?.tick, 0)),
              value: numberOr(p?.value, 0),
            }))
            .sort((a: SerializedAutomationPoint, b: SerializedAutomationPoint) => a.tick - b.tick)
        : [],
    }));
  }
  return out;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sanitizeTimeSignature(value: unknown): [number, number] {
  if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    return [value[0], value[1]];
  }
  return [4, 4];
}

function sanitizePatternId(value: unknown): PatternId {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D' ? value : 'A';
}

function sanitizeBankId(value: unknown): BankId {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D' ? value : 'A';
}

function ensurePatternShape(value: SerializedPattern | undefined, fallbackId: PatternId): SerializedPattern {
  if (!value || typeof value !== 'object') {
    return emptySerializedPattern(fallbackId);
  }
  const stepLength: 16 | 32 = value.stepLength === 32 ? 32 : 16;
  const layerRows: Record<string, PatternCell[]> = {};
  if (value.layerRows && typeof value.layerRows === 'object') {
    for (const [k, row] of Object.entries(value.layerRows)) {
      if (Array.isArray(row)) {
        layerRows[k] = row.map((c) => ({ ...c }));
      }
    }
  }
  return {
    id: fallbackId,
    name: typeof value.name === 'string' ? value.name : `Pattern ${fallbackId}`,
    layerRows,
    timeSignature: sanitizeTimeSignature(value.timeSignature),
    stepLength,
    swing: numberOr(value.swing, 0),
    bpm: numberOr(value.bpm, 120),
  };
}

function emptySerializedPattern(id: PatternId): SerializedPattern {
  return {
    id,
    name: `Pattern ${id}`,
    layerRows: {},
    timeSignature: [4, 4],
    stepLength: 16,
    swing: 0,
    bpm: 120,
  };
}

/**
 * Type guard — used by load paths to short-circuit before invoking the async
 * deserializer.
 */
export function isProjectDocument(value: unknown): value is RawProjectDocument {
  if (!value || typeof value !== 'object') return false;
  const obj = value as RawProjectDocument;
  return obj.format === PROJECT_FORMAT_TAG && typeof obj.schemaVersion === 'number';
}

/**
 * Cheap dirty-check used by historyStore (Step 0.3) to decide whether a state
 * change warrants a new undo entry. Sample audio bytes are not compared here;
 * the caller compares layer identity and `sampleData` presence separately.
 */
export function isProjectDirty(
  prev: ProjectDocument | null | undefined,
  next: ProjectDocument
): boolean {
  if (!prev) return true;
  if (prev.title !== next.title) return true;
  if (prev.bpm !== next.bpm) return true;
  if (prev.timeSignature[0] !== next.timeSignature[0] || prev.timeSignature[1] !== next.timeSignature[1]) return true;
  if (prev.globalSwing !== next.globalSwing) return true;
  if (prev.masterLevel !== next.masterLevel) return true;
  if (prev.activePatternId !== next.activePatternId) return true;
  if (prev.activeBank !== next.activeBank) return true;
  if (prev.layers.length !== next.layers.length) return true;
  if (prev.layers.some((l, i) => l.id !== next.layers[i].id)) return true;
  if (prev.layers.some((l, i) => Boolean(l.sampleData) !== Boolean(next.layers[i].sampleData))) return true;
  if (prev.masterRack.modules.length !== next.masterRack.modules.length) return true;
  return false;
}

/**
 * Encode a `ProjectDocument` to a JSON string suitable for writing to disk
 * (`.nsl`) or IndexedDB.
 */
export function stringifyProject(document: ProjectDocument): string {
  return JSON.stringify(document);
}

export const PROJECT_MIME_TYPE = PROJECT_MIME;

/**
 * Parse a JSON string into a versioned `ProjectDocument`. This is the inverse
 * of `stringifyProject` minus the audio rehydration step — use this when you
 * just want to validate + migrate a stored blob.
 */
export function parseProjectText(text: string): ProjectDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Not a valid JSON project document.');
  }
  return migrate(parsed);
}
