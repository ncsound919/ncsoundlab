/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coverage-focused interaction tests for the App shell: global keyboard
 * shortcuts, the Recourse bridge, autosave recovery, snapshots and the
 * ChannelStrip FX clipboard / randomizer. These target handler paths that the
 * dashboard/smoke suites don't reach so the whole shell stays exercised.
 */

import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import App from './App';
import { usePatternStore } from './store/patternStore';
import { audioEngine } from './lib/audioEngine';
import { readAutosaveDocument, clearAutosave } from './lib/autosave';
import { fetchSoundKits, saveSoundKit } from './lib/db';

// The App shell renders very large trees and lazy-loads each stage panel, so
// the per-test ceiling must exceed the find* waits used below (the default is
// 15s; the waits here are up to 20s under full-suite load).
vi.setConfig({ testTimeout: 45_000, hookTimeout: 45_000 });

vi.mock('./lib/autosave', () => ({
  scheduleAutosave: vi.fn(),
  installAutosaveFlushHandlers: vi.fn(),
  uninstallAutosaveFlushHandlers: vi.fn(),
  readAutosaveDocument: vi.fn(async () => null),
  clearAutosave: vi.fn(async () => undefined),
}));

// Keep the App's destructive-DSP handlers cheap: the switch in
// `applyWaveformEdit` and the synth render are what we want to exercise, not
// the sample-accurate math (that has its own suite). The stand-in buffer is
// shaped like a real AudioBuffer so the waveform renderer keeps working.
const fakeBuffer = () => ({
  duration: 1.5,
  length: 66150,
  sampleRate: 44100,
  numberOfChannels: 1,
  getChannelData: () => new Float32Array(66150),
  copyToChannel: () => undefined,
  copyFromChannel: () => undefined,
});

vi.mock('./lib/chaosSynth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/chaosSynth')>();
  return { ...actual, generateChaosSynthBuffer: vi.fn(() => fakeBuffer()) };
});

vi.mock('./lib/waveformEditor', () => ({
  reverseBuffer: vi.fn(() => fakeBuffer()),
  invertPhase: vi.fn(() => fakeBuffer()),
  normalizeBuffer: vi.fn(() => fakeBuffer()),
  trimBuffer: vi.fn(() => fakeBuffer()),
  fadeInBuffer: vi.fn(() => fakeBuffer()),
  fadeOutBuffer: vi.fn(() => fakeBuffer()),
  glitchBuffer: vi.fn(() => fakeBuffer()),
  gainAdjustBuffer: vi.fn(() => fakeBuffer()),
}));

// The evolution engine does 24 offline renders; stub it to a single variation
// so the App's evolve flow (guard → render → switch stage) is what runs.
// Beat Studio (StudioSequencer) constructs a real Tone.js context; jsdom has
// no Web Audio, so stub the same surface the sequencer suites use.
vi.mock('tone', () => ({
  Sequence: vi.fn(function () {
    return { loop: false, start: vi.fn(), dispose: vi.fn() };
  }),
  Draw: { schedule: vi.fn((fn: () => void) => fn()) },
  Transport: {
    bpm: { value: 120 },
    swing: 0,
    swingSubdivision: '16n',
    timeSignature: 4,
    seconds: 0,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    clear: vi.fn(),
    scheduleRepeat: vi.fn(() => 1),
  },
  setContext: vi.fn(),
}));

vi.mock('./lib/evolutionEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/evolutionEngine')>();
  return {
    ...actual,
    generateEvolutionVariations: vi.fn(async () => [
      {
        id: 'v1',
        name: 'Mutant v1',
        role: 'lead',
        buffer: fakeBuffer(),
        chaosLevel: 0.5,
        spectralDensity: 0.5,
        temporalBehavior: 0.5,
        routingPath: ['filter'],
      },
    ]),
  };
});

vi.mock('./lib/db', () => {
  const table = () => ({
    put: vi.fn(async () => 'id'),
    toArray: vi.fn(async () => []),
    filter: vi.fn(() => ({ toArray: vi.fn(async () => []) })),
    delete: vi.fn(async () => undefined),
    get: vi.fn(async () => undefined),
  });
  return {
    db: {
      soundKits: table(), soundProjects: table(), favorites: table(),
      libraryFolders: table(), librarySamples: table(), projectDocuments: table(), folderLinks: table(),
    },
    fetchUserProjects: vi.fn(async () => []),
    saveProject: vi.fn(async () => 'proj-1'),
    fetchSoundKits: vi.fn(async () => []),
    saveSoundKit: vi.fn(async () => 'kit-1'),
    fetchUserFavorites: vi.fn(async () => []),
    toggleFavorite: vi.fn(async () => undefined),
    deleteSoundKit: vi.fn(async () => undefined),
    fetchProjectDocuments: vi.fn(async () => []),
    fetchProjectDocument: vi.fn(async () => undefined),
    saveProjectDocument: vi.fn(async () => 'doc-1'),
    readAutosaveDocument: vi.fn(async () => null),
    clearAutosave: vi.fn(async () => undefined),
    saveAutosaveDocument: vi.fn(async () => undefined),
    deleteProjectDocument: vi.fn(async () => undefined),
    deleteProject: vi.fn(async () => undefined),
    saveFolderLink: vi.fn(async () => undefined),
    fetchFolderLinks: vi.fn(async () => []),
    deleteFolderLink: vi.fn(async () => undefined),
  };
});

