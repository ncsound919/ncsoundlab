/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the versioned project document serializer (Phase 0.1).
 */

import { describe, expect, it, beforeAll } from 'vitest';
import {
  serializeProject,
  deserializeProject,
  migrate,
  isProjectDocument,
  isProjectDirty,
  PROJECT_FORMAT_TAG,
  PROJECT_SCHEMA_VERSION,
  type ProjectDocument,
  type SerializedLayer,
} from './projectFormat';
import type { SoundLayer, Pattern, PatternCell } from '../types';
import { DEFAULT_ENVELOPE, DEFAULT_FX, DEFAULT_SYNTH } from '../types';

function makeBuffer(channels = 1, length = 128, sampleRate = 44100) {
  const buf = new OfflineAudioContext(channels, length, sampleRate).createBuffer(channels, length, sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.sin((i / length) * Math.PI * 2 * 4);
  }
  return buf;
}

function makeSampleLayer(id: string): SoundLayer {
  return {
    id,
    name: `Layer ${id}`,
    type: 'sample',
    enabled: true,
    gain: 0.9,
    pan: 0,
    pitch: 0,
    envelope: DEFAULT_ENVELOPE,
    fx: DEFAULT_FX,
    audioBuffer: makeBuffer(1, 256),
    fileName: 'sample.wav',
  };
}

function makeSynthLayer(id: string): SoundLayer {
  return {
    id,
    name: `Synth ${id}`,
    type: 'synth',
    enabled: true,
    gain: 0.7,
    pan: -0.2,
    pitch: 0,
    envelope: DEFAULT_ENVELOPE,
    fx: DEFAULT_FX,
    synth: DEFAULT_SYNTH,
  };
}

function makePattern(id: 'A' | 'B' | 'C' | 'D', layerIds: string[]): Pattern {
  const layerRows: Record<string, PatternCell[]> = {};
  for (const lid of layerIds) {
    layerRows[lid] = Array.from({ length: 16 }, () => ({ on: false }));
  }
  return {
    id,
    name: `Pattern ${id}`,
    layerRows,
    timeSignature: [4, 4],
    stepLength: 16,
    swing: 0,
    bpm: 120,
  };
}

function fakeDecodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  // Simple deterministic decode: read first byte to determine channels/length,
  // build a 1-channel Float32Array of the right size. Adequate for tests that
  // only assert that the buffer round-trips through the serializer.
  const bytes = new Uint8Array(arrayBuffer);
  const sampleRate = 44100;
  const length = Math.max(64, bytes.length || 64);
  const buf = new OfflineAudioContext(1, length, sampleRate).createBuffer(1, length, sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = bytes[i % bytes.length] / 255 - 0.5;
  }
  return Promise.resolve(buf);
}

beforeAll(() => {
  // Ensure decodeAudioData is available on the mocked AudioContext.
  const proto = (globalThis as any).AudioContext?.prototype ?? (globalThis as any).webkitAudioContext?.prototype;
  if (proto && typeof proto.decodeAudioData !== 'function') {
    proto.decodeAudioData = function (input: ArrayBuffer) {
      return fakeDecodeAudioData(input);
    };
  }
});

