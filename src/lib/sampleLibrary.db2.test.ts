/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coverage for the IndexedDB-backed paths of `sampleLibrary.ts` (folder CRUD,
 * sample update/delete, buffer cache). The `db` module is replaced with a
 * richer in-memory mock than `sampleLibrary.db.test.ts`; the audio encode/decode
 * helpers run for real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbMock } = vi.hoisted(() => {
  const sampleLibrarySamples = {
    put: vi.fn(),
    get: vi.fn(),
    toArray: vi.fn(),
    where: vi.fn(),
    delete: vi.fn(),
    bulkPut: vi.fn(),
  };
  const sampleLibraryFolders = {
    put: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    toArray: vi.fn(),
  };
  return {
    dbMock: {
      sampleLibrarySamples,
      sampleLibraryFolders,
      transaction: vi.fn(),
    },
  };
});

vi.mock('./db', () => ({ db: dbMock }));

import {
  createLibraryFolder,
  renameLibraryFolder,
  deleteLibraryFolder,
  fetchLibraryFolders,
  fetchLibrarySample,
  updateLibrarySample,
  deleteLibrarySample,
  clearLibrarySampleBufferCache,
  saveLibrarySample,
  decodeLibrarySample,
  fetchLibrarySamples,
} from './sampleLibrary';

const makeBuffer = (): AudioBuffer => {
  const ch = new Float32Array(64).fill(0.1);
  return {
    numberOfChannels: 1,
    length: 64,
    sampleRate: 44100,
    duration: 64 / 44100,
    getChannelData: () => ch,
  } as unknown as AudioBuffer;
};

const makeRow = (id: string, sampleData = '') => ({
  id,
  name: `sample-${id}`,
  fileName: `sample-${id}.wav`,
  folderId: null as string | null,
  category: 'Perc',
  tags: [] as string[],
  gain: 0.85,
  pitch: 0,
  sampleData,
  sampleMeta: { sampleRate: 44100, channels: 1, length: 64 },
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
});

const folderRow = (id: string, name: string) => ({
  id,
  name,
  parentId: null,
  createdAt: '2026-08-01T00:00:00Z',
});

const mockWhereRows = (rows: unknown[]) => {
  dbMock.sampleLibrarySamples.where.mockImplementation(() => ({
    equals: vi.fn(() => ({ toArray: vi.fn(async () => rows) })),
  }));
};

describe('sampleLibrary folder CRUD', () => {
  beforeEach(() => {
    dbMock.sampleLibrarySamples.put.mockReset();
    dbMock.sampleLibrarySamples.put.mockResolvedValue(undefined);
    dbMock.sampleLibrarySamples.get.mockReset();
    dbMock.sampleLibrarySamples.get.mockResolvedValue(undefined);
    dbMock.sampleLibrarySamples.toArray.mockReset();
    dbMock.sampleLibrarySamples.toArray.mockResolvedValue([]);
    dbMock.sampleLibrarySamples.where.mockReset();
    mockWhereRows([]);
    dbMock.sampleLibrarySamples.delete.mockReset();
    dbMock.sampleLibrarySamples.delete.mockResolvedValue(undefined);
    dbMock.sampleLibrarySamples.bulkPut.mockReset();
    dbMock.sampleLibrarySamples.bulkPut.mockResolvedValue(undefined);

    dbMock.sampleLibraryFolders.put.mockReset();
    dbMock.sampleLibraryFolders.put.mockResolvedValue(undefined);
    dbMock.sampleLibraryFolders.update.mockReset();
    dbMock.sampleLibraryFolders.update.mockResolvedValue(undefined);
    dbMock.sampleLibraryFolders.delete.mockReset();
    dbMock.sampleLibraryFolders.delete.mockResolvedValue(undefined);
    dbMock.sampleLibraryFolders.toArray.mockReset();
    dbMock.sampleLibraryFolders.toArray.mockResolvedValue([]);

    dbMock.transaction.mockReset();
    dbMock.transaction.mockImplementation(async (...args: unknown[]) => {
      const cb = args[args.length - 1] as () => Promise<void>;
      return cb();
    });

    clearLibrarySampleBufferCache();
  });

  it('createLibraryFolder trims the name and defaults parentId to null', async () => {
    const id = await createLibraryFolder({ name: '  Drums  ' });
    expect(id).toBeTruthy();
    expect(dbMock.sampleLibraryFolders.put).toHaveBeenCalledTimes(1);
    const row = dbMock.sampleLibraryFolders.put.mock.calls[0][0];
    expect(row.name).toBe('Drums');
    expect(row.parentId).toBeNull();
    expect(row.id).toBe(id);
  });

  it('createLibraryFolder falls back to "New Folder" and honours parentId', async () => {
    await createLibraryFolder({ name: '   ', parentId: 'parent-1' });
    const row = dbMock.sampleLibraryFolders.put.mock.calls[0][0];
    expect(row.name).toBe('New Folder');
    expect(row.parentId).toBe('parent-1');
  });

  it('renameLibraryFolder updates with a trimmed name', async () => {
    await renameLibraryFolder('folder-1', '  Snares  ');
    expect(dbMock.sampleLibraryFolders.update).toHaveBeenCalledWith('folder-1', { name: 'Snares' });
  });

  it('renameLibraryFolder ignores blank names', async () => {
    await renameLibraryFolder('folder-1', '    ');
    expect(dbMock.sampleLibraryFolders.update).not.toHaveBeenCalled();
  });

  it('deleteLibraryFolder orphans contained samples and deletes the folder', async () => {
    const samples = [makeRow('s1'), { ...makeRow('s2'), folderId: 'folder-1' }];
    mockWhereRows(samples);

    await deleteLibraryFolder('folder-1');

    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    expect(dbMock.transaction).toHaveBeenCalledWith(
      'rw',
      dbMock.sampleLibrarySamples,
      dbMock.sampleLibraryFolders,
      expect.any(Function)
    );
    expect(dbMock.sampleLibrarySamples.bulkPut).toHaveBeenCalledTimes(1);
    const moved = dbMock.sampleLibrarySamples.bulkPut.mock.calls[0][0];
    expect(moved).toHaveLength(2);
    expect(moved.every((s: { folderId: string | null }) => s.folderId === null)).toBe(true);
    expect(dbMock.sampleLibraryFolders.delete).toHaveBeenCalledWith('folder-1');
  });

  it('deleteLibraryFolder with no samples still deletes the folder', async () => {
    mockWhereRows([]);
    await deleteLibraryFolder('folder-2');
    expect(dbMock.sampleLibrarySamples.bulkPut).not.toHaveBeenCalled();
    expect(dbMock.sampleLibraryFolders.delete).toHaveBeenCalledWith('folder-2');
  });

  it('fetchLibraryFolders sorts by name', async () => {
    dbMock.sampleLibraryFolders.toArray.mockResolvedValue([
      folderRow('b', 'Zeta'),
      folderRow('a', 'Alpha'),
      folderRow('c', 'Mu'),
    ]);
    const folders = await fetchLibraryFolders();
    expect(folders.map((f) => f.name)).toEqual(['Alpha', 'Mu', 'Zeta']);
  });
});

