/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
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

import { db, saveFolderLink, fetchFolderLinks, deleteFolderLink } from './db';

const makeTable = () => ({ put: vi.fn(), get: vi.fn(), delete: vi.fn(), toArray: vi.fn() });

describe('db folder links', () => {
  beforeEach(() => {
    (db as any).folderLinks = makeTable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves a link with timestamps', async () => {
    const id = await saveFolderLink({
      id: 'l1', name: 'drums', rootFolderId: 'f0', handle: {}, folderCount: 3, sampleCount: 5,
    });
    expect(id).toBe('l1');
    const row = (db as any).folderLinks.put.mock.calls[0][0];
    expect(row).toMatchObject({ name: 'drums', sampleCount: 5 });
    expect(row.createdAt).toBeTruthy();
    expect(row.updatedAt).toBeTruthy();
  });

  it('keeps an explicit createdAt', async () => {
    await saveFolderLink({
      id: 'l2', name: 'x', rootFolderId: 'f', handle: {}, folderCount: 0, sampleCount: 0,
      createdAt: '2020-01-01T00:00:00Z',
    });
    expect((db as any).folderLinks.put.mock.calls[0][0].createdAt).toBe('2020-01-01T00:00:00Z');
  });

  it('fetches links newest first', async () => {
    (db as any).folderLinks.toArray.mockResolvedValue([
      { id: 'a', name: 'a', createdAt: '2020-01-01T00:00:00Z' },
      { id: 'b', name: 'b', createdAt: '2021-01-01T00:00:00Z' },
    ]);
    const rows = await fetchFolderLinks();
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('swallows storage errors on save and fetch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (db as any).folderLinks.put.mockRejectedValue(new Error('nope'));
    (db as any).folderLinks.toArray.mockRejectedValue(new Error('nope'));
    await expect(saveFolderLink({ id: 'l3', name: 'x', rootFolderId: 'f', handle: {}, folderCount: 0, sampleCount: 0 })).resolves.toBe('l3');
    await expect(fetchFolderLinks()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('deletes a link', async () => {
    await deleteFolderLink('l1');
    expect((db as any).folderLinks.delete).toHaveBeenCalledWith('l1');
  });

  it('swallows delete errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    (db as any).folderLinks.delete.mockRejectedValue(new Error('nope'));
    await expect(deleteFolderLink('l1')).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
