/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extra coverage for `src/lib/db.ts` — every exported CRUD helper (sound kits,
 * projects, favorites, project documents) through a mocked Dexie instance.
 * The `dexie` module is replaced with a tiny fake so the `SoundLabDB` class
 * constructs without IndexedDB, and each table is swapped for fresh vi.fn()s
 * per test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('dexie', () => {
  class MockDexie {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    version(_n: number) {
      return { stores: () => {} };
    }
  }
  return { default: MockDexie };
});

import {
  db,
  saveSoundKit,
  fetchSoundKits,
  deleteSoundKit,
  saveProject,
  fetchUserProjects,
  deleteProject,
  fetchUserFavorites,
  toggleFavorite,
  saveProjectDocument,
  fetchProjectDocuments,
  fetchProjectDocument,
  deleteProjectDocument,
} from './db';

const makeTable = () => ({
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  toArray: vi.fn(),
  filter: vi.fn(),
});

const setFilterRows = (table: ReturnType<typeof makeTable>, rows: unknown[]) => {
  table.filter.mockReturnValue({ toArray: vi.fn().mockResolvedValue(rows) });
};

const kitSample = {
  id: 's1',
  name: 'Kick',
  fileName: 'kick.wav',
  category: 'Perc',
  tags: [],
  gain: 0.9,
  pitch: 0,
  audioBuffer: {} as unknown as AudioBuffer,
};

const makeKit = (over: Record<string, unknown> = {}): any => ({
  id: 'kit-1',
  title: 'Kit One',
  producer: 'P',
  description: 'D',
  genre: 'Hip Hop',
  tags: ['tag'],
  price: 0,
  isPublished: true,
  coverArt: {} as Record<string, unknown>,
  samples: [kitSample],
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
});

