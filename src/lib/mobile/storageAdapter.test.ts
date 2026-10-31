/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  createFieldStorage,
  createMemoryAudioIO,
  createMemoryMetaStore,
  toStorageAdapter,
} from './storageAdapter';
import { buildFieldMeta } from './fieldMeta';
import { decodeWavMono } from '../../audio/mobile/wavCodec';
import { tone } from '../../tests/mobileSignals';

const SR = 48000;

const makeTake = (id: string, seconds = 0.1) => ({
  meta: buildFieldMeta({
    id,
    place: 'Battery',
    timeISO: '2026-10-27T14:00:00Z',
    sampleRateHz: SR,
    durationSec: seconds,
  }),
  samples: tone(220, seconds, SR, 0.5),
});

const makeStorage = () => {
  const meta = createMemoryMetaStore();
  const audio = createMemoryAudioIO();
  return { meta, audio, storage: createFieldStorage({ meta, audio }) };
};

describe('saveTake / loadTake', () => {
  it('round-trips a take bit-exactly as float32', async () => {
    const { storage } = makeStorage();
    const { meta, samples } = makeTake('take-a');
    await storage.saveTake(meta, samples);
    const loaded = await storage.loadTake('take-a');
    expect(loaded).not.toBeNull();
    expect(loaded!.meta.id).toBe('take-a');
    expect(loaded!.sampleRate).toBe(SR);
    expect(loaded!.samples.length).toBe(samples.length);
    for (let i = 0; i < samples.length; i += 101) {
      expect(loaded!.samples[i]).toBe(samples[i]);
    }
  });

  it('can store a smaller format when asked', async () => {
    const { storage, audio } = makeStorage();
    const { meta, samples } = makeTake('take-b');
    await storage.saveTake(meta, samples, { format: 'int16' });
    const bytes = audio.peek('take-b')!;
    expect(bytes.length).toBe(44 + samples.length * 2);
    const decoded = decodeWavMono(bytes);
    expect(decoded.format).toBe('int16');
  });

  it('returns null when the metadata is missing', async () => {
    const { storage } = makeStorage();
    expect(await storage.loadTake('missing')).toBeNull();
  });

  it('returns null when the audio file is missing', async () => {
    const { storage, audio } = makeStorage();
    const { meta, samples } = makeTake('take-c');
    await storage.saveTake(meta, samples);
    await audio.remove('take-c');
    expect(await storage.loadTake('take-c')).toBeNull();
    expect(await storage.audioExists('take-c')).toBe(false);
  });
});

describe('listing and deletion', () => {
  it('lists saved takes', async () => {
    const { storage } = makeStorage();
    await storage.saveTake(makeTake('one').meta, makeTake('one').samples);
    await storage.saveTake(makeTake('two').meta, makeTake('two').samples);
    const listed = await storage.listTakes();
    expect(listed.map((meta) => meta.id).sort()).toEqual(['one', 'two']);
  });

  it('deletes metadata and audio together', async () => {
    const { storage, meta, audio } = makeStorage();
    await storage.saveTake(makeTake('gone').meta, makeTake('gone').samples);
    await storage.deleteTake('gone');
    expect(await storage.loadTake('gone')).toBeNull();
    expect(meta.size()).toBe(0);
    expect(await audio.exists('gone')).toBe(false);
  });

  it('tolerates deleting something that is not there', async () => {
    const { storage } = makeStorage();
    await expect(storage.deleteTake('never')).resolves.toBeUndefined();
  });
});

describe('metadata-only access', () => {
  it('saves and reads metadata without touching audio', async () => {
    const { storage, audio } = makeStorage();
    const { meta } = makeTake('meta-only');
    await storage.saveMetaOnly(meta);
    expect(await storage.loadMeta('meta-only')).toMatchObject({ id: 'meta-only' });
    expect(await audio.exists('meta-only')).toBe(false);
    expect(await storage.loadMeta('nope')).toBeNull();
  });
});

describe('memory backends', () => {
  it('hands out copies, so callers cannot mutate stored rows', async () => {
    const meta = createMemoryMetaStore();
    const { meta: record } = makeTake('copy');
    await meta.put(record);
    const first = await meta.get('copy');
    first!.name = 'mutated';
    expect((await meta.get('copy'))!.name).toBe(record.name);
  });

  it('throws when reading audio that was never written', async () => {
    const audio = createMemoryAudioIO();
    await expect(audio.read('absent')).rejects.toThrow(/No audio stored/);
  });
});

describe('toStorageAdapter', () => {
  it('exposes ArrayBuffer access for the engine context', async () => {
    const { storage, audio } = makeStorage();
    const { meta, samples } = makeTake('adapter');
    await storage.saveTake(meta, samples);
    const adapter = toStorageAdapter(storage, audio);

    const buffer = await adapter.readAudio('adapter');
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBe(44 + samples.length * 4);

    await adapter.writeAudio('copied', buffer);
    expect(await audio.exists('copied')).toBe(true);

    await expect(adapter.readMeta('adapter')).resolves.toMatchObject({ id: 'adapter' });
    await expect(adapter.readMeta('nothing')).resolves.toEqual({});
  });

  it('updates metadata through the adapter', async () => {
    const { storage, audio } = makeStorage();
    const { meta, samples } = makeTake('edit');
    await storage.saveTake(meta, samples);
    const adapter = toStorageAdapter(storage, audio);
    await adapter.writeMeta('edit', { notes: 'wind noise behind the hit' });
    expect((await storage.loadMeta('edit'))!.notes).toBe('wind noise behind the hit');
  });

  it('writes nothing when the take does not exist', async () => {
    const { storage, audio } = makeStorage();
    const adapter = toStorageAdapter(storage, audio);
    await adapter.writeMeta('ghost', { notes: 'x' });
    expect(await storage.loadMeta('ghost')).toBeNull();
  });
});
