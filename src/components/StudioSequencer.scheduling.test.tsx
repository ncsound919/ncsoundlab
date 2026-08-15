/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mount test for the studio sequencer's sample-accurate scheduling path.
 * The `tone` and transport modules are mocked so the Tone.Sequence callback
 * can be driven deterministically in jsdom, exercising the new audio-clock
 * `when` scheduling (swing/groove/pocket offsets land at `time + offset`).
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';

// --- Tone mock: capture the Sequence callback so tests can drive steps ---
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

vi.mock('../audio/transport/transport', () => {
  let initialized = false;
  return {
    initTransport: vi.fn(() => { initialized = true; }),
    getTransport: vi.fn(() => ({
      setBpm: vi.fn(),
      setTimeSignature: vi.fn(),
      setSwing: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      getPosition: vi.fn(() => 0),
      isInitialized: () => initialized,
    })),
    resetTransport: vi.fn(() => { initialized = false; }),
  };
});

vi.mock('../lib/audioEngine', () => ({
  audioEngine: {
    getContext: vi.fn(() => ({ currentTime: 1 })),
    triggerLayer: vi.fn(),
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
      soundKits: table(),
      soundProjects: table(),
      favorites: table(),
      libraryFolders: table(),
      librarySamples: table(),
      projectDocuments: table(),
    },
    fetchUserProjects: vi.fn(async () => []),
    saveProject: vi.fn(async () => 'p'),
    fetchSoundKits: vi.fn(async () => []),
    fetchUserFavorites: vi.fn(async () => []),
    toggleFavorite: vi.fn(async () => undefined),
    saveSoundKit: vi.fn(async () => 'k'),
  };
});

import { StudioSequencer } from './StudioSequencer';
import type { SoundLayer } from '../types';
import { DEFAULT_FX, DEFAULT_SYNTH } from '../types';
import { usePatternStore } from '../store/patternStore';
import { useSequencerStore } from '../store/sequencerStore';

function makeLayer(id = 'l1'): SoundLayer {
  return {
    id,
    name: 'Kick',
    type: 'synth',
    enabled: true,
    gain: 0.8,
    pan: 0,
    pitch: 0,
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 },
    fx: { ...DEFAULT_FX },
    synth: { ...DEFAULT_SYNTH, oscType: 'sine', frequency: 80 },
  };
}

function renderSequencer() {
  usePatternStore.getState().reset();
  usePatternStore.getState().ensureLayerRow('A', 'l1');
  usePatternStore.getState().setCell('A', 'l1', 0, { on: true, velocity: 100 });
  usePatternStore.getState().setCell('A', 'l1', 1, { on: true, offset: 0.25, velocity: 80 });
  return render(
    <StudioSequencer
      layers={[makeLayer()]}
      selectedLayerId="l1"
      onSelectLayer={() => undefined}
      onUpdateLayer={() => undefined}
    />,
  );
}

describe('StudioSequencer sample-accurate scheduling', () => {
  beforeEach(() => {
    toneState.sequenceCallback = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
    usePatternStore.getState().reset();
  });

  it('mounts and exposes the pattern play control', () => {
    renderSequencer();
    expect(screen.getByRole('button', { name: /Play Pattern/i })).toBeDefined();
  });

  it('registers a Tone.Sequence when Tone mode is active', async () => {
    renderSequencer();
    await waitFor(() => expect(toneState.mockSequence).toHaveBeenCalled(), { timeout: 3000 });
  });

  it('schedules steps at audio-clock time through triggerStep (when param)', async () => {
    const { audioEngine } = await import('../lib/audioEngine');
    const triggerMock = audioEngine.triggerLayer as unknown as ReturnType<typeof vi.fn>;
    renderSequencer();
    await waitFor(() => expect(toneState.sequenceCallback).toBeTruthy(), { timeout: 3000 });

    await act(async () => {
      toneState.sequenceCallback!(2.0, 0);
    });
    // Step 0 has no offset → triggerLayer scheduled at the step time (2.0).
    expect(triggerMock).toHaveBeenCalled();
    const call = triggerMock.mock.calls.find((c: unknown[]) => (c[0] as { id?: string })?.id === 'l1');
    expect(call).toBeTruthy();
    // when === step time for a zero-offset step
    expect(call![3]).toBeCloseTo(2.0, 6);

    await act(async () => {
      toneState.sequenceCallback!(2.5, 1);
    });
    // Step 1 has cell.offset 0.25 → note lands at 2.5 + 0.03125.
    const call2 = triggerMock.mock.calls.find(
      (c: unknown[]) => (c[0] as { id?: string })?.id === 'l1' && (c[3] as number) > 2.5
    );
    expect(call2).toBeTruthy();
    expect(call2![3]).toBeCloseTo(2.5 + 0.25 * (60000 / 120) / 4 / 1000, 5);
  });

  it('falls back to the setInterval tick when Tone Transport is disabled', async () => {
    vi.useFakeTimers();
    const { audioEngine } = await import('../lib/audioEngine');
    const triggerMock = audioEngine.triggerLayer as unknown as ReturnType<typeof vi.fn>;
    renderSequencer();
    // Disable Tone Transport → the interval path drives tick().
    fireEvent.click(screen.getByLabelText('Tone Transport'));
    fireEvent.click(screen.getByRole('button', { name: /Play Pattern/i }));
    await act(async () => {
      vi.advanceTimersByTime(2000); // let several ticks fire
    });
    expect(triggerMock).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Tone Transport'));
    vi.useRealTimers();
  });
});
