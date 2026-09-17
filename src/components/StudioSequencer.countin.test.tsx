/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mount tests for the main-transport count-in: with step-record armed, Play
 * schedules count-in clicks on the audio clock and rolls the transport after
 * the count-in; unarmed play starts immediately; stopping during the count-in
 * cancels the pending start.
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
  setBpm: vi.fn(),
  setSwing: vi.fn(),
}));

vi.mock('../audio/transport/transport', () => ({
  initTransport: vi.fn(),
  getTransport: vi.fn(() => ({
    setBpm: transportMocks.setBpm,
    setTimeSignature: vi.fn(),
    setSwing: transportMocks.setSwing,
    play: transportMocks.play,
    pause: vi.fn(),
    stop: transportMocks.stop,
    getPosition: vi.fn(() => 0),
    isInitialized: () => true,
  })),
  resetTransport: vi.fn(),
}));

vi.mock('../lib/audioEngine', () => ({
  audioEngine: {
    getContext: vi.fn(() => ({ currentTime: 1, state: 'running', resume: vi.fn() })),
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

const metroState = vi.hoisted(() => ({
  scheduleAtBeat: vi.fn(),
  dispose: vi.fn(),
  setEnabled: vi.fn(),
  setVolume: vi.fn(),
}));

vi.mock('../audio/transport/metronome', () => ({
  createMetronome: vi.fn(() => ({
    scheduleAtBeat: metroState.scheduleAtBeat,
    dispose: metroState.dispose,
    setEnabled: metroState.setEnabled,
    setVolume: metroState.setVolume,
  })),
}));

vi.mock('../lib/db', () => {
  const table = () => ({
    put: vi.fn(async () => 'id'),
    toArray: vi.fn(async () => []),
    filter: vi.fn(() => ({ toArray: vi.fn(async () => []) })),
    where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(async () => []) })) })),
    delete: vi.fn(async () => undefined),
    get: vi.fn(async () => undefined),
    update: vi.fn(async () => 1),
  });
  return {
    db: {
      soundKits: table(),
      soundProjects: table(),
      favorites: table(),
      libraryFolders: table(),
      librarySamples: table(),
      projectDocuments: table(),
      chopMaps: table(),
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

import { StudioSequencer } from './StudioSequencer';
import type { SoundLayer } from '../types';
import { DEFAULT_FX, DEFAULT_SYNTH } from '../types';
import { usePatternStore } from '../store/patternStore';
import { createMetronome } from '../audio/transport/metronome';

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
  return render(
    <StudioSequencer
      layers={[makeLayer()]}
      selectedLayerId="l1"
      onSelectLayer={() => undefined}
      onUpdateLayer={() => undefined}
    />,
  );
}

const armRecord = () =>
  fireEvent.click(screen.getByTitle('Step-record pad/piano hits into the active pattern'));
const pressPlay = () => fireEvent.click(screen.getAllByLabelText('Play')[0]);

describe('StudioSequencer record count-in', () => {
  beforeEach(() => {
    toneState.sequenceCallback = null;
    metroState.scheduleAtBeat.mockClear();
    transportMocks.play.mockClear();
    transportMocks.stop.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    usePatternStore.getState().reset();
  });

  it('counts in on the audio clock, then rolls the transport when record is armed', async () => {
    vi.useFakeTimers();
    try {
      renderSequencer();
      armRecord();
      await act(async () => {
        pressPlay();
      });
      // 4 count-in clicks scheduled ahead of the audio clock (currentTime 1).
      expect(createMetronome).toHaveBeenCalled();
      expect(metroState.scheduleAtBeat).toHaveBeenCalledTimes(4);
      const times = metroState.scheduleAtBeat.mock.calls.map((c) => c[3] as number);
      expect(times[0]).toBeCloseTo(1.06, 6);
      expect(times[3]).toBeCloseTo(1.06 + 3 * 0.5, 6);
      // The transport has not started yet.
      expect(transportMocks.play).not.toHaveBeenCalled();
      expect(screen.getByText(/Count-in…/)).toBeDefined();

      // 4 beats at 120bpm = 2s later, the transport rolls.
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      expect(transportMocks.play).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts immediately when record is not armed', async () => {
    renderSequencer();
    await act(async () => {
      pressPlay();
    });
    expect(metroState.scheduleAtBeat).not.toHaveBeenCalled();
    expect(transportMocks.play).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending start when stopped during the count-in', async () => {
    vi.useFakeTimers();
    try {
      renderSequencer();
      armRecord();
      await act(async () => {
        pressPlay();
      });
      expect(metroState.scheduleAtBeat).toHaveBeenCalledTimes(4);
      await act(async () => {
        fireEvent.click(screen.getByLabelText('Stop')); // stop during count-in
        vi.advanceTimersByTime(5000);
      });
      expect(transportMocks.play).not.toHaveBeenCalled();
      expect(transportMocks.stop).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
