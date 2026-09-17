/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRegistry,
  exportProfileJson,
  getProfile,
  importProfile,
  listProfiles,
  loadBuiltinProfiles,
  registerProfile,
  unregisterProfile,
} from './registry';
import { ProfileFormatError, stringifyProfile } from './document';
import type { ControllerProfile } from '../types';

const profile = (id: string, name = id): ControllerProfile => ({
  id,
  name,
  bindings: {
    'pad:0:0': { enabled: true, messageType: 'note', number: 36, channel: null, action: 'pad:A:0' },
    'knob:0:0': { enabled: true, messageType: 'cc', number: 3, channel: null, action: 'mix:master', min: 0, max: 1 },
  },
  followPadBank: true,
  enabledInputIds: [],
});

beforeEach(() => {
  clearRegistry();
});

describe('registration', () => {
  it('registers, lists and retrieves a profile', () => {
    const summary = registerProfile(profile('mine', 'My Rig'), { source: 'imported' });
    expect(summary).toMatchObject({ id: 'mine', name: 'My Rig', source: 'imported', bindingCount: 2 });
    expect(listProfiles()).toHaveLength(1);
    expect(getProfile('mine')?.name).toBe('My Rig');
  });

  it('replaces by default and can refuse to', () => {
    registerProfile(profile('dup', 'First'));
    registerProfile(profile('dup', 'Second'));
    expect(getProfile('dup')?.name).toBe('Second');
    expect(() => registerProfile(profile('dup'), { replace: false })).toThrow(/already registered/);
  });

  it('unregisters and reports whether anything was removed', () => {
    registerProfile(profile('gone'));
    expect(unregisterProfile('gone')).toBe(true);
    expect(unregisterProfile('gone')).toBe(false);
    expect(getProfile('gone')).toBeNull();
  });

  it('returns null for an unknown profile', () => {
    expect(getProfile('nope')).toBeNull();
  });
});

describe('built-ins', () => {
  it('loads the shipped MPD226 layouts as built-ins', () => {
    const loaded = loadBuiltinProfiles();
    const ids = loaded.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['mpd226-default', 'mpd226-sampler', 'mpd226-recourse']));
    expect(loaded.every((p) => p.source === 'builtin')).toBe(true);
    expect(getProfile('mpd226-default')).not.toBeNull();
  });

  it('is idempotent', () => {
    loadBuiltinProfiles();
    const count = listProfiles().length;
    loadBuiltinProfiles();
    expect(listProfiles()).toHaveLength(count);
  });

  it('lists built-ins ahead of imported profiles', () => {
    registerProfile(profile('aaa-imported', 'AAA'), { source: 'imported' });
    loadBuiltinProfiles();
    const sources = listProfiles().map((p) => p.source);
    expect(sources.indexOf('builtin')).toBeLessThan(sources.lastIndexOf('imported'));
  });
});

describe('import / export', () => {
  it('round-trips a profile through JSON', () => {
    const json = stringifyProfile(profile('round', 'Round Trip'), { name: 'Acme' });
    const summary = importProfile(json);
    expect(summary.id).toBe('round');
    expect(summary.vendor?.name).toBe('Acme');

    const out = JSON.parse(exportProfileJson('round'));
    expect(out.profile.bindings['knob:0:0']).toMatchObject({ action: 'mix:master', min: 0, max: 1 });
  });

  it('preserves bindings exactly across an export/import cycle', () => {
    registerProfile(profile('exact'));
    const before = getProfile('exact');
    importProfile(exportProfileJson('exact'));
    expect(getProfile('exact')).toEqual(before);
  });

  it('rejects a malformed import', () => {
    expect(() => importProfile('{oops')).toThrow(ProfileFormatError);
  });

  it('throws when exporting an unknown profile', () => {
    expect(() => exportProfileJson('missing')).toThrow(/Unknown profile/);
  });
});
