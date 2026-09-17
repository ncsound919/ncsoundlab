/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Gap-coverage suite for `StudioSequencer.tsx` (Vite+React+Vitest).
 *
 * Baseline (scheduling + controller + helper suites): ~55% statements.
 * This file targets the uncovered remainder through the public UI and the
 * Phase-8 sequencer bridge: step grid, piano-roll view, transport/tempo,
 * pattern toolbar (duplicate/copy/paste/groove/humanize), MPC pad bank
 * (swing/pocket/tune/choke/mute/banks/quantize/drop), QWERTY performance
 * keys, theory progressions, song mode + arrangement, import/export, mic
 * capture + mixdown (modular mocks), and the record paths.
 *
 * Module mocks mirror the existing scheduling/controller suites. The global
 * AudioContext/audioEngine mocks from `src/tests/setup.ts` are left alone;
 * per-file `vi.mock` calls below only add the tone/transport/db/capture
 * seams this component needs, plus narrow overrides (SoundLayerPlayer,
 * mixdown, sampleLibrary) so no real audio work runs in jsdom.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';

// ---------------------------------------------------------------------------
// Hoisted mutable seams (stable mock identities for assertions)
// ---------------------------------------------------------------------------
const toneState = vi.hoisted(() => {
  let sequenceCallback: ((time: number, stepIdx: number) => void) | null = null;
  let songRepeatCallback: ((time: number) => void) | null = null;
  const mockSequence = vi.fn(function (this: unknown, cb: (time: number, stepIdx: number) => void) {
    sequenceCallback = cb;
    return { loop: false, start: vi.fn(), dispose: vi.fn() };
  });
  const scheduleRepeat = vi.fn((cb: (time: number) => void) => {
    songRepeatCallback = cb;
    return 7;
  });
  return {
    get sequenceCallback() { return sequenceCallback; },
    set sequenceCallback(cb) { sequenceCallback = cb; },
    get songRepeatCallback() { return songRepeatCallback; },
    set songRepeatCallback(cb) { songRepeatCallback = cb; },
    mockSequence,
    scheduleRepeat,
  };
});

const transportState = vi.hoisted(() => ({
  initTransport: vi.fn(),
  setBpm: vi.fn(),
  setSwing: vi.fn(),
  play: vi.fn(),
  stop: vi.fn(),
}));

const audioState = vi.hoisted(() => ({
  triggerLayer: vi.fn(),
  setMasterLevel: vi.fn(),
  ctx: { currentTime: 5 } as { currentTime: number } | null,
}));

const captureState = vi.hoisted(() => {
  const fakeBuffer = {
    duration: 1.5,
    sampleRate: 44100,
    length: 8,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(8),
  };
  return {
    fakeBuffer,
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => ({})),
    decodeBlobToBuffer: vi.fn(async () => fakeBuffer),
    dispose: vi.fn(),
    sliceBufferIntoPads: vi.fn(() => [fakeBuffer, fakeBuffer]),
  };
});

const mixdownState = vi.hoisted(() => ({
  renderMixdown: vi.fn(async () => ({
    numberOfChannels: 1,
    sampleRate: 44100,
    length: 8,
    getChannelData: () => new Float32Array(8),
  })),
}));

// --- tone: capture the Sequence + song-repeat callbacks so tests can drive them ---
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
    scheduleRepeat: toneState.scheduleRepeat,
  },
  setContext: vi.fn(),
}));

vi.mock('../audio/transport/transport', () => ({
  initTransport: transportState.initTransport,
  getTransport: vi.fn(() => ({
    setBpm: transportState.setBpm,
    setTimeSignature: vi.fn(),
    setSwing: transportState.setSwing,
    play: transportState.play,
    pause: vi.fn(),
    stop: transportState.stop,
    getPosition: vi.fn(() => 0),
    isInitialized: () => true,
  })),
  resetTransport: vi.fn(),
}));

// Stable audioEngine双面 mock: explicit fns keep identity; the Proxy covers any
// other surface child components touch at mount time.
function makeEngineMock() {
  const target = {
    triggerLayer: audioState.triggerLayer,
    setMasterLevel: audioState.setMasterLevel,
    getContext: vi.fn(() => audioState.ctx),
  };
  return new Proxy(target, {
    get: (t, prop) => {
      if (prop in t) return (t as Record<string | symbol, unknown>)[prop];
      return vi.fn();
    },
  });
}

vi.mock('../lib/audioEngine', () => ({ audioEngine: makeEngineMock() }));
vi.mock('../audio/AudioEngine', () => ({ audioEngine: makeEngineMock() }));

vi.mock('../lib/db', () => {
  const table = () => ({
    put: vi.fn(async () => 'id'),
    get: vi.fn(async () => undefined),
    toArray: vi.fn(async () => []),
    where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(async () => []) })) })),
    filter: vi.fn(() => ({ toArray: vi.fn(async () => []) })),
    delete: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    bulkPut: vi.fn(async () => undefined),
  });
  return {
    db: {
      soundKits: table(),
      soundProjects: table(),
      favorites: table(),
      projectDocuments: table(),
      sampleLibraryFolders: table(),
      sampleLibrarySamples: table(),
      folderLinks: table(),
      libraryFolders: table(),
      librarySamples: table(),
      transaction: vi.fn(async (_mode: string, ...args: unknown[]) => {
        const fn = args[args.length - 1];
        if (typeof fn === 'function') await (fn as () => Promise<void>)();
      }),
    },
    fetchUserProjects: vi.fn(async () => []),
    saveProject: vi.fn(async () => 'p'),
    fetchSoundKits: vi.fn(async () => []),
    fetchUserFavorites: vi.fn(async () => []),
    toggleFavorite: vi.fn(async () => undefined),
    saveSoundKit: vi.fn(async () => 'k'),
    saveFolderLink: vi.fn(async () => 'fl'),
    fetchFolderLinks: vi.fn(async () => []),
    deleteFolderLink: vi.fn(async () => undefined),
  };
});

