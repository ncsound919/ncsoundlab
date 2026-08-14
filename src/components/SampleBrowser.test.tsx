/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Interaction tests for the SampleBrowser panel: folder CRUD + rename UI,
 * search / category filtering, preview + use + rename + delete samples,
 * drag & drop import, and the audioEngine integration. The whole
 * `../lib/sampleLibrary` module is mocked (it depends on Dexie/IndexedDB).
 */

import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { SampleBrowser, SAMPLE_DRAG_MIME } from './SampleBrowser';
import { audioEngine } from '../audio/AudioEngine';

const { libMock } = vi.hoisted(() => ({
  libMock: {
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
  },
}));

vi.mock('../lib/sampleLibrary', () => {
  const filterLibrarySamples = (
    rows: any[],
    query: string,
    category?: string | null
  ): any[] => {
    const q = (query || '').trim().toLowerCase();
    return rows.filter((row: any) => {
      if (category && category !== 'All' && row.category !== category) return false;
      if (!q) return true;
      if (row.name.toLowerCase().includes(q)) return true;
      if (row.fileName.toLowerCase().includes(q)) return true;
      if ((row.tags || []).some((t: string) => t.toLowerCase().includes(q))) return true;
      return false;
    });
  };
  return {
    fetchLibraryFolders: libMock.fetchLibraryFolders,
    createLibraryFolder: libMock.createLibraryFolder,
    renameLibraryFolder: libMock.renameLibraryFolder,
    deleteLibraryFolder: libMock.deleteLibraryFolder,
    fetchLibrarySamples: libMock.fetchLibrarySamples,
    fetchLibrarySample: libMock.fetchLibrarySample,
    decodeLibrarySample: libMock.decodeLibrarySample,
    deleteLibrarySample: libMock.deleteLibrarySample,
    updateLibrarySample: libMock.updateLibrarySample,
    saveLibrarySample: libMock.saveLibrarySample,
    filterLibrarySamples,
    analyzeLibrarySample: libMock.analyzeLibrarySample,
  };
});

const makeSample = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  name: 'Kick Fat',
  fileName: 'kick-fat.wav',
  folderId: null,
  category: 'Kick',
  tags: ['punchy'],
  gain: 0.85,
  pitch: 0,
  sampleMeta: { sampleRate: 44100, channels: 1, length: 100 },
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