describe('projectFormat — serialize/deserialize round-trip', () => {
  it('round-trips a synth layer without an audio buffer', async () => {
    const layers = [makeSynthLayer('s1')];
    const patterns = {
      A: makePattern('A', ['s1']),
      B: makePattern('B', ['s1']),
      C: makePattern('C', ['s1']),
      D: makePattern('D', ['s1']),
    };
    const doc = await serializeProject({
      title: 'Round Trip',
      appVersion: '1.0.0',
      layers,
      patterns,
      activePatternId: 'A',
      songChain: { order: ['A', 'B', 'C', 'D'] },
      programs: {
        A: ['s1', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        B: Array.from({ length: 16 }, () => null),
        C: Array.from({ length: 16 }, () => null),
        D: Array.from({ length: 16 }, () => null),
      },
      activeBank: 'A',
      bpm: 120,
      timeSignature: [4, 4],
      masterLevel: 0.8,
      masterRack: { modules: [] },
    });
    const ctx = new AudioContext();
    const hydrated = await deserializeProject(ctx, doc);
    expect(hydrated.layers).toHaveLength(1);
    expect(hydrated.layers[0].id).toBe('s1');
    expect(hydrated.layers[0].audioBuffer).toBeUndefined();
    expect(hydrated.patterns.A.layerRows['s1']).toHaveLength(16);
    expect(hydrated.programs.A[0]).toBe('s1');
    expect(hydrated.document.title).toBe('Round Trip');
    expect(hydrated.document.bpm).toBe(120);
  });

  it('embeds sample audio as base64 and rehydrates it', async () => {
    const layers = [makeSampleLayer('k1')];
    const patterns = {
      A: makePattern('A', ['k1']),
      B: makePattern('B', []),
      C: makePattern('C', []),
      D: makePattern('D', []),
    };
    const doc = await serializeProject({
      title: 'Sample Project',
      appVersion: '1.0.0',
      layers,
      patterns,
      activePatternId: 'A',
      songChain: { order: ['A'] },
      programs: {
        A: Array.from({ length: 16 }, () => null),
        B: Array.from({ length: 16 }, () => null),
        C: Array.from({ length: 16 }, () => null),
        D: Array.from({ length: 16 }, () => null),
      },
      activeBank: 'A',
      bpm: 90,
      timeSignature: [3, 4],
      masterLevel: 0.5,
      masterRack: { modules: [] },
    });

    expect(doc.format).toBe(PROJECT_FORMAT_TAG);
    expect(doc.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(doc.layers).toHaveLength(1);
    expect(doc.layers[0].sampleData).toBeDefined();
    expect(typeof doc.layers[0].sampleData).toBe('string');
    expect(doc.layers[0].sampleMeta?.sampleRate).toBe(44100);

    const ctx = new AudioContext();
    const hydrated = await deserializeProject(ctx, doc);
    expect(hydrated.layers[0].audioBuffer).toBeDefined();
    expect(hydrated.layers[0].audioBuffer?.length).toBeGreaterThan(0);
    expect(hydrated.layers[0].fileName).toBe('sample.wav');
  });

  it('round-trips both sample and synth layers together', async () => {
    const layers = [makeSampleLayer('k1'), makeSynthLayer('s1')];
    const patterns = {
      A: makePattern('A', ['k1', 's1']),
      B: makePattern('B', []),
      C: makePattern('C', []),
      D: makePattern('D', []),
    };
    const doc = await serializeProject({
      title: 'Mix',
      appVersion: '1.0.0',
      layers,
      patterns,
      activePatternId: 'B',
      songChain: { order: ['A', 'B'] },
      programs: {
        A: Array.from({ length: 16 }, () => null),
        B: Array.from({ length: 16 }, () => null),
        C: Array.from({ length: 16 }, () => null),
        D: Array.from({ length: 16 }, () => null),
      },
      activeBank: 'C',
      bpm: 100,
      timeSignature: [4, 4],
      masterLevel: 0.8,
      masterRack: { modules: [] },
    });

    const ctx = new AudioContext();
    const hydrated = await deserializeProject(ctx, doc);
    expect(hydrated.layers.find((l) => l.id === 'k1')?.audioBuffer).toBeDefined();
    expect(hydrated.layers.find((l) => l.id === 's1')?.audioBuffer).toBeUndefined();
    expect(hydrated.document.activePatternId).toBe('B');
    expect(hydrated.document.activeBank).toBe('C');
    expect(hydrated.document.timeSignature).toEqual([4, 4]);
    expect(hydrated.document.songChain.order).toEqual(['A', 'B']);
  });
});

describe('projectFormat — migrate / guards', () => {
  it('isProjectDocument returns true for a valid doc', () => {
    const doc = {
      format: PROJECT_FORMAT_TAG,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      title: 't',
      layers: [],
    };
    expect(isProjectDocument(doc)).toBe(true);
  });

  it('isProjectDocument returns false for the wrong format tag', () => {
    expect(isProjectDocument({ format: 'other', schemaVersion: 1 })).toBe(false);
  });

  it('migrate throws on an unrecognized format tag', () => {
    expect(() => migrate({ format: 'bogus', schemaVersion: 1 })).toThrow();
  });

  it('migrate throws when schemaVersion is ahead of the current', () => {
    expect(() => migrate({ format: PROJECT_FORMAT_TAG, schemaVersion: 999 })).toThrow(/newer app version/);
  });

  it('migrate fills defaults for missing optional fields', () => {
    const raw = {
      format: PROJECT_FORMAT_TAG,
      schemaVersion: 1,
      title: 'minimal',
      layers: [],
      patterns: { A: {}, B: undefined, C: undefined, D: undefined },
      programs: {},
    };
    const doc = migrate(raw);
    expect(doc.bpm).toBe(120);
    expect(doc.masterLevel).toBe(0.8);
    expect(doc.timeSignature).toEqual([4, 4]);
    expect(doc.songChain.order).toEqual(['A', 'B', 'C', 'D']);
    expect(doc.programs.A).toHaveLength(16);
    expect(doc.patterns.A.stepLength).toBe(16);
  });
});

describe('projectFormat — isProjectDirty', () => {
  const base = (): ProjectDocument => ({
    format: PROJECT_FORMAT_TAG,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    appVersion: '1.0.0',
    id: 'p1',
    title: 't',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    bpm: 120,
    timeSignature: [4, 4],
    globalSwing: 0,
    masterLevel: 0.8,
    masterRack: { modules: [] },
    layers: [],
    patterns: {
      A: { id: 'A', name: 'A', layerRows: {}, timeSignature: [4, 4], stepLength: 16, swing: 0, bpm: 120 },
      B: { id: 'B', name: 'B', layerRows: {}, timeSignature: [4, 4], stepLength: 16, swing: 0, bpm: 120 },
      C: { id: 'C', name: 'C', layerRows: {}, timeSignature: [4, 4], stepLength: 16, swing: 0, bpm: 120 },
      D: { id: 'D', name: 'D', layerRows: {}, timeSignature: [4, 4], stepLength: 16, swing: 0, bpm: 120 },
    },
    activePatternId: 'A',
    songChain: { order: ['A'] },
    programs: {
      A: Array.from({ length: 16 }, () => null),
      B: Array.from({ length: 16 }, () => null),
      C: Array.from({ length: 16 }, () => null),
      D: Array.from({ length: 16 }, () => null),
    },
    activeBank: 'A',
  });

  it('returns true for the first commit (prev = null)', () => {
    expect(isProjectDirty(null, base())).toBe(true);
  });

  it('returns false for an identical document', () => {
    const a = base();
    const b = base();
    expect(isProjectDirty(a, b)).toBe(false);
  });

  it('returns true when BPM changes', () => {
    const a = base();
    const b = base();
    b.bpm = 140;
    expect(isProjectDirty(a, b)).toBe(true);
  });

  it('returns true when sampleData presence flips', () => {
    const a = base();
    const b = base();
    const layerWith = { ...makeSampleLayer('k1') } as SerializedLayer;
    layerWith.sampleData = 'AAAA';
    b.layers = [layerWith as unknown as ProjectDocument['layers'][number]];
    expect(isProjectDirty(a, b)).toBe(true);
  });
});

describe('projectFormat — arrangement round-trip', () => {
  it('serializes and rehydrates an arrangement with clips', async () => {
    const layers = [makeSynthLayer('s1')];
    const patterns = {
      A: makePattern('A', ['s1']),
      B: makePattern('B', ['s1']),
      C: makePattern('C', ['s1']),
      D: makePattern('D', ['s1']),
    };
    const arrangement = {
      totalBeats: 12,
      clips: [
        { id: 'c1', patternId: 'A', startBeat: 0, beats: 4, loops: 1, muted: false },
        { id: 'c2', patternId: 'B', startBeat: 4, beats: 4, loops: 2, muted: true },
        { id: 'c3', patternId: 'C', startBeat: 12, beats: 4, loops: 1, muted: false },
      ],
    };
    const doc = await serializeProject({
      title: 'Arrangement',
      appVersion: '1.0.0',
      layers,
      patterns,
      activePatternId: 'A',
      songChain: { order: ['A', 'B', 'B', 'C'] },
      arrangement,
      programs: {
        A: ['s1', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        B: Array.from({ length: 16 }, () => null),
        C: Array.from({ length: 16 }, () => null),
        D: Array.from({ length: 16 }, () => null),
      },
      activeBank: 'A',
      bpm: 120,
      timeSignature: [4, 4],
      masterLevel: 0.8,
      masterRack: { modules: [] },
    });
    expect(doc.arrangement).toBeDefined();
    expect(doc.arrangement!.clips).toHaveLength(3);

    const ctx = new AudioContext();
    const hydrated = await deserializeProject(ctx, doc);
    expect(hydrated.arrangement).not.toBeNull();
    expect(hydrated.arrangement!.clips).toHaveLength(3);
    expect(hydrated.arrangement!.clips[1].loops).toBe(2);
    expect(hydrated.arrangement!.clips[1].muted).toBe(true);
    // totalBeats is preserved verbatim (the runtime recomputes it via
    // patternStore.recomputeArrangement when clips mutate).
    expect(hydrated.arrangement!.totalBeats).toBe(12);
  });

  it('round-trips per-pattern pad programs (Phase 6.1)', async () => {
    const layers: any[] = [];
    const empty16 = () => Array.from({ length: 16 }, () => null);
    const patternPrograms = {
      A: {
        A: ['s1', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        B: empty16(), C: empty16(), D: empty16(),
      },
      B: {
        A: empty16(),
        B: ['s2', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
        C: empty16(), D: empty16(),
      },
      C: { A: empty16(), B: empty16(), C: empty16(), D: empty16() },
      D: { A: empty16(), B: empty16(), C: empty16(), D: empty16() },
    };
    const doc = await serializeProject({
      title: 'PerPattern',
      appVersion: '1.0.0',
      layers,
      patterns: {
        A: makePattern('A', []), B: makePattern('B', []), C: makePattern('C', []), D: makePattern('D', []),
      },
      activePatternId: 'A',
      songChain: { order: ['A', 'B'] },
      programs: { A: empty16(), B: empty16(), C: empty16(), D: empty16() },
      patternPrograms,
      activeBank: 'A',
      bpm: 120,
      timeSignature: [4, 4],
      masterLevel: 0.8,
      masterRack: { modules: [] },
    });
    expect(doc.patternPrograms).toBeDefined();
    expect(doc.patternPrograms!.A.A[0]).toBe('s1');
    expect(doc.patternPrograms!.B.B[0]).toBe('s2');

    const ctx = new AudioContext();
    const hydrated = await deserializeProject(ctx, doc);
    expect(hydrated.patternPrograms).toBeDefined();
    expect(hydrated.patternPrograms!.A.A[0]).toBe('s1');
    expect(hydrated.patternPrograms!.B.B[0]).toBe('s2');
    // Deep-cloned (not shared references).
    expect(hydrated.patternPrograms).not.toBe(doc.patternPrograms);
  });

  it('migrates a document without arrangement (backwards-compat)', () => {
    const raw = {
      format: PROJECT_FORMAT_TAG,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      title: 'Legacy',
      layers: [],
      patterns: { A: {}, B: {}, C: {}, D: {} },
      programs: {},
    };
    const doc = migrate(raw);
    expect(doc.arrangement).toBeUndefined();
  });

  it('sanitises a malformed arrangement on load', () => {
    const raw = {
      format: PROJECT_FORMAT_TAG,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      title: 'Malformed',
      layers: [],
      patterns: { A: {}, B: {}, C: {}, D: {} },
      programs: {},
      arrangement: {
        totalBeats: 'garbage',
        clips: [{ id: 'c1', patternId: 'X', startBeat: -3, beats: -10, loops: 0.5, muted: 1 }],
      },
    };
    const doc = migrate(raw);
    expect(doc.arrangement).toBeDefined();
    const clip = doc.arrangement!.clips[0];
    expect(clip.startBeat).toBe(0);
    expect(clip.beats).toBe(0);
    expect(clip.loops).toBe(1);
    expect(clip.muted).toBe(true);
    expect(clip.patternId).toBe('A'); // unknown patternId falls back to A
  });
});

describe('projectFormat — automation round-trip', () => {
  it('serializes and rehydrates per-layer automation lanes', async () => {
    const layers = [makeSynthLayer('s1')];
    const patterns = {
      A: makePattern('A', ['s1']),
      B: makePattern('B', ['s1']),
      C: makePattern('C', ['s1']),
      D: makePattern('D', ['s1']),
    };
    const automation = {
      s1: [
        { id: 'vol', target: 'volume', min: 0, max: 1.5, points: [
          { tick: 0, value: 0.5 },
          { tick: 8, value: 1.0 },
          { tick: 16, value: 0.5 },
        ] },
      ],
    };
    const doc = await serializeProject({
      title: 'Auto',
      appVersion: '1.0.0',
      layers,
      patterns,
      activePatternId: 'A',
      songChain: { order: ['A'] },
      automation,
      programs: {
        A: Array.from({ length: 16 }, () => null),
        B: Array.from({ length: 16 }, () => null),
        C: Array.from({ length: 16 }, () => null),
        D: Array.from({ length: 16 }, () => null),
      },
      activeBank: 'A',
      bpm: 120,
      timeSignature: [4, 4],
      masterLevel: 0.8,
      masterRack: { modules: [] },
    });
    expect(doc.automation).toBeDefined();
    expect(doc.automation!.s1).toHaveLength(1);

    const ctx = new AudioContext();
    const hydrated = await deserializeProject(ctx, doc);
    expect(hydrated.automation.s1[0].target).toBe('volume');
    expect(hydrated.automation.s1[0].points).toHaveLength(3);
  });

  it('migrates a document without automation (backwards-compat)', () => {
    const raw = {
      format: PROJECT_FORMAT_TAG,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      title: 'Legacy',
      layers: [],
      patterns: { A: {}, B: {}, C: {}, D: {} },
      programs: {},
    };
    const doc = migrate(raw);
    expect(doc.automation).toBeDefined();
    expect(doc.automation).toEqual({});
  });

  it('sanitises a malformed lane on load', () => {
    const raw = {
      format: PROJECT_FORMAT_TAG,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      title: 'BadAuto',
      layers: [],
      patterns: { A: {}, B: {}, C: {}, D: {} },
      programs: {},
      automation: {
        bad: [{ id: 123, target: 7, min: 'min', max: 'max', points: 'oops' }],
      },
    };
    const doc = migrate(raw);
    expect(doc.automation!.bad).toHaveLength(1);
    const lane = doc.automation!.bad[0];
    expect(typeof lane.id).toBe('string');
    expect(lane.target).toBe('7'); // coerced to string
    expect(lane.points).toEqual([]);
  });
});

describe('projectFormat — FX buses round-trip', () => {
  it('migrates a doc without buses and falls back to defaults', () => {
    const raw = {
      format: PROJECT_FORMAT_TAG,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      title: 'Legacy',
      layers: [],
      patterns: { A: {}, B: {}, C: {}, D: {} },
      programs: {},
    };
    const doc = migrate(raw);
    expect(doc.buses).toBeDefined();
    expect(doc.buses!.reverb.gain).toBe(1);
    expect(doc.buses!.delay.gain).toBe(1);
  });

  it('clamps bus gain to 0..2 and pan to -1..1 on load', () => {
    const raw = {
      format: PROJECT_FORMAT_TAG,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      title: 'Clamp',
      layers: [],
      patterns: { A: {}, B: {}, C: {}, D: {} },
      programs: {},
      buses: {
        reverb: { enabled: true, gain: 99, pan: 5 },
        delay: { enabled: false, gain: -1, pan: -3 },
      },
    };
    const doc = migrate(raw);
    expect(doc.buses!.reverb.gain).toBe(2);
    expect(doc.buses!.reverb.pan).toBe(1);
    expect(doc.buses!.delay.gain).toBe(0);
    expect(doc.buses!.delay.pan).toBe(-1);
    expect(doc.buses!.delay.enabled).toBe(false);
  });

  it('round-trips custom buses via serialize/deserialize', async () => {
    const layers = [makeSynthLayer('s1')];
    const patterns = {
      A: makePattern('A', ['s1']),
      B: makePattern('B', ['s1']),
      C: makePattern('C', ['s1']),
      D: makePattern('D', ['s1']),
    };
    const buses = {
      reverb: { enabled: true, gain: 0.6, pan: -0.1 },
      delay: { enabled: false, gain: 0.3, pan: 0.2 },
      chorus: { enabled: true, gain: 1.4, pan: 0 },
    };
    const doc = await serializeProject({
      title: 'Buses',
      appVersion: '1.0.0',
      layers,
      patterns,
      activePatternId: 'A',
      songChain: { order: ['A'] },
      buses,
      programs: {
        A: Array.from({ length: 16 }, () => null),
        B: Array.from({ length: 16 }, () => null),
        C: Array.from({ length: 16 }, () => null),
        D: Array.from({ length: 16 }, () => null),
      },
      activeBank: 'A',
      bpm: 120,
      timeSignature: [4, 4],
      masterLevel: 0.8,
      masterRack: { modules: [] },
    });
    const ctx = new AudioContext();
    const hydrated = await deserializeProject(ctx, doc);
    expect(hydrated.buses.chorus.gain).toBe(1.4);
    expect(hydrated.buses.delay.enabled).toBe(false);
  });
});