// Mic capture + mixdown: stub the hardware boundary, keep the component logic.
vi.mock('../audio/transport/audioCapture', () => ({
  createAudioCapture: vi.fn(() => ({
    start: captureState.start,
    stop: captureState.stop,
    decodeBlobToBuffer: captureState.decodeBlobToBuffer,
    dispose: captureState.dispose,
  })),
  sliceBufferIntoPads: captureState.sliceBufferIntoPads,
}));

vi.mock('../audio/transport/mixdown', () => ({
  renderMixdown: mixdownState.renderMixdown,
}));

// Library decode for pad-drop; everything else in the module stays real.
vi.mock('../lib/sampleLibrary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/sampleLibrary')>();
  return {
    ...actual,
    fetchLibrarySample: vi.fn(async () => ({ id: 'sample-1', name: 'Dropped' })),
    decodeLibrarySample: vi.fn(async () => captureState.fakeBuffer),
  };
});

import { StudioSequencer } from './StudioSequencer';
import { SAMPLE_DRAG_MIME } from './SampleBrowser';
import type { SoundLayer } from '../types';
import { DEFAULT_FX, DEFAULT_SYNTH } from '../types';
import { usePatternStore } from '../store/patternStore';
import { useSequencerStore, BANK_IDS } from '../store/sequencerStore';
import { getSequencerBridge, hasSequencerBridge } from '../lib/controller/sequencerBridge';
import { GROOVE_TEMPLATES } from '../lib/grooveTemplates';

