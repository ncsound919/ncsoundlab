/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Storage for field takes: metadata in the app database, audio on the
 * filesystem.
 *
 * The desktop app keeps audio in IndexedDB (Dexie); a phone cannot afford that
 * — a field kit is hundreds of megabytes of WAV. So the split is explicit: a
 * `MetaStore` for JSON records and an `AudioFileIO` for bytes, both injected.
 * Memory implementations ship here so the engine is testable and so the browser
 * (desktop) build has a drop-in backend without touching native code.
 */

import type { Table } from 'dexie';
import { decodeWavMono, encodeWavMono, type WavSampleFormat } from '../../audio/mobile/wavCodec';
import type { FieldMeta } from './fieldMeta';

export interface MetaStore {
  get(id: string): Promise<FieldMeta | undefined>;
  put(meta: FieldMeta): Promise<void>;
  list(): Promise<FieldMeta[]>;
  delete(id: string): Promise<void>;
}

export interface AudioFileIO {
  /** Bytes of the WAV file for this id; throws when it does not exist. */
  read(id: string): Promise<Uint8Array>;
  write(id: string, bytes: Uint8Array): Promise<void>;
  remove(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
}

export interface FieldStorage {
  saveTake(meta: FieldMeta, samples: Float32Array, options?: { format?: WavSampleFormat }): Promise<void>;
  loadTake(
    id: string
  ): Promise<{ meta: FieldMeta; samples: Float32Array; sampleRate: number } | null>;
  listTakes(): Promise<FieldMeta[]>;
  /** Metadata-only write, for edits that do not touch the audio. */
  saveMetaOnly(meta: FieldMeta): Promise<void>;
  /** Metadata-only read. */
  loadMeta(id: string): Promise<FieldMeta | null>;
  deleteTake(id: string): Promise<void>;
  audioExists(id: string): Promise<boolean>;
}

export interface FieldStorageOptions {
  meta: MetaStore;
  audio: AudioFileIO;
  /** Default encoding for saved takes. Default 'float32' (lossless). */
  format?: WavSampleFormat;
}

/** Compose the two backends into the storage the app actually uses. */
export function createFieldStorage(options: FieldStorageOptions): FieldStorage {
  const format = options.format ?? 'float32';
  return {
    async saveTake(meta, samples, saveOptions = {}) {
      await options.audio.write(meta.id, encodeWavMono(samples, meta.sampleRateHz, {
        format: saveOptions.format ?? format,
      }));
      try {
        await options.meta.put(meta);
      } catch (error) {
        // Compensate instead of leaving audio no metadata can ever reach.
        await options.audio.remove(meta.id).catch(() => undefined);
        throw error;
      }
    },
    async loadTake(id) {
      const meta = await options.meta.get(id);
      if (!meta) return null;
      if (!(await options.audio.exists(id))) return null;
      const decoded = decodeWavMono(await options.audio.read(id));
      return { meta, samples: decoded.samples, sampleRate: decoded.sampleRate };
    },
    listTakes() {
      return options.meta.list();
    },
    async saveMetaOnly(meta) {
      await options.meta.put(meta);
    },
    async loadMeta(id) {
      return (await options.meta.get(id)) ?? null;
    },
    async deleteTake(id) {
      // Metadata is the index: drop it first so a failed audio delete can only
      // leave an unreferenced file, never a listed take with missing audio.
      await options.meta.delete(id);
      await options.audio.remove(id).catch(() => undefined);
    },
    audioExists(id) {
      return options.audio.exists(id);
    },
  };
}

/** In-memory metadata store — tests, and a fallback when Dexie is unavailable. */
export function createMemoryMetaStore(): MetaStore & { size(): number } {
  const rows = new Map<string, FieldMeta>();
  return {
    async get(id) {
      const row = rows.get(id);
      return row ? { ...row } : undefined;
    },
    async put(meta) {
      rows.set(meta.id, { ...meta });
    },
    async list() {
      return [...rows.values()].map((row) => ({ ...row }));
    },
    async delete(id) {
      rows.delete(id);
    },
    size() {
      return rows.size;
    },
  };
}

/** In-memory audio store — also used to verify a round-trip in tests. */
export function createMemoryAudioIO(): AudioFileIO & { peek(id: string): Uint8Array | undefined } {
  const files = new Map<string, Uint8Array>();
  return {
    async read(id) {
      const bytes = files.get(id);
      if (!bytes) throw new Error(`No audio stored for ${id}`);
      return bytes.slice();
    },
    async write(id, bytes) {
      files.set(id, bytes.slice());
    },
    async remove(id) {
      files.delete(id);
    },
    async exists(id) {
      return files.has(id);
    },
    peek(id) {
      const bytes = files.get(id);
      return bytes ? bytes.slice() : undefined;
    },
  };
}

/**
 * Wrap a Dexie table. Dexie is imported as a *type* only, so this module never
 * pulls the database into the engine bundle — the app owner injects the table.
 */
export function createDexieMetaStore(table: Table<FieldMeta, string>): MetaStore {
  return {
    get: (id) => table.get(id) as Promise<FieldMeta | undefined>,
    put: async (meta) => {
      await table.put(meta);
    },
    list: () => table.toArray() as Promise<FieldMeta[]>,
    delete: async (id) => {
      await table.delete(id);
    },
  };
}

/**
 * The boundary-shaped view of storage (`EngineContext.storage`): ArrayBuffer in,
 * ArrayBuffer out, metadata as loose records. Kept so audio code that predates
 * the field app can consume field storage without knowing about FieldMeta.
 */
export interface StorageAdapter {
  readAudio(id: string): Promise<ArrayBuffer>;
  writeAudio(id: string, data: ArrayBuffer): Promise<void>;
  readMeta(id: string): Promise<Record<string, unknown>>;
  writeMeta(id: string, meta: Record<string, unknown>): Promise<void>;
}

export function toStorageAdapter(storage: FieldStorage, audio: AudioFileIO): StorageAdapter {
  return {
    async readAudio(id) {
      const bytes = await audio.read(id);
      // Copy into a standalone ArrayBuffer: a subarray view would keep the whole
      // file alive and detach badly across the native bridge.
      return bytes.slice().buffer as ArrayBuffer;
    },
    async writeAudio(id, data) {
      await audio.write(id, new Uint8Array(data));
    },
    async readMeta(id) {
      const meta = await storage.loadMeta(id);
      return meta ? { ...meta } : {};
    },
    async writeMeta(id, meta) {
      const existing = await storage.loadMeta(id);
      if (existing) await storage.saveMetaOnly({ ...existing, ...meta, id } as FieldMeta);
    },
  };
}
