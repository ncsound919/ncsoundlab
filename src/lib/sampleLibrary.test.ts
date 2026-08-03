/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/lib/sampleLibrary.ts` pure helpers (Phase 5.1).
 * Skips IndexedDB-dependent paths; tests pure analysis + filtering logic.
 */

import { describe, expect, it } from 'vitest';
import {
  analyzeLibrarySample,
  filterLibrarySamples,
  sanitiseSampleName,
  deriveCleanFileName,
  type SampleLibrarySample,
} from './sampleLibrary';

const createMockBuffer = (channels: Float32Array[], sampleRate = 44100): AudioBuffer => {
  const length = channels[0]?.length ?? 0;
  const buf = {
    numberOfChannels: channels.length,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (i: number) => channels[i],
  } as unknown as AudioBuffer;
  return buf;
};

describe('sanitiseSampleName', () => {
  it('falls back to SAMPLE when empty', () => {
    expect(sanitiseSampleName('')).toBe('SAMPLE');
    expect(sanitiseSampleName('   ')).toBe('SAMPLE');
  });
  it('trims surrounding whitespace', () => {
    expect(sanitiseSampleName('  kick_01  ')).toBe('kick_01');
  });
});

describe('deriveCleanFileName', () => {
  it('strips extension', () => {
    expect(deriveCleanFileName('OBSIDIAN_808_C1.wav')).toBe('OBSIDIAN_808_C1');
    expect(deriveCleanFileName('foo.AIFF')).toBe('foo');
  });
  it('returns "sample" for empty input', () => {
    expect(deriveCleanFileName('')).toBe('sample');
  });
});

describe('analyzeLibrarySample', () => {
  it('produces a valid analysis on a synthetic click', () => {
    const sampleRate = 44100;
    const length = sampleRate / 2; // 500ms
    const channel = new Float32Array(length);
    // Sharp attack: a 100-sample ramp, then decay
    for (let i = 0; i < 100; i++) channel[i] = i / 100;
    for (let i = 100; i < length; i++) channel[i] = (1 - (i - 100) / (length - 100)) * 0.5;
    const buf = createMockBuffer([channel], sampleRate);
    const analysis = analyzeLibrarySample(buf);
    expect(analysis.peakDb).toBeLessThan(0);
    expect(analysis.peakDb).toBeGreaterThan(-10);
    expect(analysis.rmsDb).toBeLessThan(0);
    expect(analysis.durationSeconds).toBe(0.5);
    expect(analysis.transientSharpness).toBeGreaterThan(0);
    expect(analysis.suggestedCategory).toBeTruthy();
  });

  it('returns suggestCategory Kick for a short sharp transient', () => {
    const sampleRate = 44100;
    const length = Math.floor(sampleRate * 0.2); // 200ms
    const channel = new Float32Array(length);
    channel[0] = 1;
    channel[1] = 0.9;
    channel[2] = 0.4;
    const buf = createMockBuffer([channel], sampleRate);
    const analysis = analyzeLibrarySample(buf);
    expect(analysis.suggestedCategory).toBe('Kick');
  });

  it('handles silent buffers gracefully', () => {
    const channel = new Float32Array(1024);
    const buf = createMockBuffer([channel], 44100);
    const analysis = analyzeLibrarySample(buf);
    expect(Number.isFinite(analysis.peakDb)).toBe(true);
    expect(Number.isFinite(analysis.rmsDb)).toBe(true);
  });
});

describe('filterLibrarySamples', () => {
  const rows: SampleLibrarySample[] = [
    row({ id: '1', name: 'OBSIDIAN 808', fileName: 'obsidian.wav', tags: ['808', 'sub'], category: '808' }),
    row({ id: '2', name: 'Punchy Kick', fileName: 'kick.wav', tags: ['kick', 'punchy'], category: 'Kick' }),
    row({ id: '3', name: 'Vinyl Snare', fileName: 'snare.wav', tags: ['snare', 'lofi'], category: 'Snare' }),
  ];

  it('returns all when query is empty', () => {
    expect(filterLibrarySamples(rows, '').length).toBe(3);
  });

  it('matches by name (case-insensitive)', () => {
    const result = filterLibrarySamples(rows, 'OBSIDIAN');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('1');
  });

  it('matches by tag', () => {
    const result = filterLibrarySamples(rows, 'lofi');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('3');
  });

  it('filters by category', () => {
    const result = filterLibrarySamples(rows, '', 'Kick');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('2');
  });

  it('combines query and category', () => {
    expect(filterLibrarySamples(rows, 'kick', 'Kick').length).toBe(1);
    expect(filterLibrarySamples(rows, 'kick', 'Snare').length).toBe(0);
  });
});

function row(p: Partial<SampleLibrarySample>): SampleLibrarySample {
  const now = '2026-08-01T00:00:00Z';
  return {
    id: p.id ?? 'x',
    name: p.name ?? 'sample',
    fileName: p.fileName ?? 'sample.wav',
    folderId: null,
    category: p.category ?? 'Perc',
    tags: p.tags ?? [],
    gain: 0.85,
    pitch: 0,
    sampleData: '',
    sampleMeta: { sampleRate: 44100, channels: 1, length: 1024 },
    createdAt: now,
    updatedAt: now,
    ...p,
  };
}