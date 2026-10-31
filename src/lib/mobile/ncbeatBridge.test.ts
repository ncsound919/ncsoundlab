/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  NCBEAT_SCHEMA,
  NCBEAT_APP,
  DRUM_PATTERN_SCHEMA,
  calculateLoopFrames,
  buildNcbeatManifest,
  buildNcbeatPattern,
  buildNcbeatMixer,
  buildNcbeatPackage,
} from './ncbeatBridge';
import { createFieldKit, makeSliceEntry, addSlice } from './fieldKit';
import { makeGenome } from './genome';
import { decodeWav } from '../../audio/mobile/wavCodec';

const dummyGenome = makeGenome(42);

const testKit = () => {
  let kit = createFieldKit({
    id: 'test-field-kit',
    name: 'Biscayne Field Kit',
    createdAt: '2026-10-27T12:00:00Z',
    place: 'Biscayne Bay',
    rootHz: 220,
  });
  kit = addSlice(kit, makeSliceEntry({ id: 's1', name: 'Hit 1', sourceId: 'take-1', genome: dummyGenome }));
  kit = addSlice(kit, makeSliceEntry({ id: 's2', name: 'Hit 2', sourceId: 'take-1', genome: dummyGenome }));
  kit = addSlice(kit, makeSliceEntry({ id: 's3', name: 'Hit 3', sourceId: 'take-1', genome: dummyGenome }));
  return kit;
};

describe('calculateLoopFrames', () => {
  it('computes 16 steps at 120 bpm and 48kHz correctly', () => {
    // 16 steps of 1/16 = 4 beats = 2 seconds at 120 bpm -> 96000 frames
    const frames = calculateLoopFrames(16, 120, '1/16', 48000);
    expect(frames).toBe(96000);
  });

  it('clamps extreme bpm gracefully', () => {
    const low = calculateLoopFrames(16, 10, '1/16', 48000);
    const clamped40 = calculateLoopFrames(16, 40, '1/16', 48000);
    expect(low).toBe(clamped40);
  });
});

describe('buildNcbeatManifest', () => {
  it('produces valid ncbeat.v1 manifest structure', () => {
    const kit = testKit();
    const samplePaths = ['samples/pad00.wav', 'samples/pad01.wav', 'samples/pad02.wav'];
    const manifest = buildNcbeatManifest(kit, samplePaths, { tempoBpm: 130 });

    expect(manifest.schema).toBe(NCBEAT_SCHEMA);
    expect(manifest.app).toBe(NCBEAT_APP);
    expect(manifest.tempoBpm).toBe(130);
    expect(manifest.patternSchema).toBe(DRUM_PATTERN_SCHEMA);
    expect(manifest.files.samples).toEqual(samplePaths);
    expect(manifest.files.pattern).toBe('pattern.json');
    expect(manifest.files.mixer).toBe('mixer.json');
    expect(manifest.files.stems).toContain('stems/master.wav');
  });

  it('stamps exportedAt with the real export time', () => {
    const before = Date.now();
    const manifest = buildNcbeatManifest(testKit(), ['samples/pad00.wav']);
    const stamped = Date.parse(manifest.exportedAt);
    expect(Number.isFinite(stamped)).toBe(true);
    expect(stamped).toBeGreaterThanOrEqual(before - 1000);
    expect(stamped).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('honours an explicit exportedAt', () => {
    const manifest = buildNcbeatManifest(testKit(), [], {
      exportedAt: '2026-01-02T03:04:05.000Z',
    });
    expect(manifest.exportedAt).toBe('2026-01-02T03:04:05.000Z');
  });
});

describe('buildNcbeatPattern', () => {
  it('generates 16 steps mapped to pads', () => {
    const pattern = buildNcbeatPattern(4);
    expect(pattern.schema).toBe(DRUM_PATTERN_SCHEMA);
    expect(pattern.length_steps).toBe(16);
    expect(pattern.steps).toHaveLength(16);
    expect(pattern.steps[0].pad).toBe(0);
    expect(pattern.steps[1].pad).toBe(1);
    expect(pattern.steps[4].pad).toBe(0);
  });
});

describe('buildNcbeatMixer', () => {
  it('creates 16 tracks with valid mixer parameters', () => {
    const mixer = buildNcbeatMixer(4, 140);
    expect(mixer.version).toBe(2);
    expect(mixer.bpm).toBe(140);
    expect(mixer.tracks).toHaveLength(4);
    expect(mixer.tracks[0].type).toBe(0); // Sampler
    expect(mixer.tracks[0].params).toHaveLength(24);
  });
});

describe('buildNcbeatPackage', () => {
  it('builds WAVs and JSONs ready for archive zip', () => {
    const kit = testKit();
    const sampleRate = 48000;
    const s1 = new Float32Array(4800).fill(0.1);
    const s2 = new Float32Array(4800).fill(0.2);
    const s3 = new Float32Array(4800).fill(0.3);

    const files = buildNcbeatPackage(kit, [s1, s2, s3], sampleRate, { tempoBpm: 120 });
    const paths = files.map((f) => f.path);

    expect(paths).toContain('manifest.json');
    expect(paths).toContain('pattern.json');
    expect(paths).toContain('mixer.json');
    expect(paths).toContain('stems/master.wav');
    expect(paths).toContain('samples/pad00.wav');
    expect(paths).toContain('samples/pad01.wav');
    expect(paths).toContain('samples/pad02.wav');

    // Verify WAV bytes decode correctly
    const pad0Wav = files.find((f) => f.path === 'samples/pad00.wav')!;
    const decoded = decodeWav(pad0Wav.data as Uint8Array);
    expect(decoded.sampleRate).toBe(48000);
    expect(decoded.frames).toBe(4800);
  });
});
