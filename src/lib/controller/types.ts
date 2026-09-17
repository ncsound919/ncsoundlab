/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Controller mapping model.
 *
 * A `ControllerProfile` is a plain-data description of which MIDI messages
 * drive which app actions. It is deliberately device-agnostic: the MPD226
 * factory layout is only the *default* profile — every control can be
 * re-bound (or learned from the hardware) from the visual controller panel.
 *
 * Layout mirrors the hardware: four pad banks (16 pads each), three control
 * banks (4 knobs + 4 faders + 4 switches each), plus the transport buttons.
 */

export type ControlKind = 'pad' | 'knob' | 'fader' | 'switch' | 'transport';

export const PAD_BANKS = ['A', 'B', 'C', 'D'] as const;
export type PadBank = (typeof PAD_BANKS)[number];

/** Pad bank page index (0 = A … 3 = D). */
export type PadBankPage = 0 | 1 | 2 | 3;
/** Control bank page index (0 = first bank of knobs/faders/switches). */
export type ControlBankPage = 0 | 1 | 2;

/**
 * Message types the resolver understands:
 *  - `note`      — pad / key note messages (number = note, value = velocity)
 *  - `cc`        — continuous controllers (number = CC#, value = 0..127)
 *  - `realtime`  — MIDI transport (number: 0=start, 1=continue, 2=stop)
 *  - `program`   — program change (number = program)
 *  - `pitchbend` — (number = 0, value = 0..127 centred on 64)
 *  - `aftertouch`— channel pressure (value = 0..127)
 */
export type MidiMessageType = 'note' | 'cc' | 'realtime' | 'program' | 'pitchbend' | 'aftertouch';

export const REALTIME_CODES = { start: 0, continue: 1, stop: 2 } as const;

/** A single control's mapping. */
export interface ControllerBinding {
  /** Disabled bindings still show in the UI but never fire. */
  enabled: boolean;
  messageType: MidiMessageType;
  /** Note / CC / program number; realtime code for transport. */
  number: number;
  /** 1..16, or null to accept any channel. */
  channel: number | null;
  /**
   * Action id (see `actions.ts`). Examples:
   *  - `pad:A:3`          trigger program bank A slot 3
   *  - `chord:degree:5`   play diatonic chord degree 5
   *  - `note:60`          play MIDI note 60
   *  - `transport:play`
   *  - `fx:filterFreq`    continuous sound-design parameter
   */
  action: string;
  /** Output range for continuous actions (defaults to 0..1). */
  min?: number;
  max?: number;
  /** Invert the incoming 0..127 value before mapping. */
  invert?: boolean;
  /** Response curve for continuous actions. */
  curve?: 'linear' | 'log';
}

export interface ControllerProfile {
  id: string;
  name: string;
  /** controlKey → binding. Missing keys mean "unbound". */
  bindings: Record<string, ControllerBinding>;
  /**
   * When true (default), a pad hit from hardware pad bank B/C/D first switches
   * the app's program bank to match, so all 64 pads address all 64 slots.
   */
  followPadBank: boolean;
  /** When true, a pad hit under `chord`-bound pads switches the app to the chord bank. */
  enabledInputIds: string[];
}

/** Normalized incoming MIDI message used by the resolver + learn mode. */
export interface IncomingMidiMessage {
  messageType: MidiMessageType;
  /** note / CC# / program / realtime code. */
  number: number;
  /** 0..127 (velocity / CC / aftertouch) — realtime uses 127. */
  value: number;
  /** 1..16 */
  channel: number;
}

export interface BindingMatch {
  controlKey: string;
  binding: ControllerBinding;
}