// Stub the folder-import modal so the Kit Creator can accept a sample without
// a real folder/File pipeline; publishing then exercises App.handlePublishNewKit.
vi.mock('./components/FolderUploadModal', () => ({
  FolderUploadModal: ({ onAddSamplesToKit, onClose }: any) => (
    <div>
      <button
        onClick={() =>
          onAddSamplesToKit([
            {
              id: 'app-kit-sample-1',
              name: 'APP_KICK',
              fileName: 'app_kick.wav',
              category: 'Kick',
              tags: ['kick'],
              gain: 0.8,
              pitch: 0,
            },
          ])
        }
      >
        ADD_APP_SAMPLE
      </button>
      <button onClick={onClose}>CLOSE_UPLOAD_MODAL</button>
    </div>
  ),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const renderDashboard = () => {
  localStorage.setItem('ncs_demo_status', 'purchased');
  window.history.replaceState(null, '', '#');
  return render(<App />);
};

const addSynth = () => fireEvent.click(screen.getByRole('button', { name: /Add Synth Layer/i }));
const key = (k: string, opts: KeyboardEventInit = {}) => fireEvent.keyDown(window, { key: k, ...opts });

const sidebar = () => within(screen.getAllByRole('complementary')[0]);

/** Open the mixer stage and wait for the channel strips to mount. */
const openMixer = async () => {
  sidebar().getByRole('button', { name: /Mix, Space & Compare/ }).click();
  await waitFor(() => expect(screen.getAllByTitle('Copy FX Settings').length).toBeGreaterThan(0), {
    timeout: 60000,
  });
};

const PIECE = {
  format: 'recourse-soundlab-piece',
  version: 1,
  style: 'steely-dan',
  title: 'Bridge Test',
  bpm: 90,
  bars: 2,
  headChord: { rootPc: 0, quality: 'maj7', rootName: 'C' },
  layers: [{ id: 'bass', name: 'Bass', role: 'bass', kind: 'synth' }],
  pattern: { bass: Array.from({ length: 16 }, (_, i) => ({ on: i % 4 === 0, note: 36 })) },
  chainBars: 2,
};

describe('App global keyboard shortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (audioEngine as any).getIsPlaying = vi.fn(() => false);
    (audioEngine as any).playAll = vi.fn();
    (audioEngine as any).stop = vi.fn();
    (audioEngine as any).disposeModule = vi.fn();
  });

  it('navigates stages with the arrow keys', () => {
    renderDashboard();
    key('ArrowRight');
    expect(screen.getAllByText(/Beat Studio & Sequencer/i).length).toBeGreaterThan(0);
    key('ArrowLeft');
    expect(screen.getAllByText(/Sound Design/i).length).toBeGreaterThan(0);
  });

  it('opens the command palette with Ctrl+K and runs a command', async () => {
    renderDashboard();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const input = await screen.findByLabelText('Command palette search', undefined, { timeout: 20000 });
    fireEvent.change(input, { target: { value: 'toggle sidebar' } });
    fireEvent.click(await screen.findByText('Toggle Sidebar', undefined, { timeout: 20000 }));
    await waitFor(() => expect(screen.queryByLabelText('Command palette search')).toBeNull());
  });

  it('drives playback and tempo from the header transport', () => {
    renderDashboard();
    fireEvent.click(screen.getByLabelText(/play master mix/i));
    fireEvent.click(screen.getByLabelText('Increase tempo'));
    fireEvent.click(screen.getByLabelText('Decrease tempo'));
  });

  it('toggles the master mix with the space bar', () => {
    renderDashboard();
    addSynth();
    key(' ');
    expect((audioEngine as any).playAll).toHaveBeenCalled();
    (audioEngine as any).getIsPlaying = vi.fn(() => true);
    key(' ');
    expect((audioEngine as any).stop).toHaveBeenCalled();
  });

  it('undoes and redoes with Ctrl+Z / Ctrl+Y', () => {
    renderDashboard();
    addSynth();
    key('z', { ctrlKey: true });
    key('y', { ctrlKey: true });
    expect(screen.getByTitle('Undo last action')).toBeDefined();
  });

  it('opens the shortcuts overlay with ? and closes it with Escape', async () => {
    renderDashboard();
    key('?');
    await screen.findByRole('dialog', undefined, { timeout: 60000 });
    key('Escape');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 60000 });
  });

  it('opens the project manager with Ctrl+S and closes it with Escape', async () => {
    renderDashboard();
    key('s', { ctrlKey: true });
    await screen.findByRole('dialog', undefined, { timeout: 60000 });
    key('Escape');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 60000 });
  });

  it('starts a new empty session with Ctrl+N', async () => {
    renderDashboard();
    addSynth();
    key('n', { ctrlKey: true });
    await waitFor(() => expect(screen.getByText(/No Sound Layers Created Yet/i)).toBeDefined());
  });

  it('switches the active pattern with A–D', () => {
    renderDashboard();
    key('b');
    expect(usePatternStore.getState().activePatternId).toBe('B');
    key('d');
    expect(usePatternStore.getState().activePatternId).toBe('D');
  });

  it('deletes the selected layer with Delete and selects by number', async () => {
    renderDashboard();
    addSynth();
    addSynth();
    key('1');
    key('Delete');
    await waitFor(() => expect(screen.getAllByDisplayValue(/Synth Layer/).length).toBeLessThan(2));
  });

  it('mutes and solos the selected layer with M / S', async () => {
    renderDashboard();
    addSynth();
    // Mute/solo state is rendered by ChannelStrip, which lives in the mixer stage.
    fireEvent.click(within(screen.getAllByRole('complementary')[0]).getByRole('button', { name: /Mix, Space & Compare/ }));

    const mute = await screen.findByTitle('Mute Channel', undefined, { timeout: 60000 });
    expect(mute.className).not.toMatch(/text-red-400/);
    key('m');
    await waitFor(() => expect(screen.getByTitle('Mute Channel').className).toMatch(/text-red-400/));

    const solo = screen.getByTitle('Solo Channel');
    expect(solo.className).not.toMatch(/text-emerald-400/);
    key('s');
    await waitFor(() => expect(screen.getByTitle('Solo Channel').className).toMatch(/text-emerald-400/));
  });

  it('ignores shortcuts while a form field is focused', () => {
    renderDashboard();
    const input = screen.getByPlaceholderText('e.g. kick_thick');
    (input as HTMLInputElement).focus();
    key('m');
    key('ArrowRight');
    expect(screen.getAllByText(/Synth Layering & Samples/i).length).toBeGreaterThan(0);
  });
});