function makeSampleLayer(id = 'l1', name = 'Kick', extra: Partial<SoundLayer> = {}): SoundLayer {
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
    ...extra,
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

const emptyProgram = () => Array.from({ length: 16 }, () => null);

interface RenderOpts {
  layers?: SoundLayer[];
  selectedLayerId?: string | null;
  withUpdateLayer?: boolean;
}

function renderSequencer(opts: RenderOpts = {}) {
  usePatternStore.getState().reset();
  const layers = opts.layers ?? [makeSampleLayer(), makeSynthLayer()];
  for (const l of layers) usePatternStore.getState().ensureLayerRow('A', l.id);
  const props = {
    layers,
    selectedLayerId: opts.selectedLayerId === undefined ? 'l1' : opts.selectedLayerId,
    onSelectLayer: vi.fn(),
    ...(opts.withUpdateLayer ? { onUpdateLayer: vi.fn() } : {}),
    onAddLayer: vi.fn((_b: AudioBuffer, _n?: string) => 'new-layer-id'),
    onAddSlicedLayers: vi.fn(),
    onAddSynthLayer: vi.fn((_s: SoundLayer, name: string) => `pad-${name}`),
  };
  const utils = render(<StudioSequencer {...props} />);
  return { ...utils, props };
}

function blurActiveElement() {
  // PerformanceControls ignores QWERTY while an input/select is focused.
  (document.activeElement as HTMLElement | null)?.blur?.();
  if (document.activeElement && document.activeElement !== document.body) {
    (document.body as HTMLElement).focus?.();
  }
}

function pressKey(key: string, type: 'keydown' | 'keyup' = 'keydown') {
  blurActiveElement();
  if (type === 'keydown') fireEvent.keyDown(window, { key });
  else fireEvent.keyUp(window, { key });
}

/** MPC bank tabs share single-letter names with other panels; scope by style. */
function bankButton(label: string): HTMLElement {
  const all = screen.getAllByRole('button', { name: label });
  const found = all.find((b) => b.className.includes('w-7'));
  if (!found) throw new Error(`bank button ${label} not found`);
  return found as HTMLElement;
}

/** Pad-grid buttons carry the layer name; step-grid row buttons append a hint. */
function padButtonByName(name: string): HTMLElement {
  const cands = screen.getAllByTitle(new RegExp(name));
  const found = cands.find((el) => !el.getAttribute('title')?.includes('click to make'));
  if (!found) throw new Error(`pad button ${name} not found`);
  return (found.closest('button') ?? found) as HTMLElement;
}

/** Pattern-store writes followed by DOM reads need flushed effects. */
function setCell(layerId: string, step: number, cell: { on: boolean; note?: number; velocity?: number; duration?: number; offset?: number; probability?: number }) {
  act(() => {
    usePatternStore.getState().setCell('A', layerId, step, cell);
  });
}

function setFileInput(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  vi.clearAllMocks();
  toneState.sequenceCallback = null;
  toneState.songRepeatCallback = null;
  audioState.ctx = { currentTime: 5 };
  usePatternStore.getState().reset();
  useSequencerStore.setState({
    programs: { A: emptyProgram(), B: emptyProgram(), C: emptyProgram(), D: emptyProgram() },
    activeBank: 'A',
  });
  useSequencerStore.getState().setPatternProgramsAll({} as never);
  // jsdom/Node expose a real URL.createObjectURL; replace it with a spy so
  // download assertions are hermetic.
  (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:mock');
  (URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
  if (!(HTMLElement.prototype as unknown as Record<string, unknown>).setPointerCapture) {
    (HTMLElement.prototype as unknown as Record<string, unknown>).setPointerCapture = vi.fn();
    (HTMLElement.prototype as unknown as Record<string, unknown>).releasePointerCapture = vi.fn();
    (HTMLElement.prototype as unknown as Record<string, unknown>).hasPointerCapture = vi.fn(() => true);
  }
});

afterEach(() => {
  vi.useRealTimers();
  usePatternStore.getState().reset();
  useSequencerStore.setState({ activeBank: 'A' });
  vi.restoreAllMocks();
});

describe('StudioSequencer gap coverage: step grid and views', () => {
  it('toggles a step cell on and off, preserving an existing melodic note', () => {
    const { container } = renderSequencer();
    const triggers = container.querySelectorAll('button[title="Trigger"]');
    expect(triggers.length).toBeGreaterThan(0);
    fireEvent.click(triggers[0]);
    expect(usePatternStore.getState().patterns.A.layerRows.l1[0].on).toBe(true);
    fireEvent.click(triggers[0]);
    expect(usePatternStore.getState().patterns.A.layerRows.l1[0].on).toBe(false);
    // Melodic cell keeps its note across toggles.
    setCell('l1', 3, { on: true, note: 60 });
    const noteBtn = container.querySelector('button[title="Note C4"]');
    expect(noteBtn).toBeTruthy();
    fireEvent.click(noteBtn!);
    expect(usePatternStore.getState().patterns.A.layerRows.l1[3].on).toBe(false);
    fireEvent.click(noteBtn!);
    const row = usePatternStore.getState().patterns.A.layerRows.l1[3];
    expect(row.on).toBe(true);
    expect(row.note).toBe(60);
  });

  it('selects a layer through its row button', () => {
    const { props } = renderSequencer();
    fireEvent.click(screen.getByTitle('Lead — click to make active'));
    expect(props.onSelectLayer).toHaveBeenCalledWith('l2');
  });

  it('switches to the piano roll, toggles a note by grid click, and back', () => {
    const { container } = renderSequencer();
    fireEvent.click(screen.getByRole('button', { name: 'Piano Roll' }));
    const grid = container.querySelector('.cursor-crosshair') as HTMLElement;
    expect(grid).toBeTruthy();
    grid.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 784, right: 320, bottom: 784, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(grid, { clientX: 10, clientY: 20 });
    const row = usePatternStore.getState().patterns.A.layerRows.l1;
    expect(row.some((c) => c.on && c.note === 83)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Step Grid' }));
    expect(container.querySelectorAll('button[title="Trigger"]').length).toBeGreaterThan(0);
  });

  it('renders the empty-layers state with the synth hint', () => {
    const { container } = renderSequencer({ layers: [], selectedLayerId: null });
    expect(screen.getByText(/Select a synth layer/i)).toBeTruthy();
    expect(screen.getByText(/0 tracks/i)).toBeTruthy();
    // Note/progression actions with no active row are safe no-ops.
    act(() => { getSequencerBridge()!.playNote(60, 1); });
    expect(screen.getByText(/Select a synth layer/i)).toBeTruthy();
    act(() => { getSequencerBridge()!.applyProgressionToPattern([{ root: 'C', type: 'maj', duration: 4 }]); });
    const panel = container.querySelector('[data-theory-panel]') as HTMLElement;
    fireEvent.click(panel.querySelector('button') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /roots/i }));
  });
});

describe('StudioSequencer gap coverage: transport and tempo', () => {
  it('plays and stops through the Tone transport', () => {
    renderSequencer();
    fireEvent.click(screen.getAllByLabelText('Play')[0]);
    expect(transportState.play).toHaveBeenCalled();
    expect(screen.getAllByLabelText('Stop').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByLabelText('Stop')[0]);
    expect(transportState.stop).toHaveBeenCalled();
  });

  it('falls back to setInterval when Tone init throws, then stops cleanly', () => {
    renderSequencer();
    // Transport ON but init throws: warn, then the interval path takes over.
    transportState.initTransport.mockImplementationOnce(() => { throw new Error('no ctx'); });
    fireEvent.click(screen.getAllByLabelText('Play')[0]);
    expect(transportState.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByLabelText('Stop')[0]);
    // Transport OFF from the start: straight to the interval path.
    fireEvent.click(screen.getByLabelText('Tone Transport'));
    fireEvent.click(screen.getAllByLabelText('Play')[0]);
    fireEvent.click(screen.getAllByLabelText('Stop')[0]);
  });

  it('restarts the interval clock when BPM changes mid-play', () => {
    renderSequencer();
    fireEvent.click(screen.getByLabelText('Tone Transport'));
    fireEvent.click(screen.getAllByLabelText('Play')[0]);
    fireEvent.change(screen.getByLabelText(/BPM/), { target: { value: '140' } });
    expect(usePatternStore.getState().patterns.A.bpm).toBe(140);
    fireEvent.click(screen.getAllByLabelText('Stop')[0]);
  });

  it('tap tempo clamps a fast double-tap and resets on a stale gap', () => {
    renderSequencer();
    // Controllable clock: mockImplementation can't be shifted by stray callers.
    let t = 1000;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => t);
    const tap = screen.getByRole('button', { name: /tap tempo/i });
    fireEvent.click(tap);
    t = 1005;
    fireEvent.click(tap);
    expect(usePatternStore.getState().patterns.A.bpm).toBe(240);
    // Stale gap (>2s) resets the buffer instead of skewing the tempo.
    t = 9000;
    fireEvent.click(tap);
    t = 9100;
    fireEvent.click(tap);
    t = 9200;
    fireEvent.click(tap);
    expect(usePatternStore.getState().patterns.A.bpm).toBe(240);
    // A fifth tap overflows the 4-tap window (times.shift branch).
    t = 9300;
    fireEvent.click(tap);
    t = 9400;
    fireEvent.click(tap);
    expect(usePatternStore.getState().patterns.A.bpm).toBe(240);
    now.mockRestore();
  });

  it('changes time signature and step length from the transport bar', () => {
    renderSequencer();
    fireEvent.change(screen.getByLabelText(/Time Sig/), { target: { value: '3/4' } });
    expect(usePatternStore.getState().patterns.A.timeSignature).toEqual([3, 4]);
    fireEvent.change(screen.getByLabelText(/Steps/), { target: { value: '32' } });
    expect(usePatternStore.getState().patterns.A.stepLength).toBe(32);
  });

  it('toggles step recording and clears the pattern from both buttons', () => {
    renderSequencer();
    usePatternStore.getState().setCell('A', 'l1', 0, { on: true });
    fireEvent.click(screen.getAllByRole('button', { name: /^record$/i })[0]);
    expect(screen.getByRole('button', { name: /recording/i })).toBeTruthy();
    const clears = screen.getAllByRole('button', { name: /clear pattern/i });
    expect(clears.length).toBe(2);
    fireEvent.click(clears[0]);
    expect(usePatternStore.getState().patterns.A.layerRows.l1.every((c) => !c.on)).toBe(true);
    usePatternStore.getState().setCell('A', 'l1', 1, { on: true });
    fireEvent.click(clears[1]);
    expect(usePatternStore.getState().patterns.A.layerRows.l1.every((c) => !c.on)).toBe(true);
  });
});

