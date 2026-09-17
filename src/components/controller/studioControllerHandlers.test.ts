/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import {
  createStudioControllerHandlers,
  cycleScale,
  generateProgressionFromChord,
  shiftKey,
  type StudioControllerDeps,
} from './studioControllerHandlers';
import { GROOVE_TEMPLATES } from '../../lib/grooveTemplates';
import { DEFAULT_CHORD_SETTINGS } from '../../lib/controller/chordPads';
import { DEFAULT_FX, DEFAULT_SYNTH, type SoundLayer } from '../../types';

const makeLayer = (withSynth = true): SoundLayer => ({
  id: 'l1',
  name: 'Lead',
  type: withSynth ? 'synth' : 'sample',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3 },
  fx: { ...DEFAULT_FX },
  ...(withSynth ? { synth: { ...DEFAULT_SYNTH, fmDepth: 1 } } : {}),
});

const program = (first: string | null = 'l1') => {
  const slots = Array.from({ length: 16 }, () => null as string | null);
  slots[0] = first;
  return slots;
};

function makeDeps(over: Partial<StudioControllerDeps> = {}): StudioControllerDeps {
  return {
    getPrograms: vi.fn(() => ({ A: program(), B: program(), C: program(), D: program() })),
    getActiveBank: vi.fn(() => 'A'),
    setActiveBank: vi.fn(),
    followPadBank: vi.fn(() => true),
    getPadTune: vi.fn(() => ({ l1: 2 })),
    getPadChoke: vi.fn(() => ({ l1: 1 })),
    triggerLayer: vi.fn(),
    playNote: vi.fn(),
    stopNote: vi.fn(),
    getIsPlaying: vi.fn(() => false),
    togglePlay: vi.fn(),
    toggleRecord: vi.fn(),
    tapTempo: vi.fn(),
    setBpm: vi.fn(),
    setSwing: vi.fn(),
    setMaster: vi.fn(),
    getActiveLayer: vi.fn(() => makeLayer()),
    getLayers: vi.fn(() => [makeLayer(), { ...makeLayer(), id: 'l2', name: 'Bass' }]),
    updateLayer: vi.fn(),
    setLayerSend: vi.fn(),
    getSelectedPad: vi.fn(() => 0),
    clearPad: vi.fn(),
    assignPad: vi.fn(),
    togglePadMute: vi.fn(),
    selectLayer: vi.fn(),
    toggleChannelMute: vi.fn(),
    clearPattern: vi.fn(),
    quantizePattern: vi.fn(),
    humanizePattern: vi.fn(),
    applyGroove: vi.fn(),
    getChord: vi.fn(() => ({ ...DEFAULT_CHORD_SETTINGS })),
    setChord: vi.fn(),
    setChordParam: vi.fn(),
    generateProgression: vi.fn(() => [
      { root: 'C', type: 'm7', duration: 4 },
      { root: 'F', type: 'maj7', duration: 4 },
    ]),
    applyProgressionToPattern: vi.fn(),
    sampleCommand: vi.fn(),
    sampleParam: vi.fn(),
    samplePad: vi.fn(),
    recourseCommand: vi.fn(),
    recourseParam: vi.fn(),
    sectionCompare: vi.fn(),
    sectionEvolution: vi.fn(),
    ...over,
  };
}

const build = (deps: StudioControllerDeps) => createStudioControllerHandlers(() => deps);

afterEach(() => {
  vi.useRealTimers();
});

describe('helpers', () => {
  it('shifts keys around the circle', () => {
    expect(shiftKey('C', 1)).toBe('Db');
    expect(shiftKey('C', -1)).toBe('B');
    expect(shiftKey('unknown', 1)).toBe('Db');
  });

  it('cycles scale presets', () => {
    expect(cycleScale('major', 1)).toBe('minor');
    expect(cycleScale('major', -1)).toBe('melodic minor');
    expect(cycleScale('nonsense', 1)).toBe('minor');
  });

  it('generates a progression from chord settings', () => {
    const prog = generateProgressionFromChord({ ...DEFAULT_CHORD_SETTINGS, key: 'A', seventh: true });
    expect(prog.length).toBeGreaterThan(0);
    expect(prog.every((c) => typeof c.root === 'string' && typeof c.type === 'string')).toBe(true);
  });
});

