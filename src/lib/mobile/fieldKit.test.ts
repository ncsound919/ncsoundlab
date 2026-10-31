/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  FIELD_KIT_FORMAT,
  addRoundRobinGroup,
  addSlice,
  createFieldKit,
  describeKit,
  kitFileName,
  kitGenomes,
  kitManifestJson,
  makeSliceEntry,
  parseKitManifest,
  replaceSliceGenome,
  sliceFileName,
  totalVariants,
} from './fieldKit';
import { makeGenome, mutate, serializeGenome } from './genome';

const createdAt = '2026-10-27T14:05:00Z';
const genome = makeGenome(101);

const kit = () =>
  createFieldKit({
    id: 'kit-1',
    name: 'Biscayne Field Kit',
    createdAt,
    place: 'Biscayne Bay',
    rootHz: 110,
  });

const entry = (id: string, name = id) =>
  makeSliceEntry({ id, name, sourceId: 'take-1', genome, sliceIndex: 0 });

describe('createFieldKit', () => {
  it('builds an empty, self-describing kit', () => {
    const created = kit();
    expect(created.format).toBe(FIELD_KIT_FORMAT);
    expect(created.createdAt).toBe(createdAt);
    expect(created.rootHz).toBe(110);
    expect(created.slices).toEqual([]);
    expect(created.groups).toEqual([]);
  });
});

describe('addSlice', () => {
  it('adds a slice with its serialized genome', () => {
    const withSlice = addSlice(kit(), entry('s1', 'Metal clang'));
    expect(withSlice.slices).toHaveLength(1);
    expect(withSlice.slices[0].genomeId).toBe(genome.id);
    expect(JSON.parse(withSlice.slices[0].genome).seed).toBe(genome.seed);
    expect(totalVariants(withSlice)).toBe(1);
  });

  it('replaces by id instead of duplicating', () => {
    const first = addSlice(kit(), entry('s1', 'Metal clang'));
    const replaced = addSlice(first, entry('s1', 'Metal clang v2'));
    expect(replaced.slices).toHaveLength(1);
    expect(replaced.slices[0].name).toBe('Metal clang v2');
  });

  it('does not add a new slice to a round-robin group', () => {
    const withGroup = addRoundRobinGroup(addSlice(kit(), entry('s1')), 'RR', ['s1']);
    const grown = addSlice(withGroup, entry('s2'));
    expect(grown.groups[0].memberIds).toEqual(['s1']);
  });
});

describe('replaceSliceGenome', () => {
  it('swaps the sound and remembers the lineage', () => {
    const base = addSlice(kit(), entry('s1'));
    const evolved = mutate(genome, 0.6, { seed: 55 });
    const updated = replaceSliceGenome(base, 's1', evolved);
    expect(updated.slices[0].genomeId).toBe(evolved.id);
    expect(updated.slices[0].variantOf).toBe(genome.id);
    expect(updated.slices[0].genome).toBe(serializeGenome(evolved));
  });

  it('is a no-op for an unknown slice', () => {
    const base = addSlice(kit(), entry('s1'));
    expect(replaceSliceGenome(base, 'nope', genome).slices[0].genomeId).toBe(genome.id);
  });
});

describe('addRoundRobinGroup', () => {
  it('adds a group of existing slices', () => {
    let built = addSlice(addSlice(kit(), entry('a')), entry('b'));
    built = addRoundRobinGroup(built, 'RR_Metal_01', ['a', 'b']);
    expect(built.groups).toHaveLength(1);
    expect(built.groups[0].memberIds).toEqual(['a', 'b']);
  });

  it('drops unknown members rather than writing a broken manifest', () => {
    const built = addRoundRobinGroup(addSlice(kit(), entry('a')), 'RR', ['a', 'ghost']);
    expect(built.groups[0].memberIds).toEqual(['a']);
  });

  it('refuses a group with no real members', () => {
    const built = addRoundRobinGroup(kit(), 'RR', ['ghost']);
    expect(built.groups).toHaveLength(0);
  });

  it('replaces a group with the same name', () => {
    let built = addSlice(addSlice(kit(), entry('a')), entry('b'));
    built = addRoundRobinGroup(built, 'RR', ['a']);
    built = addRoundRobinGroup(built, 'RR', ['b']);
    expect(built.groups).toHaveLength(1);
    expect(built.groups[0].memberIds).toEqual(['b']);
  });
});

describe('manifest serialization', () => {
  it('round-trips through JSON', () => {
    let built = addSlice(kit(), entry('a', 'Clang'));
    built = addRoundRobinGroup(built, 'RR_01', ['a']);
    const json = kitManifestJson(built);
    const parsed = parseKitManifest(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe('kit-1');
    expect(parsed!.slices).toHaveLength(1);
    expect(parsed!.groups[0].name).toBe('RR_01');
    expect(parsed!.rootHz).toBe(110);
  });

  it('can emit compact JSON', () => {
    expect(kitManifestJson(kit(), { pretty: false })).not.toMatch(/\n/);
  });

  it('rejects foreign or broken manifests', () => {
    expect(parseKitManifest('not json')).toBeNull();
    expect(parseKitManifest('{}')).toBeNull();
    expect(parseKitManifest(JSON.stringify({ format: 'other@1', id: 'x', slices: [] }))).toBeNull();
  });

  it('deserializes every slice genome', () => {
    const built = addSlice(kit(), entry('a'));
    const [first] = kitGenomes(built);
    expect(first.genome).not.toBeNull();
    expect(first.genome!.seed).toBe(genome.seed);
  });

  it('reports a null genome for a corrupt entry without throwing', () => {
    const broken = addSlice(kit(), { ...entry('a'), genome: '{"nope":1}' });
    expect(kitGenomes(broken)[0].genome).toBeNull();
  });
});

describe('file names and summaries', () => {
  it('sanitises file names for the interchange folder', () => {
    expect(kitFileName(kit())).toBe('Biscayne-Field-Kit.ncfield.json');
    expect(sliceFileName(entry('a', 'Metal clang 2!'), 0)).toBe('Metal-clang-2_01.wav');
  });

  it('summarises the kit', () => {
    let built = addSlice(kit(), entry('a'));
    built = addRoundRobinGroup(built, 'RR', ['a']);
    expect(describeKit(built)).toBe('1 slice · 1 round-robin group · root 110.0 Hz');
    expect(describeKit(kit())).toBe('0 slices · 0 round-robin groups · root 110.0 Hz');
  });
});
