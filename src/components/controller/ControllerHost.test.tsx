/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the App-level controller host: section readout, section remap
 * through the owned engine, bridge delegation, and store-backed fallbacks.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SoundLayer } from '../../types';
import { DEFAULT_FX } from '../../types';

const hoisted = vi.hoisted(() => {
  const svc = {
    isSupported: vi.fn(() => true),
    subscribe: vi.fn(async (_handlers: unknown, _opts?: unknown) => true),
    setInputFilter: vi.fn(),
    listInputs: vi.fn(() => []),
    disable: vi.fn(async () => undefined),
    enable: vi.fn(async () => true),
  };
  return { svc };
});

vi.mock('../../lib/midiService', () => ({
  createMidiService: () => hoisted.svc,
}));

const audioMocks = vi.hoisted(() => ({
  triggerLayer: vi.fn(),
  setMasterLevel: vi.fn(),
}));

vi.mock('../../lib/audioEngine', () => ({ audioEngine: audioMocks }));

const compareMocks = vi.hoisted(() => ({
  setRefGain: vi.fn(),
  setSource: vi.fn(),
  setLoopA: vi.fn(),
  setLoopB: vi.fn(),
  getMeterData: vi.fn(() => ({ refRms: -20, mixRms: -14 })),
  loadTrackFromFile: vi.fn(),
  setMixBuffer: vi.fn(),
  playReference: vi.fn(),
  pauseReference: vi.fn(),
  stopReference: vi.fn(),
  playMixFile: vi.fn(),
  pauseMixFile: vi.fn(),
  stopMixFile: vi.fn(),
  getRefPlaybackPosition: vi.fn(() => 0),
  getMixPlaybackPosition: vi.fn(() => 0),
}));

vi.mock('../../audio/CompareEngine', () => ({ compareEngine: compareMocks }));

import { ControllerHost, isLayerAudible } from './ControllerHost';
import { useControllerStore } from '../../store/controllerStore';
import { useSequencerStore } from '../../store/sequencerStore';
import { usePatternStore } from '../../store/patternStore';
import { useCompareEngineStore } from '../../store/compareEngineStore';
import { useEvolutionStore, type EvolutionBridge } from '../../store/evolutionStore';
import { createDefaultMpd226Profile } from '../../lib/controller/defaultMpd226';
import {
  clearSequencerBridge,
  setSequencerBridge,
  type SequencerBridge,
} from '../../lib/controller/sequencerBridge';

const makeLayer = (id: string, name: string): SoundLayer => ({
  id,
  name,
  type: 'sample',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 },
  fx: { ...DEFAULT_FX },
});

const hostProps = (over: Partial<Parameters<typeof ControllerHost>[0]> = {}) => ({
  layers: [makeLayer('l1', 'Kick'), makeLayer('l2', 'Snare')],
  selectedLayerId: 'l1',
  updateLayer: vi.fn(),
  playAll: vi.fn(),
  stopStack: vi.fn(),
  stackPlaying: false,
  ...over,
});

const makeBridge = (over: Partial<SequencerBridge> = {}): SequencerBridge => ({
  getPadTune: vi.fn(() => ({})),
  getPadChoke: vi.fn(() => ({})),
  triggerLayer: vi.fn(),
  playNote: vi.fn(),
  stopNote: vi.fn(),
  getIsPlaying: vi.fn(() => false),
  togglePlay: vi.fn(),
  toggleRecord: vi.fn(),
  tapTempo: vi.fn(),
  setSwing: vi.fn(),
  getSelectedPad: vi.fn(() => 0),
  clearPad: vi.fn(),
  assignPad: vi.fn(),
  clearPattern: vi.fn(),
  quantizePattern: vi.fn(),
  humanizePattern: vi.fn(),
  applyGroove: vi.fn(),
  applyProgressionToPattern: vi.fn(),
  ...over,
});

const lastOnMessage = () =>
  (hoisted.svc.subscribe.mock.calls.at(-1)![0] as { onMessage: (e: unknown) => void }).onMessage;