describe('StudioSequencer gap coverage: pattern toolbar', () => {
  it('duplicates the active pattern into the next slot', () => {
    renderSequencer();
    usePatternStore.getState().setCell('A', 'l1', 5, { on: true });
    fireEvent.click(screen.getByRole('button', { name: /duplicate pattern/i }));
    expect(usePatternStore.getState().activePatternId).toBe('B');
    expect(usePatternStore.getState().patterns.B.layerRows.l1[5].on).toBe(true);
  });

  it('copies and pastes the active row', () => {
    renderSequencer();
    usePatternStore.getState().setCell('A', 'l1', 2, { on: true });
    fireEvent.click(screen.getByRole('button', { name: /copy row/i }));
    usePatternStore.getState().setCell('A', 'l1', 2, { on: false });
    fireEvent.click(screen.getByRole('button', { name: /paste row/i }));
    expect(usePatternStore.getState().patterns.A.layerRows.l1[2].on).toBe(true);
  });

  it('applies a groove template and ignores unknown ids', () => {
    renderSequencer();
    usePatternStore.getState().setCell('A', 'l1', 1, { on: true });
    const select = screen.getByLabelText('Apply groove template');
    fireEvent.change(select, { target: { value: 'boom-bap' } });
    // Selector resets to straight after applying.
    expect((select as HTMLSelectElement).value).toBe('straight');
    fireEvent.change(select, { target: { value: 'no-such-groove' } });
  });

  it('humanizes velocities and resets groove offsets', () => {
    renderSequencer();
    usePatternStore.getState().setCell('A', 'l1', 0, { on: true, velocity: 100 });
    fireEvent.click(screen.getByRole('button', { name: /humanize/i }));
    fireEvent.click(screen.getByRole('button', { name: /reset swing/i }));
    expect(usePatternStore.getState().patterns.A.layerRows.l1[0].on).toBe(true);
  });
});

describe('StudioSequencer gap coverage: export and import', () => {
  it('exports program and sequence downloads', () => {
    renderSequencer();
    const create = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;
    fireEvent.click(screen.getByRole('button', { name: /save pgm/i }));
    fireEvent.click(screen.getByRole('button', { name: /save seq/i }));
    expect(create).toHaveBeenCalled();
  });

  it('imports a v4 program and applies global swing', async () => {
    const { container } = renderSequencer();
    fireEvent.click(screen.getByRole('button', { name: /load pgm/i }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const prgm = JSON.stringify({
      format: 'ncsoundlab-mpc-program',
      version: 4,
      programs: { A: ['l1', 'l2'] },
      swing: { l1: 30 },
      tune: { l1: 2 },
      choke: { l1: 1 },
      globalSwing: 42,
      sixteenLevels: true,
      timeCorrect: 2,
    });
    setFileInput(input, new File([prgm], 'm.prgm', { type: 'application/json' }));
    await waitFor(() => expect(screen.getByText('42%')).toBeTruthy());
  });

  it('imports a legacy v3 pads program', async () => {
    const { container } = renderSequencer();
    fireEvent.click(screen.getByRole('button', { name: /load pgm/i }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const v3 = JSON.stringify({ pads: [{ layerId: 'l1' }, { name: 'Lead' }], globalSwing: 10 });
    setFileInput(input, new File([v3], 'old.prgm', { type: 'application/json' }));
    // Global swing is shown in two readouts; assert the control value instead.
    await waitFor(() => expect(
      (screen.getByRole('slider', { name: 'Global swing' }) as HTMLInputElement).value,
    ).toBe('10'));
  });

  it('imports a v2 sequence and applies its bpm', async () => {
    const { container } = renderSequencer();
    const st = usePatternStore.getState();
    const { exportV2 } = await import('../sequencerFormat');
    const seq = JSON.stringify(exportV2('A', { ...st.patterns.A, bpm: 96 }, st.songChain));
    fireEvent.click(screen.getByRole('button', { name: /load seq/i }));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    setFileInput(input, new File([seq], 'm.seq', { type: 'application/json' }));
    await waitFor(() => expect(usePatternStore.getState().patterns.A.bpm).toBe(96));
  });

  it('warns instead of crashing on garbage and unknown sequence files', async () => {
    const { container } = renderSequencer();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: /load pgm/i }));
    setFileInput(input, new File(['{nope'], 'bad.prgm', { type: 'application/json' }));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /load seq/i }));
    setFileInput(input, new File([JSON.stringify({ foo: 1 })], 'weird.seq', { type: 'application/json' }));
    await waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
    // A change event with no files hits the early return.
    fireEvent.click(screen.getByRole('button', { name: /load pgm/i }));
    Object.defineProperty(input, 'files', { value: null, configurable: true });
    fireEvent.change(input);
    warn.mockRestore();
  });
});