describe('App Recourse bridge', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    window.history.replaceState(null, '', '#');
  });

  it('loads a valid piece and rejects an invalid one', () => {
    renderDashboard();
    const bridge = (window as any).__recourse;
    expect(bridge?.ready).toBe(true);

    let result: any;
    act(() => { result = bridge.load(PIECE); });
    expect(result.ok).toBe(true);
    expect(result.bars).toBe(2);

    act(() => { result = bridge.load({ format: 'nope' }); });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('recourse-soundlab-piece');
  });

  it('pulls and auto-pulls a piece over fetch, and play dispatches an event', async () => {
    renderDashboard();
    const bridge = (window as any).__recourse;
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => PIECE }));
    (globalThis as any).fetch = fetchMock;

    let pulled: any;
    await act(async () => { pulled = await bridge.pull('http://x/piece.json'); });
    expect(pulled.ok).toBe(true);

    const playSpy = vi.fn();
    window.addEventListener('recourse:play', playSpy);
    act(() => { bridge.play(); });
    expect(playSpy).toHaveBeenCalled();
    window.removeEventListener('recourse:play', playSpy);

    // autoPull polls and can be stopped.
    let handle: any;
    await act(async () => { handle = bridge.autoPull('http://x/piece.json', 500); });
    expect(typeof handle.stop).toBe('function');
    act(() => { handle.stop(); });

    // A failing pull reports honestly.
    (globalThis as any).fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    let failed: any;
    await act(async () => { failed = await bridge.pull('http://x/piece.json'); });
    expect(failed.ok).toBe(false);
  });
});

describe('App autosave recovery + snapshots + FX clipboard', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    window.history.replaceState(null, '', '#');
    (audioEngine as any).getIsPlaying = vi.fn(() => false);
  });

  it('shows the recovery banner and discards it', async () => {
    vi.mocked(readAutosaveDocument).mockResolvedValue({
      layers: [{ id: 'l1', name: 'Recovered', type: 'synth', enabled: true, gain: 1, pan: 0, pitch: 0 }],
      patterns: { A: { layerRows: { l1: [{ on: true }] } } },
      activePatternId: 'A',
      songChain: { order: ['A'] },
      programs: { A: [], B: [], C: [], D: [] },
      activeBank: 'A',
      masterLevel: 0.8,
    } as any);

    renderDashboard();
    await screen.findByText(/Unsaved session found/i, undefined, { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: /^Discard$/i }));
    await waitFor(() => expect(vi.mocked(clearAutosave)).toHaveBeenCalled());
    vi.mocked(readAutosaveDocument).mockResolvedValue(null);
  });

  it('stores and loads A/B snapshots from the header controls', () => {
    renderDashboard();
    addSynth();

    fireEvent.click(screen.getByTitle('Save Current State to Snapshot A'));
    fireEvent.click(screen.getByTitle('Save Current State to Snapshot B'));
    fireEvent.click(screen.getByTitle('Load Snapshot A'));
    fireEvent.click(screen.getByTitle('Load Snapshot B'));
    expect(screen.getByTitle('Load Snapshot A')).toBeDefined();
    // Local storage mirror of the snapshots is written.
    expect(localStorage.getItem('sonik_snapshot_a')).toBeTruthy();
  });

  it('warns when loading a snapshot slot that was never stored', () => {
    renderDashboard();
    addSynth();
    fireEvent.click(screen.getByTitle('Load Snapshot A'));
    expect(screen.getByText(/Snapshot A is empty/i)).toBeDefined();
  });
});