/** Connect the mocked MIDI service through the rail's panel. */
async function expandAndConnect() {
  fireEvent.click(screen.getByRole('button', { name: /connect midi/i }));
  await waitFor(() => expect(hoisted.svc.subscribe).toHaveBeenCalled());
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  clearSequencerBridge();
  useControllerStore.getState().setProfile(createDefaultMpd226Profile());
  useControllerStore.getState().setMode('beat');
  useControllerStore.getState().setSection('produce');
  useControllerStore.getState().cancelLearn();
  useCompareEngineStore.setState({
    refGainDb: 0, activeSource: 'A', loopStart: 0, loopEnd: 10, loopEnabled: false, levelMatchEnabled: false,
  });
  useEvolutionStore.getState().clearBridge();
  useEvolutionStore.getState().selectIndex(0);
});

describe('ControllerHost dock', () => {
  it('shows the followed section and its control roles', () => {
    useControllerStore.getState().setSection('mixer');
    render(<ControllerHost {...hostProps()} />);
    expect(screen.getByRole('button', { name: /mpd · mixer/i })).toBeTruthy();
    expect(screen.getAllByText(/ch 1–4 gain/i).length).toBeGreaterThan(0);
  });

  it('notes when section follow is off in sampler/recourse modes', () => {
    useControllerStore.getState().setSamplerMode(true);
    render(<ControllerHost {...hostProps()} />);
    expect(screen.getByText(/section follow off/i)).toBeTruthy();
  });

  it('collapses the rail and restores it', () => {
    render(<ControllerHost {...hostProps()} />);
    // The rail is expanded by default, so the panel (and its connect button) is mounted.
    expect(screen.getByRole('button', { name: /connect midi/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /mpd ·/i }));
    expect(screen.queryByRole('button', { name: /connect midi/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /mpd ·/i }));
    expect(screen.getByRole('button', { name: /connect midi/i })).toBeTruthy();
  });
});

