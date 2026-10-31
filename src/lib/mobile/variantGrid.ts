/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The variant grid — eight children at a time, tap to audition, swipe to keep
 * or trash, breed two keeps.
 *
 * Everything here is a pure state transition over genomes plus (optional)
 * measurements of what each child rendered to. Two rules keep it honest:
 *
 *  - children are generated from `deriveSeed(parent.seed, slot)` so the same
 *    round can be regenerated exactly, and a session is reproducible;
 *  - a candidate that rendered clipped, silent, DC-offset or as a near-duplicate
 *    of a sibling is filtered *before* the user sees it, using thresholds and
 *    spectral distance — not a model.
 */

import {
  crossover,
  deriveSeed,
  mutate,
  poolCrossover,
  genomeDistance,
  GENOME_SCHEMA,
  type EvolutionTarget,
  type GeneLocks,
  type Genome,
} from './genome';
import {
  autoFilterIssues,
  isNearDuplicate,
  type AnalysisIssue,
  type AutoFilterThresholds,
  type BufferAnalysis,
} from '../../audio/mobile/analysis';

export interface VariantPreview {
  genomeId: string;
  /** Measurements of the rendered child. */
  analysis: BufferAnalysis;
}

export type SlotStatus = 'candidate' | 'kept' | 'trashed';

export interface GridSlot {
  genome: Genome;
  status: SlotStatus;
  /** Set once the child has been rendered and measured. */
  analysis?: BufferAnalysis;
  /** Auto-filter verdict; a rejected slot is never shown. */
  issues: AnalysisIssue[];
  rejected: boolean;
  /** Reason the slot was hidden: auto-filter, or too close to a sibling. */
  hiddenReason?: string;
  /** Lineage generation index (1 = direct child, 2 = child of child/crossover). */
  generation?: number;
}

export interface GridOptions {
  /** Visible children per round. Default 8. */
  slots?: number;
  /** Mutation strength for new rounds, 0..1. Default 0.35. */
  mutationStrength?: number;
  /** Spectral distance below which a child is a near-duplicate. Default 0.08. */
  duplicateDistance?: number;
  /** Keep the parent's attack intact. Default true. */
  lockTransient?: boolean;
  filterThresholds?: AutoFilterThresholds;
  /** Evolution objective biasing mutations. Default 'balanced'. */
  target?: EvolutionTarget;
  /** Category gene freezes. */
  locks?: GeneLocks;
  /** Oversample factor for greedy diversity maximization. Default 1.5. */
  oversampleRatio?: number;
}

export interface VariantGrid {
  parent: Genome;
  round: number;
  generation: number;
  /** Children per round, fixed at creation so every round has the same shape. */
  slotCount: number;
  mutationStrength: number;
  lockTransient: boolean;
  target: EvolutionTarget;
  locks: GeneLocks;
  slots: GridSlot[];
  /** Ids the user kept, in the order they kept them. */
  kept: string[];
  trashed: string[];
  /** Genomes bred from keeps, newest last. */
  bred: Genome[];
  /**
   * Keeps that survive a new round. `slots` is replaced on every evolve, so a
   * keep recorded only as a slot id would vanish — taking the breeding pool
   * and "add kept to kit" with it. Absent on grids built before this existed.
   */
  keptPool?: Genome[];
}

const OPTION_DEFAULTS: Required<Omit<GridOptions, 'filterThresholds' | 'target' | 'locks'>> = {
  slots: 8,
  mutationStrength: 0.35,
  duplicateDistance: 0.08,
  lockTransient: true,
  oversampleRatio: 1.5,
};

/** A fresh grid for one take. No children until `spawnRound` runs. */
export function createGrid(parent: Genome, options: GridOptions = {}): VariantGrid {
  const opts = { ...OPTION_DEFAULTS, ...options };
  return {
    parent,
    round: 0,
    generation: 1,
    slotCount: Math.max(1, opts.slots),
    mutationStrength: opts.mutationStrength,
    lockTransient: opts.lockTransient,
    target: options.target ?? 'balanced',
    locks: options.locks ?? {},
    slots: [],
    kept: [],
    trashed: [],
    bred: [],
    keptPool: [],
  };
}

/** Add or replace by id, preserving keep order. */
function upsertGenome(genomes: Genome[], genome: Genome): Genome[] {
  const index = genomes.findIndex((entry) => entry.id === genome.id);
  if (index === -1) return [...genomes, genome];
  const next = [...genomes];
  next[index] = genome;
  return next;
}

/**
 * Generate the next round of children.
 * Uses oversampled candidate pool with greedy pairwise diversity selection
 * to guarantee maximal timbral and parameter spread.
 */
