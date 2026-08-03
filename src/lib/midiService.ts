/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 6.3 — Web MIDI input service.
 *
 * Thin wrapper around `webmidi` that enumerates MIDI inputs, subscribes to
 * note-on/note-off, and forwards them to an app callback. The mapping of MIDI
 * notes to pads/layers lives in the UI (PerformanceControls / MidiPanel); this
 * module only owns the hardware connection lifecycle so tests can exercise it
 * with a fake input.
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

export interface MidiService {
  isSupported(): boolean;
  /** Enable Web MIDI and subscribe to note events from all inputs. */
  enable(onNoteOn: MidiHandler, onNoteOff: MidiHandler, onStateChange?: (inputs: MidiInputInfo[]) => void): Promise<boolean>;
  /** List currently connected inputs. */
  listInputs(): MidiInputInfo[];
  disable(): Promise<void>;
}

export function createMidiService(): MidiService {
  let noteOnHandler: MidiHandler | null = null;
  let noteOffHandler: MidiHandler | null = null;
  let stateHandler: ((inputs: MidiInputInfo[]) => void) | null = null;
  let enabled = false;

  const listInputs = (): MidiInputInfo[] => {
    if (!enabled) return [];
    return WebMidi.inputs.map((input: any) => ({
      id: input.id,
      name: input.name ?? 'Unknown',
      manufacturer: input.manufacturer ?? '',
      state: input.state ?? 'connected',
    }));
  };

  const subscribeToInputs = () => {
    for (const input of WebMidi.inputs) {
      input.removeListener('noteon');
      input.removeListener('noteoff');
      input.addListener('noteon', (e: any) => {
        noteOnHandler?.({ note: e.note.number ?? e.note, velocity: e.velocity ?? 0, channel: e.channel ?? 1 });
      });
      input.addListener('noteoff', (e: any) => {
        noteOffHandler?.({ note: e.note.number ?? e.note, velocity: 0, channel: e.channel ?? 1 });
      });
    }
  };

  const notifyState = () => {
    stateHandler?.(listInputs());
  };

  return {
    isSupported() {
      return typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
    },

    async enable(onNoteOn, onNoteOff, onStateChange) {
      if (!this.isSupported()) return false;
      noteOnHandler = onNoteOn;
      noteOffHandler = onNoteOff;
      stateHandler = onStateChange ?? null;
      try {
        await WebMidi.enable();
        enabled = true;
        subscribeToInputs();
        // Re-subscribe when ports connect/disconnect.
        WebMidi.addListener('connected', () => subscribeToInputs());
        WebMidi.addListener('disconnected', () => subscribeToInputs());
        notifyState();
        return true;
      } catch (err) {
        console.warn('Web MIDI enable failed:', err);
        return false;
      }
    },

    listInputs,

    async disable() {
      if (!enabled) return;
      try {
        await WebMidi.disable();
      } catch { /* ignore */ }
      enabled = false;
    },
  };
}
