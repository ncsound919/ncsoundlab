/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the Tier 2 program work in the studio sequencer: keygroup-style
 * chromatic sample playback, pad mute sync, pad copy/paste/swap, named
 * program presets (save → list → load with missing-layer reporting), and the
 * synth auto-sampler.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';

const toneState = vi.hoisted(() => {
  let sequenceCallback: ((time: number, stepIdx: number) => void) | null = null;
  const mockSequence = vi.fn(function (this: unknown, cb: (time: number, stepIdx: number) => void) {
    sequenceCallback = cb;
    return { loop: false, start: vi.fn(), dispose: vi.fn() };
  });
  return {
    get sequenceCallback() { return sequenceCallback; },
    set sequenceCallback(cb) { sequenceCallback = cb; },
    mockSequence,
  };
});

vi.mock('tone', () => ({
  Sequence: toneState.mockSequence,
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

const transportMocks = vi.hoisted(() => ({
  play: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('../audio/transport/transport', () => ({
  initTransport: vi.fn(),
  getTransport: vi.fn(() => ({
    setBpm: vi.fn(),
    setTimeSignature: vi.fn(),
    setSwing: vi.fn(),
    play: transportMocks.play,
    pause: vi.fn(),
    stop: transportMocks.stop,
    getPosition: vi.fn(() => 0),
    isInitialized: () => true,
  })),
  resetTransport: vi.fn(),
}));

const audioState = vi.hoisted(() => ({
  triggerLayer: vi.fn(),
  exportWav: vi.fn(),
}));

vi.mock('../lib/audioEngine', () => ({
  audioEngine: {
    getContext: vi.fn(() => ({ currentTime: 5, state: 'running', resume: vi.fn() })),
    getMasterRackInput: vi.fn(() => null),
    triggerLayer: audioState.triggerLayer,
    exportWav: audioState.exportWav,
    stop: vi.fn(),
    playAll: vi.fn(),
    getIsPlaying: vi.fn(() => false),
    setLoopEnabled: vi.fn(),
  },
}));

vi.mock('../audio/AudioEngine', () => ({
  audioEngine: {
    getModuleGainNode: vi.fn(),
    getContext: vi.fn(() => null),
  },
}));

vi.mock('../audio/transport/metronome', () => ({
  createMetronome: vi.fn(() => ({
    scheduleAtBeat: vi.fn(),
    dispose: vi.fn(),
    setEnabled: vi.fn(),
    setVolume: vi.fn(),
  })),
}));

// In-memory Dexie stand-in so preset save → list → load round-trips for real.
const { dbMock, dbStore } = vi.hoisted(() => {
  const dbStore = new Map<string, Map<string, Record<string, unknown>>>();
  const table = (name: string) => {
    if (!dbStore.has(name)) dbStore.set(name, new Map());
    const store = dbStore.get(name)!;
    return {
      put: vi.fn(async (row: Record<string, unknown>) => {
        store.set(row.id as string, row);
        return row.id as string;
      }),
      get: vi.fn(async (id: string) => store.get(id)),
      toArray: vi.fn(async () => [...store.values()]),
      where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(async () => [...store.values()]) })) })),
      filter: vi.fn(() => ({ toArray: vi.fn(async () => []) })),
      delete: vi.fn(async (id: string) => {
        store.delete(id);
      }),
      update: vi.fn(async () => 1),
    };
  };
  return {
    dbStore,
    dbMock: {
      soundKits: table('soundKits'),
      soundProjects: table('soundProjects'),
      favorites: table('favorites'),
      projectDocuments: table('projectDocuments'),
      sampleLibraryFolders: table('sampleLibraryFolders'),
      sampleLibrarySamples: table('sampleLibrarySamples'),
      folderLinks: table('folderLinks'),
      chopMaps: table('chopMaps'),
      padPrograms: table('padPrograms'),
    },
  };
});

vi.mock('../lib/db', () => ({
  db: dbMock,
  fetchUserProjects: vi.fn(async () => []),
  saveProject: vi.fn(async () => 'p'),
  fetchSoundKits: vi.fn(async () => []),
  fetchUserFavorites: vi.fn(async () => []),
  toggleFavorite: vi.fn(async () => undefined),
  saveSoundKit: vi.fn(async () => 'k'),
  fetchFolderLinks: vi.fn(async () => []),
}));

