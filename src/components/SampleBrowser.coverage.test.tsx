/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extra coverage for `SampleBrowser` — CRUD failure paths, prompt fallbacks,
 * use-sample with no audio context, import edge cases (unknown saved id,
 * folder-scoped import), linked-root load failure, the full link-folder flow
 * (cancel / toggle / import / skipped / scan failure / no-pick), and the
 * category badge + missing-analysis display branches. `sampleLibrary`,
 * `folderLink` and `db` are stubbed; the global `audioEngine` mock is driven
 * per-test (never re-mocked).
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { SampleBrowser } from './SampleBrowser';
import { audioEngine } from '../audio/AudioEngine';

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
    filterLibrarySamples: vi.fn((rows: any[]) => rows),
  },
  fl: {
    pickDirectory: vi.fn(),
    scanDirectoryToLibrary: vi.fn(),
    isFolderLinkSupported: vi.fn(),
    ensureReadPermission: vi.fn(),
    countAudioFiles: vi.fn(),
    listSubfolders: vi.fn(),
  },
  db: {
    saveFolderLink: vi.fn(),
    fetchFolderLinks: vi.fn(),
    deleteFolderLink: vi.fn(),
  },
}));

vi.mock('../lib/sampleLibrary', () => h.lib);
vi.mock('../lib/folderLink', () => h.fl);
vi.mock('../lib/db', () => h.db);

