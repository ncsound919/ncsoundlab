/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  barDurationSec,
  DEFAULT_RECOURSE_BASE,
  fetchRecoursePiece,
  pieceToLayersAndPattern,
  recoursePieceUrl,
  renderRecoursePiece,
  type RecourseRenderDeps,
} from './recourseEvolution';
import type { RecoursePiece } from './recourseBridge';

const makePiece = (over: Partial<RecoursePiece> = {}): RecoursePiece => ({
  format: 'recourse-soundlab-piece',
  version: 1,
  style: 'steely-dan',
  title: 'Test Piece',
  bpm: 120,
  bars: 4,
  headChord: { rootPc: 0, quality: 'maj7', rootName: 'C' },
  layers: [{ id: 'keys0', name: 'Keys 1', role: 'keysVoice', kind: 'synth', midi: 60 }],
  pattern: { keys0: Array.from({ length: 16 }, (_, i) => (i === 0 ? { on: true, note: 60, duration: 16 } : { on: false })) },
  chainBars: 4,
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('recoursePieceUrl', () => {
  it('builds the deterministic piece URL', () => {
    expect(recoursePieceUrl(DEFAULT_RECOURSE_BASE, 'steely-dan', 3, 8)).toBe(
      'http://localhost:3050/api/recourse/compose/soundlab.json?style=steely-dan&seed=3&bars=8'
    );
  });

  it('trims trailing slashes and falls back to the default base', () => {
    expect(recoursePieceUrl('http://box:3050/', 'airplane', 1)).toContain('http://box:3050/api/recourse');
    expect(recoursePieceUrl('', 'airplane', 1)).toContain(DEFAULT_RECOURSE_BASE);
  });
});

describe('fetchRecoursePiece', () => {
  it('returns a validated piece', async () => {
    const piece = makePiece();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => piece })));
    await expect(fetchRecoursePiece('http://x/y')).resolves.toEqual(piece);
  });

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    await expect(fetchRecoursePiece('http://x/y')).rejects.toThrow(/HTTP 500/);
  });

  it('throws when the payload is not a piece', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ nope: true }) })));
    await expect(fetchRecoursePiece('http://x/y')).rejects.toThrow(/not a recourse-soundlab-piece/i);
  });
});

describe('pieceToLayersAndPattern', () => {
  it('hydrates synth layers + a pattern keyed by layer id', () => {
    const { layers, pattern } = pieceToLayersAndPattern(makePiece());
    expect(layers).toHaveLength(1);
    expect(layers[0]).toMatchObject({ id: 'keys0', type: 'synth' });
    expect(pattern.layerRows.keys0).toHaveLength(16);
    expect(pattern.bpm).toBe(120);
  });
});

describe('barDurationSec', () => {
  it('is four beats', () => {
    expect(barDurationSec(120)).toBeCloseTo(2);
    expect(barDurationSec(60)).toBeCloseTo(4);
    expect(barDurationSec(0)).toBeCloseTo(2); // clamped to 120
  });
});

describe('renderRecoursePiece', () => {
  it('bounces each layer then mixes the chained pattern', async () => {
    const fakeBuffer = { duration: 2 } as AudioBuffer;
    const bounced: string[] = [];
    const deps: RecourseRenderDeps = {
      bounceLayer: vi.fn(async (layer) => { bounced.push(layer.id); return fakeBuffer; }),
      mixdown: vi.fn(async () => fakeBuffer),
    };

    const out = await renderRecoursePiece(makePiece(), deps);
    expect(out).toBe(fakeBuffer);
    expect(bounced).toEqual(['keys0']);
    expect(deps.bounceLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'keys0' }), 2);

    const opts = (deps.mixdown as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      patterns: Record<string, unknown>;
      chain: { order: string[] };
      layers: Array<{ type: string; audioBuffer?: AudioBuffer }>;
    };
    expect(opts.patterns.A).toBeTruthy();
    expect(opts.chain.order).toHaveLength(4);
    expect(opts.layers[0]).toMatchObject({ type: 'sample', audioBuffer: fakeBuffer });
  });

  it('clamps the chain length from bars', async () => {
    const deps: RecourseRenderDeps = {
      bounceLayer: vi.fn(async () => ({}) as AudioBuffer),
      mixdown: vi.fn(async () => ({} as AudioBuffer)),
    };
    await renderRecoursePiece(makePiece({ chainBars: 0, bars: 999 }), deps);
    const opts = (deps.mixdown as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as { chain: { order: string[] } };
    expect(opts.chain.order.length).toBe(64);
  });
});