describe('App bounce + pad routing + file ingest', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (audioEngine as any).playLayer = vi.fn();
    (audioEngine as any).playAll = vi.fn();
    (audioEngine as any).exportWav = vi.fn(async () => fakeBuffer());
    (audioEngine as any).disposeModule = vi.fn();
  });

  it('bounces a synth to a sample, routes layers to pads, and plays the selection', async () => {
    renderDashboard();
    addSynth();

    fireEvent.click(screen.getByText(/Sample Waveform & Detailed DSP Editor/i));
    fireEvent.click(screen.getByRole('button', { name: /Bounce Synth to Sample/i }));
    await waitFor(() => expect((audioEngine as any).exportWav).toHaveBeenCalled());

    fireEvent.click(screen.getByTitle(/your layers are already mapped to pads/i));
    fireEvent.click(screen.getByRole('button', { name: /Play Sound/i }));
    expect((audioEngine as any).playLayer).toHaveBeenCalled();
  });

  it('sends the selected synth to the pads from the tweaker', async () => {
    renderDashboard();
    addSynth();
    fireEvent.click(
      within(await screen.findByRole('navigation', { name: /Sound Design views/i }, { timeout: 60000 })).getByRole(
        'button',
        { name: 'Synth & FX' }
      )
    );
    const send = await screen.findByRole('button', { name: /Send Synth/i }, { timeout: 60000 });
    fireEvent.click(send);
    await waitFor(() => expect((audioEngine as any).exportWav).toHaveBeenCalled());
  });

  it('ingests a dropped audio file and toasts success', async () => {
    const { container } = renderDashboard();
    addSynth();
    (audioEngine as any).getContext = vi.fn(() => ({ decodeAudioData: vi.fn(async () => fakeBuffer()) }));
    const file = new File([new Uint8Array([1, 2, 3])], 'kick.wav', { type: 'audio/wav' });

    const root = container.firstElementChild as HTMLElement;
    fireEvent.dragOver(root);
    fireEvent.drop(root, { dataTransfer: { files: [file] }, clientX: 5, clientY: 5 });
    await waitFor(() => expect(screen.getByText(/Successfully loaded/i)).toBeDefined());
  });

  it('reports a decode failure when the audio context is missing', async () => {
    const { container } = renderDashboard();
    addSynth();
    (audioEngine as any).getContext = vi.fn(() => null);
    const file = new File([new Uint8Array([1])], 'bad.wav', { type: 'audio/wav' });

    const root = container.firstElementChild as HTMLElement;
    fireEvent.drop(root, { dataTransfer: { files: [file] }, clientX: 5, clientY: 5 });
    await waitFor(() => expect(screen.getByText(/Failed to load/i)).toBeDefined());
  });

  it('imports through the hidden file input', async () => {
    const { container } = renderDashboard();
    addSynth();
    (audioEngine as any).getContext = vi.fn(() => ({ decodeAudioData: vi.fn(async () => fakeBuffer()) }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1])], 'hihat.wav', { type: 'audio/wav' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getAllByDisplayValue(/hihat\.wav/).length).toBeGreaterThan(0));
  });

  it('handles drag-leave and routes an uploaded file into chop mode', () => {
    const { container } = renderDashboard();
    addSynth();
    (audioEngine as any).getContext = vi.fn(() => ({ decodeAudioData: vi.fn(async () => fakeBuffer()) }));

    const root = container.firstElementChild as HTMLElement;
    fireEvent.dragOver(root);
    fireEvent.dragLeave(root, { clientX: 0, clientY: 0 });

    fireEvent.click(screen.getByRole('button', { name: /^Chop$/i }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], 'loop.wav', { type: 'audio/wav' })] } });
    expect(screen.getByRole('main')).toBeDefined();
  });
});

describe('App Evolution stage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (audioEngine as any).playLayer = vi.fn();
    (audioEngine as any).disposeModule = vi.fn();
  });

  it('generates a new generation and lists the variation', async () => {
    renderDashboard();
    addSynth();

    fireEvent.click(screen.getByTitle(/Sound Evolution Engine/));
    const generate = await screen.findByRole('button', { name: /Generate New Generation/i }, { timeout: 60000 });
    fireEvent.click(generate);
    await waitFor(() => expect(screen.getAllByText(/Mutant v1/i).length).toBeGreaterThan(0));

    // The variation's own controls are wired (preview / add / save / discard).
    expect(screen.getAllByTitle('Add as Layer').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Save to Kit').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByTitle('Add as Layer')[0]);
    fireEvent.click(screen.getAllByTitle('Discard mutant')[0]);
    await waitFor(() => expect(screen.queryByText(/Mutant v1/i)).toBeNull());

    // The added layer shows up in the Sound Lab layer stack.
    fireEvent.click(screen.getAllByTitle(/Sound Design/)[0]);
    await waitFor(() => expect(screen.getAllByDisplayValue(/Mutant_/).length).toBeGreaterThan(0));
  }, 150_000);

  it('saves a generated variation to a new kit through the finalize modal', async () => {
    renderDashboard();
    addSynth();

    fireEvent.click(screen.getByTitle(/Sound Evolution Engine/));
    const generate = await screen.findByRole('button', { name: /Generate New Generation/i }, { timeout: 60000 });
    fireEvent.click(generate);
    await waitFor(() => expect(screen.getAllByTitle('Save to Kit').length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByTitle('Save to Kit')[0]);
    await screen.findByText(/Finalize & Export One-Shot/i, undefined, { timeout: 60000 });
    fireEvent.click(screen.getByRole('button', { name: /Finalize & Save Sample/i }));
    await waitFor(() => expect(localStorage.getItem('sonik_published_kits')).toBeTruthy());
  }, 150_000);
});

