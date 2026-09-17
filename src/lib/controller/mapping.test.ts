/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  applyLearnedMessage,
  bindingValue,
  clamp01,
  describeIncoming,
  describeMessage,
  emptyProfile,
  findBinding,
  findBindings,
  isContinuousOn,
  mapUnitToRange,
  normalizeRaw,
  padBankLetterFor,
  padNoteFor,
  parseControlKey,
  controlKey,
} from './mapping';
import type { ControllerBinding, ControllerProfile, IncomingMidiMessage } from './types';

const binding = (over: Partial<ControllerBinding> = {}): ControllerBinding => ({
  enabled: true,
  messageType: 'cc',
  number: 3,
  channel: null,
  action: 'fx:filterFreq',
  ...over,
});

const profile = (bindings: Record<string, ControllerBinding>): ControllerProfile => ({
  id: 'p',
  name: 'P',
  bindings,
  followPadBank: true,
  enabledInputIds: [],
});

const msg = (over: Partial<IncomingMidiMessage> = {}): IncomingMidiMessage => ({
  messageType: 'cc',
  number: 3,
  value: 64,
  channel: 1,
  ...over,
});

describe('control keys', () => {
  it('builds and parses keys', () => {
    expect(controlKey('pad', 2, 5)).toBe('pad:2:5');
    expect(parseControlKey('pad:2:5')).toEqual({ kind: 'pad', page: 2, index: '5' });
    expect(parseControlKey('transport:0:play')).toEqual({ kind: 'transport', page: 0, index: 'play' });
  });

  it('rejects malformed keys', () => {
    expect(parseControlKey('pad:0')).toBeNull();
    expect(parseControlKey('bogus:0:1')).toBeNull();
  });

  it('maps pad index to MPC note numbers', () => {
    expect(padNoteFor(0, 0)).toBe(36);
    expect(padNoteFor(1, 0)).toBe(52);
    expect(padNoteFor(3, 15)).toBe(99);
    expect(padBankLetterFor(2)).toBe('C');
  });
});

describe('value mapping', () => {
  it('clamps units', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
  });

  it('maps linear and log ranges', () => {
    expect(mapUnitToRange(0.5, 0, 100)).toBe(50);
    expect(mapUnitToRange(0.5, 0, 100, 'log')).toBe(50); // log falls back when min is 0
    expect(mapUnitToRange(1, 100, 10000, 'log')).toBeCloseTo(10000);
    expect(mapUnitToRange(0, 100, 10000, 'log')).toBeCloseTo(100);
  });

  it('normalizes and inverts raw values', () => {
    expect(normalizeRaw(127)).toBe(1);
    expect(normalizeRaw(0)).toBe(0);
    expect(normalizeRaw(0, true)).toBe(1);
    expect(normalizeRaw(127, true)).toBe(0);
  });

  it('resolves binding values with range, invert and curve', () => {
    expect(bindingValue(binding(), 127)).toBe(1);
    expect(bindingValue(binding({ min: 0, max: 200 }), 64)).toBeCloseTo(100.8, 1);
    expect(bindingValue(binding({ min: 200, max: 18000, curve: 'log' }), 0)).toBeCloseTo(200);
    expect(bindingValue(binding({ invert: true }), 0)).toBe(1);
  });

  it('treats CC >= 64 as on, respecting invert', () => {
    expect(isContinuousOn(binding(), 64)).toBe(true);
    expect(isContinuousOn(binding(), 63)).toBe(false);
    expect(isContinuousOn(binding({ invert: true }), 0)).toBe(true);
  });
});

describe('binding resolution', () => {
  it('matches by type, number and channel', () => {
    const p = profile({
      'knob:0:0': binding({ number: 3 }),
      'knob:0:1': binding({ number: 4, action: 'fx:filterRes' }),
      'pad:0:0': binding({ messageType: 'note', number: 36 }),
    });
    expect(findBindings(p, msg()).map((m) => m.controlKey)).toEqual(['knob:0:0']);
    expect(findBinding(p, msg({ number: 36, messageType: 'note' }))?.controlKey).toBe('pad:0:0');
    expect(findBinding(p, msg({ number: 99 }))).toBeNull();
  });

  it('skips disabled bindings and honours channel filters', () => {
    const p = profile({
      'knob:0:0': binding({ enabled: false }),
      'knob:0:1': binding({ channel: 2 }),
    });
    expect(findBindings(p, msg())).toEqual([]);
    expect(findBindings(p, msg({ channel: 2 }))[0].controlKey).toBe('knob:0:1');
  });

  it('applies a learned message while keeping the action', () => {
    const learned = applyLearnedMessage(binding({ action: 'fx:distortion' }), {
      messageType: 'note',
      number: 40,
      value: 100,
      channel: 3,
    });
    expect(learned.action).toBe('fx:distortion');
    expect(learned.messageType).toBe('note');
    expect(learned.number).toBe(40);
    expect(learned.channel).toBe(3);
    expect(learned.enabled).toBe(true);
  });
});

describe('descriptions', () => {
  it('describes binding signatures', () => {
    expect(describeMessage(binding())).toBe('CC 3');
    expect(describeMessage(binding({ channel: 2 }))).toBe('CC 3 · ch2');
    expect(describeMessage(binding({ messageType: 'note', number: 36 }))).toBe('Note 36');
    expect(describeMessage(binding({ messageType: 'program' }))).toBe('Program 3');
    expect(describeMessage(binding({ messageType: 'pitchbend' }))).toBe('Pitch bend');
    expect(describeMessage(binding({ messageType: 'aftertouch' }))).toBe('Aftertouch');
    expect(describeMessage(binding({ messageType: 'realtime', number: 0 }))).toBe('Transport Start');
    expect(describeMessage(binding({ messageType: 'realtime', number: 1 }))).toBe('Transport Continue');
    expect(describeMessage(binding({ messageType: 'realtime', number: 2 }))).toBe('Transport Stop');
    expect(describeMessage(binding({ messageType: 'bogus' as never }))).toBe('bogus 3');
  });

  it('describes incoming messages', () => {
    expect(describeIncoming(msg({ messageType: 'note', value: 100 }))).toContain('Note 3 · vel 100');
    expect(describeIncoming(msg())).toContain('CC 3 · 64');
    expect(describeIncoming(msg({ messageType: 'realtime', number: 0 }))).toContain('Transport Start');
    expect(describeIncoming(msg({ messageType: 'program', number: 7 }))).toContain('program 7');
  });

  it('emptyProfile has no bindings', () => {
    expect(emptyProfile('x')).toMatchObject({ name: 'x', bindings: {}, followPadBank: true });
  });
});
