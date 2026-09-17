/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Folder-linking tests for SampleBrowser. `folderLink` keeps its real
 * `scanDirectoryToLibrary` (only the picker / support / permission helpers are
 * stubbed) so the scan-deps wiring is exercised end to end against a fake
 * in-memory directory handle.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const h = vi.hoisted(() => ({
  lib: {
    fetchLibraryFolders: vi.fn(),
    createLibraryFolder: vi.fn(),
    renameLibraryFolder: vi.fn(),
    deleteLibraryFolder: vi.fn(),
    fetchLibrarySamples: vi.fn(),
    fetchLibrarySample: vi.fn(),
    decodeLibrarySample: vi.fn(),
    deleteLibrarySample: vi.fn(),
    updateLibrarySample: vi.fn(),
    saveLibrarySample: vi.fn(),
    analyzeLibrarySample: vi.fn(),
    filterLibrarySamples: vi.fn((rows: unknown[]) => rows),
  },
  fl: {
    isFolderLinkSupported: vi.fn(),
    pickDirectory: vi.fn(),
    ensureReadPermission: vi.fn(),
  },
  db: { saveFolderLink: vi.fn(), fetchFolderLinks: vi.fn(), deleteFolderLink: vi.fn() },
}));

vi.mock('../lib/sampleLibrary', () => h.lib);
vi.mock('../lib/db', () => h.db);
vi.mock('../lib/folderLink', async (importOriginal: () => Promise<Record<string, unknown>>) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isFolderLinkSupported: (...a: unknown[]) => h.fl.isFolderLinkSupported(...a),
    pickDirectory: (...a: unknown[]) => h.fl.pickDirectory(...a),
    ensureReadPermission: (...a: unknown[]) => h.fl.ensureReadPermission(...a),
  };
});
vi.mock('../audio/AudioEngine', () => ({
  audioEngine: { getContext: vi.fn(() => ({ decodeAudioData: vi.fn(async () => ({})) })) },
}));

import { SampleBrowser } from './SampleBrowser';

const linkRow = (over: Record<string, unknown> = {}) => ({
  id: 'l1', name: 'drums', rootFolderId: 'f0', handle: {}, folderCount: 2, sampleCount: 3,
  createdAt: '', updatedAt: '', ...over,
});

function fakeFile(name: string) {
  return { kind: 'file', name, getFile: async () => ({ name, size: 12, arrayBuffer: async () => new ArrayBuffer(0) }) };
}
function fakeDir(name: string, children: unknown[]) {
  return {
    kind: 'directory',
    name,
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    entries: () => (async function* () { for (const c of children) yield c; })(),
  };
}