describe('StudioSequencer gap coverage: MPC pad bank', () => {
  function selectPadOne() {
    // Pads use pointer events; the jsdom polyfill is installed in beforeEach.
    const btn = padButtonByName('Kick');
    (btn as HTMLElement).getBoundingClientRect = () => ({
      left: 0, top: 0, width: 80, height: 100, right: 80, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
    });
    fireEvent.pointerDown(btn as HTMLElement, { clientY: 25, pointerId: 1 });
    fireEvent.pointerUp(btn as HTMLElement, { pointerId: 1 });
  }

  it('switches banks and renders empty programs', () => {
    // Null selection: the bank-follow effect would otherwise snap back to A.
    renderSequencer({ selectedLayerId: null });
    fireEvent.click(bankButton('B'));
    expect(useSequencerStore.getState().activeBank).toBe('B');
    expect(screen.getByText('Program B')).toBeTruthy();
    fireEvent.click(bankButton('A'));
    expect(useSequencerStore.getState().activeBank).toBe('A');
  });

  it('triggers the pad layer and selects the pad on pointer down', () => {
    const { props } = renderSequencer();
    audioState.triggerLayer.mockClear();
    selectPadOne();
    expect(audioState.triggerLayer).toHaveBeenCalled();
    expect(props.onSelectLayer).toHaveBeenCalledWith('l1');
  });

  it('selects an empty pad without triggering', () => {
    renderSequencer({ selectedLayerId: null });
    audioState.triggerLayer.mockClear();
    fireEvent.click(bankButton('B'));
    const empties = screen.getAllByText('01');
    const btn = empties[0].closest('button') as HTMLElement;
    fireEvent.pointerDown(btn, { pointerId: 2 });
    expect(audioState.triggerLayer).not.toHaveBeenCalled();
    expect(screen.getByText('Empty pad')).toBeTruthy();
  });

  it('mutes through onUpdateLayer, and no-ops without it', () => {
    const first = renderSequencer({ withUpdateLayer: true });
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(first.props.onUpdateLayer).toHaveBeenCalledWith('l1', { muted: true });
    // Without the optional callback the toggle is a safe no-op (single tree
    // so the query hits the callback-free mount).
    first.unmount();
    renderSequencer();
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
  });

  it('clears a pad and assigns the active layer to it', () => {
    renderSequencer();
    fireEvent.click(screen.getByRole('button', { name: /clear pad/i }));
    expect(useSequencerStore.getState().programs.A[0]).toBe(null);
    fireEvent.click(screen.getByRole('button', { name: /active layer/i }));
    expect(useSequencerStore.getState().programs.A[0]).toBe('l1');
  });

  it('edits per-pad swing/pocket/tune with clamping, plus choke groups', () => {
    renderSequencer();
    fireEvent.change(screen.getByRole('slider', { name: 'Per-pad swing' }), { target: { value: '200' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Per-pad pocket' }), { target: { value: '-12' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Per-pad tune (semitones)' }), { target: { value: '7' } });
    expect(screen.getByText('+7st')).toBeTruthy();
    const chokeGroup = screen.getByText('Choke Group').closest('div')?.parentElement as HTMLElement;
    fireEvent.click(chokeGroup.querySelectorAll('button')[2]);
    expect(screen.getByText('G2')).toBeTruthy();
  });

  it('drives global swing, note repeat, levels, curve, time correct and quantize', () => {
    renderSequencer();
    setCell('l1', 3, { on: true });
    fireEvent.change(screen.getByRole('slider', { name: 'Global swing' }), { target: { value: '25' } });
    expect((screen.getByRole('slider', { name: 'Global swing' }) as HTMLInputElement).value).toBe('25');
    const noteRepeatOff = screen.getAllByRole('button', { name: 'Off' });
    fireEvent.click(noteRepeatOff[0]);
    fireEvent.click(screen.getByRole('button', { name: '1/32' }));
    const velocitySelect = Array.from(document.querySelectorAll('select')).find((s) => (s as HTMLSelectElement).value === 'linear') as HTMLSelectElement;
    fireEvent.change(velocitySelect, { target: { value: 'exponential' } });
    // '1/8' exists in both note-repeat divisions and time-correct; the
    // time-correct grid renders after the divisions grid.
    fireEvent.click(screen.getAllByRole('button', { name: '1/8' })[1]);
    fireEvent.click(screen.getByRole('button', { name: /quantize pattern/i }));
    const row = usePatternStore.getState().patterns.A.layerRows.l1;
    expect(row.some((c) => c.on)).toBe(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'On' })[0]);
  });

  it('drops a library sample onto a pad and covers drop guards', async () => {
    const { props, unmount } = renderSequencer();
    fireEvent.drop(padButtonByName('Kick'), {
      dataTransfer: { types: [SAMPLE_DRAG_MIME], getData: () => 'sample-1' },
    });
    await waitFor(() => expect(props.onAddLayer).toHaveBeenCalled());
    expect(props.onSelectLayer).toHaveBeenCalledWith('new-layer-id');
    // The success path assigned a foreign id to pad 0; restore the fixture
    // program so the guard drops below hit a real Kick pad (act-flushed so
    // the queries below see the fresh pads, not the stale DOM).
    act(() => {
      useSequencerStore.setState({
        programs: { A: emptyProgram(), B: emptyProgram(), C: emptyProgram(), D: emptyProgram() },
        activeBank: 'A',
      });
      useSequencerStore.getState().setPatternProgramsAll({} as never);
      useSequencerStore.getState().setPatternProgram('A', 'A', ['l1', 'l2']);
    });
    // Drop guards: missing audio clock, unknown sample, decode failure.
    audioState.ctx = null;
    fireEvent.drop(padButtonByName('Kick'), {
      dataTransfer: { types: [SAMPLE_DRAG_MIME], getData: () => 'sample-1' },
    });
    audioState.ctx = { currentTime: 5 };
    const { fetchLibrarySample, decodeLibrarySample } = await import('../lib/sampleLibrary');
    vi.mocked(fetchLibrarySample).mockResolvedValueOnce(null as never);
    fireEvent.drop(padButtonByName('Kick'), {
      dataTransfer: { types: [SAMPLE_DRAG_MIME], getData: () => 'ghost' },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(decodeLibrarySample).mockRejectedValueOnce(new Error('decode'));
    fireEvent.drop(padButtonByName('Kick'), {
      dataTransfer: { types: [SAMPLE_DRAG_MIME], getData: () => 'sample-1' },
    });
    await waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
    // Without the optional layer factory the drop is a safe no-op.
    unmount();
    // The first mount assigned a foreign id to pad 0; reset programs so the
    // auto-fill puts the fixture layers back on pads.
    useSequencerStore.setState({
      programs: { A: emptyProgram(), B: emptyProgram(), C: emptyProgram(), D: emptyProgram() },
      activeBank: 'A',
    });
    useSequencerStore.getState().setPatternProgramsAll({} as never);
    render(
      <StudioSequencer
        layers={[makeSampleLayer(), makeSynthLayer()]}
        selectedLayerId="l1"
        onSelectLayer={() => undefined}
      />,
    );
    fireEvent.drop(padButtonByName('Kick'), {
      dataTransfer: { types: [SAMPLE_DRAG_MIME], getData: () => 'sample-1' },
    });
  });

  it('prunes per-pad state and falls back the active row when layers shrink', () => {
    const { rerender, props } = renderSequencer();
    const chokeGroup = () => screen.getByText('Choke Group').closest('div')?.parentElement as HTMLElement;
    // Per-pad state for the KEPT layer first (pad 0 = Kick is selected).
    fireEvent.change(screen.getByRole('slider', { name: 'Per-pad swing' }), { target: { value: '10' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Per-pad tune (semitones)' }), { target: { value: '1' } });
    fireEvent.click(chokeGroup().querySelectorAll('button')[1]);
    // Then state for the soon-removed layer: select its pad, then edit.
    useSequencerStore.getState().setPatternProgramSlot('A', 'A', 5, 'l2');
    const leadPad = padButtonByName('Lead');
    leadPad.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 80, height: 100, right: 80, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
    });
    fireEvent.pointerDown(leadPad, { clientY: 25, pointerId: 3 });
    fireEvent.change(screen.getByRole('slider', { name: 'Per-pad swing' }), { target: { value: '40' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Per-pad tune (semitones)' }), { target: { value: '-3' } });
    fireEvent.click(chokeGroup().querySelectorAll('button')[3]);
    rerender(
      <StudioSequencer
        layers={[makeSampleLayer()]}
        selectedLayerId="l1"
        onSelectLayer={props.onSelectLayer}
        onAddLayer={props.onAddLayer}
        onAddSlicedLayers={props.onAddSlicedLayers}
      />,
    );
    expect(screen.getByTitle('Kick — click to make active')).toBeTruthy();
    // Removing the selected row too forces the find-fallback branch.
    rerender(
      <StudioSequencer
        layers={[makeSynthLayer()]}
        selectedLayerId="l1"
        onSelectLayer={props.onSelectLayer}
        onAddLayer={props.onAddLayer}
        onAddSlicedLayers={props.onAddSlicedLayers}
      />,
    );
    expect(screen.getByTitle('Lead — click to make active')).toBeTruthy();
    // Dropping every layer falls back to no active row.
    rerender(
      <StudioSequencer
        layers={[]}
        selectedLayerId={null}
        onSelectLayer={props.onSelectLayer}
        onAddLayer={props.onAddLayer}
        onAddSlicedLayers={props.onAddSlicedLayers}
      />,
    );
  });

  it('jumps to the bank that holds the externally selected layer', () => {
    useSequencerStore.getState().setPatternProgramSlot('A', 'B', 3, 'l2');
    renderSequencer({ selectedLayerId: 'l2' });
    expect(useSequencerStore.getState().activeBank).toBe('B');
  });
});

describe('StudioSequencer gap coverage: performance keys and piano', () => {
  it('plays sample and synth notes and shows the chord', () => {
    // NOTE: QWERTY note keys collide with react-piano's own HOME_ROW listener
    // and ping-pong stopNote into a setState loop in jsdom (environmental, not
    // a component bug), so the melodic path is driven through the same bridge
    // the MIDI controller uses. stopMidiNote is covered here; the piano-only
    // handlePlayNoteInput wrapper is left uncovered (see summary).
    const { unmount } = renderSequencer();
    expect(screen.getByText('No notes held')).toBeTruthy();
    act(() => { getSequencerBridge()!.playNote(60, 1); });
    expect(audioState.triggerLayer).toHaveBeenCalled();
    // The held note feeds the tonal chord readout.
    expect(screen.queryByText('No notes held')).toBeNull();
    act(() => { getSequencerBridge()!.stopNote(60); });
    expect(screen.getByText('No notes held')).toBeTruthy();
    // Synth rows voice through the engine's full FX chain with a target note;
    // selection is parent-owned, so remount with the synth selected.
    unmount();
    renderSequencer({ selectedLayerId: 'l2' });
    audioState.triggerLayer.mockClear();
    act(() => { getSequencerBridge()!.playNote(60, 1); });
    expect(audioState.triggerLayer).toHaveBeenCalled();
    const synthCall = audioState.triggerLayer.mock.calls.at(-1) as unknown[];
    expect((synthCall[4] as { note?: number }).note).toBe(60);
    expect(screen.queryByText('No notes held')).toBeNull();
  });

  it('triggers pads from QWERTY, honouring choke groups', () => {
    renderSequencer();
    audioState.triggerLayer.mockClear();
    const chokeGroup = screen.getByText('Choke Group').closest('div')?.parentElement as HTMLElement;
    fireEvent.click(chokeGroup.querySelectorAll('button')[1]);
    pressKey('z');
    expect(audioState.triggerLayer).toHaveBeenCalled();
    const chokeCalls = audioState.triggerLayer.mock.calls as unknown[][];
    expect(chokeCalls.some((c) => c[2] === 'choke:1')).toBe(true);
    // Empty pad slots are a safe no-op in the QWERTY wrapper.
    audioState.triggerLayer.mockClear();
    pressKey('x');
    expect(audioState.triggerLayer).not.toHaveBeenCalled();
  });

  it('records pad hits and piano notes while recording + playing', async () => {
    renderSequencer();
    fireEvent.click(screen.getByLabelText('Tone Transport'));
    fireEvent.click(screen.getAllByRole('button', { name: /^record$/i })[0]);
    fireEvent.click(screen.getAllByLabelText('Play')[0]);
    // 'z' is a piano-safe pad key (not in react-piano's HOME_ROW map).
    pressKey('z');
    // A real pad pointer-down records through onPadInput (recordPadHit).
    const kickPad = padButtonByName('Kick');
    kickPad.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 80, height: 100, right: 80, bottom: 100, x: 0, y: 0, toJSON: () => ({}),
    });
    fireEvent.pointerDown(kickPad, { clientY: 25, pointerId: 9 });
    fireEvent.pointerUp(kickPad, { pointerId: 9 });
    // Melodic recording goes through the bridge for the same piano reason.
    act(() => { getSequencerBridge()!.playNote(60, 0.8); });
    const rows = usePatternStore.getState().patterns.A.layerRows;
    expect(Object.values(rows).some((row) => row.some((c) => c.on))).toBe(true);
    fireEvent.click(screen.getAllByLabelText('Stop')[0]);
  });

  it('previews theory chords and voices progressions into the pattern', async () => {
    const { container, props } = renderSequencer({ selectedLayerId: 'l2' });
    const panel = container.querySelector('[data-theory-panel]') as HTMLElement;
    // RecourseComposerPanel has its own Generate button; scope to Theory.
    fireEvent.click(panel.querySelector('button') as HTMLElement);
    fireEvent.click(screen.getByTitle('Voice the progression into the active pattern row'));
    const row = usePatternStore.getState().patterns.A.layerRows.l2;
    // Chords are written as voiced `notes` arrays (not bare roots).
    expect(row.some((c) => c.on && (c.notes?.length ?? 0) > 0)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /roots/i }));
    // "Roots → Pads" now creates one synth pad layer per root.
    expect(props.onAddSynthLayer).toHaveBeenCalled();
    const previews = screen.getAllByTitle(/^Preview /);
    fireEvent.click(previews[0]);
    // The 1.5s auto-stop timer drives the TheoryPanel onStopNote wrapper.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1600));
    });
  });
});