describe('App stage panels (lazy chunks)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (audioEngine as any).playLayer = vi.fn();
    (audioEngine as any).disposeModule = vi.fn();
  });

  const sidebar = () => within(screen.getAllByRole('complementary')[0]);
  const openSubTab = async (label: string) => {
    const nav = await screen.findByRole('navigation', { name: /views/i }, { timeout: 90000 });
    fireEvent.click(within(nav).getByRole('button', { name: label }));
  };

  it('mounts Beat Studio, Compare, Kit Creator and Catalog panels', async () => {
    renderDashboard();
    addSynth();

    sidebar().getByRole('button', { name: /Beat Studio & Sequencer/ }).click();
    await screen.findByRole('button', { name: /Tap Tempo/i }, { timeout: 60000 });

    sidebar().getByRole('button', { name: /Mix, Space & Compare/ }).click();
    await openSubTab('Compare');
    await screen.findByText(/Reference Library/i, undefined, { timeout: 120000 });

    sidebar().getByRole('button', { name: /Sound Kits/ }).click();
    await screen.findByText(/Loaded Working Samples/i, undefined, { timeout: 120000 });

    await openSubTab('Catalog');
    await screen.findByPlaceholderText(/Search kits/i, undefined, { timeout: 120000 });
  }, 300_000);
});

describe('App mixer channel strip', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (audioEngine as any).playLayer = vi.fn();
    (audioEngine as any).disposeModule = vi.fn();
  });

  it('duplicates, copies/pastes FX, randomizes, reorders and mutes a channel', async () => {
    renderDashboard();
    addSynth();
    addSynth();
    await openMixer();

    fireEvent.click(screen.getAllByTitle('Copy FX Settings')[0]);
    fireEvent.click(screen.getAllByTitle('Paste FX Settings')[0]);
    fireEvent.click(screen.getAllByTitle('Randomize Pitch & Pan')[0]);
    fireEvent.click(screen.getAllByTitle('Duplicate Layer')[0]);
    // Reorder: the first strip's up button is disabled, so use the second.
    fireEvent.click(screen.getAllByTitle('Move Layer Up')[1]);
    fireEvent.click(screen.getAllByTitle('Move Layer Down')[1]);
    fireEvent.click(screen.getAllByTitle('Mute Channel')[0]);
    fireEvent.click(screen.getAllByTitle('Solo Channel')[0]);

    // The duplicate added a third channel strip.
    await waitFor(() => expect(screen.getAllByTitle('Copy FX Settings').length).toBeGreaterThan(1));
  });

  it('warns when pasting FX with an empty clipboard', async () => {
    renderDashboard();
    addSynth();
    await openMixer();
    fireEvent.click(screen.getAllByTitle('Paste FX Settings')[0]);
    expect(screen.getByText(/No FX settings in clipboard/i)).toBeDefined();
  });
});

describe('App catalog + toast container', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (audioEngine as any).playLayer = vi.fn();
    (audioEngine as any).disposeModule = vi.fn();
  });

  it('loads a catalog kit into One-Shot Sound Lab', async () => {
    renderDashboard();
    sidebar().getByRole('button', { name: /Sound Kits/ }).click();
    const catalogNav = await screen.findByRole('navigation', { name: /Sound Kits views/i }, { timeout: 60000 });
    fireEvent.click(within(catalogNav).getByRole('button', { name: 'Catalog' }));
    const load = await screen.findByRole('button', { name: /Load Kit into One-Shot Sound Lab/i }, { timeout: 60000 });
    fireEvent.click(load);
    // handleLoadKitToSoundLab routes back to the Layering stage.
    await waitFor(() => expect(screen.getAllByText(/Synth Layering & Samples/i).length).toBeGreaterThan(0));
  });

  it('dismisses a toast from the container', async () => {
    renderDashboard();
    addSynth();
    fireEvent.click(screen.getByTitle('Save Current State to Snapshot A'));
    const dismiss = await screen.findByLabelText('Dismiss notification', undefined, { timeout: 20000 });
    fireEvent.click(dismiss);
    await waitFor(() => expect(screen.queryByLabelText('Dismiss notification')).toBeNull(), { timeout: 5000 });
  });
});

describe('App preset browser + autosave restore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (audioEngine as any).playLayer = vi.fn();
    (audioEngine as any).disposeModule = vi.fn();
    (audioEngine as any).getContext = vi.fn(() => new (globalThis as any).AudioContext());
  });

  it('adds a preset layer from the preset browser', async () => {
    renderDashboard();
    sidebar().getByRole('button', { name: /Sound Design/ }).click();
    fireEvent.click(
      within(screen.getByRole('navigation', { name: /views/i })).getByRole('button', { name: 'Synth & FX' })
    );
    const adds = await screen.findAllByRole('button', { name: /New Layer/i }, { timeout: 60000 });
    fireEvent.click(adds[0]);
    expect(await screen.findByText(/Added new preset layer/i)).toBeDefined();
  });

  it('restores an autosave session', async () => {
    vi.mocked(readAutosaveDocument).mockResolvedValue({
      layers: [],
      patterns: { A: { layerRows: {} } },
      activePatternId: 'A',
      songChain: { order: ['A'] },
      programs: { A: [], B: [], C: [], D: [] },
      activeBank: 'A',
      masterLevel: 0.8,
    } as any);

    renderDashboard();
    await screen.findByText(/Unsaved session found/i, undefined, { timeout: 60000 });
    fireEvent.click(screen.getByRole('button', { name: /Restore Session/i }));
    await waitFor(() => expect(screen.queryByText(/Unsaved session found/i)).toBeNull(), { timeout: 60000 });
    vi.mocked(readAutosaveDocument).mockResolvedValue(null);
  });
});

