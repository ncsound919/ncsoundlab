/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Recourse → Evolution bridge.
 *
 * Recourse (a desktop composer on :3050) emits `recourse-soundlab-piece`
 * objects: synth layers + a 1-bar pattern + a chain length. The Evolution
 * engine mutates *audio buffers*. This module closes the gap: it fetches a
 * piece, hydrates its layers/pattern, bounces each synth layer to audio, mixes
 * the pattern through the existing offline mixdown, and returns a single
 * AudioBuffer ready for `generateEvolutionVariations`.
 */

import type { Pattern, SoundLayer } from '../types';
import { synthLayerFor, patternFor, isRecoursePiece, type RecoursePiece } from './recourseBridge';
import { clampBpm } from './controlRanges';
import { renderMixdown, type MixdownOptions } from '../audio/transport/mixdown';
import { audioEngine } from './audioEngine';

export const DEFAULT_RECOURSE_BASE = 'http://localhost:3050';

/** Styles the Recourse composer ships (see its lexicons). */
export const RECOURSE_STYLES = ['steely-dan', 'jasper-ballad', 'dangelo-glasper', 'airplane'] as const;

/** Build the deterministic piece URL the Recourse server exposes (CORS-open). */
export function recoursePieceUrl(base: string, style: string, seed: number, bars = 8): string {
  const root = (base || DEFAULT_RECOURSE_BASE).replace(/\/+$/, '');
  const query = new URLSearchParams({ style, seed: String(seed), bars: String(bars) });
  return `${root}/api/recourse/compose/soundlab.json?${query.toString()}`;
}

/** Fetch + validate a piece. Throws on transport or shape errors. */
export async function fetchRecoursePiece(url: string): Promise<RecoursePiece> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Recourse fetch failed: HTTP ${res.status}`);
  const data: unknown = await res.json();
  if (!isRecoursePiece(data)) throw new Error('Response is not a recourse-soundlab-piece');
  return data;
}

/** Hydrate a piece into SoundLab layers + a playable Pattern 'A'. */
export function pieceToLayersAndPattern(piece: RecoursePiece): { layers: SoundLayer[]; pattern: Pattern } {
  return {
    layers: piece.layers.map((pl) => synthLayerFor(pl)),
    pattern: patternFor(piece),
  };
}

export interface RecourseRenderDeps {
  /** Render one synth layer to a one-bar audio buffer. */
  bounceLayer: (layer: SoundLayer, durationSec: number) => Promise<AudioBuffer>;
  /** Offline pattern mixdown (injectable for tests). */
  mixdown: (opts: MixdownOptions) => Promise<AudioBuffer>;
}

export const defaultRecourseRenderDeps: RecourseRenderDeps = {
  bounceLayer: (layer, durationSec) => audioEngine.exportWav([layer], durationSec),
  mixdown: (opts) => renderMixdown(opts),
};

/** One bar of a 4/4 pattern, in seconds. */
export function barDurationSec(bpm: number): number {
  const safeBpm = clampBpm(bpm || 120);
  return (60 / safeBpm) * 4;
}

/**
 * Bounce a piece to a single AudioBuffer: each synth layer is rendered to a
 * sample, then the piece's 1-bar pattern is mixed down across `chainBars`.
 */
export async function renderRecoursePiece(
  piece: RecoursePiece,
  deps: RecourseRenderDeps = defaultRecourseRenderDeps
): Promise<AudioBuffer> {
  const { layers, pattern } = pieceToLayersAndPattern(piece);
  const oneBar = barDurationSec(pattern.bpm);

  const bounced: SoundLayer[] = [];
  for (const layer of layers) {
    const buffer = await deps.bounceLayer(layer, oneBar);
    bounced.push({ ...layer, type: 'sample', audioBuffer: buffer, synth: undefined });
  }

  const bars = Math.max(1, Math.min(64, piece.chainBars || piece.bars || 1));
  const chain = { order: Array.from({ length: bars }, () => 'A') };
  return deps.mixdown({ patterns: { A: pattern }, chain, layers: bounced });
}