describe('StudioSequencer gap coverage: song mode and recourse', () => {
  it('advances the pattern at each bar while song mode is on', () => {
    renderSequencer();
    expect(screen.queryByText('Song Chain')).toBeNull();
    fireEvent.click(screen.getByLabelText('Song Mode'));
    expect(screen.getByText('Song Chain')).toBeTruthy();
    expect(toneState.songRepeatCallback).toBeTruthy();
    act(() => { toneState.songRepeatCallback!(0); });
    expect(usePatternStore.getState().activePatternId).toBe('B');
    // Slot buttons call through the (comment-only) play-from-slot hook.
    const slot = document.querySelector('[data-slot="0"] button') as HTMLElement;
    fireEvent.click(slot);
    // Turning song mode off clears the scheduled repeat.
    fireEvent.click(screen.getByLabelText('Song Mode'));
    expect(toneState.scheduleRepeat).toHaveBeenCalled();
  });

  it('derives the song chain from the arrangement when song mode starts', async () => {
    const { planFromArrangement } = await import('../lib/arrangementScheduler');
    renderSequencer();
    // NOTE: store writes must come after render — the helper resets the
    // pattern store on mount, so pre-seeding would be wiped.
    usePatternStore.getState().addClip({ patternId: 'A', startBeat: 0, beats: 4, loops: 1, muted: false });
    const st = usePatternStore.getState();
    expect(planFromArrangement(st.arrangement, st.patterns).bars).toBeGreaterThan(0);
    usePatternStore.setState({ songChain: { order: ['D'] } });
    fireEvent.click(screen.getByLabelText('Song Mode'));
    expect(usePatternStore.getState().songChain.order[0]).toBe('A');
  });

  it('starts playback on the recourse:play window event', () => {
    renderSequencer();
    act(() => { window.dispatchEvent(new window.Event('recourse:play')); });
    expect(transportState.play).toHaveBeenCalled();
    expect(screen.getByText('Song Chain')).toBeTruthy();
  });

  it('warns when song scheduling throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    toneState.scheduleRepeat.mockImplementationOnce(() => { throw new Error('boom'); });
    renderSequencer();
    fireEvent.click(screen.getByLabelText('Song Mode'));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('handles an empty song chain and a cancelled repeat', () => {
    renderSequencer();
    usePatternStore.setState({ songChain: { order: [] } });
    fireEvent.click(screen.getByLabelText('Song Mode'));
    // Active pattern missing from the chain resets the cursor; the bar
    // callback then exits on the empty chain.
    expect(toneState.songRepeatCallback).toBeTruthy();
    act(() => { toneState.songRepeatCallback!(0); });
    expect(usePatternStore.getState().activePatternId).toBe('A');
  });
});

describe('StudioSequencer gap coverage: capture, slice and mixdown', () => {
  it('records mic takes, slices them at both sizes, then dismisses', async () => {
    const { props } = renderSequencer();
    async function recordTake() {
      fireEvent.click(screen.getByRole('button', { name: /record audio/i }));
      await waitFor(() => expect(screen.getByRole('button', { name: /stop recording/i })).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /stop recording/i }));
      await waitFor(() => expect(screen.getByRole('button', { name: /slice 16/i })).toBeTruthy());
    }
    // Slicing consumes the take (box closes), so record one take per action.
    // onSlice forwards the pad array, not (buffer, n) — assert call counts.
    await recordTake();
    await waitFor(() => expect(props.onAddLayer).toHaveBeenCalledWith(expect.anything(), 'Mic Take'));
    fireEvent.click(screen.getByRole('button', { name: /slice 32/i }));
    expect(props.onAddSlicedLayers).toHaveBeenCalledTimes(1);
    await recordTake();
    fireEvent.click(screen.getByRole('button', { name: /slice 16/i }));
    expect(props.onAddSlicedLayers).toHaveBeenCalledTimes(2);
    await recordTake();
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('button', { name: /slice 16/i })).toBeNull();
  });

  it('warns when the mic cannot start', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    captureState.start.mockRejectedValueOnce(new Error('denied'));
    renderSequencer();
    fireEvent.click(screen.getByRole('button', { name: /record audio/i }));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });

  it('warns when stopping a take without an audio clock', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderSequencer();
    audioState.ctx = null;
    fireEvent.click(screen.getByRole('button', { name: /record audio/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /stop recording/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /stop recording/i }));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    audioState.ctx = { currentTime: 5 };
    warn.mockRestore();
  });

  it('renders a mixdown and warns when rendering fails', async () => {
    renderSequencer();
    const create = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;
    fireEvent.click(screen.getByRole('button', { name: /mixdown/i }));
    await waitFor(() => expect(mixdownState.renderMixdown).toHaveBeenCalled());
    await waitFor(() => expect(create).toHaveBeenCalled());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mixdownState.renderMixdown.mockRejectedValueOnce(new Error('render fail'));
    fireEvent.click(screen.getByRole('button', { name: /mixdown/i }));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });
});

