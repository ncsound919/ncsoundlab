/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Web MIDI input service.
 *
 * Thin wrapper around `webmidi` that enumerates MIDI inputs and forwards
 * normalized note / CC / transport / program / pitch-bend / aftertouch events to
 * an app callback. The mapping of those messages to pads, actions, and
 * parameters lives in `lib/controller/*`; this module only owns the hardware
 * connection lifecycle so tests can exercise it with a fake input.
 *
 * Two entry points:
 *  - `enable(onNoteOn, onNoteOff, onStateChange)` — legacy note-only API kept
 *    for the existing MIDI panel and its tests.
 *  - `subscribe({ onMessage, onStateChange }, { inputIds })` — full message
 *    stream used by the controller engine, with optional per-device filtering.
 */

import { WebMidi } from 'webmidi';

export interface MidiNoteEvent {
  note: number;
  velocity: number;
  channel: number;
}

export type MidiHandler = (event: MidiNoteEvent) => void;

export interface MidiInputInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

export type MidiRealtimeCode = 0 | 1 | 2; // 0 = start, 1 = continue, 2 = stop

export type MidiMessageEvent =
  | { type: 'noteon'; note: number; velocity: number; channel: number }
  | { type: 'noteoff'; note: number; velocity: number; channel: number }
  | { type: 'cc'; controller: number; value: number; channel: number }
  | { type: 'realtime'; code: MidiRealtimeCode; channel: number }
  | { type: 'program'; program: number; channel: number }
  | { type: 'pitchbend'; value: number; channel: number }
  | { type: 'aftertouch'; value: number; channel: number };

export type MidiMessageHandler = (event: MidiMessageEvent) => void;

export interface MidiSubscribeOptions {
  /** When non-empty, only these input ids are listened to. */
  inputIds?: string[];
}

export interface MidiService {
  isSupported(): boolean;
  /** Legacy note-only entry point. */
  enable(onNoteOn: MidiHandler, onNoteOff: MidiHandler, onStateChange?: (inputs: MidiInputInfo[]) => void): Promise<boolean>;
  /** Full message stream (note + CC + transport + …). */
  subscribe(handlers: { onMessage: MidiMessageHandler; onStateChange?: (inputs: MidiInputInfo[]) => void }, options?: MidiSubscribeOptions): Promise<boolean>;
  /** Update the per-device filter without re-opening the connection. */
  setInputFilter(inputIds: string[]): void;
  /** List currently connected inputs. */
  listInputs(): MidiInputInfo[];
  disable(): Promise<void>;
}

const raw127 = (e: any, normalizedKey = 'value'): number => {
  if (typeof e?.rawValue === 'number') return e.rawValue;
  const v = e?.[normalizedKey];
  if (typeof v === 'number') return Math.max(0, Math.min(127, Math.round(v * 127)));
  return 0;
};

