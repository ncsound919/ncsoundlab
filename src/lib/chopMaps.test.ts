/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the persisted chop-session module: source-key normalization, the
 * pure slice→slot mapping, and the IndexedDB-backed CRUD paths (the `db`
 * module is mocked with an in-memory store, mirroring `sampleLibrary.db.test.ts`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbMock, store } = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const rows = () => [...store.values()];
  return {
    store,
    dbMock: {
      chopMaps: {
        put: vi.fn(async (row: Record<string, unknown>) => {
          store.set(row.id as string, row);
          return row.id as string;
        }),
        get: vi.fn(async (id: string) => store.get(id)),
        toArray: vi.fn(async () => rows()),
        where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn(async () => rows()) })) })),
        delete: vi.fn(async (id: string) => {
          store.delete(id);
        }),
        update: vi.fn(async (id: string, patch: Record<string, unknown>) => {
          const row = store.get(id);
          if (row) store.set(id, { ...row, ...patch });
          return 1;
        }),
      },
    },
  };
});

vi.mock('./db', () => ({ db: dbMock }));

import {
  chopSourceKey,
  chopMapSlots,
  saveChopMap,
  fetchChopMaps,
  fetchChopMap,
  fetchChopMapForSource,
  deleteChopMap,
  stampChopMapSent,
} from './chopMaps';

describe('chopSourceKey', () => {
  it('normalizes names to a match key', () => {
    expect(chopSourceKey('Break.WAV')).toBe('break');
    expect(chopSourceKey('E:\\drums\\Funky Drummer.mp3')).toBe('funky drummer');
    expect(chopSourceKey('  ')).toBe('sample');
  });
});

describe('chopMapSlots', () => {
  it('maps slices to pad slots with per-slice meta', () => {
    const slots = chopMapSlots(
      {
        markers: [0.25, 0.5, 0.75],
        meta: {
          '0.0000': { gain: 1, tune: 0, key: 'C', name: 'KICK' },
          '0.2500': { gain: 0.5, tune: 3, key: 'D' },
        },
      },
      'BREAK'
    );
    expect(slots).toHaveLength(4);
    expect(slots[0]).toMatchObject({ padIndex: 0, name: 'KICK', gain: 1, tune: 0, key: 'C' });
    expect(slots[1]).toMatchObject({ padIndex: 1, name: 'BREAK_CHOP_02', gain: 0.5, tune: 3, key: 'D' });
    expect(slots[1].start).toBeCloseTo(0.25);
    expect(slots[3].end).toBeCloseTo(1);
  });
});

describe('chopMaps persistence', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it('saves, lists (metadata-only), fetches by source, stamps and deletes', async () => {
    const id = await saveChopMap({
      name: 'Funky Drummer',
      sourceName: 'funky drummer.wav',
      sourceKey: 'funky drummer',
      markers: [0.5],
      meta: { '0.0000': { gain: 1, tune: 0, key: 'C' } },
      defaultCount: 4,
      sourceData: 'AAA=',
      sourceMeta: { sampleRate: 44100, channels: 1, length: 64 },
    });
    expect(typeof id).toBe('string');

    const list = await fetchChopMaps();
    expect(list).toHaveLength(1);
    expect(list[0].sourceData).toBeUndefined(); // metadata-only
    expect(list[0].sourceKey).toBe('funky drummer');

    const full = await fetchChopMap(id);
    expect(full?.sourceData).toBe('AAA=');

    const latest = await fetchChopMapForSource('funky drummer');
    expect(latest?.id).toBe(id);
    expect(dbMock.chopMaps.where).toHaveBeenCalledWith('sourceKey');

    await stampChopMapSent(id, 'D');
    expect((await fetchChopMap(id))?.programBank).toBe('D');

    await deleteChopMap(id);
    expect(await fetchChopMap(id)).toBeUndefined();
  });

  it('upserts by id and preserves stored audio when only meta changes', async () => {
    const id = await saveChopMap({
      name: 'Loop',
      sourceName: 'loop.wav',
      sourceKey: 'loop',
      markers: [],
      meta: {},
      defaultCount: 4,
      sourceData: 'QQQ=',
      sourceMeta: { sampleRate: 48000, channels: 2, length: 128 },
    });
    await saveChopMap({
      id,
      name: 'Loop v2',
      sourceName: 'loop.wav',
      sourceKey: 'loop',
      markers: [0.5],
      meta: {},
      defaultCount: 4,
    });
    const row = await fetchChopMap(id);
    expect(row?.name).toBe('Loop v2');
    expect(row?.markers).toEqual([0.5]);
    expect(row?.sourceData).toBe('QQQ='); // preserved
  });
});
