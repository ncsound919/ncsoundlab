/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  ensureReadPermission,
  isAudioFileName,
  isFolderLinkSupported,
  listSubfolders,
  pickDirectory,
  sampleNameFromFile,
  scanDirectoryToLibrary,
  type DirectoryEntryLike,
  type DirectoryLike,
  type FolderScanDeps,
} from './folderLink';

function dir(name: string, children: Array<[string, DirectoryEntryLike]>): DirectoryLike {
  return {
    kind: 'directory',
    name,
    entries: () =>
      (async function* () {
        for (const child of children) yield child;
      })() as AsyncIterableIterator<[string, DirectoryEntryLike]>,
  };
}

function file(name: string, size = 11, fail = false): DirectoryEntryLike {
  return {
    kind: 'file',
    name,
    getFile: async () => ({ name, size, arrayBuffer: async () => new ArrayBuffer(0) }) as unknown as File,
    // `fail` simulates a decode error.
    ...(fail ? { __fail: true } : {}),
  } as DirectoryEntryLike;
}

function makeDeps(existing: Record<string, Set<string>> = {}) {
  const created: Array<{ name: string; parent: string | null }> = [];
  const saved: Array<{ name: string; folderId: string; fileName: string }> = [];
  const deps: FolderScanDeps & { created: typeof created; saved: typeof saved } = {
    created,
    saved,
    createFolder: async (name, parentId) => {
      const id = `f${created.length}`;
      created.push({ name, parent: parentId });
      return id;
    },
    saveSample: async (input) => {
      saved.push({ name: input.name, folderId: input.folderId, fileName: input.fileName });
      return `s${saved.length}`;
    },
    decode: async (f) => {
      if (f.name.includes('BAD')) throw new Error('decode failed');
      return {} as AudioBuffer;
    },
    existingFileNames: async (folderId) => existing[folderId] ?? new Set<string>(),
  };
  return deps;
}

describe('audio file helpers', () => {
  it('detects audio extensions case-insensitively', () => {
    expect(isAudioFileName('KICK.WAV')).toBe(true);
    expect(isAudioFileName('loop.mp3')).toBe(true);
    expect(isAudioFileName('notes.txt')).toBe(false);
    expect(isAudioFileName('cover.png')).toBe(false);
  });

  it('strips the extension for a display name', () => {
    expect(sampleNameFromFile('Snare 1.wav')).toBe('Snare 1');
  });
});

describe('scanDirectoryToLibrary', () => {
  it('mirrors the subfolder tree and imports audio files', async () => {
    const deps = makeDeps();
    const root = dir('drums', [
      ['kick', dir('kick', [['Kick 1.wav', file('Kick 1.wav')], ['readme.txt', file('readme.txt')]])],
      ['snare', dir('snare', [['Snare 1.wav', file('Snare 1.wav')]])],
      ['loop.mp3', file('loop.mp3')],
    ]);

    const result = await scanDirectoryToLibrary(root, deps);

    expect(result.folders).toBe(3); // drums + kick + snare
    expect(result.samples).toBe(3); // loop.mp3 + Kick 1 + Snare 1
    expect(deps.created).toEqual([
      { name: 'drums', parent: null },
      { name: 'kick', parent: 'f0' },
      { name: 'snare', parent: 'f0' },
    ]);
    // The kick sample landed in the kick folder, not the root.
    const kick = deps.saved.find((s) => s.fileName === 'Kick 1.wav');
    expect(kick?.folderId).toBe('f1');
  });

  it('skips files that already exist in the folder', async () => {
    const deps = makeDeps({ f0: new Set(['loop.mp3']) });
    const root = dir('drums', [['loop.mp3', file('loop.mp3')], ['Kick.wav', file('Kick.wav')]]);
    const result = await scanDirectoryToLibrary(root, deps);
    expect(result.samples).toBe(1);
    expect(deps.saved.map((s) => s.fileName)).toEqual(['Kick.wav']);
  });

  it('records decode failures as skipped', async () => {
    const deps = makeDeps();
    const root = dir('drums', [['BAD.wav', file('BAD.wav')], ['ok.wav', file('ok.wav')]]);
    const result = await scanDirectoryToLibrary(root, deps);
    expect(result.samples).toBe(1);
    expect(result.skipped).toEqual(['BAD.wav']);
  });

  it('re-scans into an existing root folder without creating a new one', async () => {
    const deps = makeDeps();
    const root = dir('drums', [['new.wav', file('new.wav')]]);
    const result = await scanDirectoryToLibrary(root, deps, { rootFolderId: 'existing' });
    expect(result.rootFolderId).toBe('existing');
    expect(deps.created).toHaveLength(0);
    expect(result.folders).toBe(0);
  });
});

describe('listSubfolders + selectedSubfolders', () => {
  it('lists immediate subfolders with recursive audio counts', async () => {
    const root = dir('drums', [
      ['kick', dir('kick', [['a.wav', file('a.wav')], ['deep', dir('deep', [['b.wav', file('b.wav')]])]])],
      ['empty', dir('empty', [])],
      ['loose.wav', file('loose.wav')],
    ]);
    const subs = await listSubfolders(root);
    expect(subs.map((s) => s.name)).toEqual(['empty', 'kick']);
    expect(subs.find((s) => s.name === 'kick')!.audioCount).toBe(2);
    expect(subs.find((s) => s.name === 'empty')!.audioCount).toBe(0);
  });

  it('imports only the selected subfolders', async () => {
    const deps = makeDeps();
    const root = dir('drums', [
      ['keep', dir('keep', [['k.wav', file('k.wav')]])],
      ['skip', dir('skip', [['s.wav', file('s.wav')]])],
    ]);
    const result = await scanDirectoryToLibrary(root, deps, { selectedSubfolders: ['keep'] });
    expect(deps.created.map((c) => c.name)).toEqual(['drums', 'keep']);
    expect(deps.saved.map((s) => s.fileName)).toEqual(['k.wav']);
    expect(result.samples).toBe(1);
  });
});

describe('capability + permission helpers', () => {
  it('reports the folder picker as unsupported in jsdom', () => {
    expect(isFolderLinkSupported()).toBe(false);
    return expect(pickDirectory()).resolves.toBeNull();
  });

  it('does not grant permission when the handle cannot report it', async () => {
    await expect(ensureReadPermission(dir('d', []))).resolves.toBe(false);
  });

  it('honors a granted queryPermission', async () => {
    const handle = { ...dir('d', []), queryPermission: vi.fn(async () => 'granted' as PermissionState) };
    await expect(ensureReadPermission(handle)).resolves.toBe(true);
  });

  it('requests permission when not already granted', async () => {
    const handle = {
      ...dir('d', []),
      queryPermission: vi.fn(async () => 'prompt' as PermissionState),
      requestPermission: vi.fn(async () => 'granted' as PermissionState),
    };
    await expect(ensureReadPermission(handle, true)).resolves.toBe(true);
    expect(handle.requestPermission).toHaveBeenCalled();
  });
});
