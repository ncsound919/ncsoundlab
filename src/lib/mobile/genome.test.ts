/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRANSIENT_LOCK_MS,
  GENOME_SCHEMA,
  GENOME_VERSION,
  SOUND_PRESETS,
  applyGenomeEdits,
  clampParams,
  crossover,
  defaultParams,
  deriveSeed,
  describeGenome,
  deserializeGenome,
  genomeByteSize,
  genomeDistance,
  genomeJsonSchema,
  makeGenome,
  mulberry32,
  mutate,
  poolCrossover,
  serializeGenome,
} from './genome';

describe('SOUND_PRESETS', () => {
  it('has unique ids and every preset stays inside the schema', () => {
    expect(new Set(SOUND_PRESETS.map((preset) => preset.id)).size).toBe(SOUND_PRESETS.length);
    const base = makeGenome(42);
    for (const preset of SOUND_PRESETS) {
      const next = applyGenomeEdits(base, preset.edits);
      expect(next.params.filter.highHz).toBeGreaterThanOrEqual(next.params.filter.lowHz);
      expect(next.params.crush.bits).toBeGreaterThanOrEqual(GENOME_SCHEMA.crush.bits.min);
      expect(next.params.crush.bits).toBeLessThanOrEqual(GENOME_SCHEMA.crush.bits.max);
      expect(describeGenome(next)).not.toBe(describeGenome(base));
    }
  });
});

describe('clampParams', () => {
  it('clamps out-of-range numbers to the schema', () => {
    const params = clampParams({ gainDb: 999, filter: { lowHz: -50 } });
    expect(params.gainDb).toBe(GENOME_SCHEMA.gainDb.max);
    expect(params.filter.lowHz).toBe(GENOME_SCHEMA.filter.lowHz.min);
  });

  it('falls back to the base value for junk input', () => {
    const base = defaultParams();
    const params = clampParams({ gainDb: 'loud', filter: { lowHz: Number.NaN } }, base);
    expect(params.gainDb).toBe(base.gainDb);
    expect(params.filter.lowHz).toBe(base.filter.lowHz);
  });

  it('drops unknown keys and invalid enums', () => {
    const params = clampParams({
      filter: { type: 'flange', lowHz: 100, highHz: 5000 },
      sneaky: { payload: 1 },
    } as unknown);
    expect(params.filter.type).toBe('lohi');
    expect('sneaky' in params).toBe(false);
    expect(params.filter.lowHz).toBe(100);
  });

  it('keeps the high cut above the low cut', () => {
    const params = clampParams({ filter: { lowHz: 5000, highHz: 1000, type: 'bandpass' } });
    expect(params.filter.highHz).toBeGreaterThan(params.filter.lowHz);
  });

  it('allows a lowpass whose high cut is below the low cut', () => {
    const params = clampParams({ filter: { lowHz: 5000, highHz: 1000, type: 'lowpass' } });
    expect(params.filter.highHz).toBe(1000);
  });

  it('caps the layer stack and defaults a bad kind', () => {
    const params = clampParams({
      layers: [
        { kind: 'sub', weight: 0.5 },
        { kind: 'nonsense', weight: 9 },
        { kind: 'noise', weight: 0.3 },
        { kind: 'body', weight: 0.2 },
        { kind: 'synth', weight: 0.1 },
      ],
    });
    expect(params.layers).toHaveLength(GENOME_SCHEMA.layers.maxItems);
    expect(params.layers[1].kind).toBe('recording');
    expect(params.layers[1].weight).toBe(1);
  });

  it('keeps optional genes optional', () => {
    const params = clampParams({ layers: [{ kind: 'recording', weight: 1 }] });
    expect(params.layers[0].waveform).toBeUndefined();
    expect(params.layers[0].freqHz).toBeUndefined();
  });

  it('carries numeric layer genes through', () => {
    const params = clampParams({
      layers: [{ kind: 'sub', weight: 0.4, waveform: 'sine', freqHz: 55, decayS: 0.5, phaseOffset: 0.25 }],
    });
    expect(params.layers[0]).toMatchObject({ waveform: 'sine', freqHz: 55, decayS: 0.5, phaseOffset: 0.25 });
  });

  it('keeps the base layers when given an empty array', () => {
    const base = defaultParams();
    expect(clampParams({ layers: [] }, base).layers).toHaveLength(base.layers.length);
  });
});

describe('deterministic RNG', () => {
  it('reproduces its sequence from a seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('derives stable, distinct child seeds', () => {
    expect(deriveSeed(1, 2)).toBe(deriveSeed(1, 2));
    expect(deriveSeed(1, 2)).not.toBe(deriveSeed(2, 1));
  });
});

