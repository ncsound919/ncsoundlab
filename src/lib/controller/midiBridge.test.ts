/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { bindingIsOn, toIncomingMessage } from './midiBridge';
import type { ControllerBinding, IncomingMidiMessage } from './types';

const binding = (over: Partial<ControllerBinding> = {}): ControllerBinding => ({
  enabled: true,
  messageType: 'cc',
  number: 3,
  channel: null,
  action: 'fx:filterFreq',
  ...over,
});

describe('toIncomingMessage', () => {
  it('converts each event type', () => {
    expect(toIncomingMessage({ type: 'noteon', note: 60, velocity: 100, channel: 1 }))
      .toEqual({ messageType: 'note', number: 60, value: 100, channel: 1 });
    expect(toIncomingMessage({ type: 'noteoff', note: 60, velocity: 0, channel: 2 }))
      .toEqual({ messageType: 'note', number: 60, value: 0, channel: 2 });
    expect(toIncomingMessage({ type: 'cc', controller: 3, value: 90, channel: 1 }))
      .toEqual({ messageType: 'cc', number: 3, value: 90, channel: 1 });
    expect(toIncomingMessage({ type: 'realtime', code: 2, channel: 1 }))
      .toEqual({ messageType: 'realtime', number: 2, value: 127, channel: 1 });
    expect(toIncomingMessage({ type: 'program', program: 7, channel: 3 }))
      .toEqual({ messageType: 'program', number: 7, value: 127, channel: 3 });
    expect(toIncomingMessage({ type: 'pitchbend', value: 64, channel: 1 }))
      .toEqual({ messageType: 'pitchbend', number: 0, value: 64, channel: 1 });
    expect(toIncomingMessage({ type: 'aftertouch', value: 30, channel: 4 }))
      .toEqual({ messageType: 'aftertouch', number: 0, value: 30, channel: 4 });
  });

  it('falls back safely for an unknown event', () => {
    expect(toIncomingMessage({ type: 'mystery' } as never))
      .toEqual({ messageType: 'cc', number: 0, value: 0, channel: 1 });
  });
});

describe('bindingIsOn', () => {
  const m = (over: Partial<IncomingMidiMessage>): IncomingMidiMessage => ({
    messageType: 'cc', number: 3, value: 64, channel: 1, ...over,
  });

  it('uses velocity for notes', () => {
    expect(bindingIsOn(binding({ messageType: 'note' }), m({ messageType: 'note', value: 1 }))).toBe(true);
    expect(bindingIsOn(binding({ messageType: 'note' }), m({ messageType: 'note', value: 0 }))).toBe(false);
  });

  it('uses the upper half for CC', () => {
    expect(bindingIsOn(binding(), m({ value: 127 }))).toBe(true);
    expect(bindingIsOn(binding(), m({ value: 10 }))).toBe(false);
  });

  it('always fires transport and other messages', () => {
    expect(bindingIsOn(binding({ messageType: 'realtime' }), m({ messageType: 'realtime' }))).toBe(true);
    expect(bindingIsOn(binding({ messageType: 'program' }), m({ messageType: 'program' }))).toBe(true);
  });
});