describe('sampleLibrary sample metadata', () => {
  beforeEach(() => {
    dbMock.sampleLibrarySamples.put.mockReset();
    dbMock.sampleLibrarySamples.put.mockResolvedValue(undefined);
    dbMock.sampleLibrarySamples.get.mockReset();
    dbMock.sampleLibrarySamples.get.mockResolvedValue(undefined);
    dbMock.sampleLibrarySamples.toArray.mockReset();
    dbMock.sampleLibrarySamples.toArray.mockResolvedValue([]);
    dbMock.sampleLibrarySamples.where.mockReset();
    mockWhereRows([]);
    dbMock.sampleLibrarySamples.delete.mockReset();
    dbMock.sampleLibrarySamples.delete.mockResolvedValue(undefined);
    dbMock.sampleLibrarySamples.bulkPut.mockReset();
    dbMock.sampleLibrarySamples.bulkPut.mockResolvedValue(undefined);
    clearLibrarySampleBufferCache();
  });

  it('fetchLibrarySample delegates to db.get', async () => {
    const row = makeRow('x');
    dbMock.sampleLibrarySamples.get.mockResolvedValue(row);
    const result = await fetchLibrarySample('x');
    expect(dbMock.sampleLibrarySamples.get).toHaveBeenCalledWith('x');
    expect(result).toBe(row);
  });

  it('updateLibrarySample is a no-op when the row is missing', async () => {
    dbMock.sampleLibrarySamples.get.mockResolvedValue(undefined);
    await updateLibrarySample('missing', { name: 'Nope' });
    expect(dbMock.sampleLibrarySamples.put).not.toHaveBeenCalled();
  });

  it('updateLibrarySample applies every patch field (tags deduped/trimmed)', async () => {
    const row = makeRow('u1');
    dbMock.sampleLibrarySamples.get.mockResolvedValue(row);

    await updateLibrarySample('u1', {
      name: '  New Name  ',
      fileName: 'new.wav',
      folderId: 'folder-9',
      category: 'Kick',
      tags: [' a ', 'b', 'a', '   ', 'b'],
      key: 'C',
      bpm: 140,
      gain: 0.5,
      pitch: -3,
    });

    expect(dbMock.sampleLibrarySamples.put).toHaveBeenCalledTimes(1);
    const next = dbMock.sampleLibrarySamples.put.mock.calls[0][0];
    expect(next.name).toBe('New Name');
    expect(next.fileName).toBe('new.wav');
    expect(next.folderId).toBe('folder-9');
    expect(next.category).toBe('Kick');
    expect(next.tags).toEqual(['a', 'b']);
    expect(next.key).toBe('C');
    expect(next.bpm).toBe(140);
    expect(next.gain).toBe(0.5);
    expect(next.pitch).toBe(-3);
    expect(typeof next.updatedAt).toBe('string');
  });

  it('deleteLibrarySample deletes the row and evicts its decode cache', async () => {
    const ctx = { decodeAudioData: vi.fn(async () => makeBuffer()) } as unknown as BaseAudioContext;
    await decodeLibrarySample(ctx, makeRow('del1', 'TWFu'));
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);

    await deleteLibrarySample('del1');
    expect(dbMock.sampleLibrarySamples.delete).toHaveBeenCalledWith('del1');

    await decodeLibrarySample(ctx, makeRow('del1', 'TWFu'));
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(2);
  });

  it('fetchLibrarySamples(null) lists all rows and strips sampleData', async () => {
    dbMock.sampleLibrarySamples.toArray.mockResolvedValue([makeRow('1', 'PAYLOAD'), makeRow('2', 'PAYLOAD')]);
    const rows = await fetchLibrarySamples(null);
    expect(rows).toHaveLength(2);
    expect((rows[0] as { sampleData?: unknown }).sampleData).toBeUndefined();
  });

  it('fetchLibrarySamples(folderId) queries where folderId equals', async () => {
    mockWhereRows([makeRow('3', 'PAYLOAD')]);
    const rows = await fetchLibrarySamples('folderX');
    expect(dbMock.sampleLibrarySamples.where).toHaveBeenCalledWith('folderId');
    const equals = dbMock.sampleLibrarySamples.where.mock.results[0].value.equals;
    expect(equals).toHaveBeenCalledWith('folderX');
    expect(rows).toHaveLength(1);
    expect((rows[0] as { sampleData?: unknown }).sampleData).toBeUndefined();
  });
});

