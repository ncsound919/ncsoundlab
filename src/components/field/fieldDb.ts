/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Web build of the field storage backend.
 *
 * In the browser there is no private filesystem, so audio lives in IndexedDB
 * next to the metadata (the desktop pattern). The Android build keeps audio in
 * app storage instead and uses only the metadata table — everything downstream
 * goes through the same injected `MetaStore` / `AudioFileIO` interfaces.
 */

import Dexie, { type Table } from 'dexie';
import type { FieldMeta } from '../../lib/mobile/fieldMeta';
import {
  createDexieMetaStore,
  createFieldStorage,
  type AudioFileIO,
  type FieldStorage,
  type MetaStore,
} from '../../lib/mobile/storageAdapter';

interface TakeRow extends FieldMeta {
  id: string;
}

interface AudioRow {
  id: string;
  bytes: Uint8Array;
}

export class FieldDb extends Dexie {
  takes!: Table<TakeRow, string>;
  audio!: Table<AudioRow, string>;

  constructor() {
    super('FieldStudioDB');
    this.version(1).stores({
      takes: '&id, createdAt',
      audio: '&id',
    });
  }
}

let sharedDb: FieldDb | null = null;

export function getDb(): FieldDb {
  if (!sharedDb) sharedDb = new FieldDb();
  return sharedDb;
}

/** Metadata store over the Dexie table. */
export function webMetaStore(): MetaStore {
  return createDexieMetaStore(getDb().takes);
}

/** Audio store over the same database, so a take survives a reload. */
export function webAudioIO(): AudioFileIO {
  const db = getDb();
  return {
    async read(id) {
      const row = await db.audio.get(id);
      if (!row) throw new Error(`No audio stored for ${id}`);
      return row.bytes;
    },
    async write(id, bytes) {
      await db.audio.put({ id, bytes });
    },
    async remove(id) {
      await db.audio.delete(id);
    },
    async exists(id) {
      return (await db.audio.get(id)) !== undefined;
    },
  };
}

export function webFieldStorage(): FieldStorage {
  return createFieldStorage({ meta: webMetaStore(), audio: webAudioIO(), format: 'float32' });
}

/**
 * Bytes of saved take audio, for the storage readout.
 *
 * Deliberately computed from the metadata table: `audio.toArray()` would pull
 * every WAV blob into memory just to add up its length, which is hundreds of
 * megabytes on a phone that has been recording. Takes are stored as 32-bit
 * float mono, so the size follows from the duration and sample rate.
 */
export async function storageBytesUsed(): Promise<number> {
  const rows = await getDb().takes.toArray();
  return rows.reduce((sum, row) => sum + estimateWavBytes(row.durationSec, row.sampleRateHz), 0);
}

/** 32-bit float mono WAV size for a duration, including the 44-byte header. */
export function estimateWavBytes(durationSec: number | undefined, sampleRateHz: number): number {
  const frames = Math.max(0, Math.round((durationSec ?? 0) * sampleRateHz));
  return frames * 4 + 44;
}

export async function storageTakeCount(): Promise<number> {
  return getDb().takes.count();
}