describe('SampleBrowser folder linking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.lib.fetchLibraryFolders.mockResolvedValue([]);
    h.lib.fetchLibrarySamples.mockResolvedValue([]);
    h.lib.filterLibrarySamples.mockImplementation((rows: unknown[]) => rows);
    h.lib.createLibraryFolder.mockResolvedValue('f0');
    h.lib.saveLibrarySample.mockResolvedValue('s1');
    h.db.fetchFolderLinks.mockResolvedValue([]);
    h.db.saveFolderLink.mockResolvedValue('l1');
  });

  it('scans a picked folder (with subfolders) and shows the linked root', async () => {
    h.fl.isFolderLinkSupported.mockReturnValue(true);
    h.fl.pickDirectory.mockResolvedValue(fakeDir('drums', [
      ['Kick 1.wav', fakeFile('Kick 1.wav')],
      ['kick', fakeDir('kick', [['Sub.wav', fakeFile('Sub.wav')]])],
      ['notes.txt', fakeFile('notes.txt')],
    ]));
    h.db.fetchFolderLinks.mockResolvedValue([linkRow()]);

    render(<SampleBrowser />);
    fireEvent.click(screen.getByTitle(/Link a folder on disk/i));

    // Root folder + subfolder created; only the two audio files saved.
    await waitFor(() => expect(h.lib.saveLibrarySample).toHaveBeenCalledTimes(2));
    expect(h.lib.createLibraryFolder).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByText('drums')).toBeDefined());
  });

  it('lets you choose which subfolders to import', async () => {
    h.fl.isFolderLinkSupported.mockReturnValue(true);
    h.fl.pickDirectory.mockResolvedValue(fakeDir('drums', [
      ['Beat Butcha', fakeDir('Beat Butcha', [['a.wav', fakeFile('a.wav')]])],
      ['CashMoneyAP', fakeDir('CashMoneyAP', [['b.wav', fakeFile('b.wav')]])],
    ]));
    h.db.fetchFolderLinks.mockResolvedValue([linkRow({ name: 'drums' })]);

    const { container } = render(<SampleBrowser />);
    fireEvent.click(screen.getByTitle(/Link a folder on disk/i));

    await waitFor(() => expect(container.querySelector('[data-link-picker]')).toBeTruthy());
    expect(h.lib.saveLibrarySample).not.toHaveBeenCalled();

    // Deselect one folder, then import the rest.
    fireEvent.click(screen.getByLabelText('Import CashMoneyAP'));
    fireEvent.click(screen.getByRole('button', { name: /Import selected/i }));
    await waitFor(() => expect(h.lib.saveLibrarySample).toHaveBeenCalledTimes(1));
  });

  it('confirms before importing a huge folder and aborts when declined', async () => {
    h.fl.isFolderLinkSupported.mockReturnValue(true);
    const many = Array.from({ length: 501 }, (_, i) => [`f${i}.wav`, fakeFile(`f${i}.wav`)] as [string, unknown]);
    h.fl.pickDirectory.mockResolvedValue(fakeDir('big', many));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<SampleBrowser />);
    fireEvent.click(screen.getByTitle(/Link a folder on disk/i));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(h.lib.saveLibrarySample).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('reports unsupported browsers instead of failing silently', async () => {
    h.fl.isFolderLinkSupported.mockReturnValue(false);
    render(<SampleBrowser />);
    fireEvent.click(screen.getByTitle(/Link a folder on disk/i));
    await waitFor(() => expect(screen.getByText(/needs a Chromium browser/i)).toBeDefined());
  });

  it('reports a scan failure', async () => {
    h.fl.isFolderLinkSupported.mockReturnValue(true);
    h.fl.pickDirectory.mockResolvedValue(fakeDir('drums', []));
    h.lib.createLibraryFolder.mockRejectedValue(new Error('disk error'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<SampleBrowser />);
    fireEvent.click(screen.getByTitle(/Link a folder on disk/i));
    await waitFor(() => expect(screen.getByText(/Could not scan the linked folder/i)).toBeDefined());
    warn.mockRestore();
  });

  it('blocks a rescan when read permission is denied', async () => {
    h.db.fetchFolderLinks.mockResolvedValue([linkRow()]);
    h.fl.ensureReadPermission.mockResolvedValue(false);
    render(<SampleBrowser />);
    await waitFor(() => expect(screen.getByText('drums')).toBeDefined());
    fireEvent.click(screen.getByTitle(/Rescan this folder/i));
    await waitFor(() => expect(screen.getByText(/Permission to read "drums" was denied/i)).toBeDefined());
  });

  it('rescans then unlinks a linked root', async () => {
    h.db.fetchFolderLinks.mockResolvedValue([linkRow({ handle: fakeDir('drums', [['X.wav', fakeFile('X.wav')]]) })]);
    h.fl.ensureReadPermission.mockResolvedValue(true);
    h.fl.pickDirectory.mockResolvedValue(fakeDir('drums', [['X.wav', fakeFile('X.wav')]]));

    render(<SampleBrowser />);
    await waitFor(() => expect(screen.getByText('drums')).toBeDefined());

    fireEvent.click(screen.getByTitle(/Rescan this folder/i));
    await waitFor(() => expect(h.lib.saveLibrarySample).toHaveBeenCalled());

    fireEvent.click(screen.getByTitle(/Unlink/i));
    await waitFor(() => expect(h.db.deleteFolderLink).toHaveBeenCalledWith('l1'));
  });

  it('reports a rescan failure', async () => {
    h.db.fetchFolderLinks.mockResolvedValue([linkRow({ handle: fakeDir('drums', [['X.wav', fakeFile('X.wav')]]) })]);
    h.fl.ensureReadPermission.mockResolvedValue(true);
    h.db.saveFolderLink.mockRejectedValue(new Error('nope'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<SampleBrowser />);
    await waitFor(() => expect(screen.getByText('drums')).toBeDefined());
    fireEvent.click(screen.getByTitle(/Rescan this folder/i));
    await waitFor(() => expect(screen.getByText(/Could not rescan "drums"/i)).toBeDefined());
    warn.mockRestore();
  });
});
