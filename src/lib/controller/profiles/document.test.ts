/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  CONTROLLER_PROFILE_FORMAT,
  CONTROLLER_PROFILE_VERSION,
  ProfileFormatError,
  parseProfileDocument,
  sanitizeBinding,
  sanitizeProfile,
  stringifyProfile,
  toDocument,
} from './document';
import type { ControllerProfile } from '../types';

const cc = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  messageType: 'cc',
  number: 3,
  channel: null,
  action: 'mix:master',
  ...over,
});

const profile = (over: Partial<ControllerProfile> = {}): ControllerProfile => ({
  id: 'test',
  name: 'Test',
  bindings: { 'knob:0:0': cc() as never },
  followPadBank: true,
  enabledInputIds: [],
  ...over,
});

describe('sanitizeBinding', () => {
  it('accepts a well-formed binding and preserves optional fields', () => {
    const b = sanitizeBinding(cc({ min: -1, max: 1, invert: true, curve: 'log' }));
    expect(b).toEqual({
      enabled: true,
      messageType: 'cc',
      number: 3,
      channel: null,
      action: 'mix:master',
      min: -1,
      max: 1,
      invert: true,
      curve: 'log',
    });
  });

  it('defaults enabled to true and channel to null', () => {
    const b = sanitizeBinding({ messageType: 'note', number: 36, action: 'pad:A:0' });
    expect(b?.enabled).toBe(true);
    expect(b?.channel).toBeNull();
  });

  it('rejects a missing/blank action', () => {
    expect(sanitizeBinding(cc({ action: '' }))).toBeNull();
    expect(sanitizeBinding(cc({ action: '   ' }))).toBeNull();
    expect(sanitizeBinding(cc({ action: 42 }))).toBeNull();
  });

  it('rejects unknown message types', () => {
    expect(sanitizeBinding(cc({ messageType: 'sysex' }))).toBeNull();
  });

  it('rejects out-of-range or non-integer numbers', () => {
    expect(sanitizeBinding(cc({ number: -1 }))).toBeNull();
    expect(sanitizeBinding(cc({ number: 128 }))).toBeNull();
    expect(sanitizeBinding(cc({ number: 1.5 }))).toBeNull();
    expect(sanitizeBinding(cc({ number: 'x' }))).toBeNull();
  });

  it('rejects realtime codes the transport does not define', () => {
    expect(sanitizeBinding(cc({ messageType: 'realtime', number: 9 }))).toBeNull();
    expect(sanitizeBinding(cc({ messageType: 'realtime', number: 0 }))).not.toBeNull();
  });

  it('rejects an out-of-range channel but accepts null/1..16', () => {
    expect(sanitizeBinding(cc({ channel: 0 }))).toBeNull();
    expect(sanitizeBinding(cc({ channel: 17 }))).toBeNull();
    expect(sanitizeBinding(cc({ channel: 16 }))?.channel).toBe(16);
    expect(sanitizeBinding(cc({ channel: null }))?.channel).toBeNull();
  });

  it('rejects non-objects and leftover curve values', () => {
    expect(sanitizeBinding(null)).toBeNull();
    expect(sanitizeBinding([])).toBeNull();
    expect(sanitizeBinding(cc({ curve: 'exponential' }))?.curve).toBeUndefined();
  });
});

describe('sanitizeProfile', () => {
  it('keeps valid bindings and reports dropped ones', () => {
    const { profile: out, dropped } = sanitizeProfile({
      id: 'p',
      name: 'P',
      bindings: { good: cc(), bad: cc({ number: 999 }) },
      followPadBank: false,
      enabledInputIds: ['dev-1', 5],
    });
    expect(Object.keys(out.bindings)).toEqual(['good']);
    expect(dropped).toEqual(['bad']);
    expect(out.followPadBank).toBe(false);
    expect(out.enabledInputIds).toEqual(['dev-1']);
  });

  it('supplies safe defaults for a non-object', () => {
    const { profile: out } = sanitizeProfile(null);
    expect(out.id).toBe('invalid');
    expect(out.bindings).toEqual({});
    expect(out.followPadBank).toBe(true);
  });

  it('defaults id from a missing name and vice versa', () => {
    expect(sanitizeProfile({ bindings: {} }).profile.id).toBe('imported');
    expect(sanitizeProfile({ id: 'x', bindings: {} }).profile.name).toBe('x');
  });
});

describe('toDocument / stringifyProfile', () => {
  it('tags the document and records the version', () => {
    const doc = toDocument(profile(), { name: 'Acme', device: 'Pad 16' });
    expect(doc.format).toBe(CONTROLLER_PROFILE_FORMAT);
    expect(doc.version).toBe(CONTROLLER_PROFILE_VERSION);
    expect(typeof doc.exportedAt).toBe('string');
    expect(doc.vendor).toEqual({ name: 'Acme', device: 'Pad 16' });
  });

  it('omits vendor when absent and produces parseable JSON', () => {
    const json = stringifyProfile(profile());
    const parsed = JSON.parse(json);
    expect(parsed.vendor).toBeUndefined();
    expect(parsed.profile.id).toBe('test');
  });
});

describe('parseProfileDocument', () => {
  it('round-trips a full document', () => {
    const json = stringifyProfile(profile(), { name: 'Acme' });
    const { document } = parseProfileDocument(json);
    expect(document.profile.id).toBe('test');
    expect(document.vendor?.name).toBe('Acme');
  });

  it('accepts a bare profile without an envelope (partner-friendly)', () => {
    const { document } = parseProfileDocument(profile());
    expect(document.profile.id).toBe('test');
    expect(document.format).toBe(CONTROLLER_PROFILE_FORMAT);
  });

  it('rejects a document with a foreign format tag', () => {
    expect(() => parseProfileDocument({ format: 'something-else', profile: profile() })).toThrow(
      ProfileFormatError
    );
  });

  it('rejects a future version rather than guessing', () => {
    expect(() =>
      parseProfileDocument({ format: CONTROLLER_PROFILE_FORMAT, version: 99, profile: profile() })
    ).toThrow(/newer version/);
  });

  it('rejects invalid JSON and non-objects', () => {
    expect(() => parseProfileDocument('{not json')).toThrow(/not valid JSON/);
    expect(() => parseProfileDocument(42)).toThrow(/must be a JSON object/);
  });

  it('rejects a profile with no bindings at all', () => {
    expect(() => parseProfileDocument({ id: 'p', name: 'P', bindings: {} })).toThrow(/no bindings/);
  });

  it('reports dropped bindings instead of silently loading them', () => {
    const { dropped, document } = parseProfileDocument({
      id: 'p',
      name: 'P',
      bindings: { good: cc(), bad: cc({ action: '' }) },
    });
    expect(dropped).toEqual(['bad']);
    expect(Object.keys(document.profile.bindings)).toEqual(['good']);
  });
});