const makeSample = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  name: 'Kick Fat',
  fileName: 'kick-fat.wav',
  folderId: null,
  category: 'Kick',
  tags: ['punchy'],
  analysis: {
    durationSeconds: 0.5,
    peakDb: -3,
    rmsDb: -12,
    sampleRate: 44100,
    channels: 1,
    transientSharpness: 4,
    suggestedCategory: 'Kick',
  },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeFolder = (overrides: Record<string, unknown> = {}) => ({
  id: 'f1',
  name: 'Drums',
  parentId: null,
  createdAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeCtx = () => ({
  state: 'running',
  resume: vi.fn(async () => {}),
  decodeAudioData: vi.fn(async () => ({
    numberOfChannels: 1,
    length: 100,
    sampleRate: 44100,
    duration: 0.5,
    getChannelData: () => new Float32Array(100),
  })),
  createBufferSource: vi.fn(() => ({
    buffer: null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  })),
  destination: {},
});

const makeBuffer = () =>
  ({ numberOfChannels: 1, length: 100, sampleRate: 44100, duration: 0.5 }) as unknown as AudioBuffer;

describe('SampleBrowser coverage', () => {
  const props = {
    onSelectFolder: vi.fn(),
    onUseSample: vi.fn(),
    onImportExternal: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    h.lib.fetchLibraryFolders.mockResolvedValue([]);
    h.lib.fetchLibrarySamples.mockResolvedValue([]);
    h.lib.fetchLibrarySample.mockResolvedValue(undefined);
    h.lib.decodeLibrarySample.mockResolvedValue(makeBuffer());
    h.lib.analyzeLibrarySample.mockReturnValue({ suggestedCategory: 'Perc' });
    h.lib.filterLibrarySamples.mockImplementation((rows: any[]) => rows);
    h.fl.isFolderLinkSupported.mockReturnValue(true);
    h.fl.pickDirectory.mockResolvedValue(null);
    h.fl.listSubfolders.mockResolvedValue([]);
    h.fl.countAudioFiles.mockResolvedValue(0);
    h.fl.scanDirectoryToLibrary.mockResolvedValue({
      rootFolderId: 'f0',
      folders: 1,
      samples: 2,
      skipped: [],
    });
    h.db.fetchFolderLinks.mockResolvedValue([]);
    h.db.saveFolderLink.mockResolvedValue('l1');
    h.db.deleteFolderLink.mockResolvedValue(undefined);
    (audioEngine.getContext as any).mockReturnValue(makeCtx());
  });

  const renderBrowser = (overrides: Record<string, unknown> = {}) =>
    render(
      <SampleBrowser
        onSelectFolder={props.onSelectFolder}
        onUseSample={props.onUseSample}
        onImportExternal={props.onImportExternal}
        {...overrides}
      />,
    );

  const sampleRow = (name = 'Kick Fat') =>
    screen.getByText(name).closest('[draggable]') as HTMLElement;

  const folderRow = (name: string) => {
    const span = screen.getByTitle(name);
    return span.parentElement as HTMLElement;
  };

  it('reports a folder-rename failure and still refreshes', async () => {
    h.lib.fetchLibraryFolders.mockResolvedValue([makeFolder()]);
    h.lib.renameLibraryFolder.mockRejectedValue(new Error('locked'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderBrowser();
    await screen.findByText('Drums');
    const row = folderRow('Drums');
    fireEvent.click(within(row).getByTitle('Rename'));
    fireEvent.keyDown(within(row).getByRole('textbox'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Could not rename folder.')).toBeDefined());
    expect(h.lib.fetchLibraryFolders).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('reports a folder-delete failure and refreshes', async () => {
    h.lib.fetchLibraryFolders.mockResolvedValue([makeFolder()]);
    h.lib.deleteLibraryFolder.mockRejectedValue(new Error('locked'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderBrowser({ selectedFolderId: null });
    await screen.findByText('Drums');
    fireEvent.click(within(folderRow('Drums')).getByTitle('Delete'));
    await waitFor(() => expect(screen.getByText('Could not delete folder.')).toBeDefined());
    warn.mockRestore();
  });

  it('does not reset the active folder when deleting a different one', async () => {
    h.lib.fetchLibraryFolders.mockResolvedValue([makeFolder()]);
    const onSelectFolder = vi.fn();
    renderBrowser({ selectedFolderId: 'other', onSelectFolder });
    await screen.findByText('Drums');
    fireEvent.click(within(folderRow('Drums')).getByTitle('Delete'));
    await waitFor(() => expect(h.lib.deleteLibraryFolder).toHaveBeenCalledWith('f1'));
    expect(onSelectFolder).not.toHaveBeenCalledWith(null);
  });

  it('reports a sample-delete failure', async () => {
    h.lib.fetchLibrarySamples.mockResolvedValue([makeSample()]);
    h.lib.deleteLibrarySample.mockRejectedValue(new Error('locked'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderBrowser();
    await screen.findByText('Kick Fat');
    fireEvent.click(within(sampleRow()).getByTitle('Delete'));
    await waitFor(() => expect(screen.getByText('Could not delete sample.')).toBeDefined());
    warn.mockRestore();
  });

  it('keeps the sample name when the rename prompt is cancelled', async () => {
    h.lib.fetchLibrarySamples.mockResolvedValue([makeSample()]);
    vi.stubGlobal('prompt', vi.fn(() => null));
    renderBrowser();
    await screen.findByText('Kick Fat');
    fireEvent.click(within(sampleRow()).getByTitle('Rename'));
    await waitFor(() =>
      expect(h.lib.updateLibrarySample).toHaveBeenCalledWith('s1', { name: 'Kick Fat' }),
    );
    vi.unstubAllGlobals();
  });

  it('reports a sample-update failure', async () => {
    h.lib.fetchLibrarySamples.mockResolvedValue([makeSample()]);
    h.lib.updateLibrarySample.mockRejectedValue(new Error('locked'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('prompt', vi.fn(() => 'Kick 2'));
    renderBrowser();
    await screen.findByText('Kick Fat');
    fireEvent.click(within(sampleRow()).getByTitle('Rename'));
    await waitFor(() => expect(screen.getByText('Could not update sample.')).toBeDefined());
    warn.mockRestore();
    vi.unstubAllGlobals();
  });

  it('does nothing in use-sample when the audio context is missing', async () => {
    h.lib.fetchLibrarySamples.mockResolvedValue([makeSample()]);
    (audioEngine.getContext as any).mockReturnValue(null);
    const onUseSample = vi.fn();
    renderBrowser({ onUseSample });
    await screen.findByText('Kick Fat');
    fireEvent.click(within(sampleRow()).getByTitle('Use sample in active layer'));
    await new Promise((r) => setTimeout(r, 20));
    expect(onUseSample).not.toHaveBeenCalled();
    expect(h.lib.decodeLibrarySample).not.toHaveBeenCalled();
  });

  it('imports nothing new when the saved sample cannot be re-fetched', async () => {
    h.lib.saveLibrarySample.mockResolvedValue('new-id');
    h.lib.fetchLibrarySample.mockResolvedValue(undefined);
    const onImportExternal = vi.fn();
    renderBrowser({ onImportExternal });
    await screen.findByText('No samples yet. Drag audio files here.');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['a'], 'kick.wav', { type: 'audio/wav' })] } });
    await waitFor(() => expect(onImportExternal).toHaveBeenCalledWith([]));
    // The input is cleared after handling.
    expect(input.value).toBe('');
  });

  it('scopes imports to the active folder', async () => {
    h.lib.saveLibrarySample.mockResolvedValue('new-id');
    h.lib.fetchLibrarySample.mockResolvedValue(makeSample());
    renderBrowser({ selectedFolderId: 'f1' });
    await screen.findByText('No samples yet. Drag audio files here.');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['a'], 'kick.wav', { type: 'audio/wav' })] } });
    await waitFor(() =>
      expect(h.lib.saveLibrarySample).toHaveBeenCalledWith(expect.objectContaining({ folderId: 'f1' })),
    );
  });

  it('warns when linked roots fail to load', async () => {
    h.db.fetchFolderLinks.mockRejectedValue(new Error('db down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderBrowser();
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith('Failed to load folder links:', expect.anything()),
    );
    warn.mockRestore();
  });

  it('does nothing when the folder picker is dismissed', async () => {
    h.fl.pickDirectory.mockResolvedValue(null);
    renderBrowser();
    await screen.findByText('No samples yet. Drag audio files here.');
    fireEvent.click(screen.getByTitle(/Link a folder on disk/i));
    await new Promise((r) => setTimeout(r, 20));
    expect(h.fl.scanDirectoryToLibrary).not.toHaveBeenCalled();
  });

  it('shows the subfolder picker, cancels, and clears the selection', async () => {
    const dir = { kind: 'directory', name: 'drums' };
    h.fl.pickDirectory.mockResolvedValue(dir);
    h.fl.listSubfolders.mockResolvedValue([
      { name: 'kicks', audioCount: 3 },
      { name: 'empty', audioCount: 0 },
    ]);
    const { container } = renderBrowser();
    await screen.findByText('No samples yet. Drag audio files here.');
    fireEvent.click(screen.getByTitle(/Link a folder on disk/i));
    await waitFor(() => expect(container.querySelector('[data-link-picker]')).toBeTruthy());
    expect(screen.getByText('1/2')).toBeDefined();
    // Only the non-empty folder is preselected.
    expect(screen.getByLabelText('Import kicks')).toBeDefined();
    fireEvent.click(screen.getByText('Cancel'));
    expect(container.querySelector('[data-link-picker]')).toBeNull();
  });

  it('toggles a subfolder and imports the selection', async () => {
    const dir = { kind: 'directory', name: 'drums' };
    h.fl.pickDirectory.mockResolvedValue(dir);
    h.fl.listSubfolders.mockResolvedValue([
      { name: 'kicks', audioCount: 3 },
      { name: 'snares', audioCount: 2 },
    ]);
    renderBrowser();
    await screen.findByText('No samples yet. Drag audio files here.');
    fireEvent.click(screen.getByTitle(/Link a folder on disk/i));
    await waitFor(() => expect(screen.getByLabelText('Import snares')).toBeDefined());
    fireEvent.click(screen.getByLabelText('Import snares'));
    fireEvent.click(screen.getByRole('button', { name: /Import selected/i }));
    await waitFor(() =>
      expect(h.fl.scanDirectoryToLibrary).toHaveBeenCalledWith(
        dir,
        expect.anything(),
        { selectedSubfolders: ['kicks'] },
      ),
    );
    expect(h.db.saveFolderLink).toHaveBeenCalled();
  });

  it('disables import with nothing selected', async () => {
    const dir = { kind: 'directory', name: 'drums' };
    h.fl.pickDirectory.mockResolvedValue(dir);
    h.fl.listSubfolders.mockResolvedValue([
      { name: 'kicks', audioCount: 1 },
      { name: 'snares', audioCount: 2 },
    ]);
    renderBrowser();
    await screen.findByText('No samples yet. Drag audio files here.');
    fireEvent.click(screen.getByTitle(/Link a folder on disk/i));
    await waitFor(() => expect(screen.getByLabelText('Import kicks')).toBeDefined());
    // Deselect both preselected folders: the picker requires 2+ to appear.
    fireEvent.click(screen.getByLabelText('Import kicks'));
    fireEvent.click(screen.getByLabelText('Import snares'));
    expect(screen.getByText('0/2')).toBeDefined();
    expect((screen.getByRole('button', { name: /Import selected/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports skipped files after a linked scan', async () => {
    const dir = { kind: 'directory', name: 'drums' };
    h.fl.pickDirectory.mockResolvedValue(dir);
    h.fl.scanDirectoryToLibrary.mockResolvedValue({
      rootFolderId: 'f0',
      folders: 1,
      samples: 1,
      skipped: ['bad.wav'],
    });
    renderBrowser();
    await screen.findByText('No samples yet. Drag audio files here.');
    fireEvent.click(screen.getByTitle(/Link a folder on disk/i));
    await waitFor(() => expect(screen.getByText(/Skipped 1 file\(s\)/)).toBeDefined());
  });

  it('reports a linked-scan failure', async () => {
    h.fl.pickDirectory.mockResolvedValue({ kind: 'directory', name: 'drums' });
    h.fl.scanDirectoryToLibrary.mockRejectedValue(new Error('disk error'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderBrowser();
    await screen.findByText('No samples yet. Drag audio files here.');
    fireEvent.click(screen.getByTitle(/Link a folder on disk/i));
    await waitFor(() => expect(screen.getByText(/Could not scan the linked folder/i)).toBeDefined());
    warn.mockRestore();
  });

  it('renders every category badge and the missing-duration dash', async () => {
    const cats = ['Snare', 'HiHat', 'Clap', '808', 'Perc', 'Vox', 'FX', 'Melody', 'Bass', 'Atmospheres', 'Custom'];
    h.lib.fetchLibrarySamples.mockResolvedValue([
      ...cats.map((c, i) =>
        makeSample({ id: `s${i}`, name: `Sample ${c}`, fileName: `${c}.wav`, category: c }),
      ),
      makeSample({ id: 'sx', name: 'No Analysis', fileName: 'na.wav', category: 'Kick', analysis: undefined }),
    ]);
    renderBrowser();
    for (const c of cats) {
      expect(await screen.findByText(`Sample ${c}`)).toBeDefined();
    }
    expect(screen.getByText('No Analysis')).toBeDefined();
    // Missing analysis renders the duration dash.
    expect(screen.getAllByText('—s').length).toBeGreaterThan(0);
  });
});
