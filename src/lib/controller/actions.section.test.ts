/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  describeAction,
  dispatchAction,
  isContinuousAction,
  type ControllerHandlers,
} from './actions';

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
  sectionChannel: vi.fn(),
  sectionLayer: vi.fn(),
  sectionCompare: vi.fn(),
  sectionEvolution: vi.fn(),
});

const ctx = (handlers: ControllerHandlers, value = 0.5) => ({
  value,
  unit: 0.5,
  raw: 64,
  on: true,
  handlers,
});

describe('section actions', () => {
  it('dispatches channel gain/pan to the indexed channel', () => {
    const handlers = makeHandlers();
    expect(dispatchAction('section:channel:gain:2', ctx(handlers, 0.9))).toBe(true);
    expect(dispatchAction('section:channel:pan:0', ctx(handlers, -0.5))).toBe(true);
    expect(handlers.sectionChannel).toHaveBeenNthCalledWith(1, 2, 'gain', 0.9);
    expect(handlers.sectionChannel).toHaveBeenNthCalledWith(2, 0, 'pan', -0.5);
  });

  it('dispatches layer params to the selected layer', () => {
    const handlers = makeHandlers();
    expect(dispatchAction('section:layer:filterFreq', ctx(handlers, 800))).toBe(true);
    expect(dispatchAction('section:layer:attack', ctx(handlers, 0.05))).toBe(true);
    expect(handlers.sectionLayer).toHaveBeenNthCalledWith(1, 'filterFreq', 800);
    expect(handlers.sectionLayer).toHaveBeenNthCalledWith(2, 'attack', 0.05);
  });

  it('rejects unknown section actions without throwing', () => {
    const handlers = makeHandlers();
    expect(dispatchAction('section:layer:nope', ctx(handlers))).toBe(false);
    expect(dispatchAction('section:bogus:1', ctx(handlers))).toBe(false);
    expect(handlers.sectionChannel).not.toHaveBeenCalled();
    expect(handlers.sectionLayer).not.toHaveBeenCalled();
  });

  it('is safe when the host implements no section handlers', () => {
    const { sectionChannel: _c, sectionLayer: _l, ...rest } = makeHandlers();
    expect(dispatchAction('section:channel:gain:0', ctx(rest))).toBe(true);
    expect(dispatchAction('section:layer:pan', ctx(rest))).toBe(true);
  });

  it('describes section actions for the assignment UI', () => {
    expect(describeAction('section:channel:gain:0')).toMatchObject({
      label: 'Section · channel 1 gain',
      group: 'Section',
      continuous: true,
    });
    expect(describeAction('section:layer:filterFreq').group).toBe('Section');
    expect(isContinuousAction('section:channel:pan:3')).toBe(true);
  });

  it('dispatches Compare section params with the on flag', () => {
    const handlers = makeHandlers();
    expect(dispatchAction('section:compare:refGain', ctx(handlers, -3))).toBe(true);
    expect(dispatchAction('section:compare:levelMatch', { ...ctx(handlers, 1), on: true })).toBe(true);
    expect(handlers.sectionCompare).toHaveBeenNthCalledWith(1, 'refGain', -3, true);
    expect(handlers.sectionCompare).toHaveBeenNthCalledWith(2, 'levelMatch', 1, true);
  });

  it('dispatches Evolution section params with the on flag', () => {
    const handlers = makeHandlers();
    expect(dispatchAction('section:evolution:mode', ctx(handlers, 2))).toBe(true);
    expect(dispatchAction('section:evolution:reEvolve', { ...ctx(handlers, 1), on: false })).toBe(true);
    expect(handlers.sectionEvolution).toHaveBeenNthCalledWith(1, 'mode', 2, true);
    expect(handlers.sectionEvolution).toHaveBeenNthCalledWith(2, 'reEvolve', 1, false);
  });

  it('rejects unknown Compare/Evolution params', () => {
    const handlers = makeHandlers();
    expect(dispatchAction('section:compare:bogus', ctx(handlers))).toBe(false);
    expect(dispatchAction('section:evolution:bogus', ctx(handlers))).toBe(false);
    expect(handlers.sectionCompare).not.toHaveBeenCalled();
    expect(handlers.sectionEvolution).not.toHaveBeenCalled();
  });
});