export function spawnRound(
  grid: VariantGrid,
  options: GridOptions = {}
): { grid: VariantGrid; children: Genome[] } {
  const opts = {
    ...OPTION_DEFAULTS,
    ...options,
    mutationStrength: options.mutationStrength ?? grid.mutationStrength,
    target: options.target ?? grid.target,
    locks: options.locks ?? grid.locks,
  };
  const count = Math.max(1, options.slots ?? grid.slotCount);
  const round = grid.round + 1;
  const generation = grid.generation;
  const oversample = Math.max(count, Math.round(count * (opts.oversampleRatio ?? 1.5)));

  // Generate oversampled candidate pool
  const candidates: Genome[] = [];
  for (let c = 0; c < oversample; c++) {
    const seed = deriveSeed(grid.parent.seed, round * 1000 + c);
    const child = mutate(grid.parent, opts.mutationStrength, {
      seed,
      respectTransientLock: grid.lockTransient,
      target: opts.target,
      locks: opts.locks,
    });
    candidates.push({ ...child, id: `${child.id}-r${round}s${c}-${child.seed}` });
  }

  // Greedy diversity selection:
  // 1. Pick candidate with largest distance from parent
  // 2. Iteratively pick candidates that maximize minimum distance to already picked candidates
  const selected: Genome[] = [];
  if (candidates.length <= count) {
    selected.push(...candidates);
  } else {
    // Start with candidate farthest from parent
    let bestFirstIdx = 0;
    let maxDistToParent = -1;
    for (let i = 0; i < candidates.length; i++) {
      const d = genomeDistance(grid.parent, candidates[i]);
      if (d > maxDistToParent) {
        maxDistToParent = d;
        bestFirstIdx = i;
      }
    }
    selected.push(candidates[bestFirstIdx]);
    const remaining = candidates.filter((_, idx) => idx !== bestFirstIdx);

    while (selected.length < count && remaining.length > 0) {
      let bestNextIdx = 0;
      let maxMinDist = -1;

      for (let i = 0; i < remaining.length; i++) {
        const cand = remaining[i];
        let minDistToSelected = 1.0;
        for (const sel of selected) {
          const d = genomeDistance(cand, sel);
          if (d < minDistToSelected) minDistToSelected = d;
        }
        if (minDistToSelected > maxMinDist) {
          maxMinDist = minDistToSelected;
          bestNextIdx = i;
        }
      }

      selected.push(remaining[bestNextIdx]);
      remaining.splice(bestNextIdx, 1);
    }
  }

  return {
    grid: {
      ...grid,
      round,
      generation,
      slotCount: count,
      mutationStrength: opts.mutationStrength,
      target: opts.target,
      locks: opts.locks,
      slots: selected.map((genome) => ({
        genome,
        status: 'candidate',
        issues: [],
        rejected: false,
        generation,
      })),
      trashed: [],
    },
    children: selected,
  };
}

/**
 * Attach render measurements and run the deterministic pre-view filter:
 * clipping / DC / silence / short via thresholds, near-duplicate siblings via
 * spectral distance (first occurrence wins, so the grid stays diverse).
 */
export function attachPreviews(
  grid: VariantGrid,
  previews: VariantPreview[],
  options: GridOptions = {}
): VariantGrid {
  const opts = { ...OPTION_DEFAULTS, ...options };
  const byId = new Map(previews.map((p) => [p.genomeId, p.analysis]));
  const seen: BufferAnalysis[] = [];
  const slots: GridSlot[] = grid.slots.map((slot) => {
    const analysis = byId.get(slot.genome.id);
    if (!analysis) return slot;
    const issues = autoFilterIssues(analysis, opts.filterThresholds ?? {});
    if (issues.some((i) => i.severity === 'reject')) {
      return {
        ...slot,
        analysis,
        issues,
        rejected: true,
        hiddenReason: issues.find((i) => i.severity === 'reject')?.message ?? 'rejected',
      };
    }
    const duplicate = seen.find((other) => isNearDuplicate(other, analysis, opts.duplicateDistance));
    if (duplicate) {
      return {
        ...slot,
        analysis,
        issues,
        rejected: true,
        hiddenReason: 'near-duplicate of a sibling in this round',
      };
    }
    seen.push(analysis);
    return { ...slot, analysis, issues, rejected: false };
  });
  return { ...grid, slots };
}

/** Slots the user should actually see: measured, accepted, not trashed. */
export function visibleSlots(grid: VariantGrid): GridSlot[] {
  return grid.slots.filter((slot) => slot.status !== 'trashed' && !slot.rejected);
}