describe('StudioSequencer gap coverage: sequencer bridge', () => {
  it('registers the bridge and drives every action through it', () => {
    renderSequencer({ withUpdateLayer: true });
    expect(hasSequencerBridge()).toBe(true);
    // The bridge is re-registered every render, so always use a fresh reader —
    // a held reference keeps stale closures.
    const br = () => getSequencerBridge()!;
    expect(br().getPadTune()).toEqual({});
    expect(br().getPadChoke()).toEqual({});
    expect(br().getSelectedPad()).toBe(0);
    expect(br().getIsPlaying()).toBe(false);
    act(() => {
      br().setSwing(200); // clamped to 75
      br().tapTempo();
      br().toggleRecord();
      br().playNote(60, 1);
      br().playNote(64, 1);
    });
    expect((screen.getByRole('slider', { name: 'Global swing' }) as HTMLInputElement).value).toBe('75');
    expect(screen.queryByText('No notes held')).toBeNull();
    act(() => {
      br().stopNote(60);
      br().stopNote(64);
      br().triggerLayer('l1', 2, 0.9);
    });
    expect(audioState.triggerLayer).toHaveBeenCalled();
    expect(screen.getByText('No notes held')).toBeTruthy();
    act(() => {
      usePatternStore.getState().setCell('A', 'l1', 0, { on: true });
      br().quantizePattern();
      br().humanizePattern();
      br().applyGroove(GROOVE_TEMPLATES[1]);
      // Long chords overflow the 16-step row (loop-break branch: 16 beats = 4 steps).
      br().applyProgressionToPattern([
        { root: 'C', type: 'maj', duration: 16 },
        { root: 'G', type: 'maj', duration: 16 },
        { root: 'A', type: 'min', duration: 16 },
        { root: 'F', type: 'maj', duration: 16 },
        { root: 'C', type: 'maj', duration: 16 },
        { root: 'G', type: 'maj', duration: 16 },
      ]);
      br().clearPad(0);
      br().assignPad(1);
      br().clearPattern();
    });
    expect(usePatternStore.getState().patterns.A.layerRows.l1.every((c) => !c.on)).toBe(true);
    act(() => {
      br().togglePlay();
    });
    expect(br().getIsPlaying()).toBe(true);
    act(() => {
      br().togglePlay();
    });
    expect(br().getIsPlaying()).toBe(false);
  });

  it('ignores notes and triggers for inaudible rows', () => {
    renderSequencer({ layers: [makeSampleLayer('l1', 'Kick'), makeSampleLayer('m1', 'Muted', { muted: true })], selectedLayerId: 'm1' });
    const bridge = getSequencerBridge()!;
    audioState.triggerLayer.mockClear();
    act(() => {
      bridge.playNote(60, 1);
      bridge.triggerLayer('m1', 0, 1);
    });
    expect(audioState.triggerLayer).not.toHaveBeenCalled();
    expect(screen.getByText('No notes held')).toBeTruthy();
  });

  it('clears the bridge and transport on unmount', () => {
    const { unmount } = renderSequencer();
    const bridge = getSequencerBridge()!;
    act(() => { bridge.togglePlay(); });
    // Exercising a cancelled Tone callback is a safe no-op.
    const cb = toneState.sequenceCallback;
    unmount();
    expect(hasSequencerBridge()).toBe(false);
    expect(transportState.stop).toHaveBeenCalled();
    if (cb) act(() => { cb(9.0, 0); });
  });

  it('ignores bar callbacks that race unmount', () => {
    const { unmount } = renderSequencer();
    fireEvent.click(screen.getByLabelText('Song Mode'));
    const songCb = toneState.songRepeatCallback;
    expect(songCb).toBeTruthy();
    unmount();
    // The effect cleanup flips `cancelled`; the stale callback returns early.
    act(() => { songCb!(0); });
  });
});