describe('ControllerHost engine', () => {
  it('drives mixer channels from faders/knobs in the mixer section', async () => {
    const p = hostProps();
    render(<ControllerHost {...p} />);
    await expandAndConnect();
    useControllerStore.getState().setSection('mixer');

    act(() => { lastOnMessage()({ type: 'cc', controller: 20, value: 100, channel: 1 }); });
    expect(p.updateLayer).toHaveBeenCalledWith('l1', { gain: expect.any(Number) });

    // K1 (CC 3) drives channel 1 pan; K2 (CC 9) drives channel 2 pan.
    act(() => { lastOnMessage()({ type: 'cc', controller: 3, value: 0, channel: 1 }); });
    expect(p.updateLayer).toHaveBeenCalledWith('l1', { pan: -1 });
    act(() => { lastOnMessage()({ type: 'cc', controller: 9, value: 127, channel: 1 }); });
    expect(p.updateLayer).toHaveBeenCalledWith('l2', { pan: 1 });
  });

  it('drives tweaking params on the selected layer', async () => {
    const p = hostProps();
    render(<ControllerHost {...p} />);
    await expandAndConnect();
    useControllerStore.getState().setSection('tweaking');

    act(() => { lastOnMessage()({ type: 'cc', controller: 3, value: 127, channel: 1 }); });
    const calls = (p.updateLayer as ReturnType<typeof vi.fn>).mock.calls;
    const cutoff = calls.find((c) => (c[1] as { fx?: object }).fx);
    expect(cutoff?.[0]).toBe('l1');
    expect((cutoff?.[1] as { fx: { filterFreq: number } }).fx.filterFreq).toBe(18000);
  });

  it('drives Beat Studio transport and tap tempo through the bridge when mounted', async () => {
    const togglePlay = vi.fn();
    const tapTempo = vi.fn();
    setSequencerBridge(makeBridge({ togglePlay, tapTempo, getIsPlaying: () => false }));
    const p = hostProps();
    render(<ControllerHost {...p} />);
    await expandAndConnect();

    act(() => { lastOnMessage()({ type: 'cc', controller: 118, value: 127, channel: 1 }); });
    expect(togglePlay).toHaveBeenCalled();
    expect(p.playAll).not.toHaveBeenCalled();

    // Bank-1 switch 1 (CC 36) rebound to tap tempo → bridge.tapTempo.
    useControllerStore.getState().setBinding('switch:0:0', { action: 'transport:tap' });
    act(() => { lastOnMessage()({ type: 'cc', controller: 36, value: 127, channel: 1 }); });
    expect(tapTempo).toHaveBeenCalled();
  });

  it('falls back to layer-stack transport off the Beat Studio tab', async () => {
    const p = hostProps();
    render(<ControllerHost {...p} />);
    await expandAndConnect();

    act(() => { lastOnMessage()({ type: 'cc', controller: 118, value: 127, channel: 1 }); });
    expect(p.playAll).toHaveBeenCalled();
  });

  it('previews the selected layer from pads when the sequencer is unmounted', async () => {
    useSequencerStore.getState().setPatternProgramSlot('A', 'A', 0, 'l1');
    const p = hostProps();
    render(<ControllerHost {...p} />);
    await expandAndConnect();

    act(() => { lastOnMessage()({ type: 'noteon', note: 36, velocity: 100, channel: 1 }); });
    expect(audioMocks.triggerLayer).toHaveBeenCalled();
    // Chord pad (bank D → note 84): the fallback pitches the selected layer.
    const calls = audioMocks.triggerLayer.mock.calls.length;
    act(() => { lastOnMessage()({ type: 'noteon', note: 84, velocity: 100, channel: 1 }); });
    act(() => { lastOnMessage()({ type: 'noteoff', note: 84, channel: 1 }); });
    expect(audioMocks.triggerLayer.mock.calls.length).toBeGreaterThan(calls);
    useSequencerStore.getState().setPatternProgramSlot('A', 'A', 0, null);
  });

  it('drives Beat Studio pad and pattern ops through the bridge when mounted', async () => {
    const bridge = makeBridge();
    setSequencerBridge(bridge);
    const p = hostProps();
    render(<ControllerHost {...p} />);
    await expandAndConnect();
    useControllerStore.setState((s) => ({
      profile: {
        ...s.profile,
        bindings: Object.fromEntries(
          Object.entries(s.profile.bindings).map(([k, v]) => [k, { ...v, enabled: true }])
        ),
      },
    }));

    // CC 41 = pad:clear, CC 30 = tempo:swing (bank-1, enabled above).
    act(() => { lastOnMessage()({ type: 'cc', controller: 41, value: 127, channel: 1 }); });
    expect(bridge.clearPad).toHaveBeenCalledWith(0);
    act(() => { lastOnMessage()({ type: 'cc', controller: 30, value: 64, channel: 1 }); });
    expect(bridge.setSwing).toHaveBeenCalled();
  });

  it('falls back to store-backed pad, pattern, swing and tap-tempo ops', async () => {
    const p = hostProps();
    render(<ControllerHost {...p} />);
    await expandAndConnect();
    useControllerStore.setState((s) => ({
      profile: {
        ...s.profile,
        bindings: Object.fromEntries(
          Object.entries(s.profile.bindings).map(([k, v]) => [k, { ...v, enabled: true }])
        ),
      },
    }));
    // Borrow bank-0 switches (verified CCs) for ops with no default binding.
    useControllerStore.getState().setBinding('switch:0:1', { action: 'pad:assign' });
    useControllerStore.getState().setBinding('switch:0:2', { action: 'pattern:clear' });
    useControllerStore.getState().setBinding('switch:0:0', { action: 'transport:tap' });

    // pad:clear (CC 41) empties the seeded slot; pad:assign (CC 37) refills it.
    useSequencerStore.getState().setPatternProgramSlot('A', 'A', 0, 'l1');
    act(() => { lastOnMessage()({ type: 'cc', controller: 41, value: 127, channel: 1 }); });
    expect(useSequencerStore.getState().programs.A[0]).toBeNull();
    act(() => { lastOnMessage()({ type: 'cc', controller: 37, value: 127, channel: 1 }); });
    expect(useSequencerStore.getState().programs.A[0]).toBe('l1');

    // pattern:clear (CC 38) and swing (CC 30) write the pattern store.
    act(() => { lastOnMessage()({ type: 'cc', controller: 38, value: 127, channel: 1 }); });
    act(() => { lastOnMessage()({ type: 'cc', controller: 30, value: 127, channel: 1 }); });
    expect(usePatternStore.getState().patterns.A.swing).toBeGreaterThan(0);

    // Tap tempo (CC 36) with a fake clock: two taps set 120 BPM, a stale
    // third tap resets the buffer, extras roll the window.
    const nowSpy = vi.spyOn(performance, 'now');
    try {
      for (const t of [1000, 1500, 1600, 1700, 1800]) {
        nowSpy.mockReturnValue(t);
        act(() => { lastOnMessage()({ type: 'cc', controller: 36, value: 127, channel: 1 }); });
      }
      nowSpy.mockReturnValue(5000);
      act(() => { lastOnMessage()({ type: 'cc', controller: 36, value: 127, channel: 1 }); });
    } finally {
      nowSpy.mockRestore();
    }
    expect(usePatternStore.getState().patterns.A.bpm).toBe(200);
  });

  it('treats arrange edits as safe no-ops without the sequencer', async () => {
    const p = hostProps();
    render(<ControllerHost {...p} />);
    await expandAndConnect();
    // Enable the switch bindings (they ship disabled — preset #15 sends no
    // switch MIDI) so quantize/humanize/groove can be exercised.
    useControllerStore.setState((s) => ({
      profile: {
        ...s.profile,
        bindings: Object.fromEntries(
          Object.entries(s.profile.bindings).map(([k, v]) => [k, { ...v, enabled: true }])
        ),
      },
    }));

    // CC 39 = pattern:quantize, CC 42 = pattern:humanize, CC 43 = groove:next.
    // With no bridge these must not throw and must not touch the stack.
    act(() => { lastOnMessage()({ type: 'cc', controller: 39, value: 127, channel: 1 }); });
    act(() => { lastOnMessage()({ type: 'cc', controller: 42, value: 127, channel: 1 }); });
    act(() => { lastOnMessage()({ type: 'cc', controller: 43, value: 127, channel: 1 }); });
    expect(p.updateLayer).not.toHaveBeenCalled();
    expect(p.playAll).not.toHaveBeenCalled();
  });

  it('drives every Compare section control', async () => {
    useCompareEngineStore.setState({
      referenceTracks: [{ id: 't1', name: 'Ref', buffer: {} as AudioBuffer, duration: 12, channels: 2, peakMap: [] }],
    });
    const p = hostProps();
    render(<ControllerHost {...p} />);
    await expandAndConnect();
    useControllerStore.getState().setSection('compare');

    // Bank-1 knobs K1–K4 and faders F1–F4 (CC 3/9/14/15, 20/21/22/23).
    act(() => { lastOnMessage()({ type: 'cc', controller: 3, value: 127, channel: 1 }); }); // K1 ref gain
    expect(useCompareEngineStore.getState().refGainDb).toBe(18);
    act(() => { lastOnMessage()({ type: 'cc', controller: 9, value: 127, channel: 1 }); }); // K2 loop start
    act(() => { lastOnMessage()({ type: 'cc', controller: 14, value: 127, channel: 1 }); }); // K3 loop end
    act(() => { lastOnMessage()({ type: 'cc', controller: 15, value: 0, channel: 1 }); }); // K4 track 1
    act(() => { lastOnMessage()({ type: 'cc', controller: 20, value: 127, channel: 1 }); }); // F1 source B
    act(() => { lastOnMessage()({ type: 'cc', controller: 21, value: 127, channel: 1 }); }); // F2 loop on
    act(() => { lastOnMessage()({ type: 'cc', controller: 22, value: 127, channel: 1 }); }); // F3 level match
    act(() => { lastOnMessage()({ type: 'cc', controller: 23, value: 127, channel: 1 }); }); // F4 loop sync

    const cmp = useCompareEngineStore.getState();
    expect(cmp.loopStart).toBeGreaterThan(0);
    expect(cmp.loopEnd).toBeGreaterThan(0);
    expect(cmp.activeTrackId).toBe('t1');
    expect(cmp.activeSource).toBe('B');
    expect(cmp.loopEnabled).toBe(true);
    expect(cmp.loopSync).toBe(true);
    // Level-match recomputed the reference gain from the meters (mix − ref).
    expect(compareMocks.getMeterData).toHaveBeenCalled();
    expect(cmp.refGainDb).toBe(6);

    // A low value on F1 selects source A again.
    act(() => { lastOnMessage()({ type: 'cc', controller: 20, value: 0, channel: 1 }); });
    expect(useCompareEngineStore.getState().activeSource).toBe('A');
  });

  it('drives every Evolution section control through its bridge', async () => {
    const bridge = {
      setMode: vi.fn(), setFx: vi.fn(), reEvolve: vi.fn(),
      playVariation: vi.fn(), stopPlayback: vi.fn(), addVariation: vi.fn(),
      saveVariationToKit: vi.fn(), discardVariation: vi.fn(), variationCount: vi.fn(() => 4),
    } satisfies EvolutionBridge;
    useEvolutionStore.getState().setBridge(bridge);
    useEvolutionStore.getState().selectIndex(0);

    const p = hostProps();
    render(<ControllerHost {...p} />);
    await expandAndConnect();
    useControllerStore.getState().setSection('evolution');

    // Knobs: mode / fx / variation / re-evolve (rising edge).
    act(() => { lastOnMessage()({ type: 'cc', controller: 3, value: 127, channel: 1 }); });
    expect(bridge.setMode).toHaveBeenCalledWith('kit');
    act(() => { lastOnMessage()({ type: 'cc', controller: 9, value: 0, channel: 1 }); });
    expect(bridge.setFx).toHaveBeenCalledWith('mutate');
    act(() => { lastOnMessage()({ type: 'cc', controller: 14, value: 64, channel: 1 }); });
    expect(useEvolutionStore.getState().selectedIndex).toBe(8);
    act(() => { lastOnMessage()({ type: 'cc', controller: 15, value: 127, channel: 1 }); });
    expect(bridge.reEvolve).toHaveBeenCalled();

    // Faders: preview / add / save / discard (edge-triggered one-shots).
    act(() => { lastOnMessage()({ type: 'cc', controller: 20, value: 127, channel: 1 }); });
    expect(bridge.playVariation).toHaveBeenCalledWith(8);
    act(() => { lastOnMessage()({ type: 'cc', controller: 20, value: 0, channel: 1 }); });
    expect(bridge.stopPlayback).toHaveBeenCalled();
    for (const cc of [21, 22, 23]) {
      act(() => { lastOnMessage()({ type: 'cc', controller: cc, value: 127, channel: 1 }); });
      act(() => { lastOnMessage()({ type: 'cc', controller: cc, value: 127, channel: 1 }); });
    }
    expect(bridge.addVariation).toHaveBeenCalledTimes(1);
    expect(bridge.saveVariationToKit).toHaveBeenCalledTimes(1);
    expect(bridge.discardVariation).toHaveBeenCalledTimes(1);

    useEvolutionStore.getState().clearBridge();
  });
});

describe('isLayerAudible', () => {
  it('respects enabled/muted/solo', () => {
    const layers = [makeLayer('l1', 'A'), makeLayer('l2', 'B')];
    expect(isLayerAudible(layers[0], layers)).toBe(true);
    expect(isLayerAudible({ ...layers[0], muted: true }, layers)).toBe(false);
    expect(isLayerAudible({ ...layers[0], enabled: false }, layers)).toBe(false);
    const solo = [layers[0], { ...layers[1], soloed: true }];
    expect(isLayerAudible(solo[0], solo)).toBe(false);
    expect(isLayerAudible(solo[1], solo)).toBe(true);
  });
});