export function createMidiService(): MidiService {
  let noteOnHandler: MidiHandler | null = null;
  let noteOffHandler: MidiHandler | null = null;
  let messageHandler: MidiMessageHandler | null = null;
  let stateHandler: ((inputs: MidiInputInfo[]) => void) | null = null;
  let enabled = false;
  let inputFilter: string[] = [];
  // Named (removable) re-subscribe callbacks: WebMidi is a module singleton, so
  // anonymous arrows here would accumulate on every enable()/disable() cycle.
  const onPortChange = () => subscribeToInputs();

  const listInputs = (): MidiInputInfo[] => {
    if (!enabled) return [];
    return WebMidi.inputs.map((input: any) => ({
      id: input.id,
      name: input.name ?? 'Unknown',
      manufacturer: input.manufacturer ?? '',
      state: input.state ?? 'connected',
    }));
  };

  const passesFilter = (input: any): boolean =>
    inputFilter.length === 0 || inputFilter.includes(input.id);

  const emitNoteOn = (e: any, note: number, velocity: number, channel: number) => {
    noteOnHandler?.({ note, velocity, channel });
    messageHandler?.({ type: 'noteon', note, velocity, channel });
  };

  const emitNoteOff = (e: any, note: number, channel: number) => {
    noteOffHandler?.({ note, velocity: 0, channel });
    messageHandler?.({ type: 'noteoff', note, velocity: 0, channel });
  };

  const subscribeToInputs = () => {
    for (const input of WebMidi.inputs as any[]) {
      input.removeListener?.('noteon');
      input.removeListener?.('noteoff');
      input.removeListener?.('controlchange');
      input.removeListener?.('programchange');
      input.removeListener?.('pitchbend');
      input.removeListener?.('channelaftertouch');
      input.removeListener?.('start');
      input.removeListener?.('continue');
      input.removeListener?.('stop');

      if (!passesFilter(input)) continue;

      input.addListener('noteon', (e: any) => {
        emitNoteOn(e, e.note.number ?? e.note, e.velocity ?? 0, e.channel ?? 1);
      });
      input.addListener('noteoff', (e: any) => {
        emitNoteOff(e, e.note.number ?? e.note, e.channel ?? 1);
      });
      input.addListener('controlchange', (e: any) => {
        messageHandler?.({
          type: 'cc',
          controller: e.controller?.number ?? e.controller ?? 0,
          value: raw127(e),
          channel: e.channel ?? 1,
        });
      });
      input.addListener('programchange', (e: any) => {
        messageHandler?.({ type: 'program', program: raw127(e), channel: e.channel ?? 1 });
      });
      input.addListener('pitchbend', (e: any) => {
        messageHandler?.({ type: 'pitchbend', value: raw127(e), channel: e.channel ?? 1 });
      });
      input.addListener('channelaftertouch', (e: any) => {
        messageHandler?.({ type: 'aftertouch', value: raw127(e), channel: e.channel ?? 1 });
      });
      input.addListener('start', (e: any) => messageHandler?.({ type: 'realtime', code: 0, channel: e?.channel ?? 1 }));
      input.addListener('continue', (e: any) => messageHandler?.({ type: 'realtime', code: 1, channel: e?.channel ?? 1 }));
      input.addListener('stop', (e: any) => messageHandler?.({ type: 'realtime', code: 2, channel: e?.channel ?? 1 }));
    }
  };

  const notifyState = () => {
    stateHandler?.(listInputs());
  };

  const open = async (): Promise<boolean> => {
    if (enabled) return true;
    if (!('requestMIDIAccess' in (globalThis.navigator ?? {}))) return false;
    try {
      await WebMidi.enable();
      enabled = true;
      subscribeToInputs();
      WebMidi.addListener('connected', onPortChange);
      WebMidi.addListener('disconnected', onPortChange);
      notifyState();
      // Some Web MIDI stacks finish enumerating ports a tick after enable()
      // resolves. Re-scan shortly after so the device list is never left at
      // "0 in" until an unrelated port event happens to arrive.
      setTimeout(() => {
        if (!enabled) return;
        subscribeToInputs();
        notifyState();
      }, 250);
      return true;
    } catch (err) {
      console.warn('Web MIDI enable failed:', err);
      return false;
    }
  };

  return {
    isSupported() {
      return typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
    },

    async enable(onNoteOn, onNoteOff, onStateChange) {
      noteOnHandler = onNoteOn;
      noteOffHandler = onNoteOff;
      stateHandler = onStateChange ?? null;
      return open();
    },

    async subscribe(handlers, options) {
      messageHandler = handlers.onMessage;
      stateHandler = handlers.onStateChange ?? null;
      if (options?.inputIds) inputFilter = [...options.inputIds];
      const ok = await open();
      // Re-apply the filter once inputs are known (no-op when already open).
      subscribeToInputs();
      notifyState();
      return ok;
    },

    setInputFilter(inputIds) {
      inputFilter = [...inputIds];
      if (enabled) subscribeToInputs();
    },

    listInputs,

    async disable() {
      if (!enabled) return;
      try {
        // Remove the port-change re-subscription listeners so enable/disable
        // cycles don't accumulate callbacks on the module-global WebMidi.
        WebMidi.removeListener('connected', onPortChange);
        WebMidi.removeListener('disconnected', onPortChange);
        await WebMidi.disable();
      } catch { /* ignore */ }
      enabled = false;
    },
  };
}
