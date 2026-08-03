/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for groove templates (Phase 1.4).
 */

import { describe, it, expect } from 'vitest';
import {
  GROOVE_TEMPLATES,
  applyGroove,
  humanizeVelocities,
  clearGrooveOffsets,
  findGrooveTemplate,
} from './grooveTemplates';
import type { Pattern, PatternCell } from '../types';

const baseRow = (overrides: Partial<PatternCell>[] = []): PatternCell[] => {
  const row: PatternCell[] = Array.from({ length: 16 }, () => ({ on: false }));
  overrides.forEach((o, i) => {
    if (i < 16) row[i] = { on: true, velocity: 100, ...o };
  });
  return row;
};

const basePattern = (rows: Record<string, PatternCell[]> = {}): Pattern => ({
  id: 'A',
  name: 'A',
  layerRows: { k1: baseRow([{ on: true, velocity: 100 }, { on: true, velocity: 100 }]) },
  timeSignature: [4, 4],
  stepLength: 16,
  swing: 0,
  bpm: 120,
  ...rows,
});

describe('grooveTemplates — catalog', () => {
  it('exposes at least the canonical Straight template', () => {
    expect(GROOVE_TEMPLATES.find((t) => t.id === 'straight')).toBeTruthy();
  });

  it('all templates have 16-step offsets and velocities', () => {
    for (const t of GROOVE_TEMPLATES) {
      expect(t.offsets).toHaveLength(16);
      expect(t.velocities).toHaveLength(16);
    }
  });

  it('findGrooveTemplate returns a copy by id', () => {
    expect(findGrooveTemplate('swing-60')?.id).toBe('swing-60');
    expect(findGrooveTemplate('does-not-exist')).toBeUndefined();
  });
});

describe('grooveTemplates — applyGroove', () => {
  it('applies swing-50 offsets and velocity scaling to the active row', () => {
    const pattern = basePattern();
    const tpl = findGrooveTemplate('swing-50')!;
    const next = applyGroove(pattern, tpl);
    // Step 0 (downbeat) is unchanged.
    expect(next.layerRows.k1[0].offset).toBe(0);
    expect(next.layerRows.k1[0].velocity).toBe(100);
    // Step 1 (off-beat) gets offset 0.25 and a slight velocity boost.
    expect(next.layerRows.k1[1].offset).toBeCloseTo(0.25);
    expect(next.layerRows.k1[1].velocity).toBeGreaterThanOrEqual(105);
  });

  it('skips inactive cells (no offset / no velocity change)', () => {
    const pattern = basePattern();
    const next = applyGroove(pattern, findGrooveTemplate('swing-60')!);
    expect(next.layerRows.k1[2].offset).toBeUndefined();
    expect(next.layerRows.k1[2].velocity).toBeUndefined();
  });

  it('clamps velocity multipliers to 1..127', () => {
    const pattern = basePattern();
    // Manually craft a row at velocity 1 — multipliers shouldn't push below 1.
    const row = baseRow();
    row[0] = { on: true, velocity: 1 };
    const p: Pattern = { ...pattern, layerRows: { k1: row } };
    const tpl = findGrooveTemplate('straight')!;
    const next = applyGroove(p, tpl);
    expect(next.layerRows.k1[0].velocity).toBeGreaterThanOrEqual(1);
  });

  it('repeats the 16-step template across 32-step patterns', () => {
    const pattern: Pattern = {
      ...basePattern(),
      stepLength: 32,
      layerRows: {
        k1: Array.from({ length: 32 }, (_, i) =>
          i === 0 || i === 16 ? { on: true, velocity: 100 } : { on: false }
        ),
      },
    };
    const next = applyGroove(pattern, findGrooveTemplate('swing-50')!);
    // Step 16 gets the same offset as step 0 (modulo 16).
    expect(next.layerRows.k1[16].offset).toBe(0);
  });
});

describe('grooveTemplates — humanizeVelocities', () => {
  it('keeps every active cell within ±amount of its base velocity', () => {
    const pattern = basePattern();
    const next = humanizeVelocities(pattern, 0.2);
    for (const cell of next.layerRows.k1) {
      if (!cell.on || typeof cell.velocity !== 'number') continue;
      expect(cell.velocity).toBeGreaterThanOrEqual(80);
      expect(cell.velocity).toBeLessThanOrEqual(120);
    }
  });

  it('respects a deterministic RNG', () => {
    const pattern = basePattern();
    const a = humanizeVelocities(pattern, 0.2, undefined, () => 0.5);
    const b = humanizeVelocities(pattern, 0.2, undefined, () => 0.5);
    expect(a.layerRows.k1[0].velocity).toBe(b.layerRows.k1[0].velocity);
  });

  it('skips inactive cells', () => {
    const pattern = basePattern();
    const next = humanizeVelocities(pattern, 0.5);
    expect(next.layerRows.k1[2].velocity).toBeUndefined();
  });

  it('clamps amount to 0..1', () => {
    const pattern = basePattern();
    // Negative and >1 amounts should be clamped without error.
    const next = humanizeVelocities(pattern, -1);
    for (const cell of next.layerRows.k1) {
      if (!cell.on || typeof cell.velocity !== 'number') continue;
      // Should equal the base velocity (multiplier is 1 + 0 = 1).
      expect(cell.velocity).toBe(100);
    }
    const next2 = humanizeVelocities(pattern, 5);
    for (const cell of next2.layerRows.k1) {
      if (!cell.on || typeof cell.velocity !== 'number') continue;
      expect(cell.velocity).toBeGreaterThanOrEqual(1);
      expect(cell.velocity).toBeLessThanOrEqual(127);
    }
  });
});

describe('grooveTemplates — clearGrooveOffsets', () => {
  it('strips offset from every cell while preserving other fields', () => {
    const pattern = basePattern();
    const withGroove = applyGroove(pattern, findGrooveTemplate('swing-60')!);
    const cleared = clearGrooveOffsets(withGroove);
    expect(cleared.layerRows.k1[1].offset).toBeUndefined();
    expect(cleared.layerRows.k1[1].velocity).toBeDefined();
    expect(cleared.layerRows.k1[0].offset).toBeUndefined();
  });
});