vi.mock('../lib/folderLink', () => ({
  pickDirectory: vi.fn(),
  scanDirectoryToLibrary: vi.fn(),
  isFolderLinkSupported: vi.fn(() => false),
  ensureReadPermission: vi.fn(),
  countAudioFiles: vi.fn(),
  listSubfolders: vi.fn(),
}));

vi.mock('../audio/SoundLayerPlayer', () => ({
  SoundLayerPlayer: class {
    playNote = vi.fn();
  },
}));

import { StudioSequencer } from './StudioSequencer';
import type { SoundLayer } from '../types';
import { DEFAULT_FX, DEFAULT_SYNTH } from '../types';
import { usePatternStore } from '../store/patternStore';
import { useSequencerStore } from '../store/sequencerStore';
import { getSequencerBridge } from '../lib/controller/sequencerBridge';

const fakeBuffer = () =>
  ({
    numberOfChannels: 1,
    length: 4410,
    sampleRate: 44100,
    duration: 0.1,
    getChannelData: () => new Float32Array(4410),
  }) as unknown as AudioBuffer;

function makeSampleLayer(id = 'l1', name = 'Kick'): SoundLayer {
  return {
    id,
    name,
    type: 'sample',
    enabled: true,
    gain: 0.8,
    pan: 0,
    pitch: 0,
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 },
    fx: { ...DEFAULT_FX },
    audioBuffer: fakeBuffer(),
  };
}

function makeSynthLayer(id = 'l2', name = 'Lead'): SoundLayer {
  return {
    id,
    name,
    type: 'synth',
    enabled: true,
    gain: 0.7,
    pan: 0,
    pitch: 0,
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 },
    fx: { ...DEFAULT_FX },
    synth: { ...DEFAULT_SYNTH, oscType: 'sawtooth', frequency: 440 },
  };
}

let addLayerCounter = 0;

function renderSequencer(opts: { layers?: SoundLayer[]; selectedLayerId?: string | null } = {}) {
  usePatternStore.getState().reset();
  useSequencerStore.getState().setActiveBank('A');
  const layers = opts.layers ?? [makeSampleLayer(), makeSynthLayer()];
  for (const l of layers) usePatternStore.getState().ensureLayerRow('A', l.id);
  const props = {
    layers,
    selectedLayerId: opts.selectedLayerId === undefined ? 'l1' : opts.selectedLayerId,
    onSelectLayer: vi.fn(),
    onUpdateLayer: vi.fn(),
    onAddLayer: vi.fn(() => `nl-${addLayerCounter++}`),
    onAddSlicedLayers: vi.fn(),
  };
  const utils = render(<StudioSequencer {...props} />);
  return { ...utils, props };
}