export function slotFor(grid: VariantGrid, genomeId: string): GridSlot | undefined {
  return grid.slots.find((slot) => slot.genome.id === genomeId);
}

export function keep(grid: VariantGrid, genomeId: string): VariantGrid {
  const slot = slotFor(grid, genomeId);
  if (!slot) return grid;
  return {
    ...grid,
    slots: grid.slots.map((entry) =>
      entry.genome.id === genomeId ? { ...entry, status: 'kept' } : entry
    ),
    kept: grid.kept.includes(genomeId) ? grid.kept : [...grid.kept, genomeId],
    trashed: grid.trashed.filter((id) => id !== genomeId),
    keptPool: upsertGenome(grid.keptPool ?? [], slot.genome),
  };
}

export function trash(grid: VariantGrid, genomeId: string): VariantGrid {
  if (!slotFor(grid, genomeId)) return grid;
  return {
    ...grid,
    slots: grid.slots.map((entry) =>
      entry.genome.id === genomeId ? { ...entry, status: 'trashed' } : entry
    ),
    kept: grid.kept.filter((id) => id !== genomeId),
    trashed: grid.trashed.includes(genomeId) ? grid.trashed : [...grid.trashed, genomeId],
    keptPool: (grid.keptPool ?? []).filter((genome) => genome.id !== genomeId),
  };
}

/**
 * Swap a slot's genome after an edit, keeping its keep/trash status.
 *
 * The grid is the source of truth for kept genomes (`keptGenomes` reads the
 * slots), so an edit that only updated the rendered audio would be thrown away
 * by the next breed or export. Returns the same grid when the id is unknown.
 *
 * `kept` and `trashed` are id lists, not slot references, so a genome that
 * changes identity has to be re-keyed there too: without that the old id stays
 * behind, `grid.kept.includes(newId)` reads false (the grid shows a refined
 * variant as not-kept), `slotFor(oldId)` resolves to nothing, and the dead id
 * accumulates on every subsequent `trash`.
 */
export function replaceSlotGenome(
  grid: VariantGrid,
  genomeId: string,
  genome: Genome,
  analysis?: BufferAnalysis
): VariantGrid {
  let found = false;
  const slots = grid.slots.map((slot) => {
    if (slot.genome.id !== genomeId) return slot;
    found = true;
    return analysis ? { ...slot, genome, analysis } : { ...slot, genome };
  });
  if (!found) return grid;
  const keptPool = grid.keptPool?.some((entry) => entry.id === genomeId)
    ? grid.keptPool.map((entry) => (entry.id === genomeId ? genome : entry))
    : grid.keptPool;

  const rekey = (ids: string[]): string[] => {
    if (genome.id === genomeId || !ids.includes(genomeId)) return ids;
    const next = ids.map((id) => (id === genomeId ? genome.id : id));
    return next.filter((id, index) => next.indexOf(id) === index);
  };

  return {
    ...grid,
    slots,
    keptPool,
    kept: rekey(grid.kept),
    trashed: rekey(grid.trashed),
  };
}

export function setMutationStrength(grid: VariantGrid, strength: number): VariantGrid {
  return { ...grid, mutationStrength: Math.min(1, Math.max(0, strength)) };
}

export function toggleTransientLock(grid: VariantGrid): VariantGrid {
  return { ...grid, lockTransient: !grid.lockTransient };
}

/**
 * Genomes the user kept, resolved to their current slot genomes.
 *
 * The durable pool is read first so keeps survive a new round; slot lookup
 * backfills grids created before `keptPool` existed (and manual test grids).
 */
export function keptGenomes(grid: VariantGrid): Genome[] {
  const merged = [...(grid.keptPool ?? [])];
  for (const id of grid.kept) {
    const genome = slotFor(grid, id)?.genome;
    if (genome && !merged.some((entry) => entry.id === genome.id)) merged.push(genome);
  }
  return merged;
}

export interface BreedOutcome {
  grid: VariantGrid;
  child: Genome | null;
  /** Why nothing was bred, when that happened. */
  reason?: string;
}

/**
 * Breed the two most recent keeps: crossover their layer/parameter genes, then
 * mutate the result by the current strength.
 */
export function breed(grid: VariantGrid, options: { seed?: number } = {}): BreedOutcome {
  const keeps = keptGenomes(grid);
  if (keeps.length < 2) {
    return { grid, child: null, reason: 'Keep at least two variants to breed them.' };
  }
  const [a, b] = keeps.slice(-2);
  const seed = options.seed ?? deriveSeed(a.seed, b.seed);
  const crossed = crossover(a, b, seed);
  const child = mutate(crossed, grid.mutationStrength, { seed: deriveSeed(seed, 7) });
  return {
    grid: { ...grid, bred: [...grid.bred, child] },
    child,
  };
}