describe('pad + note handlers', () => {
  it('triggers a program pad with tune and choke', () => {
    const deps = makeDeps();
    build(deps).triggerPad('A', 0, 0.9);
    expect(deps.setActiveBank).toHaveBeenCalledWith('A');
    expect(deps.triggerLayer).toHaveBeenCalledWith('l1', 2, 0.9, 'choke:1');
  });

  it('does not switch banks when followPadBank is off', () => {
    const deps = makeDeps({ followPadBank: vi.fn(() => false) });
    build(deps).triggerPad('B', 0, 1);
    expect(deps.setActiveBank).not.toHaveBeenCalled();
  });

  it('ignores empty pad slots', () => {
    const deps = makeDeps({ getPrograms: vi.fn(() => ({ A: program(null) })) });
    build(deps).triggerPad('A', 0, 1);
    expect(deps.triggerLayer).not.toHaveBeenCalled();
  });

  it('forwards note on/off', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.playNote(64, 0.5);
    h.stopNote(64);
    expect(deps.playNote).toHaveBeenCalledWith(64, 0.5);
    expect(deps.stopNote).toHaveBeenCalledWith(64);
  });
});

describe('chord pads', () => {
  it('plays a block chord and releases it', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.playChord(0, 0.9);
    expect(deps.playNote).toHaveBeenCalledTimes(3);
    expect(deps.playNote).toHaveBeenCalledWith(60, 0.9);
    h.stopChord(0);
    expect(deps.stopNote).toHaveBeenCalledTimes(3);
  });

  it('strums and cancels pending notes on release', () => {
    vi.useFakeTimers();
    const deps = makeDeps({ getChord: vi.fn(() => ({ ...DEFAULT_CHORD_SETTINGS, strumMs: 20 })) });
    const h = build(deps);
    h.playChord(0, 0.9);
    expect(deps.playNote).toHaveBeenCalledWith(60, 0.9);
    act(() => { vi.advanceTimersByTime(25); });
    expect(deps.playNote).toHaveBeenCalledWith(63, 0.9);
    h.stopChord(0);
    act(() => { vi.advanceTimersByTime(50); });
    expect(deps.playNote).not.toHaveBeenCalledWith(67, 0.9);
  });

  it('previews a generated progression', () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    const h = build(deps);
    h.chordCommand('generate');
    act(() => { vi.advanceTimersByTime(0); });
    expect(deps.playNote).toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1300); });
    expect(deps.stopNote).toHaveBeenCalled();
  });

  it('applies a generated progression to the pattern', () => {
    const deps = makeDeps();
    build(deps).chordCommand('toPattern');
    expect(deps.applyProgressionToPattern).toHaveBeenCalledWith([
      { root: 'C', type: 'm7', duration: 4 },
      { root: 'F', type: 'maj7', duration: 4 },
    ]);
  });

  it('changes key, scale and 7ths', () => {
    const setChord = vi.fn();
    const deps = makeDeps({ getChord: vi.fn(() => ({ ...DEFAULT_CHORD_SETTINGS, seventh: false, key: 'C', scale: 'major' })), setChord });
    const h = build(deps);
    h.chordCommand('toggle');
    expect(setChord).toHaveBeenCalledWith({ seventh: true });
    h.chordCommand('keyUp');
    expect(setChord).toHaveBeenCalledWith({ key: 'Db' });
    h.chordCommand('keyDown');
    expect(setChord).toHaveBeenCalledWith({ key: 'B' });
    h.chordCommand('scaleUp');
    expect(setChord).toHaveBeenCalledWith({ scale: 'minor' });
    h.chordCommand('scaleDown');
    expect(setChord).toHaveBeenCalledWith({ scale: 'melodic minor' });
    h.chordCommand('unknown');
    expect(setChord).toHaveBeenCalledTimes(5);
  });

  it('forwards chord parameters', () => {
    const deps = makeDeps();
    build(deps).setChordParam('octave', 5);
    expect(deps.setChordParam).toHaveBeenCalledWith('octave', 5);
  });
});

