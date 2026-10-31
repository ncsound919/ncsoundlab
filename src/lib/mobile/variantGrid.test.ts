/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  attachPreviews,
  breed,
  breedPool,
  buildRoundRobinExport,
  createGrid,
  keep,
  keptGenomes,
  meanGridDiversity,
  replaceSlotGenome,
  roundSpread,
  setEvolutionTarget,
  setGeneLocks,
  setMutationStrength,
  slotFor,
  spawnRound,
  toggleTransientLock,
  trash,
  visibleSlots,
} from './variantGrid';
import { makeGenome, serializeGenome } from './genome';
import { analyseSamples } from '../../audio/mobile/analysis';
import { hits, noise, silence, tone } from '../../tests/mobileSignals';

const SR = 48000;
const parent = makeGenome(100, { gainDb: -3 });

const bright = analyseSamples(tone(3000, 0.3, SR, 0.4), SR);
const dark = analyseSamples(tone(120, 0.3, SR, 0.4), SR);
const clipped = analyseSamples(tone(300, 0.3, SR, 2.0), SR);
const silent = analyseSamples(silence(0.3, SR), SR);

describe('createGrid', () => {
  it('starts empty with the documented defaults', () => {
    const grid = createGrid(parent, { slots: 6, mutationStrength: 0.5 });
    expect(grid.parent).toBe(parent);
    expect(grid.round).toBe(0);
    expect(grid.slots).toHaveLength(0);
    expect(grid.mutationStrength).toBe(0.5);
    expect(grid.lockTransient).toBe(true);
    expect(grid.kept).toEqual([]);
  });
});

describe('spawnRound', () => {
  it('produces a full deterministic round of distinct children', () => {
    const grid = createGrid(parent, { slots: 8 });
    const first = spawnRound(grid);
    const second = spawnRound(grid);
    expect(first.children).toHaveLength(8);
    expect(new Set(first.children.map((c) => c.id)).size).toBe(8);
    expect(first.children.map(serializeGenome)).toEqual(second.children.map(serializeGenome));
    expect(first.children.every((child) => child.parentId === parent.id)).toBe(true);
  });

  it('advances the round and gives the next round different children', () => {
    const round1 = spawnRound(createGrid(parent, { slots: 4 }));
    const round2 = spawnRound(round1.grid, { slots: 4 });
    expect(round2.grid.round).toBe(2);
    expect(round2.children.map((c) => c.seed)).not.toEqual(round1.children.map((c) => c.seed));
  });

  it('carries slot statuses as candidates and keeps previous keeps', () => {
    const spawned = spawnRound(createGrid(parent, { slots: 3 }));
    const kept = keep(spawned.grid, spawned.children[0].id);
    const next = spawnRound(kept, { slots: 3 });
    expect(next.grid.kept).toContain(spawned.children[0].id);
    expect(next.grid.slots.every((slot) => slot.status === 'candidate')).toBe(true);
  });
});