describe('sampleLibrary buffer cache', () => {
  beforeEach(() => {
    dbMock.sampleLibrarySamples.get.mockReset();
    dbMock.sampleLibrarySamples.get.mockResolvedValue(undefined);
    dbMock.sampleLibrarySamples.put.mockReset();
    dbMock.sampleLibrarySamples.put.mockResolvedValue(undefined);
    clearLibrarySampleBufferCache();
  });

  it('decodeLibrarySample serves repeats from cache, then re-decodes after clearing one id', async () => {
    const ctx = { decodeAudioData: vi.fn(async () => makeBuffer()) } as unknown as BaseAudioContext;
    await decodeLibrarySample(ctx, makeRow('c1', 'TWFu'));
    await decodeLibrarySample(ctx, makeRow('c1', 'TWFu'));
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);

    clearLibrarySampleBufferCache('c1');
    await decodeLibrarySample(ctx, makeRow('c1', 'TWFu'));
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(2);
  });

  it('clearLibrarySampleBufferCache() with no id clears every entry', async () => {
    const ctx = { decodeAudioData: vi.fn(async () => makeBuffer()) } as unknown as BaseAudioContext;
    await decodeLibrarySample(ctx, makeRow('c2', 'TWFu'));
    await decodeLibrarySample(ctx, makeRow('c3', 'TWFu'));
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(2);

    clearLibrarySampleBufferCache();
    await decodeLibrarySample(ctx, makeRow('c2', 'TWFu'));
    await decodeLibrarySample(ctx, makeRow('c3', 'TWFu'));
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(4);
  });
});

describe('sampleLibrary saveLibrarySample rich input', () => {
  beforeEach(() => {
    dbMock.sampleLibrarySamples.put.mockReset();
    dbMock.sampleLibrarySamples.put.mockResolvedValue(undefined);
    clearLibrarySampleBufferCache();
  });

  it('persists explicit analysis, folder, tuning and deduped tags without analyzing', async () => {
    const analysis = {
      peakDb: -3,
      rmsDb: -12,
      durationSeconds: 0.2,
      sampleRate: 44100,
      channels: 1,
      transientSharpness: 8,
      estimatedKey: 'C',
      suggestedCategory: 'Kick',
    };

    const id = await saveLibrarySample({
      name: '  808 Drop  ',
      fileName: '   ',
      folderId: 'folder-7',
      category: '',
      tags: [' sub ', 'sub', '', '   ', '808'],
      key: 'C#',
      bpm: 140,
      gain: 0.5,
      pitch: -2,
      sizeBytes: 12345,
      analysis,
      audioBuffer: makeBuffer(),
    });

    expect(id).toBeTruthy();
    expect(dbMock.sampleLibrarySamples.put).toHaveBeenCalledTimes(1);
    const row = dbMock.sampleLibrarySamples.put.mock.calls[0][0];
    expect(row.name).toBe('808 Drop');
    expect(row.fileName).toBe('808 Drop');
    expect(row.folderId).toBe('folder-7');
    expect(row.category).toBe('Kick');
    expect(row.tags).toEqual(['sub', '808']);
    expect(row.key).toBe('C#');
    expect(row.bpm).toBe(140);
    expect(row.gain).toBe(0.5);
    expect(row.pitch).toBe(-2);
    expect(row.sizeBytes).toBe(12345);
    expect(row.analysis.suggestedCategory).toBe('Kick');
    expect(row.analysis.estimatedKey).toBe('C');
    expect(row.sampleData).toBeTruthy();
  });
});