describe('makeGenome', () => {
  it('is addressable by its seed and starts at revision 1', () => {
    const genome = makeGenome(42);
    expect(genome.id).toBe('g-16');
    expect(genome.parentId).toBeNull();
    expect(genome.rev).toBe(1);
    expect(genome.params.transientLockMs).toBe(DEFAULT_TRANSIENT_LOCK_MS);
  });
});

describe('mutate', () => {
  const parent = makeGenome(7, { grain: { scatter: 0.4 } });

  it('is reproducible for a given seed', () => {
    const a = mutate(parent, 0.5, { seed: 99 });
    const b = mutate(parent, 0.5, { seed: 99 });
    expect(serializeGenome(a)).toBe(serializeGenome(b));
    expect(a.seed).toBe(b.seed);
  });

  it('produces different children for different seeds', () => {
    const a = mutate(parent, 0.5, { seed: 1 });
    const b = mutate(parent, 0.5, { seed: 2 });
    expect(serializeGenome(a)).not.toBe(serializeGenome(b));
  });

  it('changes nothing at strength 0', () => {
    const child = mutate(parent, 0, { seed: 3 });
    expect(child.params).toEqual(parent.params);
    expect(child.rev).toBe(parent.rev + 1);
    expect(child.parentId).toBe(parent.id);
  });

  it('moves parameters further as strength rises', () => {
    const gentle = mutate(parent, 0.1, { seed: 5 });
    const hard = mutate(parent, 1, { seed: 5 });
    const drift = (genome: ReturnType<typeof mutate>): number =>
      Math.abs(genome.params.filter.highHz - parent.params.filter.highHz) +
      Math.abs(genome.params.grain.scatter - parent.params.grain.scatter) +
      Math.abs(genome.params.drive.mix - parent.params.drive.mix);
    expect(drift(hard)).toBeGreaterThan(drift(gentle));
  });

  it('never shortens the transient lock while it is respected', () => {
    for (let seed = 0; seed < 20; seed++) {
      const child = mutate(parent, 1, { seed });
      expect(child.params.transientLockMs).toBe(parent.params.transientLockMs);
    }
  });

  it('keeps every value inside the schema', () => {
    const child = mutate(parent, 1, { seed: 11, respectTransientLock: false });
    expect(child.params.filter.lowHz).toBeGreaterThanOrEqual(GENOME_SCHEMA.filter.lowHz.min);
    expect(child.params.filter.highHz).toBeLessThanOrEqual(GENOME_SCHEMA.filter.highHz.max);
    expect(child.params.transientLockMs).toBeLessThanOrEqual(GENOME_SCHEMA.transientLockMs.max);
    expect(child.params.layers.length).toBeLessThanOrEqual(GENOME_SCHEMA.layers.maxItems);
    expect(child.params.crush.bits).toBeGreaterThanOrEqual(GENOME_SCHEMA.crush.bits.min);
  });

  it('keeps the recording layer so the source is never lost', () => {
    for (let seed = 100; seed < 130; seed++) {
      const child = mutate(parent, 1, { seed });
      expect(child.params.layers.some((layer) => layer.kind === 'recording')).toBe(true);
    }
  });
});

describe('crossover', () => {
  const a = makeGenome(11, { filter: { lowHz: 60, highHz: 12000, type: 'lohi' }, gainDb: -6 });
  const b = makeGenome(22, { filter: { lowHz: 200, highHz: 4000, type: 'lowpass' }, gainDb: 3 });

  it('takes each gene from one parent or the other', () => {
    const child = crossover(a, b, 5);
    expect([a.params.filter.lowHz, b.params.filter.lowHz]).toContain(child.params.filter.lowHz);
    expect([a.params.gainDb, b.params.gainDb]).toContain(child.params.gainDb);
    expect(child.parentId).toBe(a.id);
  });

  it('is reproducible', () => {
    expect(serializeGenome(crossover(a, b, 5))).toBe(serializeGenome(crossover(a, b, 5)));
  });

  it('keeps the longer transient lock from either parent', () => {
    const shortLock = makeGenome(1, { transientLockMs: 5 });
    const longLock = makeGenome(2, { transientLockMs: 30 });
    expect(crossover(shortLock, longLock, 3).params.transientLockMs).toBe(30);
  });

  it('stacks distinct layer kinds from both parents, capped at the schema', () => {
    const left = makeGenome(1, { layers: [{ kind: 'recording', weight: 1 }, { kind: 'sub', weight: 0.4 }] });
    const right = makeGenome(2, { layers: [{ kind: 'noise', weight: 0.2 }, { kind: 'body', weight: 0.3 }] });
    for (let seed = 0; seed < 10; seed++) {
      const child = crossover(left, right, seed);
      expect(child.params.layers.length).toBeGreaterThanOrEqual(1);
      expect(child.params.layers.length).toBeLessThanOrEqual(GENOME_SCHEMA.layers.maxItems);
    }
  });
});