describe('attachPreviews', () => {
  it('rejects a clipped render before the user sees it', () => {
    const spawned = spawnRound(createGrid(parent, { slots: 2 }));
    const grid = attachPreviews(spawned.grid, [
      { genomeId: spawned.children[0].id, analysis: clipped },
      { genomeId: spawned.children[1].id, analysis: bright },
    ]);
    const bad = slotFor(grid, spawned.children[0].id)!;
    expect(bad.rejected).toBe(true);
    expect(bad.hiddenReason).toMatch(/clipped/);
    expect(visibleSlots(grid).map((slot) => slot.genome.id)).not.toContain(spawned.children[0].id);
  });

  it('rejects a silent render', () => {
    const spawned = spawnRound(createGrid(parent, { slots: 1 }));
    const grid = attachPreviews(spawned.grid, [{ genomeId: spawned.children[0].id, analysis: silent }]);
    expect(slotFor(grid, spawned.children[0].id)!.rejected).toBe(true);
  });

  it('drops near-duplicate siblings so the grid stays diverse', () => {
    const spawned = spawnRound(createGrid(parent, { slots: 3 }));
    const same = analyseSamples(tone(3000, 0.3, SR, 0.4), SR);
    const grid = attachPreviews(spawned.grid, [
      { genomeId: spawned.children[0].id, analysis: bright },
      { genomeId: spawned.children[1].id, analysis: same },
      { genomeId: spawned.children[2].id, analysis: dark },
    ]);
    const visible = visibleSlots(grid);
    expect(visible).toHaveLength(2);
    expect(visible.map((slot) => slot.genome.id)).toEqual([
      spawned.children[0].id,
      spawned.children[2].id,
    ]);
    expect(slotFor(grid, spawned.children[1].id)!.hiddenReason).toMatch(/duplicate/);
  });

  it('accepts a varied round', () => {
    const spawned = spawnRound(createGrid(parent, { slots: 2 }));
    const grid = attachPreviews(spawned.grid, [
      { genomeId: spawned.children[0].id, analysis: bright },
      { genomeId: spawned.children[1].id, analysis: dark },
    ]);
    expect(visibleSlots(grid)).toHaveLength(2);
  });

  it('leaves slots without a preview as pending candidates', () => {
    const spawned = spawnRound(createGrid(parent, { slots: 2 }));
    const grid = attachPreviews(spawned.grid, []);
    expect(grid.slots.every((slot) => slot.analysis === undefined && !slot.rejected)).toBe(true);
  });

  it('honours custom thresholds', () => {
    const noisy = analyseSamples(hits([{ atSec: 0.05, freq: 200 }], 0.5, SR), SR);
    const spawned = spawnRound(createGrid(parent, { slots: 1 }));
    const strict = attachPreviews(
      spawned.grid,
      [{ genomeId: spawned.children[0].id, analysis: noisy }],
      { filterThresholds: { minDurationMs: 5000 } }
    );
    expect(slotFor(strict, spawned.children[0].id)!.rejected).toBe(true);
  });
});

