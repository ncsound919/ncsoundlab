/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 5.1 — persistent user sample library.
 *
 * Samples and folders live in IndexedDB via Dexie (see `db.ts`). Sample audio
 * is stored as base64-encoded WAV so a project survives reloads even when the
 * origin has not served the original files. Folder CRUD, search-by-name/tag,
 * and a per-sample AudioBuffer decode cache round out the API.
 *
 * This module is pure / synchronous-ish; UI components orchestrate the decode
 * + analyze + save flow. Pure helpers (analysis, name sanitisation) are
 * exported for unit testing without IndexedDB.
 */

import {
  db,
  type StoredSampleLibrarySample,
  type StoredSampleLibraryFolder,
  type StoredSampleAnalysis,
} from './db';
import { audioBufferToBase64, base64ToAudioBuffer, removeDcOffset } from './audioUtils';

/** Public sample-library entry (the same shape that's persisted). */
export type SampleLibrarySample = StoredSampleLibrarySample;
export type SampleLibraryFolder = StoredSampleLibraryFolder;
export type SampleLibraryAnalysis = StoredSampleAnalysis;

/** Shape of an analysis input. */
export interface AnalysisInput {
  peakDb: number;
  rmsDb: number;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  transientSharpness: number;
  estimatedKey?: string;
  suggestedCategory: string;
}

/**
 * Lightweight peak/RMS/transient analyzer used by the library import path.
 * The existing `analyzeAudioBuffer` in `batchAudioProcessor.ts` runs a fuller
 * analysis but pulls in knobs that aren't relevant at import time. This keeps
 * the sample library self-contained and cheap to run on dozens of dropped
 * files.
 */