describe('serialization', () => {
  it('round-trips a genome', () => {
    const genome = mutate(makeGenome(5, { gainDb: -3 }), 0.4, { seed: 8 });
    const parsed = deserializeGenome(serializeGenome(genome));
    expect(parsed).not.toBeNull();
    expect(parsed!.seed).toBe(genome.seed);
    expect(parsed!.params.gainDb).toBeCloseTo(genome.params.gainDb, 3);
    expect(parsed!.parentId).toBe(genome.parentId);
  });

  it('stays small — a variant is bytes, not audio', () => {
    expect(genomeByteSize(makeGenome(3))).toBeLessThan(700);
  });

  it('records the format version', () => {
    expect(JSON.parse(serializeGenome(makeGenome(1))).v).toBe(GENOME_VERSION);
  });

  it('rejects foreign JSON', () => {
    expect(deserializeGenome('not json')).toBeNull();
    expect(deserializeGenome('{"hello":true}')).toBeNull();
    expect(deserializeGenome('42')).toBeNull();
  });

  it('clamps a hostile payload on the way in', () => {
    const parsed = deserializeGenome(
      JSON.stringify({ seed: 4, params: { gainDb: 500, filter: { type: 'weird' } } })
    );
    expect(parsed!.params.gainDb).toBe(GENOME_SCHEMA.gainDb.max);
    expect(parsed!.params.filter.type).toBe(defaultParams().filter.type);
  });
});

describe('applyGenomeEdits', () => {
  it('applies a partial edit, clamps it, and bumps the revision', () => {
    const genome = makeGenome(9);
    const edited = applyGenomeEdits(genome, { grain: { scatter: 0.9 }, gainDb: 3 });
    expect(edited.params.grain.scatter).toBe(0.9);
    expect(edited.params.gainDb).toBe(3);
    expect(edited.rev).toBe(genome.rev + 1);
    // Untouched groups keep their values.
    expect(edited.params.filter.lowHz).toBe(genome.params.filter.lowHz);
  });

  it('ignores nonsense edits entirely', () => {
    const genome = makeGenome(9);
    const edited = applyGenomeEdits(genome, { layers: 'loud please', gainDb: 'loud' });
    expect(edited.params.gainDb).toBe(genome.params.gainDb);
    expect(edited.params.layers).toEqual(genome.params.layers);
  });
});

describe('genomeJsonSchema', () => {
  const schema = genomeJsonSchema() as {
    additionalProperties: boolean;
    properties: Record<string, Record<string, unknown>>;
  };

  it('forbids extra properties so a model cannot invent parameters', () => {
    expect(schema.additionalProperties).toBe(false);
    expect((schema.properties.filter as { additionalProperties: boolean }).additionalProperties).toBe(false);
  });

  it('carries the schema ranges and enums', () => {
    const gain = schema.properties.gainDb as { minimum: number; maximum: number };
    expect(gain.minimum).toBe(GENOME_SCHEMA.gainDb.min);
    expect(gain.maximum).toBe(GENOME_SCHEMA.gainDb.max);
    const type = (schema.properties.filter as { properties: Record<string, { enum: string[] }> }).properties.type;
    expect(type.enum).toContain('lohi');
    const layers = schema.properties.layers as { maxItems: number };
    expect(layers.maxItems).toBe(GENOME_SCHEMA.layers.maxItems);
  });
});

describe('describeGenome', () => {
  it('summarises the filter and generated layers', () => {
    const text = describeGenome(makeGenome(1, { layers: [{ kind: 'sub', weight: 0.3, freqHz: 55, waveform: 'sine' }] }));
    expect(text).toMatch(/Hz/);
    expect(text).toMatch(/sub 55/);
  });

  it('describes noise as unpitched instead of printing a fake 0 Hz', () => {
    const text = describeGenome(makeGenome(3, { layers: [{ kind: 'noise', weight: 0.2 }] }));
    expect(text).toContain('noise @ 20%');
    expect(text).not.toContain('noise 0');
  });

  it('mentions pitch, grain, bit depth and drive when set', () => {
    const text = describeGenome(
      makeGenome(2, {
        layers: [{ kind: 'recording', weight: 1 }],
        pitch: { rootHz: 220, offsetCents: 30 },
        grain: { scatter: 0.5, sizeMs: 80, rateHz: 10 },
        crush: { bits: 8, downsample: 1 },
        drive: { amount: 0.5, mix: 0.4 },
      })
    );
    expect(text).toMatch(/\+30¢/);
    expect(text).toMatch(/grain 50%/);
    expect(text).toMatch(/8-bit/);
    expect(text).toMatch(/drive 40%/);
  });
});

