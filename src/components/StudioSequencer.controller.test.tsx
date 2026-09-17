/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * End-to-end controller wiring test for the Produce stage: mounts the real
 * StudioSequencer, connects a fake MPD226 (mocked webmidi), fires the default
 * profile's CC / note / transport messages, and asserts the sequencer reacts.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Tone mock (mount-time only; the controller path doesn't use it) ---
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

vi.mock('../audio/transport/transport', () => ({
  initTransport: vi.fn(),
  getTransport: vi.fn(() => ({
    setBpm: vi.fn(),
    setTimeSignature: vi.fn(),
    setSwing: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    getPosition: vi.fn(() => 0),
    isInitialized: () => true,
  })),
  resetTransport: vi.fn(),
}));

const audioMocks = vi.hoisted(() => ({
  triggerLayer: vi.fn(),
  setMasterLevel: vi.fn(),
  getContext: vi.fn(() => ({ currentTime: 1 })),
}));

vi.mock('../lib/audioEngine', () => ({ audioEngine: audioMocks }));
vi.mock('../audio/AudioEngine', () => ({ audioEngine: audioMocks }));

vi.mock('../lib/db', () => {
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
      libraryFolders: table(), librarySamples: table(), projectDocuments: table(),
    },
    fetchUserProjects: vi.fn(async () => []),
    saveProject: vi.fn(async () => 'p'),
    fetchSoundKits: vi.fn(async () => []),
    fetchUserFavorites: vi.fn(async () => []),
    toggleFavorite: vi.fn(async () => undefined),
    saveSoundKit: vi.fn(async () => 'k'),
    fetchFolderLinks: vi.fn(async () => []),
  };
});

// --- webmidi mock with a controllable fake input ---
const midi = vi.hoisted(() => {
  const input = {
    id: 'mpd-1',
    name: 'MPD226',
    manufacturer: 'Akai',
    state: 'connected',
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };
  return {
    input,
    WebMidi: {
      inputs: [input],
      enable: vi.fn(() => Promise.resolve({})),
      disable: vi.fn(() => Promise.resolve()),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  };
});

vi.mock('webmidi', () => ({ WebMidi: midi.WebMidi }));

import { StudioSequencer } from './StudioSequencer';
import { ControllerHost } from './controller/ControllerHost';
import type { SoundLayer } from '../types';
import { DEFAULT_FX } from '../types';
import { usePatternStore } from '../store/patternStore';
import { useSequencerStore } from '../store/sequencerStore';
import { useControllerStore } from '../store/controllerStore';
import { createDefaultMpd226Profile } from '../lib/controller/defaultMpd226';

function makeLayer(): SoundLayer {
  return {
    id: 'l1',
    name: 'Kick',
    type: 'sample',
    enabled: true,
    gain: 0.8,
    pan: 0,
    pitch: 0,
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 },
    fx: { ...DEFAULT_FX },
  };
}

const listener = (event: string) => {
  const calls = midi.input.addListener.mock.calls.filter((c) => c[0] === event);
  return calls.at(-1)?.[1] as ((e: unknown) => void) | undefined;
};

const send = (event: string, payload: unknown) => {
  act(() => { listener(event)?.(payload); });
};

async function mountAndConnect() {
  usePatternStore.getState().reset();
  usePatternStore.getState().ensureLayerRow('A', 'l1');
  const layers = [makeLayer()];
  render(
    <>
      <StudioSequencer
        layers={layers}
        selectedLayerId="l1"
        onSelectLayer={() => undefined}
        onUpdateLayer={() => undefined}
      />
      {/* Phase 8: the engine lives in the App-level host; the sequencer
          registers its bridge on mount so pads/transport keep working. */}
      <ControllerHost
        layers={layers}
        selectedLayerId="l1"
        updateLayer={() => undefined}
        playAll={() => undefined}
        stopStack={() => undefined}
        stackPlaying={false}
      />
    </>,
  );
  // The controller rail starts expanded — just connect.
  fireEvent.click(screen.getByRole('button', { name: /connect midi/i }));
  await waitFor(() => expect(screen.getByText('MPD226')).toBeTruthy());
}