describe('StudioSequencer gap coverage: clock tick edge cases', () => {
  it('schedules swung steps via setTimeout when no audio clock exists', () => {
    renderSequencer();
    setCell('l1', 0, { on: true });
    setCell('l1', 1, { on: true, offset: 0.5 });
    vi.useFakeTimers();
    fireEvent.click(screen.getByLabelText('Tone Transport'));
    fireEvent.click(screen.getAllByLabelText('Play')[0]);
    audioState.ctx = null;
    fireEvent.change(screen.getByRole('slider', { name: 'Per-pad swing' }), { target: { value: '75' } });
    audioState.triggerLayer.mockClear();
    act(() => { vi.advanceTimersByTime(600); });
    expect(audioState.triggerLayer).toHaveBeenCalled();
  });

  it('skips probability-gated steps when the roll fails', () => {
    renderSequencer();
    setCell('l1', 2, { on: true, probability: 0 });
    // A row for a removed layer exercises the triggerStep unknown-layer guard.
    act(() => {
      const st = usePatternStore.getState();
      st.setRow('A', 'ghost', Array.from({ length: st.patterns.A.stepLength }, () => ({ on: false })));
    });
    setCell('ghost', 5, { on: true });
    vi.useFakeTimers();
    fireEvent.click(screen.getByLabelText('Tone Transport'));
    fireEvent.click(screen.getAllByLabelText('Play')[0]);
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    audioState.triggerLayer.mockClear();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(audioState.triggerLayer).not.toHaveBeenCalled();
    rand.mockRestore();
  });

  it('routes melodic cells through the full FX engine with velocity and duration', () => {
    renderSequencer();
    setCell('l2', 0, { on: true, note: 64, velocity: 100, duration: 2 });
    vi.useFakeTimers();
    fireEvent.click(screen.getByLabelText('Tone Transport'));
    fireEvent.click(screen.getAllByLabelText('Play')[0]);
    audioState.triggerLayer.mockClear();
    act(() => { vi.advanceTimersByTime(400); });
    expect(audioState.triggerLayer).toHaveBeenCalled();
    const call = audioState.triggerLayer.mock.calls.at(-1) as unknown[];
    expect((call[4] as { note?: number }).note).toBe(64);
    // 2 steps at 120bpm = 2 * (60/120/4) = 0.25s.
    expect(call[1] as number).toBeCloseTo(0.25, 3);
  });

  it('drives the Tone-sequence callback with groove, pocket and probability', async () => {
    renderSequencer();
    await waitFor(() => expect(toneState.sequenceCallback).toBeTruthy());
    setCell('l1', 0, { on: true, velocity: 90 });
    setCell('l1', 1, { on: true, offset: 0.25, probability: 0 });
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    audioState.triggerLayer.mockClear();
    await act(async () => { toneState.sequenceCallback!(3.0, 0); });
    expect(audioState.triggerLayer).toHaveBeenCalled();
    await act(async () => { toneState.sequenceCallback!(3.5, 1); });
    rand.mockRestore();
  });

  it('warns and keeps the interval path when the Tone Sequence fails', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    toneState.mockSequence.mockImplementationOnce(() => { throw new Error('tone down'); });
    renderSequencer();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