describe('GeneLocks and EvolutionTarget', () => {
  const base = makeGenome(42, {
    filter: { lowHz: 120, highHz: 4500, type: 'lohi' },
    pitch: { rootHz: 220, offsetCents: 15 },
    grain: { scatter: 0.3, sizeMs: 60, rateHz: 8 },
    crush: { bits: 12, downsample: 2 },
    drive: { amount: 0.4, mix: 0.3 },
    layers: [{ kind: 'recording', weight: 1 }],
  });

  it('preserves locked gene categories under full mutation', () => {
    const lockedChild = mutate(base, 1.0, {
      seed: 999,
      locks: { filter: true, pitch: true, grain: true, crush: true, drive: true, layers: true },
    });
    expect(lockedChild.params.filter).toEqual(base.params.filter);
    expect(lockedChild.params.pitch).toEqual(base.params.pitch);
    expect(lockedChild.params.grain).toEqual(base.params.grain);
    expect(lockedChild.params.crush).toEqual(base.params.crush);
    expect(lockedChild.params.drive).toEqual(base.params.drive);
    expect(lockedChild.params.layers).toEqual(base.params.layers);
  });

  it('allows unlocked genes to mutate while respecting locks', () => {
    const child = mutate(base, 0.8, {
      seed: 123,
      locks: { filter: true, pitch: false },
    });
    expect(child.params.filter).toEqual(base.params.filter);
    // Pitch or other parameters should diverge
    expect(child.params.gainDb !== base.params.gainDb || child.params.pitch.offsetCents !== base.params.pitch.offsetCents).toBe(true);
  });

  it('applies sub-bass evolution target bias', () => {
    const child = mutate(base, 0.7, {
      seed: 88,
      target: 'sub-bass',
    });
    expect(child.params.filter.highHz).toBeLessThanOrEqual(1200);
    expect(child.params.layers.some((l) => l.kind === 'sub' || l.kind === 'body')).toBe(true);
  });

  it('applies lofi-crunch evolution target bias', () => {
    const child = mutate(base, 0.7, {
      seed: 88,
      target: 'lofi-crunch',
    });
    expect(child.params.crush.bits).toBeLessThanOrEqual(12);
  });
});

describe('poolCrossover', () => {
  const p1 = makeGenome(1, { gainDb: -6, filter: { lowHz: 50, highHz: 2000, type: 'lowpass' } });
  const p2 = makeGenome(2, { gainDb: 0, filter: { lowHz: 200, highHz: 8000, type: 'lohi' } });
  const p3 = makeGenome(3, { gainDb: 4, filter: { lowHz: 500, highHz: 16000, type: 'bandpass' } });

  it('crossovers across 3 parents and samples valid genes', () => {
    const child = poolCrossover([p1, p2, p3], 77);
    expect(child.parentId).toBe(p1.id);
    expect([-6, 0, 4]).toContain(child.params.gainDb);
    expect([50, 200, 500]).toContain(child.params.filter.lowHz);
    expect(child.params.layers.some((l) => l.kind === 'recording')).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const c1 = poolCrossover([p1, p2, p3], 55);
    const c2 = poolCrossover([p1, p2, p3], 55);
    expect(serializeGenome(c1)).toBe(serializeGenome(c2));
  });
});

describe('genomeDistance', () => {
  const g1 = makeGenome(10, { filter: { lowHz: 100, highHz: 1000, type: 'lohi' } });
  const g2 = makeGenome(20, { filter: { lowHz: 1000, highHz: 15000, type: 'highpass' } });

  it('returns 0 for identical genomes', () => {
    expect(genomeDistance(g1, g1)).toBe(0);
  });

  it('is symmetric: dist(a, b) === dist(b, a)', () => {
    const d1 = genomeDistance(g1, g2);
    const d2 = genomeDistance(g2, g1);
    expect(d1).toBeCloseTo(d2, 5);
  });

  it('is bounded between 0 and 1 with positive distance for differing genomes', () => {
    const d = genomeDistance(g1, g2);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(1);
  });
});
