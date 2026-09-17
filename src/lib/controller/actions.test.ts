/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTION_DEFS,
  applyChordParam,
  catalogForContext,
  CHORD_PARAM_RANGE,
  describeAction,
  dispatchAction,
  isContinuousAction,
  type ControllerHandlers,
  type DispatchContext,
} from './actions';
import { DEFAULT_CHORD_SETTINGS } from './chordPads';

const makeHandlers = (): ControllerHandlers => ({
  triggerPad: vi.fn(),
  playNote: vi.fn(),
  stopNote: vi.fn(),
  playChord: vi.fn(),
  stopChord: vi.fn(),
  transport: vi.fn(),
  setBpm: vi.fn(),
  setSwing: vi.fn(),
  setMaster: vi.fn(),
  setLayerGain: vi.fn(),
  setLayerPan: vi.fn(),
  setLayerTune: vi.fn(),
  setLayerSend: vi.fn(),
  setFxParam: vi.fn(),
  setSynthParam: vi.fn(),
  setChordParam: vi.fn(),
  chordCommand: vi.fn(),
  padCommand: vi.fn(),
  patternCommand: vi.fn(),
  selectBank: vi.fn(),
  nextBank: vi.fn(),
  grooveCommand: vi.fn(),
  sampleCommand: vi.fn(),
  sampleParam: vi.fn(),
  samplePad: vi.fn(),
  recourseCommand: vi.fn(),
  recourseParam: vi.fn(),
});

let handlers: ControllerHandlers;
const ctx = (over: Partial<DispatchContext> = {}): DispatchContext => ({
  value: 0.5,
  unit: 0.5,
  raw: 64,
  on: true,
  handlers,
  ...over,
});

beforeEach(() => {
  handlers = makeHandlers();
});

describe('catalog', () => {
  it('generates pad and chord actions plus the static catalog', () => {
    const catalog = catalogForContext({ padPage: 2 });
    expect(catalog.find((d) => d.id === 'pad:C:5')).toBeTruthy();
    expect(catalog.find((d) => d.id === 'chord:degree:9')).toBeTruthy();
    expect(catalog.find((d) => d.id === 'transport:play')).toBeTruthy();
    expect(ACTION_DEFS.length).toBeGreaterThan(20);
  });

  it('defaults to bank A', () => {
    expect(catalogForContext().find((d) => d.id === 'pad:A:0')).toBeTruthy();
    expect(catalogForContext({ padBank: 'D' }).find((d) => d.id === 'pad:D:0')).toBeTruthy();
  });

  it('describes known and generated actions', () => {
    expect(describeAction('fx:filterFreq').label).toBe('Filter cutoff');
    expect(describeAction('pad:B:3').label).toContain('pad 4');
    expect(describeAction('chord:degree:8').label).toContain('+1 oct');
    expect(describeAction('note:60').label).toBe('Note 60');
    expect(describeAction('mystery:thing').group).toBe('Pads');
  });

  it('knows which actions are continuous', () => {
    expect(isContinuousAction('fx:filterFreq')).toBe(true);
    expect(isContinuousAction('transport:play')).toBe(false);
  });
});

describe('applyChordParam', () => {
  it('applies each parameter with clamping and rounding', () => {
    expect(applyChordParam(DEFAULT_CHORD_SETTINGS, 'octave', 99).octave).toBe(6);
    expect(applyChordParam(DEFAULT_CHORD_SETTINGS, 'octave', 1.4).octave).toBe(1);
    expect(applyChordParam(DEFAULT_CHORD_SETTINGS, 'inversion', 2.6).inversion).toBe(3);
    expect(applyChordParam(DEFAULT_CHORD_SETTINGS, 'strumMs', -5).strumMs).toBe(0);
    expect(applyChordParam(DEFAULT_CHORD_SETTINGS, 'spread', 0.25).spread).toBe(0.25);
    expect(applyChordParam(DEFAULT_CHORD_SETTINGS, 'rootPc', 3).key).toBe('D#');
    expect(applyChordParam(DEFAULT_CHORD_SETTINGS, 'scaleIndex', 4).scale).toBe('lydian');
    expect(applyChordParam(DEFAULT_CHORD_SETTINGS, 'qualityIndex', 0.9).seventh).toBe(true);
    expect(applyChordParam(DEFAULT_CHORD_SETTINGS, 'nope' as never, 1)).toEqual(DEFAULT_CHORD_SETTINGS);
    expect(CHORD_PARAM_RANGE.octave).toEqual([1, 6]);
  });
});

