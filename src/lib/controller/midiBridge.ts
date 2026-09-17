/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Bridge between the raw MIDI service events and the controller mapping model.
 * Pure + testable so the message conversion and press detection don't hide
 * inside a React hook.
 */

import type { MidiMessageEvent } from '../midiService';
import { isContinuousOn } from './mapping';
import type { ControllerBinding, IncomingMidiMessage } from './types';

/** Convert a raw service event into the normalized controller message. */
export function toIncomingMessage(event: MidiMessageEvent): IncomingMidiMessage {
  switch (event.type) {
    case 'noteon':
      return { messageType: 'note', number: event.note, value: event.velocity, channel: event.channel };
    case 'noteoff':
      return { messageType: 'note', number: event.note, value: 0, channel: event.channel };
    case 'cc':
      return { messageType: 'cc', number: event.controller, value: event.value, channel: event.channel };
    case 'realtime':
      return { messageType: 'realtime', number: event.code, value: 127, channel: event.channel };
    case 'program':
      return { messageType: 'program', number: event.program, value: 127, channel: event.channel };
    case 'pitchbend':
      return { messageType: 'pitchbend', number: 0, value: event.value, channel: event.channel };
    case 'aftertouch':
      return { messageType: 'aftertouch', number: 0, value: event.value, channel: event.channel };
    default:
      return { messageType: 'cc', number: 0, value: 0, channel: 1 };
  }
}

/**
 * Whether a message counts as a press for trigger-style actions.
 * Notes: velocity > 0. CC/switches: value in the upper half. Transport: always.
 */
export function bindingIsOn(binding: ControllerBinding, msg: IncomingMidiMessage): boolean {
  if (msg.messageType === 'note') return msg.value > 0;
  if (msg.messageType === 'cc') return isContinuousOn(binding, msg.value);
  return true;
}
