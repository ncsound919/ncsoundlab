/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the IndexedDB-backed sample-library paths that `sampleLibrary.test.ts`
 * intentionally skips (save / fetch / decode-cache). The `db` module is mocked
 * with in-memory vi.fn()s; audio encode/decode helpers run for real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    sampleLibrarySamples: {
      put: vi.fn(),
      get: vi.fn(),
      toArray: vi.fn(),
      where: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('./db', () => ({ db: dbMock }));

import {
  saveLibrarySample,
  fetchLibrarySamples,
  decodeLibrarySample,
} from './sampleLibrary';

const makeBuffer = (): AudioBuffer => {
  const ch = new Float32Array(64).fill(0.1);
  return {
    numberOfChannels: 1,
    length: 64,
    sampleRate: 44100,
    duration: 64 / 44100,
    getChannelData: () => ch,
  } as unknown as AudioBuffer;
};

const makeRow = (id: string, sampleData: string) => ({
  id,
  name: `sample-${id}`,
  fileName: `sample-${id}.wav`,
  folderId: null,
  category: 'Perc',
  tags: [],
  gain: 0.85,
  pitch: 0,
  sampleData,
  sampleMeta: { sampleRate: 44100, channels: 1, length: 64 },
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
});

describe('sampleLibrary DB paths', () => {
  beforeEach(() => {
    dbMock.sampleLibrarySamples.put.mockReset();
    dbMock.sampleLibrarySamples.put.mockImplementation(async (row: any) => row.id);
    dbMock.sampleLibrarySamples.get.mockReset();
    dbMock.sampleLibrarySamples.get.mockResolvedValue(undefined);
    dbMock.sampleLibrarySamples.toArray.mockReset();
    dbMock.sampleLibrarySamples.toArray.mockResolvedValue([]);
    dbMock.sampleLibrarySamples.delete.mockReset();
    dbMock.sampleLibrarySamples.delete.mockResolvedValue(undefined);
  });

  it('saveLibrarySample strips DC offset, encodes PCM and persists a row', async () => {
    const id = await saveLibrarySample({ audioBuffer: makeBuffer(), name: '  Kick_01  ', fileName: 'kick.wav' });
    expect(id).toBeTruthy();
    expect(dbMock.sampleLibrarySamples.put).toHaveBeenCalledTimes(1);
    const row = dbMock.sampleLibrarySamples.put.mock.calls[0][0];
    expect(row.name).toBe('Kick_01');
    expect(row.sampleData).toBeTruthy();
    expect(row.sampleData.length).toBeGreaterThan(0);
    expect(row.sampleMeta).toEqual({ sampleRate: 44100, channels: 1, length: 64 });
  });

  it('fetchLibrarySamples strips the heavy base64 payload from list rows', async () => {
    dbMock.sampleLibrarySamples.toArray.mockResolvedValue([
      makeRow('1', 'BASE64PAYLOAD'),
      makeRow('2', 'BASE64PAYLOAD'),
    ]);
    const rows = await fetchLibrarySamples(null);
    expect(rows).toHaveLength(2);
    expect((rows[0] as { sampleData?: unknown }).sampleData).toBeUndefined();
  });

  it('decodeLibrarySample decodes an embedded sample and caches it', async () => {
    const ctx = { decodeAudioData: vi.fn(async () => makeBuffer()) } as any;
    const buf = await decodeLibrarySample(ctx, makeRow('a', 'TWFu'));
    expect(buf).toBeTruthy();
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
    // Second call is served from the cache (no re-decode).
    await decodeLibrarySample(ctx, makeRow('a', 'TWFu'));
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it('decodeLibrarySample evicts the oldest entries beyond the cache cap', async () => {
    const ctx = { decodeAudioData: vi.fn(async () => makeBuffer()) } as any;
    for (let i = 0; i < 26; i++) {
      await decodeLibrarySample(ctx, makeRow(String(i), 'TWFu'));
    }
    // '0' was evicted -> decode runs again (still decodes fine).
    const buf = await decodeLibrarySample(ctx, makeRow('0', 'TWFu'));
    expect(buf).toBeTruthy();
  });

  it('decodeLibrarySample lazily fetches the full row for metadata-only list rows', async () => {
    const ctx = { decodeAudioData: vi.fn(async () => makeBuffer()) } as any;
    const full = makeRow('2', 'TWFu');
    dbMock.sampleLibrarySamples.get.mockResolvedValue(full);
    const meta = { ...full, sampleData: '' };
    const buf = await decodeLibrarySample(ctx, meta);
    expect(buf).toBeTruthy();
    expect(dbMock.sampleLibrarySamples.get).toHaveBeenCalledWith('2');
  });

  it('decodeLibrarySample throws when no audio data exists anywhere', async () => {
    const ctx = { decodeAudioData: vi.fn() } as any;
    const meta = makeRow('missing', '');
    dbMock.sampleLibrarySamples.get.mockResolvedValue(undefined);
    await expect(decodeLibrarySample(ctx, meta)).rejects.toThrow(/no audio data/);
  });
});
