/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for pad-program presets: id→name snapshotting, name→id resolution
 * with missing-layer reporting, and the mocked-DB CRUD paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbMock, store } = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  return {
    store,
    dbMock: {
      padPrograms: {
        put: vi.fn(async (row: Record<string, unknown>) => {
          store.set(row.id as string, row);
          return row.id as string;
        }),
        toArray: vi.fn(async () => [...store.values()]),
        delete: vi.fn(async (id: string) => {
          store.delete(id);
        }),
      },
    },
  };
});

vi.mock('./db', () => ({ db: dbMock }));

import {
  snapshotProgram,
  resolveProgram,
  savePadProgram,
  fetchPadPrograms,
  deletePadProgram,
  type LiveProgramState,
} from './padPrograms';

const layers = [
  { id: 'l1', name: 'Kick' },
  { id: 'l2', name: 'Snare' },
];

const live = (over: Partial<LiveProgramState> = {}): LiveProgramState => ({
  banks: { A: ['l1', 'l2', ...Array(14).fill(null)], B: Array(16).fill(null), C: Array(16).fill(null), D: Array(16).fill(null) },
  swing: { l1: 10 },
  pocket: {},
  tune: { l2: 3 },
  choke: {},
  muted: { l1: true },
  level: { l1: 0.8 },
  filter: { l1: 1200 },
  sendReverb: { l1: 0.3 },
  sendDelay: {},
  voices: { l1: 2 },
  mode: { l1: 'gate' },
  sixteenLevels: true,
  sixteenLevelsMode: 'tune',
  globalSwing: 50,
  fullLevel: false,
  velocityCurve: 'linear',
  timeCorrect: 2,
  ...over,
});

describe('snapshotProgram', () => {
  it('stores slots and params by layer name', () => {
    const snap = snapshotProgram('Boom', live(), layers);
    expect(snap.name).toBe('Boom');
    expect(snap.banks.A[0]).toBe('Kick');
    expect(snap.banks.A[1]).toBe('Snare');
    expect(snap.banks.A).toHaveLength(16);
    expect(snap.swing).toEqual({ Kick: 10 });
    expect(snap.tune).toEqual({ Snare: 3 });
    expect(snap.muted).toEqual({ Kick: true });
    expect(snap.level).toEqual({ Kick: 0.8 });
    expect(snap.filter).toEqual({ Kick: 1200 });
    expect(snap.sendReverb).toEqual({ Kick: 0.3 });
    expect(snap.voices).toEqual({ Kick: 2 });
    expect(snap.mode).toEqual({ Kick: 'gate' });
  });

  it('drops params for layers that no longer exist', () => {
    const snap = snapshotProgram('Boom', live({ swing: { ghost: 20 } }), layers);
    expect(snap.swing).toEqual({});
  });
});

describe('resolveProgram', () => {
  it('resolves names back to ids and reports missing layers', () => {
    const snap = snapshotProgram('Boom', live(), layers);
    const resolved = resolveProgram({ ...snap, id: 'p1', createdAt: '', updatedAt: '' }, [
      { id: 'n1', name: 'Kick' }, // same name, new id
    ]);
    expect(resolved.banks.A[0]).toBe('n1');
    expect(resolved.banks.A[1]).toBeNull(); // Snare gone
    expect(resolved.missing).toEqual(['Snare']);
    expect(resolved.swing).toEqual({ n1: 10 });
    expect(resolved.tune).toEqual({});
    expect(resolved.filter).toEqual({ n1: 1200 });
    expect(resolved.voices).toEqual({ n1: 2 });
    expect(resolved.mode).toEqual({ n1: 'gate' });
  });

  it('sanitizes the mode and globals', () => {
    const snap = snapshotProgram('Boom', live(), layers);
    const stored = { ...snap, id: 'p1', createdAt: '', updatedAt: '', sixteenLevelsMode: 'bogus' };
    const resolved = resolveProgram(stored as never, layers);
    expect(resolved.sixteenLevelsMode).toBe('velocity');
  });
});

describe('padPrograms persistence', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it('saves, lists and deletes presets', async () => {
    const id = await savePadProgram(snapshotProgram('Boom', live(), layers));
    expect(typeof id).toBe('string');
    const list = await fetchPadPrograms();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Boom');
    await deletePadProgram(id);
    expect(await fetchPadPrograms()).toHaveLength(0);
  });
});