const makeProjectDoc = (over: Record<string, unknown> = {}): any => ({
  id: 'doc-1',
  title: 'Doc',
  layers: [{ id: 'l1', gain: 1, audioBuffer: {} }],
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('db sound kits', () => {
  beforeEach(() => {
    (db as any).soundKits = makeTable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saveSoundKit sanitizes (strips audioBuffer, forces local owner) and persists', async () => {
    const id = await saveSoundKit(makeKit());
    expect(id).toBe('kit-1');
    const row = (db as any).soundKits.put.mock.calls[0][0];
    expect(row.ownerId).toBe('local');
    expect(row.samples[0].audioBuffer).toBeUndefined();
    expect(row.isPublished).toBe(true);
  });

  it('saveSoundKit assigns a UUID when the kit has no id and tolerates missing samples/createdAt', async () => {
    const id = await saveSoundKit(makeKit({ id: undefined, createdAt: undefined, samples: undefined }));
    expect(id).toBeTruthy();
    const row = (db as any).soundKits.put.mock.calls[0][0];
    expect(row.id).toBe(id);
    expect(row.samples).toEqual([]);
  });

  it('saveSoundKit warns and still returns the id when put fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (db as any).soundKits.put.mockRejectedValue(new Error('quota'));
    const id = await saveSoundKit(makeKit());
    expect(id).toBe('kit-1');
    expect(warn).toHaveBeenCalled();
  });

  it('fetchSoundKits filters to published kits and sorts newest first', async () => {
    setFilterRows((db as any).soundKits, [
      { id: 'a', title: 'A', isPublished: true, ownerId: 'local', samples: [], createdAt: '2026-01-01' },
      { id: 'b', title: 'B', isPublished: true, ownerId: 'local', samples: [], createdAt: '2026-02-01' },
    ]);
    const out = await fetchSoundKits();
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('b');
    expect((out[0] as any).ownerId).toBeUndefined();
  });

  it('fetchSoundKits returns [] and warns on failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (db as any).soundKits.filter.mockReturnValue({ toArray: vi.fn().mockRejectedValue(new Error('idb')) });
    const out = await fetchSoundKits();
    expect(out).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('deleteSoundKit deletes and warns on failure', async () => {
    await deleteSoundKit('kit-1');
    expect((db as any).soundKits.delete).toHaveBeenCalledWith('kit-1');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (db as any).soundKits.delete.mockRejectedValue(new Error('idb'));
    await deleteSoundKit('kit-2');
    expect(warn).toHaveBeenCalled();
  });
});

describe('db projects / favorites', () => {
  beforeEach(() => {
    (db as any).soundProjects = makeTable();
    (db as any).favorites = makeTable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saveProject sanitizes layers (strips audioBuffer, handles null) and persists', async () => {
    const id = await saveProject('p1', 'My Project', [
      { id: 'l1', audioBuffer: {} as unknown as AudioBuffer, gain: 1 },
      null,
    ]);
    expect(id).toBe('p1');
    const row = (db as any).soundProjects.put.mock.calls[0][0];
    expect(row.ownerId).toBe('local');
    expect(row.layers).toEqual([{ id: 'l1', gain: 1 }, {}]);
    expect(row.title).toBe('My Project');
  });

  it('saveProject generates an id, defaults title, tolerates undefined layers, warns on failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (db as any).soundProjects.put.mockRejectedValue(new Error('idb'));
    const id = await saveProject('', '', undefined, undefined, undefined);
    expect(id).toBeTruthy();
    const row = (db as any).soundProjects.put.mock.calls[0][0];
    expect(row.title).toBe('Untitled Project');
    expect(row.layers).toEqual([]);
    expect(row.tags).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('fetchUserProjects sorts by updatedAt desc and returns [] with a warning on failure', async () => {
    (db as any).soundProjects.toArray.mockResolvedValue([
      { id: 'a', updatedAt: '2026-01-01' },
      { id: 'b', updatedAt: '2026-03-01' },
    ]);
    const out = await fetchUserProjects();
    expect(out.map((p: any) => p.id)).toEqual(['b', 'a']);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (db as any).soundProjects.toArray.mockRejectedValue(new Error('idb'));
    expect(await fetchUserProjects()).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('deleteProject deletes and warns on failure', async () => {
    await deleteProject('p1');
    expect((db as any).soundProjects.delete).toHaveBeenCalledWith('p1');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (db as any).soundProjects.delete.mockRejectedValue(new Error('idb'));
    await deleteProject('p2');
    expect(warn).toHaveBeenCalled();
  });

  it('fetchUserFavorites maps rows to kit ids and returns [] on failure', async () => {
    (db as any).favorites.toArray.mockResolvedValue([
      { id: 'f1', kitId: 'k1', createdAt: '' },
      { id: 'f2', kitId: 'k2', createdAt: '' },
    ]);
    expect(await fetchUserFavorites()).toEqual(['k1', 'k2']);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (db as any).favorites.toArray.mockRejectedValue(new Error('idb'));
    expect(await fetchUserFavorites()).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('toggleFavorite puts when favouriting and deletes when unfavouriting', async () => {
    await toggleFavorite('k1', true);
    expect((db as any).favorites.put).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'k1', kitId: 'k1' })
    );
    await toggleFavorite('k1', false);
    expect((db as any).favorites.delete).toHaveBeenCalledWith('k1');
  });

  it('toggleFavorite warns on failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (db as any).favorites.put.mockRejectedValue(new Error('idb'));
    await toggleFavorite('k1', true);
    expect(warn).toHaveBeenCalled();
  });
});

describe('db project documents', () => {
  beforeEach(() => {
    (db as any).projectDocuments = makeTable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saveProjectDocument stamps id + updatedAt and persists', async () => {
    const id = await saveProjectDocument(makeProjectDoc());
    expect(id).toBe('doc-1');
    const row = (db as any).projectDocuments.put.mock.calls[0][0];
    expect(row.id).toBe('doc-1');
    expect(row.updatedAt).toBeTruthy();
  });

  it('saveProjectDocument generates an id when absent and warns on failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (db as any).projectDocuments.put.mockRejectedValue(new Error('idb'));
    const id = await saveProjectDocument(makeProjectDoc({ id: undefined }));
    expect(id).toBeTruthy();
    expect(warn).toHaveBeenCalled();
  });

  it('fetchProjectDocuments sorts by updatedAt desc and returns [] on failure', async () => {
    (db as any).projectDocuments.toArray.mockResolvedValue([
      { id: 'a', updatedAt: '2026-01-01' },
      { id: 'b', updatedAt: '2026-02-01' },
    ]);
    const out = await fetchProjectDocuments();
    expect(out.map((d: any) => d.id)).toEqual(['b', 'a']);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (db as any).projectDocuments.toArray.mockRejectedValue(new Error('idb'));
    expect(await fetchProjectDocuments()).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('fetchProjectDocument returns a single doc and undefined on failure', async () => {
    (db as any).projectDocuments.get.mockResolvedValue(makeProjectDoc());
    expect((await fetchProjectDocument('doc-1'))?.id).toBe('doc-1');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (db as any).projectDocuments.get.mockRejectedValue(new Error('idb'));
    expect(await fetchProjectDocument('doc-2')).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('deleteProjectDocument deletes and warns on failure', async () => {
    await deleteProjectDocument('doc-1');
    expect((db as any).projectDocuments.delete).toHaveBeenCalledWith('doc-1');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (db as any).projectDocuments.delete.mockRejectedValue(new Error('idb'));
    await deleteProjectDocument('doc-2');
    expect(warn).toHaveBeenCalled();
  });
});
