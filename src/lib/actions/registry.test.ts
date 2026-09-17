/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the typed action registry (Phase 2.1).
 */

import { describe, expect, it } from 'vitest';
import {
  ACTION_PARAM_SPECS,
  NEW_ACTION_SPECS,
  allActionSpecs,
  clampParam,
  specForAction,
  validateActionArgs,
  type ParamSpec,
} from './registry';

describe('specForAction', () => {
  it('resolves declared parameter specs for a catalogued action', () => {
    const spec = specForAction('tempo:bpm');
    expect(spec.group).toBe('Tempo');
    expect(spec.mutatesAudio).toBe(true);
    expect(spec.undoable).toBe(true);
    expect(spec.params).toHaveLength(1);
    expect(spec.params[0]).toMatchObject({ name: 'bpm', type: 'number', min: 60, max: 240, unit: 'BPM' });
  });

  it('resolves generated ids with no parameters', () => {
    const pad = specForAction('pad:A:3');
    expect(pad.group).toBe('Pads');
    expect(pad.params).toHaveLength(0);
    expect(pad.mutatesAudio).toBe(true);
    // Pads are not snapshot-covered, so they are not claimed as undoable.
    expect(pad.undoable).toBe(false);
  });

  it('classifies selection-only groups as non-mutating but undoable', () => {
    const bank = specForAction('bank:A');
    expect(bank.group).toBe('Banks');
    expect(bank.mutatesAudio).toBe(false);
    expect(bank.undoable).toBe(true);
  });

  it('falls back to a generic continuous param for value-only actions', () => {
    const spec = specForAction('sample:param:zoom');
    expect(spec.group).toBe('Sampler');
    expect(spec.params).toHaveLength(1);
    expect(spec.params[0]).toMatchObject({ name: 'value', type: 'number', min: 0, max: 1 });
    // Sampler bridge state is not snapshot-covered.
    expect(spec.undoable).toBe(false);
  });

  it('resolves explicitly declared new actions', () => {
    const spec = specForAction('mix:setBus');
    expect(spec.group).toBe('Mix');
    expect(spec.mutatesAudio).toBe(true);
    expect(spec.undoable).toBe(true);
    expect(spec.params.map((p) => p.name)).toEqual(['busId', 'gain', 'pan', 'enabled']);
  });
});

describe('allActionSpecs', () => {
  it('includes both catalogued and new actions with unique ids', () => {
    const specs = allActionSpecs();
    const ids = specs.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('transport:play');
    expect(ids).toContain('mix:setBus');
    expect(specs.length).toBe(new Set([...ids]).size);
  });

  it('every new action declares at least one parameter', () => {
    for (const action of NEW_ACTION_SPECS) {
      expect(action.params.length).toBeGreaterThan(0);
    }
  });
});

describe('clampParam', () => {
  const spec: ParamSpec = { name: 'x', type: 'number', min: 0, max: 10 };

  it('clamps numbers into range', () => {
    expect(clampParam(spec, -5)).toBe(0);
    expect(clampParam(spec, 50)).toBe(10);
    expect(clampParam(spec, 4)).toBe(4);
  });

  it('coerces numeric strings and rejects non-finite input', () => {
    expect(clampParam(spec, '7')).toBe(7);
    expect(clampParam(spec, Number.NaN)).toBe(0);
  });

  it('coerces booleans from strings/numbers', () => {
    const b: ParamSpec = { name: 'on', type: 'boolean' };
    expect(clampParam(b, true)).toBe(true);
    expect(clampParam(b, 'true')).toBe(true);
    expect(clampParam(b, '1')).toBe(true);
    expect(clampParam(b, 'false')).toBe(false);
  });

  it('stringifies enum/string values', () => {
    const e: ParamSpec = { name: 'e', type: 'enum', options: ['a', 'b'] };
    expect(clampParam(e, 'a')).toBe('a');
  });
});

describe('validateActionArgs', () => {
  it('accepts a fully valid argument set', () => {
    const res = validateActionArgs('tempo:bpm', { bpm: 140 });
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.normalized).toEqual({ bpm: 140 });
  });

  it('accepts an action with no parameters', () => {
    expect(validateActionArgs('pad:A:3', {}).ok).toBe(true);
  });

  it('reports a missing required parameter', () => {
    const res = validateActionArgs('tempo:bpm', {});
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/missing required parameter "bpm"/);
  });

  it('reports unknown parameters (guards against invented args)', () => {
    const res = validateActionArgs('tempo:bpm', { bpm: 140, nonsense: true });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('unknown parameter "nonsense"'))).toBe(true);
  });

  it('rejects out-of-range numbers but returns the clamped value', () => {
    const res = validateActionArgs('tempo:bpm', { bpm: 900 });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('above maximum 240'))).toBe(true);
    expect(res.normalized.bpm).toBe(240);
  });

  it('rejects non-numeric values for number params', () => {
    const res = validateActionArgs('tempo:bpm', { bpm: 'fast' });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('finite number'))).toBe(true);
  });

  it('rejects enum values outside the allowed options', () => {
    const res = validateActionArgs('mix:setBus', { busId: 'delay-x', gain: 1, pan: 0, enabled: true });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('must be one of'))).toBe(true);
  });

  it('rejects a non-boolean for a boolean param', () => {
    const res = validateActionArgs('mix:setBus', { busId: 'reverb', gain: 1, pan: 0, enabled: 'yes' });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('must be a boolean'))).toBe(true);
  });

  it('accepts a valid multi-param action', () => {
    const res = validateActionArgs('master:setDynamics', {
      thresholdDb: -1,
      ratio: 4,
      attackSec: 0.01,
      releaseSec: 0.2,
      makeupDb: 1,
      enabled: true,
    });
    expect(res.ok).toBe(true);
    expect(Object.keys(res.normalized)).toHaveLength(6);
  });
});

describe('registry coverage sanity', () => {
  it('every declared param spec is well-formed', () => {
    for (const [id, params] of Object.entries(ACTION_PARAM_SPECS)) {
      expect(params.length, id).toBeGreaterThan(0);
      for (const p of params) {
        expect(p.name, id).toBeTruthy();
        if (p.type === 'number') {
          expect(typeof p.min, `${id}.${p.name}`).toBe('number');
          expect(typeof p.max, `${id}.${p.name}`).toBe('number');
        }
        if (p.type === 'enum') {
          expect((p.options ?? []).length, `${id}.${p.name}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