describe('dispatchAction', () => {
  it('triggers program pads only on press', () => {
    expect(dispatchAction('pad:A:3', ctx())).toBe(true);
    expect(handlers.triggerPad).toHaveBeenCalledWith('A', 3, 0.5);
    dispatchAction('pad:A:3', ctx({ on: false }));
    expect(handlers.triggerPad).toHaveBeenCalledTimes(1);
  });

  it('routes pad utility commands', () => {
    expect(dispatchAction('pad:mute', ctx())).toBe(true);
    expect(handlers.padCommand).toHaveBeenCalledWith('mute');
  });

  it('plays and stops chord degrees', () => {
    dispatchAction('chord:degree:4', ctx({ unit: 0.8 }));
    expect(handlers.playChord).toHaveBeenCalledWith(4, 0.8);
    dispatchAction('chord:degree:4', ctx({ on: false }));
    expect(handlers.stopChord).toHaveBeenCalledWith(4);
  });

  it('applies chord parameters and rejects unknown ones', () => {
    dispatchAction('chord:param:octave', ctx({ value: 5 }));
    expect(handlers.setChordParam).toHaveBeenCalledWith('octave', 5);
    dispatchAction('chord:param:bogus', ctx());
    expect(handlers.setChordParam).toHaveBeenCalledTimes(1);
  });

  it('routes chord commands only on press', () => {
    dispatchAction('chord:generate', ctx());
    expect(handlers.chordCommand).toHaveBeenCalledWith('generate');
  });

  it('plays and stops notes', () => {
    dispatchAction('note:60', ctx({ unit: 0.7 }));
    expect(handlers.playNote).toHaveBeenCalledWith(60, 0.7);
    dispatchAction('note:60', ctx({ on: false }));
    expect(handlers.stopNote).toHaveBeenCalledWith(60);
  });

  it('routes transport presses', () => {
    dispatchAction('transport:record', ctx());
    expect(handlers.transport).toHaveBeenCalledWith('record');
    dispatchAction('transport:record', ctx({ on: false }));
    expect(handlers.transport).toHaveBeenCalledTimes(1);
  });

  it('selects banks and cycles', () => {
    dispatchAction('bank:C', ctx());
    expect(handlers.selectBank).toHaveBeenCalledWith('C');
    dispatchAction('bank:next', ctx());
    expect(handlers.nextBank).toHaveBeenCalled();
  });

  it('routes tempo, mix, layer, fx and synth parameters', () => {
    dispatchAction('tempo:bpm', ctx({ value: 128 }));
    expect(handlers.setBpm).toHaveBeenCalledWith(128);
    dispatchAction('tempo:swing', ctx({ value: 20 }));
    expect(handlers.setSwing).toHaveBeenCalledWith(20);

    dispatchAction('mix:master', ctx({ value: 0.9 }));
    dispatchAction('mix:layerGain', ctx({ value: 0.8 }));
    dispatchAction('mix:layerPan', ctx({ value: -1 }));
    dispatchAction('mix:layerSendReverb', ctx({ value: 0.3 }));
    dispatchAction('mix:layerSendDelay', ctx({ value: 0.4 }));
    expect(handlers.setMaster).toHaveBeenCalledWith(0.9);
    expect(handlers.setLayerGain).toHaveBeenCalledWith(0.8);
    expect(handlers.setLayerPan).toHaveBeenCalledWith(-1);
    expect(handlers.setLayerSend).toHaveBeenCalledWith('reverb', 0.3);
    expect(handlers.setLayerSend).toHaveBeenCalledWith('delay', 0.4);

    dispatchAction('layer:tune', ctx({ value: -5 }));
    expect(handlers.setLayerTune).toHaveBeenCalledWith(-5);

    dispatchAction('fx:distortion', ctx({ value: 55 }));
    expect(handlers.setFxParam).toHaveBeenCalledWith('distortion', 55);

    dispatchAction('synth:fmDepth', ctx({ value: 3 }));
    expect(handlers.setSynthParam).toHaveBeenCalledWith('fmDepth', 3);
  });

  it('routes pattern and groove commands', () => {
    dispatchAction('pattern:quantize', ctx());
    expect(handlers.patternCommand).toHaveBeenCalledWith('quantize');
    dispatchAction('groove:next', ctx());
    expect(handlers.grooveCommand).toHaveBeenCalled();
    dispatchAction('groove:next', ctx({ on: false }));
    expect(handlers.grooveCommand).toHaveBeenCalledTimes(1);
  });

  it('routes sampler commands, params and pads', () => {
    dispatchAction('sample:reverse', ctx());
    expect(handlers.sampleCommand).toHaveBeenCalledWith('reverse');
    dispatchAction('sample:reverse', ctx({ on: false }));
    expect(handlers.sampleCommand).toHaveBeenCalledTimes(1);

    dispatchAction('sample:param:zoom', ctx({ value: 8 }));
    expect(handlers.sampleParam).toHaveBeenCalledWith('zoom', 8);

    dispatchAction('sample:pad:3', ctx({ unit: 0.9 }));
    expect(handlers.samplePad).toHaveBeenCalledWith(3, 0.9);
    dispatchAction('sample:pad:3', ctx({ on: false }));
    expect(handlers.samplePad).toHaveBeenCalledTimes(1);
  });

  it('routes recourse commands and params', () => {
    dispatchAction('recourse:generate', ctx());
    expect(handlers.recourseCommand).toHaveBeenCalledWith('generate');
    dispatchAction('recourse:generate', ctx({ on: false }));
    expect(handlers.recourseCommand).toHaveBeenCalledTimes(1);

    dispatchAction('recourse:param:seed', ctx({ value: 42 }));
    expect(handlers.recourseParam).toHaveBeenCalledWith('seed', 42);
  });

  it('returns false for unrecognized actions', () => {
    expect(dispatchAction('wat:ever', ctx())).toBe(false);
    expect(dispatchAction('pad:A:1:2', ctx())).toBe(false);
    expect(dispatchAction('tempo:other', ctx())).toBe(false);
    expect(dispatchAction('mix:other', ctx())).toBe(false);
    expect(dispatchAction('layer:other', ctx())).toBe(false);
  });
});
