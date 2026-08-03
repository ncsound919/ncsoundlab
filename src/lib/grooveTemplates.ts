/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Groove templates (Phase 1.4).
 *
 * A groove template captures per-step timing offsets and velocity scaling,
 * expressed as fractions of the 16th-note step (so 1.0 = a full 16th-note
 * shift ahead). Templates are pure data so they can be unit-tested without
 * Web Audio.
 *
 * The apply* helpers write the per-cell offsets onto each PatternCell's
 * `offset` field (added in this step) and scale velocities into the
 * 0..127 range. The scheduler honours the cell's offset when it computes the
 * trigger time, replacing the prior JS `setTimeout`-based swing.
 */

import type { Pattern, PatternCell } from '../types';
import type { PatternId } from '../store/patternStore';

export interface GrooveTemplate {
  id: string;
  name: string;
  description: string;
  /**
   * Per-step timing offset as a fraction of the 16th-note step. Positive =
   * shift the step later (laid-back); negative = earlier (pushed). Range
   * typically ±0.5 (a maximum ±half-step shift). The 0th entry is unused
   * because step 0 is the downbeat and is never shifted.
   */
  offsets: number[];
  /**
   * Per-step velocity multiplier (0..1.5, where 1.0 = unchanged). Multiplies
   * the cell's stored velocity (or 100 if unset) to produce a humanized
   * performance. Index 0 is for the downbeat; subsequent entries are per
   * 16th.
   */
  velocities: number[];
}

const make16 = (fn: (step: number) => number): number[] =>
  Array.from({ length: 16 }, (_, i) => fn(i));

export const GROOVE_TEMPLATES: GrooveTemplate[] = [
  {
    id: 'straight',
    name: 'Straight',
    description: 'No swing, no velocity humanization. The default.',
    offsets: make16(() => 0),
    velocities: make16(() => 1),
  },
  {
    id: 'swing-50',
    name: 'MPC Swing 50%',
    description: 'Even 16ths pushed by 50% — classic MPC swing.',
    offsets: make16((i) => (i % 2 === 1 ? 0.25 : 0)),
    velocities: make16((i) => (i % 2 === 1 ? 1.08 : 1)),
  },
  {
    id: 'swing-60',
    name: 'MPC Swing 60%',
    description: 'Stronger swing — 60% on the off-beats.',
    offsets: make16((i) => (i % 2 === 1 ? 0.4 : 0)),
    velocities: make16((i) => (i % 2 === 1 ? 1.1 : 1)),
  },
  {
    id: 'shuffle',
    name: 'MPC Shuffle',
    description: 'Triplet feel — pushes the off-beats almost to the next 8th.',
    offsets: make16((i) => (i % 2 === 1 ? 0.5 : 0)),
    velocities: make16((i) => (i % 2 === 1 ? 1.12 : 0.95)),
  },
  {
    id: 'boom-bap',
    name: 'Boom Bap',
    description: 'Laid-back snare on 5 and 13; gentle velocity humanize.',
    offsets: make16((i) => (i === 4 || i === 12 ? 0.15 : 0)),
    velocities: make16((i) => {
      if (i === 4 || i === 12) return 1.15;
      if (i === 0 || i === 8) return 1.05;
      return 0.97;
    }),
  },
  {
    id: 'funk',
    name: 'Funk Pocket',
    description: 'Aggressive humanize; ghost notes light, backbeats heavy.',
    offsets: make16((i) => (i % 4 === 3 ? -0.1 : 0)),
    velocities: make16((i) => {
      if (i === 0 || i === 8) return 1.2;
      if (i === 4 || i === 12) return 1.15;
      if (i % 4 === 3) return 0.85;
      return 1;
    }),
  },
];

export const GROOVE_TEMPLATE_BY_ID: Record<string, GrooveTemplate> = Object.fromEntries(
  GROOVE_TEMPLATES.map((t) => [t.id, t])
);

export const findGrooveTemplate = (id: string): GrooveTemplate | undefined =>
  GROOVE_TEMPLATE_BY_ID[id];

/**
 * Apply a groove template to the named pattern (or specific layers). The
 * template's `offsets` array is interpreted modulo `stepLength` so a 16-step
 * groove also applies to 32-step patterns (offsets repeat every 16 steps).
 *
 * Each cell's `offset` field stores the fractional step shift (multiplied
 * by the destination pattern's stepLength to convert fractions to step
 * indices — `0.25` on a 16-step pattern means "1 sixteenth later"). The
 * cell's velocity is multiplied by the template's velocity multiplier.
 */
export const applyGroove = (
  pattern: Pattern,
  template: GrooveTemplate,
  layerIds?: string[]
): Pattern => {
  const targets = layerIds ?? Object.keys(pattern.layerRows);
  const layerRows: Record<string, PatternCell[]> = { ...pattern.layerRows };
  for (const lid of targets) {
    const row = layerRows[lid];
    if (!row) continue;
    layerRows[lid] = row.map((cell, i) => {
      if (!cell.on) return cell;
      const tplIdx = i % 16;
      const offset = template.offsets[tplIdx] ?? 0;
      const velocityMultiplier = template.velocities[tplIdx] ?? 1;
      const baseVelocity = typeof cell.velocity === 'number' ? cell.velocity : 100;
      const newVelocity = Math.max(1, Math.min(127, Math.round(baseVelocity * velocityMultiplier)));
      return { ...cell, offset, velocity: newVelocity };
    });
  }
  return { ...pattern, layerRows };
};

/**
 * Randomly humanize the velocity of every active cell. `amount` is a fraction
 * (0..1) representing the maximum ±deviation. A cell with velocity 100 and
 * amount 0.2 lands in [80, 120].
 */
export const humanizeVelocities = (
  pattern: Pattern,
  amount: number,
  layerIds?: string[],
  rng: () => number = Math.random
): Pattern => {
  const a = Math.max(0, Math.min(1, amount));
  const targets = layerIds ?? Object.keys(pattern.layerRows);
  const layerRows: Record<string, PatternCell[]> = { ...pattern.layerRows };
  for (const lid of targets) {
    const row = layerRows[lid];
    if (!row) continue;
    layerRows[lid] = row.map((cell) => {
      if (!cell.on || typeof cell.velocity !== 'number') return cell;
      const drift = (rng() * 2 - 1) * a; // -amount..+amount
      const newVelocity = Math.max(1, Math.min(127, Math.round(cell.velocity * (1 + drift))));
      return { ...cell, velocity: newVelocity };
    });
  }
  return { ...pattern, layerRows };
};

/**
 * Strip groove offsets from every cell of the pattern. Useful when the user
 * switches back to "Straight" or wants to apply a new groove cleanly.
 */
export const clearGrooveOffsets = (pattern: Pattern): Pattern => {
  const layerRows: Record<string, PatternCell[]> = { ...pattern.layerRows };
  for (const [k, row] of Object.entries(layerRows)) {
    layerRows[k] = row.map((cell) => {
      if (cell.offset === undefined) return cell;
      const { offset, ...rest } = cell;
      void offset;
      return rest as PatternCell;
    });
  }
  return { ...pattern, layerRows };
};

export const applyGrooveToPatternId = (
  patternId: PatternId,
  templateId: string,
  setPattern: (p: Pattern) => void,
  layerIds?: string[]
): void => {
  const tpl = findGrooveTemplate(templateId);
  if (!tpl) return;
  setPattern(applyGroove(/* current pattern */ undefined as unknown as Pattern, tpl, layerIds));
};