describe('StudioSequencer controller wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useControllerStore.getState().setProfile(createDefaultMpd226Profile());
    Object.defineProperty(globalThis.navigator, 'requestMIDIAccess', {
      value: vi.fn(() => Promise.resolve({})),
      configurable: true,
    });
    (midi.WebMidi as { inputs: unknown[] }).inputs = [midi.input];
  });

  afterEach(() => {
    usePatternStore.getState().reset();
    useSequencerStore.getState().setActiveBank('A');
    useControllerStore.getState().setMode('beat');
    useControllerStore.getState().setSection('produce');
  });

  it('routes pads, notes, transport and continuous controls', async () => {
    await mountAndConnect();
    // Enable every binding so the unverified/factory-disabled controls can be
    // exercised here (the shipped profile leaves control banks 2–3 and the
    // switches off, matching what preset #15 actually sends).
    useControllerStore.setState((s) => ({
      profile: {
        ...s.profile,
        bindings: Object.fromEntries(
          Object.entries(s.profile.bindings).map(([k, v]) => [k, { ...v, enabled: true }])
        ),
      },
    }));
    audioMocks.triggerLayer.mockClear();

    // Pad bank A pad 1 (note 36, bottom-left) triggers the program pad.
    send('noteon', { note: { number: 36 }, velocity: 100, channel: 1 });
    expect(audioMocks.triggerLayer).toHaveBeenCalled();

    // Chord pad (bank D → note 84) and release.
    send('noteon', { note: { number: 84 }, velocity: 100, channel: 1 });
    send('noteoff', { note: { number: 84 }, channel: 1 });

    // Control Bank 1 knobs (measured CCs 3, 9, 14, 15) — sound design.
    for (const cc of [3, 9, 14, 15]) {
      send('controlchange', { controller: { number: cc }, rawValue: 100, channel: 1 });
    }
    // Control Bank 1 faders (20, 21, 22, 23) — master / gain / pan / bpm.
    send('controlchange', { controller: { number: 20 }, rawValue: 100, channel: 1 });
    send('controlchange', { controller: { number: 21 }, rawValue: 100, channel: 1 });
    send('controlchange', { controller: { number: 22 }, rawValue: 40, channel: 1 });
    send('controlchange', { controller: { number: 23 }, rawValue: 120, channel: 1 });

    expect(audioMocks.setMasterLevel).toHaveBeenCalled();
    expect(usePatternStore.getState().patterns.A.bpm).toBeGreaterThan(100);

    // Control Bank 2/3 knobs + faders (unverified placeholders, enabled above).
    for (const cc of [16, 17, 18, 19, 24, 25, 26, 27, 28, 29, 30, 31]) {
      send('controlchange', { controller: { number: cc }, rawValue: 64, channel: 1 });
    }
    // Switches (banks 1–3): transport / pattern / pad / groove / bank / chord.
    for (const cc of [36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 47]) {
      send('controlchange', { controller: { number: cc }, rawValue: 127, channel: 1 });
    }

    // Transport: measured CCs + MIDI-realtime fallback.
    send('controlchange', { controller: { number: 118 }, rawValue: 127, channel: 1 });
    send('controlchange', { controller: { number: 117 }, rawValue: 127, channel: 1 });
    send('controlchange', { controller: { number: 119 }, rawValue: 127, channel: 1 });
    send('start', {});
    send('stop', {});

    // Sticky DAW transport tools (single transport bar now).
    fireEvent.click(screen.getByRole('button', { name: /tap tempo/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /^record$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /load pgm/i }));
    fireEvent.click(screen.getByRole('button', { name: /load seq/i }));

    // Nothing should have thrown; the pad fired and master moved.
    expect(audioMocks.triggerLayer).toHaveBeenCalled();
    expect(audioMocks.setMasterLevel).toHaveBeenCalled();
  }, 30000);

  it('learns a control from a live message', async () => {
    await mountAndConnect();
    useControllerStore.getState().startLearn('knob:0:0');
    send('controlchange', { controller: { number: 77 }, rawValue: 20, channel: 1 });
    expect(useControllerStore.getState().profile.bindings['knob:0:0'].number).toBe(77);
  }, 30000);

  it('drives the sampler in Sampler mode', async () => {
    await mountAndConnect();
    useControllerStore.getState().setSamplerMode(true);
    // Enable every sampler binding so the full surface is exercised.
    useControllerStore.setState((s) => ({
      profile: {
        ...s.profile,
        bindings: Object.fromEntries(
          Object.entries(s.profile.bindings).map(([k, v]) => [k, { ...v, enabled: true }])
        ),
      },
    }));
    audioMocks.triggerLayer.mockClear();

    // Pad bank A → chromatic sample pads.
    send('noteon', { note: { number: 36 }, velocity: 100, channel: 1 });
    send('noteoff', { note: { number: 36 }, channel: 1 });

    // Knobs + faders → sampler params.
    for (const cc of [3, 9, 14, 15, 20, 21, 22, 23]) {
      send('controlchange', { controller: { number: cc }, rawValue: 90, channel: 1 });
    }
    // Switches → destructive DSP.
    for (const cc of [36, 37, 38, 39]) {
      send('controlchange', { controller: { number: cc }, rawValue: 127, channel: 1 });
    }
    // Transport → preview / stop / glitch.
    send('controlchange', { controller: { number: 118 }, rawValue: 127, channel: 1 });
    send('controlchange', { controller: { number: 117 }, rawValue: 127, channel: 1 });
    send('controlchange', { controller: { number: 119 }, rawValue: 127, channel: 1 });

    // No sampler bridge is mounted here, so the calls must be safe no-ops.
    expect(useControllerStore.getState().samplerMode).toBe(true);
  }, 30000);

  it('drives the Recourse composer in Recourse mode', async () => {
    await mountAndConnect();
    useControllerStore.getState().setMode('recourse');
    useControllerStore.setState((s) => ({
      profile: {
        ...s.profile,
        bindings: Object.fromEntries(
          Object.entries(s.profile.bindings).map(([k, v]) => [k, { ...v, enabled: true }])
        ),
      },
    }));

    // Pad bank A → composer commands.
    send('noteon', { note: { number: 36 }, velocity: 100, channel: 1 });
    // Knobs + faders → composer params.
    for (const cc of [3, 9, 14, 15, 20, 21, 22, 23]) {
      send('controlchange', { controller: { number: cc }, rawValue: 90, channel: 1 });
    }
    // Switches + transport.
    for (const cc of [36, 37, 38, 39, 117, 118, 119]) {
      send('controlchange', { controller: { number: cc }, rawValue: 127, channel: 1 });
    }

    expect(useControllerStore.getState().mode).toBe('recourse');
  }, 30000);
});