describe('keep and trash', () => {
  const spawned = spawnRound(createGrid(parent, { slots: 3 }));
  const [first, second] = spawned.children;

  it('ignores an unknown id', () => {
    expect(keep(spawned.grid, 'nope')).toBe(spawned.grid);
    expect(trash(spawned.grid, 'nope')).toBe(spawned.grid);
  });

  it('keeps a variant once and in order', () => {
    const grid = keep(keep(spawned.grid, first.id), first.id);
    expect(grid.kept).toEqual([first.id]);
    expect(slotFor(grid, first.id)!.status).toBe('kept');
  });

  it('trashing a keep removes it from the keeps', () => {
    const grid = trash(keep(spawned.grid, first.id), first.id);
    expect(grid.kept).toEqual([]);
    expect(grid.trashed).toEqual([first.id]);
    expect(visibleSlots(grid).map((slot) => slot.genome.id)).not.toContain(first.id);
  });

  it('un-trashing restores visibility', () => {
    const trashed = trash(spawned.grid, first.id);
    const restored = keep(trashed, first.id);
    expect(restored.trashed).toEqual([]);
    expect(keptGenomes(restored)).toHaveLength(1);
  });

  it('resolves keeps to genomes', () => {
    const grid = keep(keep(spawned.grid, first.id), second.id);
    expect(keptGenomes(grid).map((g) => g.id)).toEqual([first.id, second.id]);
  });

  it('replaces an edited genome without losing its kept status', () => {
    const keptGrid = keep(spawned.grid, first.id);
    const edited = { ...first, params: { ...first.params, gainDb: -12 } };
    const next = replaceSlotGenome(keptGrid, first.id, edited, bright);
    expect(next).not.toBe(keptGrid);
    expect(keptGenomes(next)[0].params.gainDb).toBe(-12);
    expect(slotFor(next, first.id)!.status).toBe('kept');
    expect(slotFor(next, first.id)!.analysis).toBe(bright);
  });

  it('returns the grid untouched for an unknown genome id', () => {
    const edited = { ...first, params: { ...first.params, gainDb: -12 } };
    expect(replaceSlotGenome(spawned.grid, 'missing', edited)).toBe(spawned.grid);
  });

  it('re-keys kept and trashed ids when a refine changes genome identity', () => {
    const reshaped = { ...first, id: `${first.id}-v2` };

    const keptGrid = keep(spawned.grid, first.id);
    const afterRefine = replaceSlotGenome(keptGrid, first.id, reshaped);
    expect(afterRefine.kept).toEqual([reshaped.id]);
    expect(afterRefine.kept).not.toContain(first.id);
    expect(afterRefine.keptPool?.map((g) => g.id)).toEqual([reshaped.id]);
    // The UI reads `grid.kept.includes(slot.genome.id)`, so a stale id here
    // showed a refined variant as no longer kept.
    expect(afterRefine.kept.includes(slotFor(afterRefine, reshaped.id)!.genome.id)).toBe(
      true
    );
    expect(keptGenomes(afterRefine).map((g) => g.id)).toEqual([reshaped.id]);
    // A later trash of the new id must actually clear it.
    expect(trash(afterRefine, reshaped.id).kept).toEqual([]);

    const trashedGrid = trash(spawned.grid, first.id);
    expect(replaceSlotGenome(trashedGrid, first.id, reshaped).trashed).toEqual([
      reshaped.id,
    ]);
  });

  it('carries keeps across a new round so they stay breedable', () => {
    const round1 = spawnRound(createGrid(parent, { slots: 4 }));
    const afterKeep = keep(round1.grid, round1.children[0].id);
    const round2 = spawnRound(afterKeep);
    expect(keptGenomes(round2.grid)).toHaveLength(1);
    const afterSecondKeep = keep(round2.grid, round2.children[0].id);
    expect(keptGenomes(afterSecondKeep).map((g) => g.id)).toEqual([
      round1.children[0].id,
      round2.children[0].id,
    ]);
    expect(breed(afterSecondKeep).child).not.toBeNull();
  });

  it('drops a trashed genome from the pool and keeps edits in it', () => {
    const round1 = spawnRound(createGrid(parent, { slots: 4 }));
    const afterKeep = keep(round1.grid, round1.children[0].id);
    expect(keptGenomes(trash(afterKeep, round1.children[0].id))).toHaveLength(0);

    const edited = {
      ...round1.children[0],
      params: { ...round1.children[0].params, gainDb: -9 },
    };
    const afterEdit = replaceSlotGenome(afterKeep, round1.children[0].id, edited);
    expect(keptGenomes(afterEdit)[0].params.gainDb).toBe(-9);
  });
});

describe('breed', () => {
  it('needs two keeps', () => {
    const outcome = breed(spawnRound(createGrid(parent, { slots: 2 })).grid);
    expect(outcome.child).toBeNull();
    expect(outcome.reason).toMatch(/two/);
  });

  it('crosses the two most recent keeps, reproducibly', () => {
    const spawned = spawnRound(createGrid(parent, { slots: 3 }));
    const grid = keep(keep(spawned.grid, spawned.children[0].id), spawned.children[1].id);
    const first = breed(grid, { seed: 42 });
    const second = breed(grid, { seed: 42 });
    expect(first.child).not.toBeNull();
    expect(serializeGenome(first.child!)).toBe(serializeGenome(second.child!));
    // Lineage: the child hangs off the crossed generation, not the original take.
    expect(first.child!.parentId).toBeTruthy();
    expect(first.child!.parentId).not.toBe(parent.id);
    expect(first.child!.rev).toBeGreaterThan(
      Math.min(...keptGenomes(grid).map((genome) => genome.rev))
    );
    expect(first.grid.bred).toHaveLength(1);
  });
});

