/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Portable controller-profile document (Phase 7).
 *
 * A `ControllerProfile` is already plain data (see `../types.ts`), but it has no
 * envelope, no version, and no validation on the way in. That makes it unusable
 * as an interchange format — which is exactly what a hardware partner needs in
 * order to ship a profile for their device.
 *
 * This module adds the envelope and the guard rails:
 *
 *   - a tagged, versioned document (`soundlab.controller-profile`);
 *   - strict per-binding validation, so a malformed or hostile import is
 *     rejected field-by-field rather than loaded into the live mapping;
 *   - optional vendor metadata (name, url, device) for co-branded profiles.
 *
 * Validation is deliberately total: unknown control keys and invalid message
 * types are dropped, never coerced into something that would silently misfire.
 */

import {
  REALTIME_CODES,
  type ControllerBinding,
  type ControllerProfile,
  type MidiMessageType,
} from '../types';

export const CONTROLLER_PROFILE_FORMAT = 'soundlab.controller-profile' as const;
export const CONTROLLER_PROFILE_VERSION = 1;

export interface ProfileVendor {
  /** Partner / maker name, e.g. "Acme Instruments". */
  name?: string;
  /** Product page or support URL. */
  url?: string;
  /** Device this profile targets, e.g. "Acme Pad 16". */
  device?: string;
}

export interface ControllerProfileDocument {
  format: typeof CONTROLLER_PROFILE_FORMAT;
  version: number;
  exportedAt: string;
  profile: ControllerProfile;
  vendor?: ProfileVendor;
}

const MESSAGE_TYPES: readonly MidiMessageType[] = [
  'note',
  'cc',
  'realtime',
  'program',
  'pitchbend',
  'aftertouch',
];

/** Realtime codes are the only valid `number` for a realtime binding. */
const REALTIME_VALUES: readonly number[] = Object.values(REALTIME_CODES);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validate one binding. Returns `null` when the binding is unusable, so the
 * caller can drop it and report the count.
 */
export function sanitizeBinding(raw: unknown): ControllerBinding | null {
  if (!isRecord(raw)) return null;

  const action = raw.action;
  if (typeof action !== 'string' || action.trim() === '') return null;

  const messageType = raw.messageType;
  if (typeof messageType !== 'string' || !MESSAGE_TYPES.includes(messageType as MidiMessageType)) {
    return null;
  }

  const number = Number(raw.number);
  if (!Number.isInteger(number) || number < 0 || number > 127) return null;
  if (messageType === 'realtime' && !REALTIME_VALUES.includes(number)) return null;

  let channel: number | null = null;
  if (raw.channel !== null && raw.channel !== undefined) {
    const c = Number(raw.channel);
    if (!Number.isInteger(c) || c < 1 || c > 16) return null;
    channel = c;
  }

  const binding: ControllerBinding = {
    enabled: raw.enabled !== false,
    messageType: messageType as MidiMessageType,
    number,
    channel,
    action: action.trim(),
  };

  if (typeof raw.min === 'number' && Number.isFinite(raw.min)) binding.min = raw.min;
  if (typeof raw.max === 'number' && Number.isFinite(raw.max)) binding.max = raw.max;
  if (typeof raw.invert === 'boolean') binding.invert = raw.invert;
  if (raw.curve === 'linear' || raw.curve === 'log') binding.curve = raw.curve;

  return binding;
}

export interface SanitizeProfileResult {
  profile: ControllerProfile;
  /** Control keys whose binding was rejected. */
  dropped: string[];
}

/** Validate a profile, dropping unusable bindings. Never throws. */
export function sanitizeProfile(raw: unknown): SanitizeProfileResult {
  const dropped: string[] = [];
  if (!isRecord(raw)) {
    return { profile: { id: 'invalid', name: 'Invalid', bindings: {}, followPadBank: true, enabledInputIds: [] }, dropped };
  }

  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : 'imported';
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id;

  const bindings: Record<string, ControllerBinding> = {};
  if (isRecord(raw.bindings)) {
    for (const [key, value] of Object.entries(raw.bindings)) {
      const binding = sanitizeBinding(value);
      if (binding) bindings[key] = binding;
      else dropped.push(key);
    }
  }

  const enabledInputIds = Array.isArray(raw.enabledInputIds)
    ? raw.enabledInputIds.filter((v): v is string => typeof v === 'string')
    : [];

  return {
    profile: {
      id,
      name,
      bindings,
      followPadBank: raw.followPadBank !== false,
      enabledInputIds,
    },
    dropped,
  };
}

/** Wrap a live profile in a versioned, portable document. */
export function toDocument(profile: ControllerProfile, vendor?: ProfileVendor): ControllerProfileDocument {
  return {
    format: CONTROLLER_PROFILE_FORMAT,
    version: CONTROLLER_PROFILE_VERSION,
    exportedAt: new Date().toISOString(),
    profile: sanitizeProfile(profile).profile,
    ...(vendor ? { vendor } : {}),
  };
}

/** Serialise a profile for export (download / clipboard / commit). */
export function stringifyProfile(profile: ControllerProfile, vendor?: ProfileVendor): string {
  return JSON.stringify(toDocument(profile, vendor), null, 2);
}

export class ProfileFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileFormatError';
  }
}

export interface ParseProfileResult {
  document: ControllerProfileDocument;
  dropped: string[];
}

/**
 * Parse and validate an imported profile document.
 *
 * A *bare* `ControllerProfile` (no envelope) is also accepted, so a hand-written
 * profile from a partner does not have to know the envelope — but a document
 * carrying the wrong format tag is rejected outright.
 */
export function parseProfileDocument(raw: unknown): ParseProfileResult {
  let body: unknown = raw;

  if (typeof raw === 'string') {
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ProfileFormatError('Profile is not valid JSON');
    }
  }

  if (!isRecord(body)) throw new ProfileFormatError('Profile must be a JSON object');

  let profileSource: unknown = body;
  let vendor: ProfileVendor | undefined;

  if (body.format !== undefined || body.version !== undefined) {
    if (body.format !== CONTROLLER_PROFILE_FORMAT) {
      throw new ProfileFormatError(`Unrecognised profile format: ${String(body.format)}`);
    }
    const version = Number(body.version);
    if (!Number.isInteger(version) || version < 1) {
      throw new ProfileFormatError('Profile document has an invalid version');
    }
    if (version > CONTROLLER_PROFILE_VERSION) {
      throw new ProfileFormatError(
        `Profile was saved by a newer version (${version}); please update the app`
      );
    }
    profileSource = body.profile;
    if (isRecord(body.vendor)) {
      vendor = {
        ...(typeof body.vendor.name === 'string' ? { name: body.vendor.name } : {}),
        ...(typeof body.vendor.url === 'string' ? { url: body.vendor.url } : {}),
        ...(typeof body.vendor.device === 'string' ? { device: body.vendor.device } : {}),
      };
    }
  }

  const { profile, dropped } = sanitizeProfile(profileSource);
  if (Object.keys(profile.bindings).length === 0 && dropped.length === 0) {
    throw new ProfileFormatError('Profile contains no bindings');
  }

  return {
    document: {
      format: CONTROLLER_PROFILE_FORMAT,
      version: CONTROLLER_PROFILE_VERSION,
      exportedAt: typeof body.exportedAt === 'string' ? body.exportedAt : new Date().toISOString(),
      profile,
      ...(vendor ? { vendor } : {}),
    },
    dropped,
  };
}
