/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Controller-profile registry (Phase 7).
 *
 * Holds the profiles the app can switch between: the built-in MPD226 layouts
 * plus any profiles a user or hardware partner imports. Registration is
 * explicit (`loadBuiltinProfiles`) rather than an import side effect, so tests
 * and the app control exactly when a profile becomes available.
 *
 * A partner's workflow is: author a JSON document (or export one from the app),
 * send it to the user, the user imports it. No core code change, no rebuild.
 */

import { createDefaultMpd226Profile, createMpd226RecourseProfile, createMpd226SamplerProfile } from '../defaultMpd226';
import type { ControllerProfile } from '../types';
import {
  parseProfileDocument,
  stringifyProfile,
  sanitizeProfile,
  type ProfileVendor,
} from './document';

export type ProfileSource = 'builtin' | 'imported';

export interface RegisteredProfile {
  id: string;
  name: string;
  source: ProfileSource;
  vendor?: ProfileVendor;
  bindingCount: number;
}

interface Entry {
  profile: ControllerProfile;
  source: ProfileSource;
  vendor?: ProfileVendor;
}

const registry = new Map<string, Entry>();

const describe = (entry: Entry): RegisteredProfile => ({
  id: entry.profile.id,
  name: entry.profile.name,
  source: entry.source,
  ...(entry.vendor ? { vendor: entry.vendor } : {}),
  bindingCount: Object.keys(entry.profile.bindings).length,
});

export interface RegisterOptions {
  source?: ProfileSource;
  vendor?: ProfileVendor;
  /** Replace an existing entry with the same id. Defaults to true. */
  replace?: boolean;
}

/** Register (or replace) a profile. Returns its summary. */
export function registerProfile(profile: ControllerProfile, opts: RegisterOptions = {}): RegisteredProfile {
  const { replace = true } = opts;
  if (!replace && registry.has(profile.id)) {
    throw new Error(`Profile "${profile.id}" is already registered`);
  }
  const { profile: clean } = sanitizeProfile(profile);
  const entry: Entry = {
    profile: clean,
    source: opts.source ?? 'imported',
    ...(opts.vendor ? { vendor: opts.vendor } : {}),
  };
  registry.set(clean.id, entry);
  return describe(entry);
}

/** All registered profiles, built-ins first then alphabetical by name. */
export function listProfiles(): RegisteredProfile[] {
  return [...registry.values()]
    .map(describe)
    .sort((a, b) => {
      if (a.source !== b.source) return a.source === 'builtin' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/** A registered profile by id, or null. */
export function getProfile(id: string): ControllerProfile | null {
  return registry.get(id)?.profile ?? null;
}

/** Remove a profile. Built-ins are removable too (the app can reload them). */
export function unregisterProfile(id: string): boolean {
  return registry.delete(id);
}

/** Drop everything. Used by tests and by an explicit app reset. */
export function clearRegistry(): void {
  registry.clear();
}

/** Register the factory layouts that ship with the app. Idempotent. */
export function loadBuiltinProfiles(): RegisteredProfile[] {
  return [
    createDefaultMpd226Profile(),
    createMpd226SamplerProfile(),
    createMpd226RecourseProfile(),
  ].map((profile) => registerProfile(profile, { source: 'builtin' }));
}

/**
 * Import a profile document (JSON string or already-parsed object).
 * Throws `ProfileFormatError` when the document is unusable.
 */
export function importProfile(raw: unknown, vendor?: ProfileVendor): RegisteredProfile {
  const { document, dropped } = parseProfileDocument(raw);
  const summary = registerProfile(document.profile, {
    source: 'imported',
    vendor: vendor ?? document.vendor,
  });
  if (dropped.length > 0) {
    // Surface the loss rather than pretending the import was complete.
    console.warn(`Imported profile dropped ${dropped.length} invalid binding(s):`, dropped);
  }
  return { ...summary, bindingCount: summary.bindingCount };
}

/** Serialise a registered profile for export. Throws when the id is unknown. */
export function exportProfileJson(id: string): string {
  const entry = registry.get(id);
  if (!entry) throw new Error(`Unknown profile "${id}"`);
  return stringifyProfile(entry.profile, entry.vendor);
}