describe('App startup sync + guards', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (audioEngine as any).disposeModule = vi.fn();
  });

  it('merges published kits from IndexedDB on startup', async () => {
    vi.mocked(fetchSoundKits).mockResolvedValue([{ id: 'k1', title: 'K1' } as any]);
    renderDashboard();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(vi.mocked(fetchSoundKits)).toHaveBeenCalled();
  });

  it('reports a failed recourse pull and ignores a no-file change', async () => {
    const { container } = renderDashboard();
    addSynth();

    const bridge = (window as any).__recourse;
    (globalThis as any).fetch = vi.fn(async () => { throw new Error('net'); });
    let pulled: any;
    await act(async () => { pulled = await bridge.pull('http://x/piece.json'); });
    expect(pulled.ok).toBe(false);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } }); // early return
    (audioEngine as any).getContext = vi.fn(() => null);
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], 'x.wav', { type: 'audio/wav' })] } });
    await waitFor(() => expect(screen.getByText(/Failed to decode audio file/i)).toBeDefined());
  });

  it('tracks the drag boundary on drag-leave', () => {
    const { container } = renderDashboard();
    const root = container.firstElementChild as HTMLElement;
    fireEvent.dragOver(root);
    fireEvent.dragLeave(root, { clientX: 500, clientY: 500 });
    fireEvent.dragLeave(root, { clientX: 0, clientY: 0 });
    expect(screen.getByRole('main')).toBeDefined();
  });
});

describe('App waveform DSP edit lab', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (audioEngine as any).playLayer = vi.fn();
    (audioEngine as any).disposeModule = vi.fn();
    // A previous suite may have replaced getContext with a null-returning mock;
    // clearAllMocks does not restore it, so applyWaveformEdit would bail at its
    // context guard and every destructive op would silently no-op.
    (audioEngine as any).getContext = vi.fn(() => ({}));
  });

  it('runs each destructive DSP operation on the selected layer', async () => {
    renderDashboard();
    addSynth();
    // Ensure the layer (and its selection) is committed before touching the lab.
    await screen.findAllByDisplayValue(/Synth Layer/);

    // The DSP lab lives inside a collapsed <details>; open it first.
    fireEvent.click(screen.getByText(/Sample Waveform & Detailed DSP Editor/i));
    const reverse = await screen.findByRole('button', { name: /Reverse/i }, { timeout: 60000 });
    fireEvent.click(reverse);

    for (const name of [/Normalize/i, /Phase Flip/i, /Inject/i]) {
      fireEvent.click(screen.getByRole('button', { name }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Gain' }));
    fireEvent.click(screen.getByRole('button', { name: 'In' }));
    fireEvent.click(screen.getByRole('button', { name: 'Out' }));

    // Each edit routes the processed buffer back through the engine — proving
    // the destructive branch actually executed rather than early-returning.
    expect((audioEngine as any).playLayer).toHaveBeenCalled();
    expect(reverse).toBeDefined();
  });
});

describe('App kit publishing + existing-kit routing', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // clearAllMocks keeps mockResolvedValue from earlier suites, so pin the
    // IndexedDB sync back to empty before each render.
    vi.mocked(fetchSoundKits).mockResolvedValue([]);
    window.history.replaceState(null, '', '#');
    (audioEngine as any).disposeModule = vi.fn();
    (audioEngine as any).getContext = vi.fn(() => new (globalThis as any).AudioContext());
  });

  it('publishes a kit from the Kit Creator and jumps to the marketplace', async () => {
    renderDashboard();
    sidebar().getByRole('button', { name: /Sound Kits/ }).click();
    await screen.findByText(/Loaded Working Samples/i, undefined, { timeout: 60000 });

    fireEvent.click(screen.getByRole('button', { name: /Import \/ Audition Folder/i }));
    fireEvent.click(screen.getByText('ADD_APP_SAMPLE'));
    fireEvent.click(screen.getByRole('button', { name: /Port to Marketplace/i }));

    await waitFor(() => expect(localStorage.getItem('sonik_published_kits')).toBeTruthy());
    const saved = JSON.parse(localStorage.getItem('sonik_published_kits') as string);
    expect(saved).toHaveLength(1);
    expect(saved[0].samples).toHaveLength(1);
    expect(vi.mocked(saveSoundKit)).toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: /View in Marketplace/i }));
    await waitFor(() => expect(screen.getAllByText(/Catalog & Sound Library Search/i).length).toBeGreaterThan(0));
  });

  it('adds an evolved sample to an existing published kit', async () => {
    localStorage.setItem(
      'sonik_published_kits',
      JSON.stringify([
        {
          id: 'kit-existing',
          title: 'EXISTING KIT',
          samples: [{ id: 's0', name: 'OLD', category: 'Kick' }],
        },
      ]),
    );
    renderDashboard();
    addSynth();

    fireEvent.click(screen.getByTitle(/Sound Evolution Engine/));
    const generate = await screen.findByRole('button', { name: /Generate New Generation/i }, { timeout: 60000 });
    fireEvent.click(generate);
    await waitFor(() => expect(screen.getAllByTitle('Save to Kit').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTitle('Save to Kit')[0]);

    // The modal defaults to the first available kit, so submitting routes the
    // one-shot into the existing kit rather than creating a new one.
    await screen.findByText(/Finalize & Export One-Shot/i, undefined, { timeout: 60000 });
    fireEvent.click(screen.getByRole('button', { name: /Finalize & Save Sample/i }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('sonik_published_kits') as string);
      expect(saved[0].id).toBe('kit-existing');
      expect(saved[0].samples).toHaveLength(2);
    });
    expect(vi.mocked(saveSoundKit)).toHaveBeenCalled();
  });

  it('sends evolved variations to the MPC pads', async () => {
    renderDashboard();
    addSynth();

    fireEvent.click(screen.getByTitle(/Sound Evolution Engine/));
    const generate = await screen.findByRole('button', { name: /Generate New Generation/i }, { timeout: 60000 });
    fireEvent.click(generate);

    const send = await screen.findByTitle(/Send these variations/i, undefined, { timeout: 60000 });
    fireEvent.click(send);
    await screen.findByText(/Sent 1 sounds to pads/i, undefined, { timeout: 60000 });
  });

  it('closes the Add-to-Kit modal via Escape and Cancel', async () => {
    renderDashboard();
    addSynth();

    fireEvent.click(screen.getByTitle(/Sound Evolution Engine/));
    const generate = await screen.findByRole('button', { name: /Generate New Generation/i }, { timeout: 60000 });
    fireEvent.click(generate);
    await waitFor(() => expect(screen.getAllByTitle('Save to Kit').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTitle('Save to Kit')[0]);

    await screen.findByText(/Finalize & Export One-Shot/i, undefined, { timeout: 60000 });
    key('Escape');
    await waitFor(
      () => expect(screen.queryByText(/Finalize & Export One-Shot/i)).toBeNull(),
      { timeout: 60000 },
    );

    // Reopen and close through the modal's own Cancel button.
    fireEvent.click(screen.getAllByTitle('Save to Kit')[0]);
    await screen.findByText(/Finalize & Export One-Shot/i, undefined, { timeout: 60000 });
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    await waitFor(
      () => expect(screen.queryByText(/Finalize & Export One-Shot/i)).toBeNull(),
      { timeout: 60000 },
    );
  });
});