describe('StudioSequencer programs + keygroup', () => {
  beforeEach(() => {
    addLayerCounter = 0;
    for (const store of dbStore.values()) store.clear();
    audioState.triggerLayer.mockClear();
    audioState.exportWav.mockReset();
    audioState.exportWav.mockResolvedValue(fakeBuffer());
    toneState.sequenceCallback = null;
    Element.prototype.setPointerCapture = vi.fn() as never;
    Element.prototype.releasePointerCapture = vi.fn() as never;
    // Deterministic pad programs: the mount auto-fill only runs when empty.
    const blank = () => Array.from({ length: 16 }, () => null as string | null);
    const banks = { A: blank(), B: blank(), C: blank(), D: blank() };
    useSequencerStore.setState({
      programs: { ...banks },
      patternPrograms: { A: { ...banks }, B: { ...banks }, C: { ...banks }, D: { ...banks } },
      activeBank: 'A',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    usePatternStore.getState().reset();
  });

  it('plays sample layers chromatically from C4', () => {
    renderSequencer();
    audioState.triggerLayer.mockClear();
    act(() => {
      getSequencerBridge()!.playNote(60, 1);
    });
    let call = audioState.triggerLayer.mock.calls.at(-1) as Array<{ pitch?: number }>;
    expect(call[0].pitch).toBe(0);
    act(() => {
      getSequencerBridge()!.playNote(72, 1);
    });
    call = audioState.triggerLayer.mock.calls.at(-1) as Array<{ pitch?: number }>;
    expect(call[0].pitch).toBe(12);
  });

  it('syncs pad mute state, layer flag and button label', () => {
    const { props } = renderSequencer();
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(props.onUpdateLayer).toHaveBeenCalledWith('l1', { muted: true });
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeDefined();
  });

  it('copies and swaps pads within the bank', () => {
    renderSequencer();
    expect(useSequencerStore.getState().programs.A[0]).toBe('l1');
    // Copy pad 1 onto pad 3 (pad buttons show 01..16).
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    fireEvent.pointerDown(screen.getByText('03').closest('button') as HTMLElement, { pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    expect(useSequencerStore.getState().programs.A[2]).toBe('l1');
    // Swap pad 1 and pad 2.
    fireEvent.pointerDown(screen.getByText('02').closest('button') as HTMLElement, { pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }));
    const prog = useSequencerStore.getState().programs.A;
    expect(prog[0]).toBe('l2');
    expect(prog[1]).toBe('l1');
  });

  it('saves, lists and loads a named preset by layer name', async () => {
    renderSequencer();
    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'Boom' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Preset' }));
    await waitFor(() => expect(screen.getByRole('option', { name: 'Boom' })).toBeDefined());

    // Wipe the program, then load the preset back.
    act(() => {
      useSequencerStore.getState().setPatternProgram('A', 'A', []);
    });
    expect(useSequencerStore.getState().programs.A[0]).toBeNull();
    const select = screen.getByLabelText('Load pad preset') as HTMLSelectElement;
    const id = (select.querySelector('option[value]:not([value=""])') as HTMLOptionElement).value;
    fireEvent.change(select, { target: { value: id } });
    await waitFor(() => expect(useSequencerStore.getState().programs.A[0]).toBe('l1'));
    expect(screen.getByText(/"Boom" loaded/)).toBeDefined();
  });

  it('reports preset layers that no longer exist', async () => {
    const first = renderSequencer();
    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'Ghost' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Preset' }));
    await waitFor(() => expect(screen.getByRole('option', { name: 'Ghost' })).toBeDefined());
    first.unmount();

    // Remove the Kick layer, then load: the slot stays empty and is reported.
    renderSequencer({ layers: [makeSynthLayer()], selectedLayerId: 'l2' });
    const select = screen.getByLabelText('Load pad preset') as HTMLSelectElement;
    await waitFor(() => expect(select.querySelector('option[value]:not([value=""])')).toBeTruthy());
    const id = (select.querySelector('option[value]:not([value=""])') as HTMLOptionElement).value;
    fireEvent.change(select, { target: { value: id } });
    await waitFor(() => expect(screen.getByText(/missing: Kick/)).toBeDefined());
  });

  it('auto-samples the active synth across 16 pitches onto Program B', async () => {
    const { props, rerender } = renderSequencer({ selectedLayerId: 'l2' });
    fireEvent.click(screen.getByRole('button', { name: 'Auto-sample → Pads' }));
    await waitFor(() => expect(props.onAddLayer).toHaveBeenCalledTimes(16), { timeout: 5000 });
    expect(audioState.exportWav).toHaveBeenCalledTimes(16);
    const firstFreq = (audioState.exportWav.mock.calls[0][0] as SoundLayer[])[0].synth?.frequency;
    expect(firstFreq).toBeCloseTo(65.41, 1); // C2
    const slots = useSequencerStore.getState().patternPrograms.A.B.filter(Boolean);
    expect(slots).toHaveLength(16);
    // The bank-follow effect tracks the app-level selection: selecting the
    // first sampled layer keeps the user on Program B.
    expect(props.onSelectLayer).toHaveBeenCalledWith('nl-0');
    rerender(
      <StudioSequencer
        layers={[makeSampleLayer(), makeSynthLayer()]}
        selectedLayerId="nl-0"
        onSelectLayer={props.onSelectLayer}
        onUpdateLayer={props.onUpdateLayer}
        onAddLayer={props.onAddLayer}
        onAddSlicedLayers={props.onAddSlicedLayers}
      />
    );
    expect(useSequencerStore.getState().activeBank).toBe('B');
  });
});