export function analyzeLibrarySample(buffer: AudioBuffer): AnalysisInput {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  let peak = 0;
  let sumSquares = 0;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));

  for (let i = 0; i < length; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += channelData[c][i];
    s /= channels;
    const a = Math.abs(s);
    if (a > peak) peak = a;
    sumSquares += s * s;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, length));
  const peakDb = 20 * Math.log10(Math.max(1e-7, peak));
  const rmsDb = 20 * Math.log10(Math.max(1e-7, rms));

  // Crude transient sharpness: max frame-level RMS delta, scaled 0..10.
  const frameSize = Math.max(32, Math.floor(sampleRate / 200));
  let maxDelta = 0;
  let prev = 0;
  for (let i = 0; i < length; i += frameSize) {
    let energy = 0;
    const end = Math.min(length, i + frameSize);
    for (let j = i; j < end; j++) {
      let s = 0;
      for (let c = 0; c < channels; c++) s += channelData[c][j];
      s /= channels;
      energy += s * s;
    }
    energy = Math.sqrt(energy / Math.max(1, end - i));
    const delta = Math.abs(energy - prev);
    if (delta > maxDelta) maxDelta = delta;
    prev = energy;
  }
  // Also consider the peak-to-RMS ratio: a sharp transient has a peak much
  // larger than its overall RMS. Blend both signals into a 0..10 score.
  const crest = peak / Math.max(1e-7, rms);
  const transientSharpness = Math.min(10, Math.max(0, maxDelta * 30 + (crest - 1) * 1.5));

  return {
    peakDb: round2(peakDb),
    rmsDb: round2(rmsDb),
    durationSeconds: round2(length / sampleRate),
    sampleRate,
    channels,
    transientSharpness: round2(transientSharpness),
    suggestedCategory: suggestCategory({ transientSharpness, durationSeconds: length / sampleRate }),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function suggestCategory(opts: { transientSharpness: number; durationSeconds: number }): string {
  if (opts.transientSharpness >= 7 && opts.durationSeconds < 0.5) return 'Kick';
  if (opts.transientSharpness >= 6 && opts.durationSeconds < 0.4) return 'Snare';
  if (opts.transientSharpness >= 5 && opts.durationSeconds < 0.3) return 'HiHat';
  if (opts.durationSeconds > 0.6) return 'Atmospheres';
  return 'Perc';
}

export function sanitiseSampleName(name: string): string {
  const trimmed = (name || '').trim();
  return trimmed || 'SAMPLE';
}

export function deriveCleanFileName(fileName: string): string {
  const base = (fileName || '').replace(/\.[^/.]+$/, '').trim();
  return base || 'sample';
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export interface CreateFolderInput {
  name: string;
  parentId?: string | null;
}

export async function createLibraryFolder(input: CreateFolderInput): Promise<string> {
  const id = crypto.randomUUID();
  const row: StoredSampleLibraryFolder = {
    id,
    name: (input.name || '').trim() || 'New Folder',
    parentId: input.parentId ?? null,
    createdAt: new Date().toISOString(),
  };
  await db.sampleLibraryFolders.put(row);
  return id;
}

export async function renameLibraryFolder(id: string, name: string): Promise<void> {
  const trimmed = (name || '').trim();
  if (!trimmed) return;
  await db.sampleLibraryFolders.update(id, { name: trimmed });
}

export async function deleteLibraryFolder(id: string): Promise<void> {
  // Move orphaned samples back to root; do not delete samples so users never
  // lose audio accidentally when re-organising.
  const samples = await db.sampleLibrarySamples.where('folderId').equals(id).toArray();
  await db.transaction('rw', db.sampleLibrarySamples, db.sampleLibraryFolders, async () => {
    if (samples.length > 0) {
      await db.sampleLibrarySamples.bulkPut(samples.map((s) => ({ ...s, folderId: null })));
    }
    await db.sampleLibraryFolders.delete(id);
  });
}

export async function fetchLibraryFolders(): Promise<SampleLibraryFolder[]> {
  const rows = await db.sampleLibraryFolders.toArray();
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

export interface SaveLibrarySampleInput {
  name: string;
  fileName: string;
  folderId?: string | null;
  category?: string;
  tags?: string[];
  key?: string;
  bpm?: number;
  gain?: number;
  pitch?: number;
  audioBuffer: AudioBuffer;
  analysis?: AnalysisInput;
  sizeBytes?: number;
}

export interface UpdateLibrarySamplePatch {
  name?: string;
  fileName?: string;
  folderId?: string | null;
  category?: string;
  tags?: string[];
  key?: string;
  bpm?: number;
  gain?: number;
  pitch?: number;
}

/**
 * Encode the buffer to base64 WAV and persist a new library row. Returns the
 * generated id. The audioBuffer is encoded at 16-bit PCM to keep library size
 * reasonable — library samples are transient material where 16-bit is plenty.
 */
export async function saveLibrarySample(input: SaveLibrarySampleInput): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const analysis = input.analysis ?? analyzeLibrarySample(input.audioBuffer);
  // Remove DC offset before encoding so the stored sample starts clean (no
  // thump/pop on trigger) and its peak analysis isn't skewed by a mean lift.
  const cleanBuffer = removeDcOffset(input.audioBuffer);
  const sampleData = await audioBufferToBase64(cleanBuffer, 16);
  const row: StoredSampleLibrarySample = {
    id,
    name: sanitiseSampleName(input.name),
    fileName: (input.fileName && input.fileName.trim()) || deriveCleanFileName(input.name),
    folderId: input.folderId ?? null,
    category: input.category || analysis.suggestedCategory || 'Perc',
    tags: Array.from(new Set((input.tags || []).map((t) => t.trim()).filter(Boolean))),
    ...(input.key ? { key: input.key } : {}),
    ...(typeof input.bpm === 'number' ? { bpm: input.bpm } : {}),
    gain: typeof input.gain === 'number' ? input.gain : 0.85,
    pitch: typeof input.pitch === 'number' ? input.pitch : 0,
    sampleData,
    sampleMeta: {
      sampleRate: input.audioBuffer.sampleRate,
      channels: input.audioBuffer.numberOfChannels,
      length: input.audioBuffer.length,
    },
    analysis: {
      peakDb: analysis.peakDb,
      rmsDb: analysis.rmsDb,
      durationSeconds: analysis.durationSeconds,
      sampleRate: analysis.sampleRate,
      channels: analysis.channels,
      transientSharpness: analysis.transientSharpness,
      ...(analysis.estimatedKey ? { estimatedKey: analysis.estimatedKey } : {}),
      suggestedCategory: analysis.suggestedCategory,
    },
    ...(typeof input.sizeBytes === 'number' ? { sizeBytes: input.sizeBytes } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await db.sampleLibrarySamples.put(row);
  return id;
}

export async function fetchLibrarySamples(folderId: string | null = null): Promise<SampleLibrarySample[]> {
  const rows = folderId === null
    ? await db.sampleLibrarySamples.toArray()
    : await db.sampleLibrarySamples.where('folderId').equals(folderId).toArray();
  rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  // Metadata-only: drop the multi-MB base64 PCM payload so the browser list
  // state stays light (fetchLibrarySamples runs on every folder switch /
  // rename / delete / import). decodeLibrarySample re-fetches the row by id.
  return rows.map(({ sampleData: _data, ...meta }) => meta);
}

export async function fetchLibrarySample(id: string): Promise<SampleLibrarySample | undefined> {
  return db.sampleLibrarySamples.get(id);
}

export async function updateLibrarySample(id: string, patch: UpdateLibrarySamplePatch): Promise<void> {
  const row = await db.sampleLibrarySamples.get(id);
  if (!row) return;
  const next: StoredSampleLibrarySample = {
    ...row,
    ...(patch.name !== undefined ? { name: sanitiseSampleName(patch.name) } : {}),
    ...(patch.fileName !== undefined ? { fileName: patch.fileName } : {}),
    ...(patch.folderId !== undefined ? { folderId: patch.folderId } : {}),
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    ...(patch.tags !== undefined ? { tags: Array.from(new Set(patch.tags.map((t) => t.trim()).filter(Boolean))) } : {}),
    ...(patch.key !== undefined ? { key: patch.key } : {}),
    ...(patch.bpm !== undefined ? { bpm: patch.bpm } : {}),
    ...(patch.gain !== undefined ? { gain: patch.gain } : {}),
    ...(patch.pitch !== undefined ? { pitch: patch.pitch } : {}),
    updatedAt: new Date().toISOString(),
  };
  await db.sampleLibrarySamples.put(next);
}

export async function deleteLibrarySample(id: string): Promise<void> {
  await db.sampleLibrarySamples.delete(id);
  // Always evict any cached AudioBuffer so a future import with the same id
  // (or just to bound memory) does not replay stale decoded PCM.
  clearLibrarySampleBufferCache(id);
}

// ---------------------------------------------------------------------------
// Buffer cache (browser-only)
// ---------------------------------------------------------------------------

interface CacheEntry {
  buffer: AudioBuffer;
}

const bufferCache = new Map<string, CacheEntry>();
// Bound the decoded-PCM cache so a large library doesn't pin every decoded
// AudioBuffer for the lifetime of the tab.
const MAX_CACHE_ENTRIES = 24;

/**
 * Decode a library sample's base64 audio into an AudioBuffer using the given
 * context. Results are memoised so repeated previews + pad drops don't re-decode.
 */
export async function decodeLibrarySample(context: BaseAudioContext, sample: SampleLibrarySample): Promise<AudioBuffer> {
  const hit = bufferCache.get(sample.id);
  if (hit) return hit.buffer;
  // List rows are metadata-only (sampleData stripped); pull the full row lazily.
  const full = sample.sampleData
    ? sample
    : await fetchLibrarySample(sample.id);
  if (!full?.sampleData) {
    throw new Error(`Sample "${sample.name}" has no audio data`);
  }
  const buffer = await base64ToAudioBuffer(context, full.sampleData);
  bufferCache.set(sample.id, { buffer });
  if (bufferCache.size > MAX_CACHE_ENTRIES) {
    // Evict the oldest entry (Map iteration is insertion-ordered).
    const oldest = bufferCache.keys().next().value;
    if (oldest !== undefined) bufferCache.delete(oldest);
  }
  return buffer;
}

export function clearLibrarySampleBufferCache(sampleId?: string): void {
  if (sampleId) bufferCache.delete(sampleId);
  else bufferCache.clear();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Filter library samples by free-text query (matches name, fileName, tags)
 * and optional category. Pure — easy to test.
 */
export function filterLibrarySamples(
  rows: SampleLibrarySample[],
  query: string,
  category?: string | null
): SampleLibrarySample[] {
  const q = (query || '').trim().toLowerCase();
  return rows.filter((row) => {
    if (category && category !== 'All' && row.category !== category) return false;
    if (!q) return true;
    if (row.name.toLowerCase().includes(q)) return true;
    if (row.fileName.toLowerCase().includes(q)) return true;
    if (row.tags.some((t) => t.toLowerCase().includes(q))) return true;
    return false;
  });
}