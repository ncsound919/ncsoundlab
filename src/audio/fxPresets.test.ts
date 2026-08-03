/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for FX-chain presets (Phase 3.6).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  PRESETS_LOCALSTORAGE_KEY,
  addPreset,
  captureMasterRackPreset,
  loadAllPresets,
  removePreset,
  sanitizePreset,
  saveAllPresets,
  type FXChainPreset,
} from './fxPresets';
import type { RackModule } from '../types';

const makeModule = (id: string, type: string, settings: Record<string, unknown> = {}): RackModule => ({
  id,
  type: type as RackModule['type'],
  enabled: true,
  settings,
});

const makePreset = (overrides: Partial<FXChainPreset> = {}): FXChainPreset => ({
  id: 'p-1',
  name: 'Test',
  target: { kind: 'master-rack' },
  modules: [makeModule('m1', 'compressor')],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('fxPresets — sanitizePreset', () => {
  it('returns null for missing required fields', () => {
    expect(sanitizePreset(null)).toBeNull();
    expect(sanitizePreset({})).toBeNull();
    expect(sanitizePreset({ id: 'x' })).toBeNull();
    expect(sanitizePreset({ id: 'x', name: 'y' })).toBeNull();
  });

  it('drops modules that lack id/type', () => {
    const preset = sanitizePreset({
      id: 'p',
      name: 'n',
      target: { kind: 'master-rack' },
      modules: [{ id: 'a', type: 'compressor' }, { type: 'eq' }, { id: 'b' }],
    });
    expect(preset).not.toBeNull();
    expect(preset!.modules).toHaveLength(1);
    expect(preset!.modules![0].id).toBe('a');
  });

  it('returns null for unknown target kind', () => {
    expect(sanitizePreset({ id: 'p', name: 'n', target: { kind: 'weird' } })).toBeNull();
  });
});

describe('fxPresets — storage round-trip', () => {
  beforeEach(() => {
    localStorage.removeItem(PRESETS_LOCALSTORAGE_KEY);
  });

  it('loadAllPresets returns empty when nothing stored', () => {
    expect(loadAllPresets()).toEqual([]);
  });

  it('saveAllPresets + loadAllPresets round-trips', () => {
    const presets = [makePreset({ id: 'a' }), makePreset({ id: 'b', name: 'B' })];
    saveAllPresets(presets);
    const loaded = loadAllPresets();
    expect(loaded).toHaveLength(2);
    expect(loaded.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('saveAllPresets ignores corrupted entries on load', () => {
    localStorage.setItem(
      PRESETS_LOCALSTORAGE_KEY,
      JSON.stringify([makePreset({ id: 'good' }), { id: 'bad' /* missing fields */ }])
    );
    const loaded = loadAllPresets();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('good');
  });

  it('addPreset prepends and de-duplicates by id', () => {
    addPreset(makePreset({ id: 'a' }));
    addPreset(makePreset({ id: 'b', name: 'B' }));
    addPreset(makePreset({ id: 'a', name: 'A2' }));
    const loaded = loadAllPresets();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe('a');
    expect(loaded[0].name).toBe('A2');
  });

  it('removePreset drops by id', () => {
    addPreset(makePreset({ id: 'a' }));
    addPreset(makePreset({ id: 'b' }));
    removePreset('a');
    const loaded = loadAllPresets();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('b');
  });
});

describe('fxPresets — captureMasterRackPreset', () => {
  it('captures modules with all params', () => {
    const preset = captureMasterRackPreset('Heavy Comp', [
      makeModule('m1', 'compressor', { threshold: -10, ratio: 4 }),
      makeModule('m2', 'limiter', { ceiling: -0.3 }),
    ], 'For drums');
    expect(preset.name).toBe('Heavy Comp');
    expect(preset.description).toBe('For drums');
    expect(preset.target).toEqual({ kind: 'master-rack' });
    expect(preset.modules).toHaveLength(2);
    expect(preset.modules![0].settings).toEqual({ threshold: -10, ratio: 4 });
    expect(preset.modules![1].settings).toEqual({ ceiling: -0.3 });
  });

  it('generates an id', () => {
    const preset = captureMasterRackPreset('X', []);
    expect(typeof preset.id).toBe('string');
    expect(preset.id.length).toBeGreaterThan(0);
  });
});