export function setEvolutionTarget(grid: VariantGrid, target: EvolutionTarget): VariantGrid {
  return { ...grid, target };
}

export function setGeneLocks(grid: VariantGrid, locks: GeneLocks): VariantGrid {
  return { ...grid, locks };
}

/**
 * Breed across the entire pool of kept variants (2 or more) using multi-parent crossover.
 */
export function breedPool(grid: VariantGrid, options: { seed?: number } = {}): BreedOutcome {
  const keeps = keptGenomes(grid);
  if (keeps.length < 2) {
    return { grid, child: null, reason: 'Keep at least two variants in the pool to breed them.' };
  }
  const seed = options.seed ?? deriveSeed(keeps[0].seed, keeps[1].seed);
  const crossed = poolCrossover(keeps, seed);
  const child = mutate(crossed, grid.mutationStrength, {
    seed: deriveSeed(seed, 11),
    locks: grid.locks,
    target: grid.target,
  });
  const generation = grid.generation + 1;
  return {
    grid: { ...grid, generation, bred: [...grid.bred, child] },
    child,
  };
}

/**
 * Mean pairwise normalized parameter distance across all visible slots in the grid (0..1).
 * Measures the true genetic divergence of the current round.
 */
export function meanGridDiversity(grid: VariantGrid): number {
  const visible = visibleSlots(grid);
  if (visible.length < 2) return 0;
  let totalDist = 0;
  let pairs = 0;
  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      totalDist += genomeDistance(visible[i].genome, visible[j].genome);
      pairs++;
    }
  }
  return pairs > 0 ? Math.round((totalDist / pairs) * 100) / 100 : 0;
}

export interface RoundRobinExport {
  name: string;
  genomes: Genome[];
  /** True when the keep count could not fill the requested size. */
  short: boolean;
}

/**
 * The set to export as a named round-robin group: keeps first (in the order they
 * were kept), then the strongest remaining candidates, so a kit always ships a
 * usable number of alternates.
 */
export function buildRoundRobinExport(
  grid: VariantGrid,
  options: { name?: string; count?: number } = {}
): RoundRobinExport {
  const count = Math.max(1, options.count ?? 4);
  const picked: Genome[] = keptGenomes(grid);
  if (picked.length < count) {
    const others = grid.slots
      .filter((slot) => slot.status === 'candidate' && !slot.rejected)
      .sort((left, right) => {
        const leftCrest = left.analysis?.crest ?? 0;
        const rightCrest = right.analysis?.crest ?? 0;
        return rightCrest - leftCrest;
      })
      .map((slot) => slot.genome);
    for (const genome of others) {
      if (picked.length >= count) break;
      if (!picked.some((existing) => existing.id === genome.id)) picked.push(genome);
    }
  }
  const trimmed = picked.slice(0, count);
  return {
    name: options.name ?? roundRobinGroupName(grid.parent, grid.round),
    genomes: trimmed,
    short: trimmed.length < count,
  };
}

/** Deterministic, human-readable group name for the kit manifest. */
export function roundRobinGroupName(parent: Genome, round: number): string {
  return `RR_${parent.id}_${String(round).padStart(2, '0')}`;
}

/**
 * Parameter spread of the current round, 0..1 — how much ground the round
 * covers. The UI uses it to nudge the user when eight children are basically
 * one child (raise the strength), or when the round is chaos (lower it).
 */
export function roundSpread(grid: VariantGrid): number {
  const slots = visibleSlots(grid);
  if (slots.length < 2) return 0;
  const fields: ((genome: Genome) => number)[] = [
    (g) => g.params.filter.lowHz / GENOME_SCHEMA.filter.lowHz.max,
    (g) => g.params.filter.highHz / GENOME_SCHEMA.filter.highHz.max,
    (g) => (g.params.pitch.offsetCents - GENOME_SCHEMA.pitch.offsetCents.min) / 2400,
    (g) => g.params.grain.scatter,
    (g) => g.params.drive.mix,
    (g) => g.params.crush.bits / 32,
    (g) => g.params.layers.length / 4,
  ];
  let total = 0;
  for (const field of fields) {
    const values = slots.map((slot) => field(slot.genome));
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / values.length;
    total += Math.sqrt(variance);
  }
  return Math.min(1, total / fields.length / 0.25);
}