describe('transport + parameters', () => {
  it('handles transport commands', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.transport('play');
    h.transport('record');
    h.transport('tap');
    h.transport('toggle');
    expect(deps.togglePlay).toHaveBeenCalledTimes(2);
    expect(deps.toggleRecord).toHaveBeenCalled();
    expect(deps.tapTempo).toHaveBeenCalled();
  });

  it('does not toggle when already in the requested state', () => {
    const playing = makeDeps({ getIsPlaying: vi.fn(() => true) });
    build(playing).transport('play');
    expect(playing.togglePlay).not.toHaveBeenCalled();
    build(playing).transport('stop');
    expect(playing.togglePlay).toHaveBeenCalled();

    const stopped = makeDeps({ getIsPlaying: vi.fn(() => false) });
    build(stopped).transport('stop');
    expect(stopped.togglePlay).not.toHaveBeenCalled();
  });

  it('clamps tempo and swing', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.setBpm(1000);
    h.setBpm(10);
    h.setSwing(100);
    h.setSwing(-5);
    expect(deps.setBpm).toHaveBeenNthCalledWith(1, 200);
    expect(deps.setBpm).toHaveBeenNthCalledWith(2, 60);
    expect(deps.setSwing).toHaveBeenNthCalledWith(1, 75);
    expect(deps.setSwing).toHaveBeenNthCalledWith(2, 0);
    h.setMaster(0.7);
    expect(deps.setMaster).toHaveBeenCalledWith(0.7);
  });

  it('updates layer gain, pan, tune, sends and fx', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.setLayerGain(0.5);
    h.setLayerPan(-0.5);
    h.setLayerTune(3.6);
    h.setLayerSend('reverb', 0.4);
    h.setFxParam('filterFreq', 1200);
    expect(deps.updateLayer).toHaveBeenCalledWith('l1', { gain: 0.5 });
    expect(deps.updateLayer).toHaveBeenCalledWith('l1', { pan: -0.5 });
    expect(deps.updateLayer).toHaveBeenCalledWith('l1', { pitch: 4 });
    expect(deps.setLayerSend).toHaveBeenCalledWith('l1', 'reverb', 0.4);
    const fxCall = (deps.updateLayer as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[1].fx);
    expect(fxCall![1].fx.filterFreq).toBe(1200);
  });

  it('skips layer updates when no layer is active', () => {
    const deps = makeDeps({ getActiveLayer: vi.fn(() => null) });
    const h = build(deps);
    h.setLayerGain(0.5);
    h.setLayerPan(0.5);
    h.setLayerTune(1);
    h.setLayerSend('delay', 0.2);
    h.setFxParam('distortion', 10);
    h.setSynthParam('fmDepth', 2);
    expect(deps.updateLayer).not.toHaveBeenCalled();
    expect(deps.setLayerSend).not.toHaveBeenCalled();
  });

  it('updates synth params only for synth layers', () => {
    const withSynth = makeDeps();
    build(withSynth).setSynthParam('fmDepth', 5);
    const call = (withSynth.updateLayer as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('l1');
    expect(call[1].synth.fmDepth).toBe(5);

    const noSynth = makeDeps({ getActiveLayer: vi.fn(() => makeLayer(false)) });
    build(noSynth).setSynthParam('fmDepth', 5);
    expect(noSynth.updateLayer).not.toHaveBeenCalled();
  });
});