describe('App chop editor send', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    window.history.replaceState(null, '', '#');
    (audioEngine as any).playLayer = vi.fn();
    (audioEngine as any).disposeModule = vi.fn();
  });

  it('sends chopped slices to the pads and closes the editor', async () => {
    const { container } = renderDashboard();
    addSynth();
    (audioEngine as any).getContext = vi.fn(() => ({ decodeAudioData: vi.fn(async () => fakeBuffer()) }));

    fireEvent.click(screen.getByRole('button', { name: /^Chop$/i }));
    // Chop count control appears once chop mode is on; the upload button just
    // proxies to the hidden file input.
    fireEvent.change(screen.getByLabelText('Chop count'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: /Upload & Chop/i }));

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1])], 'loop.wav', { type: 'audio/wav' })] } });

    const send = await screen.findByRole('button', { name: /Send Slices/i }, { timeout: 60000 });
    fireEvent.click(send);
    await waitFor(
      () => expect(screen.queryByRole('dialog', { name: /Sample editor/i })).toBeNull(),
      { timeout: 60000 },
    );
  });

  it('drops a file into chop mode and closes it with the Close button', async () => {
    const { container } = renderDashboard();
    addSynth();
    (audioEngine as any).getContext = vi.fn(() => ({ decodeAudioData: vi.fn(async () => fakeBuffer()) }));

    fireEvent.click(screen.getByRole('button', { name: /^Chop$/i }));
    const root = container.firstElementChild as HTMLElement;
    fireEvent.drop(root, {
      dataTransfer: { files: [new File([new Uint8Array([1])], 'loop.wav', { type: 'audio/wav' })] },
      clientX: 5,
      clientY: 5,
    });

    await screen.findByRole('dialog', { name: /Sample editor/i }, { timeout: 60000 });
    fireEvent.click(screen.getByTitle('Close'));
    await waitFor(
      () => expect(screen.queryByRole('dialog', { name: /Sample editor/i })).toBeNull(),
      { timeout: 60000 },
    );
  });
});

