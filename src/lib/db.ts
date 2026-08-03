/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Local-first persistence layer (IndexedDB via Dexie).
 * Replaces the previous Firebase/Firestore backend with a zero-infrastructure,
 * offline-first store. There is no auth and no network dependency; every read
 * falls back to an empty/[] result when IndexedDB is unavailable so the app
 * keeps working in private browsing or older environments.
 */

import Dexie, { type Table } from 'dexie';
import { SoundKit, SoundKitSample } from '../types';
import type { ProjectDocument } from './projectFormat';
export type { ProjectDocument } from './projectFormat';

/** SoundKitSample without the non-serializable AudioBuffer. */
export type StoredSoundKitSample = Omit<SoundKitSample, 'audioBuffer'>;

/**
 * Phase 5.1 — persistent sample library entries. Sample audio is stored as
 * base64 WAV (`sampleData`) so the browser tab + an offline IndexedDB cache
 * can hold the entire user library. `sampleMeta` records sample-rate/channels
 * at encode time so re-decoding is exact.
 */
export interface StoredSampleLibrarySample {
  id: string;
  name: string;
  fileName: string;
  folderId: string | null;
  category: string;
  tags: string[];
  key?: string;
  bpm?: number;
  gain: number;
  pitch: number;
  sampleData: string;
  sampleMeta: { sampleRate: number; channels: number; length: number };
  analysis?: StoredSampleAnalysis;
  sizeBytes?: number;
  createdAt: string;
  updatedAt: string;
}

/** Lightweight analysis snapshot (no AudioBuffer). */
export interface StoredSampleAnalysis {
  peakDb: number;
  rmsDb: number;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  transientSharpness: number;
  estimatedKey?: string;
  suggestedCategory: string;
}

export interface StoredSampleLibraryFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

/** SoundKit without non-serializable sample buffers. */
export type StoredSoundKit = Omit<SoundKit, 'samples'> & {
  ownerId: string;
  samples: StoredSoundKitSample[];
};

export interface SavedSoundProject {
  id: string;
  title: string;
  ownerId: string;
  layers: any[];
  updatedAt: string;
  description?: string;
  tags?: string[];
}

export interface Favorite {
  id: string;
  kitId: string;
  createdAt: string;
}

class SoundLabDB extends Dexie {
  soundKits!: Table<StoredSoundKit, string>;
  soundProjects!: Table<SavedSoundProject, string>;
  favorites!: Table<Favorite, string>;
  projectDocuments!: Table<ProjectDocument, string>;
  /**
   * Phase 5.1 — persistent user sample library. Two tables: folders for a
   * lightweight tree (parentId-driven), and the actual samples indexed by
   * folder so a folder listing is a single `where('folderId').equals(id)` query.
   */
  sampleLibraryFolders!: Table<StoredSampleLibraryFolder, string>;
  sampleLibrarySamples!: Table<StoredSampleLibrarySample, string>;

  constructor() {
    super('soundlab-db');
    this.version(1).stores({
      soundKits: 'id, isPublished, title, producer, genre, updatedAt',
      soundProjects: 'id, ownerId, title, updatedAt',
      favorites: 'id, kitId, createdAt',
    });
    // Phase 0.2: add a versioned project document table for round-trip project
    // files (layers + sample audio + patterns + pads + master rack). Stored
    // alongside the legacy `soundProjects` row so old UI keeps working until
    // Step 0.4 deprecates it.
    this.version(2).stores({
      projectDocuments: 'id, title, updatedAt',
    });
    // Phase 5.1: persistent sample library. Additive — does not affect any
    // existing table, so older projects continue to load unchanged.
    this.version(3).stores({
      sampleLibraryFolders: 'id, parentId, createdAt',
      sampleLibrarySamples: 'id, folderId, category, updatedAt, createdAt',
    });
  }
}

export const db = new SoundLabDB();

const sanitizeKit = (kit: SoundKit): StoredSoundKit => {
  const { samples, ...rest } = kit;
  return {
    ...rest,
    ownerId: 'local',
    samples: (samples || []).map(({ audioBuffer, ...sample }) => sample),
  };
};

// ---------------------------------------------------------------------------
// Sound Kits
// ---------------------------------------------------------------------------

