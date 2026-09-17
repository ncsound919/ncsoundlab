/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure MIDI→action resolution. No React, no DOM, no audio — everything here is
 * deterministic and unit-testable, which is where the mapping logic lives.
 */

import type {
  BindingMatch,
  ControllerBinding,
  ControllerProfile,
  ControlKind,
  IncomingMidiMessage,
} from './types';

/** MIDI note of pad 1 in hardware pad bank A (MPC convention). */
export const PAD_NOTE_BASE = 36;
export const PADS_PER_BANK = 16;
export const PAD_BANK_PAGES = 4;
export const CONTROL_BANK_PAGES = 3;
export const CONTROLS_PER_BANK = 4;

export const padNoteFor = (page: number, index: number): number =>
  PAD_NOTE_BASE + page * PADS_PER_BANK + index;

export const padBankLetterFor = (page: number): string =>
  ['A', 'B', 'C', 'D'][page] ?? 'A';

/** Build the canonical control key used as the `bindings` record key. */
export const controlKey = (kind: ControlKind, page: number, index: number | string): string =>
  `${kind}:${page}:${index}`;

export interface ParsedControlKey {
  kind: ControlKind;
  page: number;
  index: string;
}

export function parseControlKey(key: string): ParsedControlKey | null {
  const parts = key.split(':');
  if (parts.length < 3) return null;
  const [kind, page, ...rest] = parts;
  if (kind !== 'pad' && kind !== 'knob' && kind !== 'fader' && kind !== 'switch' && kind !== 'transport') {
    return null;
  }
  return { kind, page: Number(page), index: rest.join(':') };
}

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Map a 0..1 unit onto a [min,max] range (log curve requires min > 0). */
export function mapUnitToRange(
  unit: number,
  min: number,
  max: number,
  curve: 'linear' | 'log' = 'linear'
): number {
  const u = clamp01(unit);
  if (curve === 'log' && min > 0 && max > 0) {
    return min * Math.pow(max / min, u);
  }
  return min + u * (max - min);
}

/** Normalize a raw 0..127 into 0..1, honouring the binding's invert flag. */
export function normalizeRaw(raw: number, invert = false): number {
  const r = invert ? 127 - raw : raw;
  return clamp01(r / 127);
}

/**
 * Resolve the output value for a binding from a raw 0..127 message value.
 * Trigger actions still receive a 0..1 velocity; continuous actions receive the
 * value mapped into the binding's [min,max] range.
 */
export function bindingValue(binding: ControllerBinding, raw: number): number {
  const unit = normalizeRaw(raw, binding.invert);
  if (binding.min === undefined && binding.max === undefined) return unit;
  return mapUnitToRange(unit, binding.min ?? 0, binding.max ?? 1, binding.curve);
}

/**
 * Whether a continuous/switch message should count as an "on" press. Note
 * messages are handled separately (velocity 0 = off).
 */
export function isContinuousOn(binding: ControllerBinding, raw: number): boolean {
  const r = binding.invert ? 127 - raw : raw;
  return r >= 64;
}

/** Every binding whose message signature matches the incoming message. */
export function findBindings(
  profile: ControllerProfile,
  msg: IncomingMidiMessage
): BindingMatch[] {
  const out: BindingMatch[] = [];
  for (const [controlKey, binding] of Object.entries(profile.bindings)) {
    if (!binding.enabled) continue;
    if (binding.messageType !== msg.messageType) continue;
    if (binding.number !== msg.number) continue;
    if (binding.channel != null && binding.channel !== msg.channel) continue;
    out.push({ controlKey, binding });
  }
  return out;
}

/** Convenience: the first matching binding, or null. */
export function findBinding(
  profile: ControllerProfile,
  msg: IncomingMidiMessage
): BindingMatch | null {
  const matches = findBindings(profile, msg);
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Apply a learned message to a binding, preserving the action but replacing the
 * message signature. Used by MIDI-learn.
 */
export function applyLearnedMessage(
  binding: ControllerBinding,
  msg: IncomingMidiMessage
): ControllerBinding {
  return {
    ...binding,
    enabled: true,
    messageType: msg.messageType,
    number: msg.number,
    channel: msg.channel,
  };
}

/** Human-readable message signature, e.g. `Note 36` / `CC 3 ch.1`. */
export function describeMessage(binding: ControllerBinding): string {
  const ch = binding.channel == null ? '' : ` · ch${binding.channel}`;
  switch (binding.messageType) {
    case 'note':
      return `Note ${binding.number}${ch}`;
    case 'cc':
      return `CC ${binding.number}${ch}`;
    case 'program':
      return `Program ${binding.number}${ch}`;
    case 'pitchbend':
      return `Pitch bend${ch}`;
    case 'aftertouch':
      return `Aftertouch${ch}`;
    case 'realtime': {
      const name = binding.number === 0 ? 'Start' : binding.number === 1 ? 'Continue' : 'Stop';
      return `Transport ${name}`;
    }
    default:
      return `${binding.messageType} ${binding.number}${ch}`;
  }
}

/** Human-readable incoming message, used by the live monitor. */
export function describeIncoming(msg: IncomingMidiMessage): string {
  const base =
    msg.messageType === 'note'
      ? `Note ${msg.number} · vel ${msg.value}`
      : msg.messageType === 'cc'
        ? `CC ${msg.number} · ${msg.value}`
        : msg.messageType === 'realtime'
          ? `Transport ${msg.number === 0 ? 'Start' : msg.number === 1 ? 'Continue' : 'Stop'}`
          : `${msg.messageType} ${msg.number} · ${msg.value}`;
  return `${base} · ch${msg.channel}`;
}

/** A profile with no bindings (used for "reset to empty"). */
export function emptyProfile(name = 'Empty'): ControllerProfile {
  return {
    id: 'empty',
    name,
    bindings: {},
    followPadBank: true,
    enabledInputIds: [],
  };
}