describe('SampleBrowser', () => {
  const props = {
    onSelectFolder: vi.fn(),
    onUseSample: vi.fn(),
    onImportExternal: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    libMock.fetchLibraryFolders.mockResolvedValue([]);
    libMock.fetchLibrarySamples.mockResolvedValue([]);
    libMock.fetchLibrarySample.mockResolvedValue(undefined);
    libMock.decodeLibrarySample.mockResolvedValue(makeBuffer());
    libMock.analyzeLibrarySample.mockReturnValue({ suggestedCategory: 'Perc' });
    (audioEngine.getContext as any).mockReturnValue(makeCtx());
  });

  afterEach(() => {
    (audioEngine.getContext as any).mockReset();
    vi.unstubAllGlobals();
  });

  const renderBrowser = (overrides: Record<string, unknown> = {}) =>
    render(
      <SampleBrowser
        onSelectFolder={props.onSelectFolder}
        onUseSample={props.onUseSample}
        onImportExternal={props.onImportExternal}
        {...overrides}
      />
    );

  const sampleRow = (name = 'Kick Fat') =>
    screen.getByText(name).closest('[draggable]') as HTMLElement;

  const folderRow = (name: string) => {
    const span = screen.getByTitle(name);
    return span.parentElement as HTMLElement;
  };

  it('renders folders and samples after loading', async () => {
    libMock.fetchLibraryFolders.mockResolvedValue([makeFolder()]);
    libMock.fetchLibrarySamples.mockResolvedValue([makeSample()]);
    renderBrowser();

    expect(await screen.findByText('Drums')).toBeDefined();
    expect(await screen.findByText('Kick Fat')).toBeDefined();
    expect(screen.getAllByText('Kick').length).toBeGreaterThan(0);
    expect(screen.getByText('0.50s')).toBeDefined();
    expect(screen.getByText('Sample Library')).toBeDefined();
  });

  it('shows empty states for folders and samples', async () => {
    renderBrowser();
    expect(await screen.findByText('No folders yet.')).toBeDefined();
    expect(await screen.findByText('No samples yet. Drag audio files here.')).toBeDefined();
  });

  it('does not render the header in compact mode', async () => {
    libMock.fetchLibrarySamples.mockResolvedValue([makeSample()]);
    renderBrowser({ compact: true });
    await screen.findByText('Kick Fat');
    expect(screen.queryByText('Sample Library')).toBeNull();
  });

  it('filters samples by search query and category', async () => {
    libMock.fetchLibrarySamples.mockResolvedValue([
      makeSample(),
      makeSample({
        id: 's2',
        name: 'Snare Tight',
        fileName: 'snare.wav',
        category: 'Snare',
        tags: [],
      }),
    ]);
    renderBrowser();
    await screen.findByText('Kick Fat');

    const search = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'snare' } });
    expect(screen.queryByText('Kick Fat')).toBeNull();
    expect(screen.getByText('Snare Tight')).toBeDefined();

    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('No matches.')).toBeDefined();

    fireEvent.change(search, { target: { value: '' } });
    const category = document.querySelector('select') as HTMLSelectElement;
    fireEvent.change(category, { target: { value: 'Snare' } });
    expect(screen.queryByText('Kick Fat')).toBeNull();
    expect(screen.getByText('Snare Tight')).toBeDefined();
  });

  it('selects folders via the All Samples row and folder rows', async () => {
    libMock.fetchLibraryFolders.mockResolvedValue([makeFolder()]);
    renderBrowser();
    await screen.findByText('Drums');

    fireEvent.click(screen.getByText('All Samples'));
    expect(props.onSelectFolder).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getByText('Drums'));
    expect(props.onSelectFolder).toHaveBeenCalledWith('f1');
  });

  it('uses an internal folder id when no onSelectFolder is provided', async () => {
    libMock.fetchLibraryFolders.mockResolvedValue([makeFolder()]);
    renderBrowser({ onSelectFolder: undefined });
    await screen.findByText('Drums');
    fireEvent.click(screen.getByText('Drums'));
    await waitFor(() => expect(libMock.fetchLibrarySamples).toHaveBeenCalledWith('f1'));
  });

  it('creates a folder and refreshes', async () => {
    libMock.createLibraryFolder.mockResolvedValue('f-new');
    renderBrowser();
    fireEvent.click(screen.getByTitle('New folder'));
    await waitFor(() => expect(libMock.createLibraryFolder).toHaveBeenCalledWith({ name: 'New Folder' }));
    expect(libMock.fetchLibraryFolders).toHaveBeenCalledTimes(2);
  });

  it('renames a folder via the inline input (Enter, Escape and blur)', async () => {
    libMock.fetchLibraryFolders.mockResolvedValue([makeFolder()]);
    renderBrowser();
    await screen.findByText('Drums');
    const row = folderRow('Drums');

    fireEvent.click(within(row).getByTitle('Rename'));
    const input = within(row).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Percussion' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(libMock.renameLibraryFolder).toHaveBeenCalledWith('f1', 'Percussion')
    );

    fireEvent.click(within(row).getByTitle('Rename'));
    const input2 = within(row).getByRole('textbox');
    fireEvent.keyDown(input2, { key: 'Escape' });
    expect(within(row).queryByRole('textbox')).toBeNull();

    fireEvent.click(within(row).getByTitle('Rename'));
    const input3 = within(row).getByRole('textbox');
    fireEvent.change(input3, { target: { value: '   ' } });
    fireEvent.blur(input3);
    await waitFor(() =>
      expect(libMock.renameLibraryFolder).toHaveBeenCalledWith('f1', 'Folder')
    );
  });

  it('deletes a folder, resetting the active folder when it was selected', async () => {
    libMock.fetchLibraryFolders.mockResolvedValue([makeFolder()]);
    const onSelectFolder = vi.fn();
    renderBrowser({ selectedFolderId: 'f1', onSelectFolder });
    await screen.findByText('Drums');

    fireEvent.click(screen.getByText('Drums'));
    expect(onSelectFolder).toHaveBeenCalledWith('f1');
    fireEvent.click(within(folderRow('Drums')).getByTitle('Delete'));
    await waitFor(() => expect(libMock.deleteLibraryFolder).toHaveBeenCalledWith('f1'));
    expect(onSelectFolder).toHaveBeenCalledWith(null);
  });

  it('previews a sample and stops on second click', async () => {
    libMock.fetchLibrarySamples.mockResolvedValue([makeSample()]);
    renderBrowser();
    await screen.findByText('Kick Fat');
    const row = sampleRow();

    fireEvent.click(within(row).getByTitle('Preview'));
    await waitFor(() => expect(libMock.decodeLibrarySample).toHaveBeenCalledTimes(1));

    fireEvent.click(within(row).getByTitle('Preview'));
    expect(libMock.decodeLibrarySample).toHaveBeenCalledTimes(1);
  });

  it('surfaces a preview error to the errors list', async () => {
    libMock.fetchLibrarySamples.mockResolvedValue([makeSample()]);
    libMock.decodeLibrarySample.mockRejectedValue(new Error('decode exploded'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderBrowser();
    await screen.findByText('Kick Fat');

    fireEvent.click(within(sampleRow()).getByTitle('Preview'));
    await screen.findByText('Could not preview "Kick Fat".');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('uses a sample in the active layer', async () => {
    libMock.fetchLibrarySamples.mockResolvedValue([makeSample()]);
    renderBrowser();
    await screen.findByText('Kick Fat');

    fireEvent.click(within(sampleRow()).getByTitle('Use sample in active layer'));
    await waitFor(() => expect(props.onUseSample).toHaveBeenCalled());
    const [sample, buffer] = props.onUseSample.mock.calls[0];
    expect(sample.id).toBe('s1');
    expect(buffer).toBeDefined();
  });

  it('hides the use-sample button when no onUseSample is provided', async () => {
    libMock.fetchLibrarySamples.mockResolvedValue([makeSample()]);
    renderBrowser({ onUseSample: undefined });
    await screen.findByText('Kick Fat');
    expect(screen.queryByTitle('Use sample in active layer')).toBeNull();
  });

  it('renames a sample via prompt', async () => {
    libMock.fetchLibrarySamples.mockResolvedValue([makeSample()]);
    vi.stubGlobal('prompt', vi.fn(() => 'Kick 2'));
    renderBrowser();
    await screen.findByText('Kick Fat');

    fireEvent.click(within(sampleRow()).getByTitle('Rename'));
    await waitFor(() =>
      expect(libMock.updateLibrarySample).toHaveBeenCalledWith('s1', { name: 'Kick 2' })
    );
  });

  it('deletes a sample after previewing it', async () => {
    libMock.fetchLibrarySamples.mockResolvedValue([makeSample()]);
    renderBrowser();
    await screen.findByText('Kick Fat');
    const row = sampleRow();

    fireEvent.click(within(row).getByTitle('Preview'));
    await waitFor(() => expect(libMock.decodeLibrarySample).toHaveBeenCalledTimes(1));

    fireEvent.click(within(row).getByTitle('Delete'));
    await waitFor(() => expect(libMock.deleteLibrarySample).toHaveBeenCalledWith('s1'));
  });

  it('sets the sample drag payload', async () => {
    libMock.fetchLibrarySamples.mockResolvedValue([makeSample()]);
    renderBrowser();
    await screen.findByText('Kick Fat');
    const row = sampleRow();
    const dataTransfer = { effectAllowed: '', setData: vi.fn() };
    fireEvent.dragStart(row, { dataTransfer });
    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(dataTransfer.setData).toHaveBeenCalledWith(SAMPLE_DRAG_MIME, 's1');
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'Kick Fat');
  });

  it('imports audio files through the hidden file input', async () => {
    libMock.saveLibrarySample.mockResolvedValue('new-id');
    libMock.fetchLibrarySample.mockResolvedValue(makeSample());
    renderBrowser();
    await screen.findByText('No samples yet. Drag audio files here.');

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['audio'], 'kick.wav', { type: 'audio/wav' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(props.onImportExternal).toHaveBeenCalledTimes(1));
    expect(libMock.analyzeLibrarySample).toHaveBeenCalled();
    expect(libMock.saveLibrarySample).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'KICK', folderId: null, category: 'Perc' })
    );
  });

  it('imports dropped files onto the panel', async () => {
    libMock.saveLibrarySample.mockResolvedValue('new-id');
    libMock.fetchLibrarySample.mockResolvedValue(makeSample());
    renderBrowser();
    await screen.findByText('No samples yet. Drag audio files here.');

    const panel = screen.getByText('No samples yet. Drag audio files here.').closest('div')!.parentElement!;
    const file = new File(['audio'], 'drop.wav', { type: 'audio/wav' });
    fireEvent.drop(panel, { dataTransfer: { files: [file] } });
    await waitFor(() => expect(libMock.saveLibrarySample).toHaveBeenCalled());
  });

  it('ignores non-audio files during import', async () => {
    renderBrowser();
    await screen.findByText('No samples yet. Drag audio files here.');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });
    await new Promise((r) => setTimeout(r, 20));
    expect(libMock.saveLibrarySample).not.toHaveBeenCalled();
  });

  it('reports an error when the audio context is unavailable during import', async () => {
    (audioEngine.getContext as any).mockReturnValue(null as any);
    renderBrowser();
    await screen.findByText('No samples yet. Drag audio files here.');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['audio'], 'kick.wav', { type: 'audio/wav' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText('AudioContext unavailable.')).toBeDefined();
  });

  it('records per-file import errors', async () => {
    libMock.saveLibrarySample.mockRejectedValue(new Error('disk full'));
    renderBrowser();
    await screen.findByText('No samples yet. Drag audio files here.');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['audio'], 'kick.wav', { type: 'audio/wav' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText(/kick\.wav: disk full/)).toBeDefined();
  });

  it('toggles the drag-over highlight on the panel', async () => {
    const { container } = renderBrowser();
    await screen.findByText('No samples yet. Drag audio files here.');
    const panel = container.firstChild as HTMLElement;
    fireEvent.dragOver(panel, { dataTransfer: { files: [] } });
    expect(panel.className).toContain('ring-2 ring-blue-500/60');
    fireEvent.dragLeave(panel, { dataTransfer: { files: [] } });
    expect(panel.className).not.toContain('ring-2 ring-blue-500/60');
  });

  it('warns and recovers when the library refresh fails', async () => {
    libMock.fetchLibraryFolders.mockRejectedValue(new Error('db down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderBrowser();
    await waitFor(() => expect(warnSpy).toHaveBeenCalledWith('Sample library refresh failed:', expect.anything()));
    warnSpy.mockRestore();
  });

  it('opens the file picker from the header import button', async () => {
    const { container } = renderBrowser();
    await screen.findByText('No samples yet. Drag audio files here.');
    expect(() => fireEvent.click(screen.getByTitle('Import audio files'))).not.toThrow();
  });

  it('stops the previous preview source and cleans up on unmount', async () => {
    const sources: any[] = [];
    const ctx = makeCtx();
    ctx.createBufferSource = vi.fn(() => {
      const s = { buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
      sources.push(s);
      return s;
    });
    (audioEngine.getContext as any).mockReturnValue(ctx);
    libMock.fetchLibrarySamples.mockResolvedValue([
      makeSample(),
      makeSample({ id: 's2', name: 'Snare Tight', fileName: 'snare.wav', category: 'Snare', tags: [] }),
    ]);
    const { unmount } = renderBrowser();
    await screen.findByText('Kick Fat');

    fireEvent.click(within(sampleRow('Kick Fat')).getByTitle('Preview'));
    await waitFor(() => expect(sources[0]).toBeDefined());

    fireEvent.click(within(sampleRow('Snare Tight')).getByTitle('Preview'));
    await waitFor(() => expect(sources).toHaveLength(2));
    expect(sources[0].stop).toHaveBeenCalled();

    unmount();
    expect(sources[1].stop).toHaveBeenCalled();
  });

  it('clears the playing state when a preview source ends naturally', async () => {
    const sources: any[] = [];
    const ctx = makeCtx();
    ctx.createBufferSource = vi.fn(() => {
      const s = { buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
      sources.push(s);
      return s;
    });
    (audioEngine.getContext as any).mockReturnValue(ctx);
    libMock.fetchLibrarySamples.mockResolvedValue([makeSample()]);
    renderBrowser();
    await screen.findByText('Kick Fat');

    fireEvent.click(within(sampleRow()).getByTitle('Preview'));
    await waitFor(() => expect(sources[0]).toBeDefined());

    expect(() => act(() => sources[0].onended())).not.toThrow();
    // Playing state was cleared, so a fresh click starts a new source instead of stopping.
    fireEvent.click(within(sampleRow()).getByTitle('Preview'));
    await waitFor(() => expect(sources).toHaveLength(2));
    expect(sources[0].stop).not.toHaveBeenCalled();
  });

  it('resumes a suspended audio context before previewing', async () => {
    const ctx = makeCtx();
    ctx.state = 'suspended';
    (audioEngine.getContext as any).mockReturnValue(ctx);
    libMock.fetchLibrarySamples.mockResolvedValue([makeSample()]);
    renderBrowser();
    await screen.findByText('Kick Fat');

    fireEvent.click(within(sampleRow()).getByTitle('Preview'));
    await waitFor(() => expect(ctx.resume).toHaveBeenCalled());
    expect(libMock.decodeLibrarySample).toHaveBeenCalled();
  });

  it('resumes a suspended context and decodes during import', async () => {
    const ctx = makeCtx();
    ctx.state = 'suspended';
    (audioEngine.getContext as any).mockReturnValue(ctx);
    libMock.saveLibrarySample.mockResolvedValue('new-id');
    libMock.fetchLibrarySample.mockResolvedValue(makeSample());
    renderBrowser();
    await screen.findByText('No samples yet. Drag audio files here.');

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['audio'], 'kick.wav', { type: 'audio/wav' })] } });
    await waitFor(() => expect(ctx.resume).toHaveBeenCalled());
    expect(props.onImportExternal).toHaveBeenCalledTimes(1);
  });

  it('warns when folder creation fails', async () => {
    libMock.createLibraryFolder.mockRejectedValue(new Error('perm denied'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderBrowser();
    fireEvent.click(screen.getByTitle('New folder'));
    await waitFor(() => expect(warnSpy).toHaveBeenCalledWith('Failed to create folder', expect.anything()));
    warnSpy.mockRestore();
  });

  it('warns when decoding a sample for use fails', async () => {
    libMock.fetchLibrarySamples.mockResolvedValue([makeSample()]);
    libMock.decodeLibrarySample.mockRejectedValue(new Error('bad'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderBrowser();
    await screen.findByText('Kick Fat');
    fireEvent.click(within(sampleRow()).getByTitle('Use sample in active layer'));
    await waitFor(() => expect(warnSpy).toHaveBeenCalledWith('Could not decode sample for use', expect.anything()));
    expect(props.onUseSample).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

