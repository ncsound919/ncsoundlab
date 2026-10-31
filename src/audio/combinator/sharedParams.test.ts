/** @license SPDX-License-Identifier: Apache-2.0 */
import { describe, expect, it } from 'vitest';
import { paramSpec, kindSpec } from '../studioFx/catalog';
import { resolveParamKey, toSharedParams } from './sharedParams';
import { COMBINATOR_PRESETS } from '../../lib/combinatorPresets';

describe('sharedParams: Combinator vocabulary → nc.studio-fx-catalog.v1', () => {
  it('resolves aliases and unit suffixes to catalog keys', () => {
    expect(resolveParamKey('SIDECHAIN_DUCK', 'threshold')).toBe('thresholdDb');
    expect(resolveParamKey('FILTER', 'cutoff')).toBe('lpHz');
    expect(resolveParamKey('TAPE_MACHINE', 'wowFlutter')).toBe('wowFlutter');
    expect(resolveParamKey('PLATE_REVERB', 'predelay')).toBe('preDelayMs');
    expect(resolveParamKey('PLATE_REVERB', 'decay')).toBe('decaySec');
    expect(resolveParamKey('FET_1176', 'attack')).toBe('attackUs');
    expect(resolveParamKey('VCA_BUS_COMP', 'attack')).toBe('attackMs');
    // Nothing a module does not have.
    expect(resolveParamKey('FILTER', 'resonance')).toBeNull();
    expect(resolveParamKey('FUTURE_MODULE', 'drive')).toBeNull();
  });

  it('reads out-of-range values as a share of the control span', () => {
    // 0..1 controls: percentages become fractions.
    expect(toSharedParams('SATURATION', { mix: 70 }).mix).toBeCloseTo(0.7, 5);
    expect(toSharedParams('SATURATION', { drive: 12 }).driveDb).toBe(12);
    // Ratio: 100 lands on the 20:1 ceiling instead of escaping the range.
    expect(toSharedParams('SIDECHAIN_DUCK', { ratio: 100 }).ratio).toBe(20);
    // Chorus depth in percent → milliseconds inside 0.5..12.
    const depth = toSharedParams('CHORUS_WIDTH', { depth: 50 }).depthMs;
    expect(depth).toBeGreaterThanOrEqual(0.5);
    expect(depth).toBeLessThanOrEqual(12);
    // Tape bias percent snaps to one of the three catalog choices.
    const bias = toSharedParams('TAPE_MACHINE', { bias: 60 }).bias;
    expect([-1, 0, 1]).toContain(bias);
    // Values below the range clamp rather than scaling.
    expect(toSharedParams('SIDECHAIN_DUCK', { threshold: -60 }).thresholdDb).toBe(-40);
  });

  it('keeps a preset time request on the free delay division', () => {
    const free = toSharedParams('TEMPO_DELAY', { time: 375, feedback: 0.4 });
    expect(free.timeMs).toBe(375);
    expect(free.division).toBe(6);
    // An explicit division wins.
    expect(toSharedParams('TEMPO_DELAY', { time: 375, division: 1 }).division).toBe(1);
  });

  it('turns a negative Pultec high into attenuation', () => {
    const shared = toSharedParams('PULTEC_EQP1A', { low: 4, high: -2 });
    expect(shared.lowBoostDb).toBe(4);
    expect(shared.highBoostDb ?? 0).toBe(0);
    expect(shared.highAttenDb).toBe(2);
  });

  it('drops everything for a module the shared suite does not have', () => {
    expect(toSharedParams('NOT_A_MODULE', { drive: 4 })).toEqual({});
  });

  it('maps every shipped preset to catalog-valid parameters', () => {
    expect(COMBINATOR_PRESETS.length).toBeGreaterThan(30);
    for (const preset of COMBINATOR_PRESETS) {
      for (const slot of preset.state.slots) {
        if (!kindSpec(slot.moduleId)) continue;
        const shared = toSharedParams(slot.moduleId, slot.params);
        // A preset that maps to nothing would run at catalog defaults — the
        // exact failure this bridge exists to prevent.
        expect(Object.keys(shared).length, `${preset.id}/${slot.id} (${slot.moduleId})`).toBeGreaterThan(0);
        for (const [key, value] of Object.entries(shared)) {
          const spec = paramSpec(slot.moduleId, key);
          expect(spec, `${preset.id}: ${slot.moduleId}.${key}`).toBeDefined();
          expect(value).toBeGreaterThanOrEqual(spec!.min);
          expect(value).toBeLessThanOrEqual(spec!.max);
        }
      }
    }
  });

  it('keeps the wobble and sidechain presets on real controls', () => {
    const wobble = COMBINATOR_PRESETS.find((p) => p.id === 'rp-wobble-dubstep')!;
    const wobbleSlot = wobble.state.slots[0];
    // The wobble presets are written against a resonant filter, so they now
    // address the shared ladder module instead of the HPF/LPF pair.
    expect(wobbleSlot.moduleId).toBe('LADDER_FILTER');
    const filter = toSharedParams(wobbleSlot.moduleId, wobbleSlot.params);
    expect(filter.cutoffHz).toBe(600);
    expect(filter.resonance).toBe(10);
    expect(filter.drive).toBe(3);

    const pump = COMBINATOR_PRESETS.find((p) => p.id === 'rp-pump-classic')!;
    const duck = toSharedParams('SIDECHAIN_DUCK', pump.state.slots[0].params);
    expect(duck.thresholdDb).toBe(-24);
    expect(duck.releaseMs).toBe(150);
  });
});