describe('buildRoundRobinExport', () => {
  it('exports keeps first, then the remaining candidates', () => {
    const spawned = spawnRound(createGrid(parent, { slots: 4 }));
    const grid = attachPreviews(
      spawned.grid,
      [
        { genomeId: spawned.children[0].id, analysis: bright },
        { genomeId: spawned.children[1].id, analysis: dark },
        { genomeId: spawned.children[2].id, analysis: analyseSamples(noise(0.3, SR, 0.3, 5), SR) },
        { genomeId: spawned.children[3].id, analysis: analyseSamples(hits([{ atSec: 0.1, freq: 150 }], 0.3, SR), SR) },
      ],
      { duplicateDistance: 0.001 }
    );
    const kept = keep(grid, spawned.children[1].id);
    const exported = buildRoundRobinExport(kept, { count: 3 });
    expect(exported.genomes).toHaveLength(3);
    expect(exported.genomes[0].id).toBe(spawned.children[1].id);
    expect(exported.short).toBe(false);
    expect(exported.name).toBe(`RR_${parent.id}_01`);
  });

  it('flags a short export when the grid cannot fill it', () => {
    const spawned = spawnRound(createGrid(parent, { slots: 1 }));
    const exported = buildRoundRobinExport(spawned.grid, { count: 4 });
    expect(exported.genomes).toHaveLength(1);
    expect(exported.short).toBe(true);
  });

  it('accepts an explicit name', () => {
    const spawned = spawnRound(createGrid(parent, { slots: 2 }));
    expect(buildRoundRobinExport(spawned.grid, { name: 'KitA' }).name).toBe('KitA');
  });

  it('never exports a rejected candidate', () => {
    const spawned = spawnRound(createGrid(parent, { slots: 2 }));
    const grid = attachPreviews(spawned.grid, [
      { genomeId: spawned.children[0].id, analysis: clipped },
      { genomeId: spawned.children[1].id, analysis: bright },
    ]);
    const exported = buildRoundRobinExport(grid, { count: 4 });
    expect(exported.genomes.map((g) => g.id)).toEqual([spawned.children[1].id]);
  });
});

describe('grid controls', () => {
  it('clamps the mutation-strength slider', () => {
    const grid = spawnRound(createGrid(parent)).grid;
    expect(setMutationStrength(grid, 5).mutationStrength).toBe(1);
    expect(setMutationStrength(grid, -1).mutationStrength).toBe(0);
  });

  it('toggles the transient lock', () => {
    const grid = createGrid(parent, { slots: 2 });
    expect(toggleTransientLock(grid).lockTransient).toBe(false);
  });

  it('measures how much ground a round covers', () => {
    // Strength 0: every child is the parent, so the round covers no ground.
    const flat = spawnRound(createGrid(parent, { slots: 2, mutationStrength: 0 })).grid;
    expect(roundSpread(flat)).toBe(0);

    const spawned = spawnRound(createGrid(parent, { slots: 4 }));
    const spread = roundSpread(spawned.grid);
    expect(spread).toBeGreaterThan(0);
    expect(spread).toBeLessThanOrEqual(1);
  });
});

describe('pool breeding and genetic diversity metrics', () => {
  it('requires at least two kept variants for pool breeding', () => {
    const grid = createGrid(parent, { slots: 4 });
    const outcome = breedPool(grid);
    expect(outcome.child).toBeNull();
    expect(outcome.reason).toMatch(/two/);
  });

  it('breeds across 3 kept variants and advances generation count', () => {
    const spawned = spawnRound(createGrid(parent, { slots: 4 }));
    let grid = spawned.grid;
    grid = keep(grid, spawned.children[0].id);
    grid = keep(grid, spawned.children[1].id);
    grid = keep(grid, spawned.children[2].id);

    const initialGen = grid.generation;
    const outcome = breedPool(grid, { seed: 101 });
    expect(outcome.child).not.toBeNull();
    expect(outcome.grid.generation).toBe(initialGen + 1);
    expect(outcome.grid.bred).toHaveLength(1);
  });

  it('updates evolution targets and gene locks', () => {
    let grid = createGrid(parent, { slots: 4 });
    grid = setEvolutionTarget(grid, 'sub-bass');
    expect(grid.target).toBe('sub-bass');

    grid = setGeneLocks(grid, { filter: true, layers: true });
    expect(grid.locks).toEqual({ filter: true, layers: true });
  });

  it('measures mean grid diversity across visible slots', () => {
    const spawned = spawnRound(createGrid(parent, { slots: 4, mutationStrength: 0.6 }));
    const diversity = meanGridDiversity(spawned.grid);
    expect(diversity).toBeGreaterThan(0);
    expect(diversity).toBeLessThanOrEqual(1);
  });
});