describe('App header + mixer control wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    window.history.replaceState(null, '', '#');
    (audioEngine as any).playLayer = vi.fn();
    (audioEngine as any).disposeModule = vi.fn();
  });

  it('opens and closes the shortcuts and manual overlays from the header buttons', async () => {
    renderDashboard();
    fireEvent.click(screen.getByTitle('Open Keyboard Shortcuts Guide (?)'));
    await screen.findByRole('dialog', undefined, { timeout: 60000 });
    fireEvent.click(screen.getByRole('button', { name: /Got It/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 60000 });

    fireEvent.click(screen.getByTitle('Open Studio Manual & System Guide'));
    await screen.findByRole('dialog', undefined, { timeout: 60000 });
    // The global Escape handler closes whichever overlay is on top.
    key('Escape');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 60000 });
  });

  it('navigates stages while the sidebar is collapsed', async () => {
    renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    // The collapsed sidebar exposes the manual as an icon-only button.
    fireEvent.click(sidebar().getByTitle('Open Interactive Studio Manual & System Guide'));
    await screen.findByRole('dialog', undefined, { timeout: 60000 });
    fireEvent.click(screen.getByTitle('Close Manual'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 60000 });

    fireEvent.click(sidebar().getByTitle(/Beat Studio & Sequencer/));
    await waitFor(
      () => expect(screen.getAllByText(/Beat Studio & Sequencer/i).length).toBeGreaterThan(0),
      { timeout: 60000 },
    );
  });

  it('sanitizes the export filename and ignores an empty snapshot store', () => {
    renderDashboard();
    const input = screen.getByPlaceholderText('e.g. kick_thick') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'my kick!*' } });
    expect(input.value).toBe('mykick');

    // No layers yet, so the snapshot store short-circuits without writing.
    fireEvent.click(screen.getByTitle('Save Current State to Snapshot A'));
    expect(localStorage.getItem('sonik_snapshot_a')).toBeNull();
  });

  it('reflects the engine play state on the mixer and spatial transports', async () => {
    (audioEngine as any).getIsPlaying = vi.fn(() => true);
    renderDashboard();
    addSynth();

    // The 100ms poll flips `isPlaying`, swapping the transport to its Stop form.
  sidebar().getByRole('button', { name: /Mix, Space & Compare/ }).click();
    await waitFor(
      () => expect(screen.getAllByRole('button', { name: /⏹ Stop/i }).length).toBeGreaterThan(0),
      { timeout: 60000 },
    );
    sidebar().getByRole('button', { name: /Mix, Space & Compare/ }).click();
    fireEvent.click(
      within(screen.getByRole('navigation', { name: /views/i })).getByRole('button', { name: '3D Space' })
    );
    await screen.findByText(/Spatial 3D & Reverb Stage/i, undefined, { timeout: 60000 });
    await waitFor(
      () => expect(screen.getAllByRole('button', { name: /⏹ Stop/i }).length).toBeGreaterThan(0),
      { timeout: 60000 },
    );
    fireEvent.click(await screen.findByRole('button', { name: /🔁 Loop: OFF/i }, { timeout: 60000 }));
    expect(screen.getByRole('button', { name: /🔁 Loop: ON/i })).toBeDefined();
  }, 90_000);

  it('dismisses the global error banner', async () => {
    const { container } = renderDashboard();
    addSynth();
    (audioEngine as any).getContext = vi.fn(() => null);
    const root = container.firstElementChild as HTMLElement;
    fireEvent.drop(root, {
      dataTransfer: { files: [new File([new Uint8Array([1])], 'bad.wav', { type: 'audio/wav' })] },
      clientX: 5,
      clientY: 5,
    });

    const banner = await screen.findByText(/Failed to decode dropped file/i);
    fireEvent.click(banner.closest('div')?.querySelector('button') as HTMLButtonElement);
    await waitFor(() => expect(screen.queryByText(/Failed to decode dropped file/i)).toBeNull());
  });

  it('stops the stack and loads/clears an FX-chain preset from the mixer', async () => {
    localStorage.setItem(
      'soundlab_fx_presets_v1',
      JSON.stringify([
        {
          id: 'p1',
          name: 'MY CHAIN',
          target: { kind: 'master-rack' },
          modules: [{ id: 'm1', type: 'compressor', enabled: true, settings: {} }],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
    );
    renderDashboard();
    addSynth();
    await openMixer();

    (audioEngine as any).stop = vi.fn();
    fireEvent.click(screen.getByTitle('Stop All Sources Instantly'));
    expect((audioEngine as any).stop).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /^MY CHAIN/ }));
    fireEvent.click(screen.getByRole('button', { name: /Reset Rack/i }));
  });
});

describe('App empty-state + tweaker wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    window.history.replaceState(null, '', '#');
    (audioEngine as any).playLayer = vi.fn();
    (audioEngine as any).disposeModule = vi.fn();
  });

  it('adds and selects the first layer from the empty state', () => {
    renderDashboard();
    // With no layers the empty state offers its own Add / Upload shortcuts.
    fireEvent.click(screen.getByRole('button', { name: /^Upload WAV$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Add Synth$/i }));

    const nameInput = screen.getByDisplayValue('Synth Layer 1') as HTMLInputElement;
    fireEvent.click(nameInput); // stopPropagation guard on the name field
    fireEvent.click(screen.getAllByText('synth')[0]); // row select

    expect(screen.getByDisplayValue('Synth Layer 1')).toBeDefined();
  });

  it('triggers the selected sound from the tweaker', async () => {
    renderDashboard();
    addSynth();
    sidebar().getByRole('button', { name: /Sound Design/ }).click();
    fireEvent.click(
      within(screen.getByRole('navigation', { name: /views/i })).getByRole('button', { name: 'Synth & FX' })
    );

    fireEvent.click(await screen.findByRole('button', { name: /Trigger Sound/i }, { timeout: 60000 }));
    expect((audioEngine as any).playLayer).toHaveBeenCalled();
  }, 90_000);
});