export const saveSoundKit = async (kit: SoundKit): Promise<string> => {
  const kitId = kit.id || crypto.randomUUID();
  const doc = sanitizeKit({
    ...kit,
    id: kitId,
    createdAt: kit.createdAt || new Date().toISOString(),
  });
  try {
    await db.soundKits.put(doc);
  } catch (err) {
    console.warn('Local sound kit save notice (offline/unsupported):', err);
  }
  return kitId;
};

export const fetchSoundKits = async (): Promise<SoundKit[]> => {
  try {
    const rows = await db.soundKits.filter((k) => k.isPublished === true).toArray();
    rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return rows.map(({ ownerId, samples, ...rest }) => ({
      ...rest,
      samples: samples as SoundKitSample[],
    }) as SoundKit);
  } catch (err) {
    console.warn('Local sound kit load notice (offline/unsupported):', err);
    return [];
  }
};

export const deleteSoundKit = async (kitId: string): Promise<void> => {
  try {
    await db.soundKits.delete(kitId);
  } catch (err) {
    console.warn('Local sound kit delete notice (offline/unsupported):', err);
  }
};

// ---------------------------------------------------------------------------
// Projects / Presets
// ---------------------------------------------------------------------------

export const saveProject = async (
  id: string,
  title: string,
  layers: any[],
  description = '',
  tags: string[] = []
): Promise<string> => {
  const projectId = id || crypto.randomUUID();
  const sanitizedLayers = (layers || []).map((layer) => {
    const { audioBuffer, ...rest } = layer ?? {};
    return rest;
  });
  const project: SavedSoundProject = {
    id: projectId,
    title: title || 'Untitled Project',
    ownerId: 'local',
    layers: sanitizedLayers,
    updatedAt: new Date().toISOString(),
    description,
    tags,
  };
  try {
    await db.soundProjects.put(project);
  } catch (err) {
    console.warn('Local project save notice (offline/unsupported):', err);
  }
  return projectId;
};

export const fetchUserProjects = async (): Promise<SavedSoundProject[]> => {
  try {
    const rows = await db.soundProjects.toArray();
    return rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  } catch (err) {
    console.warn('Local project load notice (offline/unsupported):', err);
    return [];
  }
};

export const deleteProject = async (id: string): Promise<void> => {
  try {
    await db.soundProjects.delete(id);
  } catch (err) {
    console.warn('Local project delete notice (offline/unsupported):', err);
  }
};

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

export const fetchUserFavorites = async (): Promise<string[]> => {
  try {
    const favs = await db.favorites.toArray();
    return favs.map((f) => f.kitId);
  } catch (err) {
    console.warn('Local favorites load notice (offline/unsupported):', err);
    return [];
  }
};

export const toggleFavorite = async (kitId: string, isFav: boolean): Promise<void> => {
  try {
    if (isFav) {
      await db.favorites.put({ id: kitId, kitId, createdAt: new Date().toISOString() });
    } else {
      await db.favorites.delete(kitId);
    }
  } catch (err) {
    console.warn('Local favorites toggle notice (offline/unsupported):', err);
  }
};

// ---------------------------------------------------------------------------
// Versioned project documents (Phase 0.2)
//
// Stores self-contained `ProjectDocument` rows produced by the projectFormat
// serializer: includes sample audio as base64 WAV, patterns, pads, chain and
// master rack. These rows round-trip via deserializeProject() to restore
// audibly-complete sessions.
// ---------------------------------------------------------------------------

export const saveProjectDocument = async (doc: ProjectDocument): Promise<string> => {
  const id = doc.id || crypto.randomUUID();
  const stamped: ProjectDocument = { ...doc, id, updatedAt: new Date().toISOString() };
  try {
    await db.projectDocuments.put(stamped);
  } catch (err) {
    console.warn('Local project document save notice (offline/unsupported):', err);
  }
  return id;
};

export const fetchProjectDocuments = async (): Promise<ProjectDocument[]> => {
  try {
    const rows = await db.projectDocuments.toArray();
    rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    return rows;
  } catch (err) {
    console.warn('Local project documents load notice (offline/unsupported):', err);
    return [];
  }
};

export const fetchProjectDocument = async (id: string): Promise<ProjectDocument | undefined> => {
  try {
    return await db.projectDocuments.get(id);
  } catch (err) {
    console.warn('Local project document fetch notice (offline/unsupported):', err);
    return undefined;
  }
};

export const deleteProjectDocument = async (id: string): Promise<void> => {
  try {
    await db.projectDocuments.delete(id);
  } catch (err) {
    console.warn('Local project document delete notice (offline/unsupported):', err);
  }
};
