/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/store/compareEngineStore.ts` — the A/B reference-vs-mix
 * comparison store. `compareEngine` (the real audio engine) is mocked so the
 * store's state transitions can be tested in isolation.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useCompareEngineStore } from './compareEngineStore';

vi.mock('../audio/CompareEngine', () => {
  const engine = {
    loadTrackFromFile: vi.fn(),
    setMixBuffer: vi.fn(),
    setSource: vi.fn(),
    setRefGain: vi.fn(),
    playReference: vi.fn(),
    pauseReference: vi.fn(),
    stopReference: vi.fn(),
    playMixFile: vi.fn(),
    pauseMixFile: vi.fn(),
    stopMixFile: vi.fn(),
    getRefPlaybackPosition: vi.fn(() => 0),
    getMixPlaybackPosition: vi.fn(() => 0),
    setLoopA: vi.fn(),
    setLoopB: vi.fn(),
    getMeterData: vi.fn(() => ({ mixRms: 0, refRms: 0 })),
  };
  return { compareEngine: engine, CompareEngine: class {} };
});

import { compareEngine } from '../audio/CompareEngine';

const mockEngine = compareEngine as any;

const makeTrack = (id: string, duration = 10) => ({
  id,
  name: `Track ${id}`,
  duration,
  channels: 2,
  peakMap: [] as number[],
  buffer: { duration } as AudioBuffer,
});

const resetState = () => useCompareEngineStore.setState({
  referenceTracks: [],
  activeTrackId: null,
  isPlayingRef: false,
  isPlayingMix: false,
  activeSource: 'A',
  refGainDb: 0,
  loopSync: true,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 10,
  levelMatchEnabled: false,
  snapshots: [],
  mixTrackName: null,
  mixTrackDuration: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
});

describe('initial state', () => {
  it('starts empty with defaults', () => {
    const s = useCompareEngineStore.getState();
    expect(s.referenceTracks).toEqual([]);
    expect(s.activeTrackId).toBeNull();
    expect(s.activeSource).toBe('A');
    expect(s.loopSync).toBe(true);
    expect(s.snapshots).toEqual([]);
  });
});

describe('loadReferenceTrack', () => {
  it('adds the track and selects it as active', async () => {
    mockEngine.loadTrackFromFile.mockResolvedValue(makeTrack('t1', 8));
    await useCompareEngineStore.getState().loadReferenceTrack({} as File);
    const s = useCompareEngineStore.getState();
    expect(s.referenceTracks).toHaveLength(1);
    expect(s.activeTrackId).toBe('t1');
    // loopEnd capped at 10s
    expect(s.loopEnd).toBe(8);
  });

  it('keeps the existing active track when one is already selected', async () => {
    mockEngine.loadTrackFromFile.mockResolvedValue(makeTrack('t1'));
    const store = useCompareEngineStore;
    await store.getState().loadReferenceTrack({} as File);
    mockEngine.loadTrackFromFile.mockResolvedValue(makeTrack('t2'));
    await store.getState().loadReferenceTrack({} as File);
    expect(useCompareEngineStore.getState().activeTrackId).toBe('t1');
    expect(useCompareEngineStore.getState().referenceTracks).toHaveLength(2);
  });

  it('swallows load errors', async () => {
    mockEngine.loadTrackFromFile.mockRejectedValue(new Error('boom'));
    await expect(useCompareEngineStore.getState().loadReferenceTrack({} as File)).resolves.toBeUndefined();
    expect(useCompareEngineStore.getState().referenceTracks).toHaveLength(0);
  });
});

describe('loadMixTrack', () => {
  it('sets the mix buffer, name and duration', async () => {
    mockEngine.loadTrackFromFile.mockResolvedValue(makeTrack('mix', 5));
    await useCompareEngineStore.getState().loadMixTrack({} as File);
    expect(mockEngine.setMixBuffer).toHaveBeenCalled();
    expect(useCompareEngineStore.getState().mixTrackName).toBe('Track mix');
    expect(useCompareEngineStore.getState().mixTrackDuration).toBe(5);
  });
});

describe('selectReferenceTrack', () => {
  it('selects an existing track', () => {
    useCompareEngineStore.setState({ referenceTracks: [makeTrack('a'), makeTrack('b')], activeTrackId: 'a' });
    useCompareEngineStore.getState().selectReferenceTrack('b');
    expect(useCompareEngineStore.getState().activeTrackId).toBe('b');
  });

  it('ignores unknown ids', () => {
    useCompareEngineStore.setState({ referenceTracks: [makeTrack('a')], activeTrackId: 'a' });
    useCompareEngineStore.getState().selectReferenceTrack('nope');
    expect(useCompareEngineStore.getState().activeTrackId).toBe('a');
  });

  it('restarts playback from 0 when already playing', () => {
    useCompareEngineStore.setState({ referenceTracks: [makeTrack('a'), makeTrack('b')], activeTrackId: 'a', isPlayingRef: true });
    useCompareEngineStore.getState().selectReferenceTrack('b');
    expect(mockEngine.playReference).toHaveBeenCalledWith(expect.anything(), 0);
  });
});

describe('removeReferenceTrack', () => {
  it('removes the track and promotes the first remaining', () => {
    useCompareEngineStore.setState({ referenceTracks: [makeTrack('a'), makeTrack('b')], activeTrackId: 'a' });
    useCompareEngineStore.getState().removeReferenceTrack('a');
    const s = useCompareEngineStore.getState();
    expect(s.referenceTracks.map((t) => t.id)).toEqual(['b']);
    expect(s.activeTrackId).toBe('b');
  });

  it('clears the active id when the last track is removed', () => {
    useCompareEngineStore.setState({ referenceTracks: [makeTrack('a')], activeTrackId: 'a' });
    useCompareEngineStore.getState().removeReferenceTrack('a');
    expect(useCompareEngineStore.getState().activeTrackId).toBeNull();
  });
});

describe('setSource', () => {
  it('updates the active source and notifies the engine', () => {
    useCompareEngineStore.getState().setSource('B');
    expect(useCompareEngineStore.getState().activeSource).toBe('B');
    expect(mockEngine.setSource).toHaveBeenCalledWith('B');
  });
});

describe('togglePlayRef / stopRef', () => {
  it('starts playback from the stored position', () => {
    useCompareEngineStore.setState({ referenceTracks: [makeTrack('a')], activeTrackId: 'a' });
    mockEngine.getRefPlaybackPosition.mockReturnValue(3);
    useCompareEngineStore.getState().togglePlayRef();
    expect(mockEngine.playReference).toHaveBeenCalledWith(expect.anything(), 3);
    expect(useCompareEngineStore.getState().isPlayingRef).toBe(true);
  });

  it('pauses when already playing', () => {
    useCompareEngineStore.setState({ referenceTracks: [makeTrack('a')], activeTrackId: 'a', isPlayingRef: true });
    useCompareEngineStore.getState().togglePlayRef();
    expect(mockEngine.pauseReference).toHaveBeenCalled();
    expect(useCompareEngineStore.getState().isPlayingRef).toBe(false);
  });

  it('does nothing without an active track', () => {
    useCompareEngineStore.getState().togglePlayRef();
    expect(mockEngine.playReference).not.toHaveBeenCalled();
    expect(useCompareEngineStore.getState().isPlayingRef).toBe(false);
  });

  it('stopRef stops and clears the flag', () => {
    useCompareEngineStore.setState({ isPlayingRef: true });
    useCompareEngineStore.getState().stopRef();
    expect(mockEngine.stopReference).toHaveBeenCalled();
    expect(useCompareEngineStore.getState().isPlayingRef).toBe(false);
  });
});

describe('setLoop', () => {
  it('mirrors loop B when loop sync is enabled', () => {
    useCompareEngineStore.getState().setLoop(1, 5, true);
    expect(mockEngine.setLoopA).toHaveBeenCalledWith(1, 5, true);
    expect(mockEngine.setLoopB).toHaveBeenCalledWith(1, 5, true);
    expect(useCompareEngineStore.getState().loopStart).toBe(1);
    expect(useCompareEngineStore.getState().loopEnd).toBe(5);
    expect(useCompareEngineStore.getState().loopEnabled).toBe(true);
  });

  it('skips loop B when loop sync is disabled', () => {
    useCompareEngineStore.setState({ loopSync: false });
    useCompareEngineStore.getState().setLoop(1, 5, false);
    expect(mockEngine.setLoopA).toHaveBeenCalledWith(1, 5, false);
    expect(mockEngine.setLoopB).not.toHaveBeenCalled();
  });
});

describe('triggerLevelMatch', () => {
  it('computes the gain offset from meter RMS and clamps to ±18 dB', () => {
    mockEngine.getMeterData.mockReturnValue({ mixRms: 0.8, refRms: 0.2 }); // diff = 0.6
    useCompareEngineStore.getState().triggerLevelMatch();
    expect(mockEngine.setRefGain).toHaveBeenCalledWith(expect.closeTo(0.6, 5));
    expect(useCompareEngineStore.getState().refGainDb).toBeCloseTo(0.6, 5);
    expect(useCompareEngineStore.getState().levelMatchEnabled).toBe(true);
  });

  it('clamps an extreme difference', () => {
    mockEngine.getMeterData.mockReturnValue({ mixRms: 1.0, refRms: 0.01 }); // diff = +0.99
    useCompareEngineStore.getState().triggerLevelMatch();
    expect(mockEngine.setRefGain).toHaveBeenCalledWith(0.99);
  });
});

describe('snapshots', () => {
  it('saveSnapshot requires an active track', () => {
    useCompareEngineStore.getState().saveSnapshot('take A');
    expect(useCompareEngineStore.getState().snapshots).toHaveLength(0);
  });

  it('saveSnapshot captures the current ref state and caps at 20', () => {
    useCompareEngineStore.setState({
      referenceTracks: [makeTrack('a')],
      activeTrackId: 'a',
      refGainDb: -3,
      loopStart: 1,
      loopEnd: 4,
    });
    useCompareEngineStore.getState().saveSnapshot('take A');
    const s = useCompareEngineStore.getState();
    expect(s.snapshots).toHaveLength(1);
    expect(s.snapshots[0]).toMatchObject({ name: 'take A', refTrackId: 'a', refGainOffset: -3, loopStart: 1, loopEnd: 4 });

    // cap at 20
    for (let i = 0; i < 25; i++) useCompareEngineStore.getState().saveSnapshot(`s${i}`);
    expect(useCompareEngineStore.getState().snapshots).toHaveLength(20);
  });

  it('loadSnapshot restores gain and loop, and only if the track still exists', () => {
    useCompareEngineStore.setState({
      referenceTracks: [makeTrack('a'), makeTrack('b')],
      activeTrackId: 'b',
      refGainDb: 0,
      snapshots: [{ id: 'snap1', name: 'x', refTrackId: 'a', refGainOffset: 2, loopStart: 0, loopEnd: 6, createdAt: 't' }],
    });
    useCompareEngineStore.getState().loadSnapshot('snap1');
    const s = useCompareEngineStore.getState();
    expect(s.activeTrackId).toBe('a');
    expect(s.refGainDb).toBe(2);
    expect(s.loopEnd).toBe(6);
    expect(mockEngine.setRefGain).toHaveBeenCalledWith(2);
    expect(mockEngine.setLoopA).toHaveBeenCalledWith(0, 6, true);
  });

  it('loadSnapshot ignores unknown ids', () => {
    useCompareEngineStore.setState({ snapshots: [{ id: 'snap1', name: 'x', refTrackId: 'a', refGainOffset: 0, loopStart: 0, loopEnd: 1, createdAt: 't' }] });
    useCompareEngineStore.getState().loadSnapshot('nope');
    expect(useCompareEngineStore.getState().refGainDb).toBe(0);
  });

  it('deleteSnapshot removes the snapshot', () => {
    useCompareEngineStore.setState({
      snapshots: [
        { id: 'a', name: 'x', refTrackId: 't', refGainOffset: 0, loopStart: 0, loopEnd: 1, createdAt: 't' },
        { id: 'b', name: 'y', refTrackId: 't', refGainOffset: 0, loopStart: 0, loopEnd: 1, createdAt: 't' },
      ],
    });
    useCompareEngineStore.getState().deleteSnapshot('a');
    expect(useCompareEngineStore.getState().snapshots.map((s) => s.id)).toEqual(['b']);
  });
});