describe('pad + pattern + bank commands', () => {
  it('mutes, clears and assigns the selected pad', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.padCommand('mute');
    h.padCommand('clear');
    h.padCommand('assign');
    expect(deps.togglePadMute).toHaveBeenCalledWith('l1');
    expect(deps.clearPad).toHaveBeenCalledWith(0);
    expect(deps.assignPad).toHaveBeenCalledWith(0);
  });

  it('skips mute when the pad is empty', () => {
    const deps = makeDeps({ getPrograms: vi.fn(() => ({ A: program(null) })) });
    build(deps).padCommand('mute');
    expect(deps.togglePadMute).not.toHaveBeenCalled();
  });

  it('runs pattern commands', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.patternCommand('clear');
    h.patternCommand('quantize');
    h.patternCommand('humanize');
    h.patternCommand('other');
    expect(deps.clearPattern).toHaveBeenCalled();
    expect(deps.quantizePattern).toHaveBeenCalled();
    expect(deps.humanizePattern).toHaveBeenCalled();
  });

  it('selects and cycles banks', () => {
    const deps = makeDeps({ getActiveBank: vi.fn(() => 'D') });
    const h = build(deps);
    h.selectBank('C');
    expect(deps.setActiveBank).toHaveBeenCalledWith('C');
    h.nextBank();
    expect(deps.setActiveBank).toHaveBeenCalledWith('A');
  });

  it('cycles groove templates', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.grooveCommand();
    h.grooveCommand();
    expect(deps.applyGroove).toHaveBeenNthCalledWith(1, GROOVE_TEMPLATES[0]);
    expect(deps.applyGroove).toHaveBeenNthCalledWith(2, GROOVE_TEMPLATES[1]);
  });

  it('forwards sampler commands, params and pads', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.sampleCommand!('reverse');
    h.sampleParam!('zoom', 4);
    h.samplePad!(3, 0.9);
    expect(deps.sampleCommand).toHaveBeenCalledWith('reverse');
    expect(deps.sampleParam).toHaveBeenCalledWith('zoom', 4);
    expect(deps.samplePad).toHaveBeenCalledWith(3, 0.9);
  });

  it('forwards recourse commands and params', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.recourseCommand!('generate');
    h.recourseParam!('seed', 42);
    expect(deps.recourseCommand).toHaveBeenCalledWith('generate');
    expect(deps.recourseParam).toHaveBeenCalledWith('seed', 42);
  });

  it('drives mixer channels by stack index', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.sectionChannel!(0, 'gain', 1.2);
    h.sectionChannel!(1, 'pan', -0.75);
    expect(deps.updateLayer).toHaveBeenNthCalledWith(1, 'l1', { gain: 1.2 });
    expect(deps.updateLayer).toHaveBeenNthCalledWith(2, 'l2', { pan: -0.75 });
  });

  it('ignores channel ops past the end of the stack', () => {
    const deps = makeDeps();
    build(deps).sectionChannel!(7, 'gain', 1);
    expect(deps.updateLayer).not.toHaveBeenCalled();
  });

  it('drives selected-layer sound design params', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.sectionLayer!('filterFreq', 800);
    h.sectionLayer!('filterRes', 4);
    h.sectionLayer!('attack', 0.05);
    h.sectionLayer!('release', 1.2);
    h.sectionLayer!('gain', 0.9);
    h.sectionLayer!('pan', 0.25);
    h.sectionLayer!('pitch', 6.4);
    h.sectionLayer!('reverbMix', 0.3);
    const calls = (deps.updateLayer as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toContainEqual(['l1', { fx: expect.objectContaining({ filterFreq: 800 }) }]);
    expect(calls).toContainEqual(['l1', { fx: expect.objectContaining({ filterRes: 4 }) }]);
    expect(calls).toContainEqual(['l1', { envelope: expect.objectContaining({ attack: 0.05 }) }]);
    expect(calls).toContainEqual(['l1', { envelope: expect.objectContaining({ release: 1.2 }) }]);
    expect(calls).toContainEqual(['l1', { gain: 0.9 }]);
    expect(calls).toContainEqual(['l1', { pan: 0.25 }]);
    expect(calls).toContainEqual(['l1', { pitch: 6 }]);
    expect(calls).toContainEqual(['l1', { fx: expect.objectContaining({ reverbMix: 0.3 }) }]);
  });

  it('skips section layer ops with no active layer', () => {
    const deps = makeDeps({ getActiveLayer: vi.fn(() => null) });
    build(deps).sectionLayer!('gain', 1);
    expect(deps.updateLayer).not.toHaveBeenCalled();
  });

  it('forwards Compare section params (levels pass through every move)', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.sectionCompare!('refGain', -3, true);
    h.sectionCompare!('loopStart', 2, true);
    h.sectionCompare!('loop', 1, true);
    h.sectionCompare!('source', 0, false);
    expect(deps.sectionCompare).toHaveBeenNthCalledWith(1, 'refGain', -3, true);
    expect(deps.sectionCompare).toHaveBeenNthCalledWith(2, 'loopStart', 2, true);
    expect(deps.sectionCompare).toHaveBeenNthCalledWith(3, 'loop', 1, true);
    expect(deps.sectionCompare).toHaveBeenNthCalledWith(4, 'source', 0, false);
  });

  it('fires Compare level-match only on a rising edge', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.sectionCompare!('levelMatch', 1, true);   // press
    h.sectionCompare!('levelMatch', 1, true);   // held — ignored
    h.sectionCompare!('levelMatch', 0, false);  // release
    h.sectionCompare!('levelMatch', 1, true);   // press again
    expect(deps.sectionCompare).toHaveBeenCalledTimes(2);
  });

  it('forwards Evolution params and edge-triggers the one-shot actions', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.sectionEvolution!('mode', 2, true);
    h.sectionEvolution!('variation', 4, true);
    h.sectionEvolution!('play', 1, true);
    expect(deps.sectionEvolution).toHaveBeenNthCalledWith(1, 'mode', 2, true);
    expect(deps.sectionEvolution).toHaveBeenNthCalledWith(2, 'variation', 4, true);
    expect(deps.sectionEvolution).toHaveBeenNthCalledWith(3, 'play', 1, true);

    (deps.sectionEvolution as ReturnType<typeof vi.fn>).mockClear();
    h.sectionEvolution!('reEvolve', 1, true);   // press
    h.sectionEvolution!('reEvolve', 1, true);   // held — ignored
    h.sectionEvolution!('add', 1, true);
    h.sectionEvolution!('add', 0, false);
    h.sectionEvolution!('add', 1, true);
    expect(deps.sectionEvolution).toHaveBeenCalledTimes(3);
  });

  it('per-screen pads select + trigger a stack layer', () => {
    const deps = makeDeps();
    build(deps).sectionPad!('layer', 1, true, 0.9);
    expect(deps.selectLayer).toHaveBeenCalledWith(1);
    expect(deps.triggerLayer).toHaveBeenCalledWith('l2', 0, 0.9);
  });

  it('per-screen pads ignore releases and out-of-range indices', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.sectionPad!('layer', 1, false, 0.9); // release — ignored
    h.sectionPad!('layer', 9, true, 0.9);  // past the stack — ignored
    expect(deps.selectLayer).not.toHaveBeenCalled();
    expect(deps.triggerLayer).not.toHaveBeenCalled();
  });

  it('per-screen pads mute channels, pick variations and reference tracks', () => {
    const deps = makeDeps();
    const h = build(deps);
    h.sectionPad!('mute', 2, true, 1);
    h.sectionPad!('variation', 5, true, 1);
    h.sectionPad!('track', 3, true, 1);
    expect(deps.toggleChannelMute).toHaveBeenCalledWith(2);
    expect(deps.sectionEvolution).toHaveBeenCalledWith('variation', 5, true);
    expect(deps.sectionCompare).toHaveBeenCalledWith('track', 3, true);
  });
});
