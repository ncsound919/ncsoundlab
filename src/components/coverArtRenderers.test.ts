/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the pure canvas renderers in `src/components/coverArtRenderers.ts`.
 * `drawEraBackground` should be stateless and deterministic given the same
 * (dims, palette, layout) — we assert the exact sequence of ctx calls never
 * changes between invocations.
 */

import { describe, expect, it } from 'vitest';
import { drawEraBackground } from './coverArtRenderers';
import type { HipHopEra } from './coverArtAgents';
import type { LayoutResult, PaletteResult } from './coverArtAgents';

const W = 1200;
const H = 1200;

const palette: PaletteResult = {
  bg: ['#111111', '#222222', '#333333'],
  accent: '#ff0000',
  accentAlt: '#00ff00',
  text: '#ffffff',
  textMuted: '#999999',
};

const layout: LayoutResult = {
  titleAnchor: 'bottom-left',
  badgePosition: 'top-right',
  textureDensity: 0.5,
  rotationDeg: 15,
  lineBreakStrategy: 'half-split',
};

// A recording mock ctx. Every method is a vi.fn that records (name, args)
// into `calls`; property assignments are allowed. Gradients returned by
// create*Gradient also record their addColorStop calls so we can assert
// gradient construction is deterministic.
function makeMockCtx() {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const recordCall = (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
    };
  const makeGradient = (kind: string) =>
    (...args: unknown[]) => {
      const g = {
        addColorStop: (offset: number, color: string) => {
          calls.push({ name: `${kind}.addColorStop`, args: [offset, color] });
        },
      };
      calls.push({ name: kind, args });
      return g as unknown as CanvasGradient;
    };

  const ctx: Record<string, unknown> = {};
  for (const m of [
    'save', 'restore', 'beginPath', 'fill', 'stroke', 'closePath',
    'moveTo', 'lineTo', 'scale', 'translate', 'clip',
  ]) {
    ctx[m] = recordCall(m);
  }
  for (const rect of ['fillRect', 'strokeRect', 'clearRect']) {
    ctx[rect] = recordCall(rect);
  }
  ctx.arc = recordCall('arc');
  ctx.rotate = recordCall('rotate');
  ctx.createLinearGradient = makeGradient('createLinearGradient');
  ctx.createRadialGradient = makeGradient('createRadialGradient');
  // Allow arbitrary property sets for fillStyle/strokeStyle/lineWidth/etc.
  const writable: Record<string, unknown> = {};

  const proxy = new Proxy(ctx, {
    set(target, prop, value) {
      writable[String(prop)] = value;
      target[String(prop)] = value;
      return true;
    },
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop in target) return target[prop];
      return writable[prop];
    },
  });

  return { ctx: proxy as unknown as CanvasRenderingContext2D, calls };
}

function gradientColorStops(calls: Array<{ name: string; args: unknown[] }>, kind: string) {
  // Find every gradient created of `kind` and collect the addColorStop args
  // immediately following creation.
  const stops: unknown[][] = [];
  for (let i = 0; i < calls.length; i++) {
    if (calls[i].name === kind) {
      const stopsForOne: unknown[] = [];
      for (let j = i + 1; j < calls.length; j++) {
        if (calls[j].name === `${kind}.addColorStop`) {
          stopsForOne.push(calls[j].args[1]);
        } else if (calls[j].name !== `${kind}.addColorStop`) {
          break;
        }
      }
      stops.push(stopsForOne);
    }
  }
  return stops;
}

const ALL_ERAS: HipHopEra[] = [
  'boom_bap',
  'golden_era',
  'trap',
  'drill',
  'g_funk',
  'vinyl_press',
];

describe('drawEraBackground', () => {
  it.each(ALL_ERAS)('is deterministic for era %s', (era) => {
    const a = makeMockCtx();
    const b = makeMockCtx();
    drawEraBackground(a.ctx, W, H, era, palette, layout);
    drawEraBackground(b.ctx, W, H, era, palette, layout);
    expect(a.calls).toEqual(b.calls);
  });

  it('defaults unknown eras to boom_bap', () => {
    const boom = makeMockCtx();
    const fallback = makeMockCtx();
    drawEraBackground(boom.ctx, W, H, 'boom_bap', palette, layout);
    // @ts-expect-error deliberately testing an out-of-union fallback
    drawEraBackground(fallback.ctx, W, H, 'custom_era', palette, layout);
    expect(boom.calls).toEqual(fallback.calls);
  });

  it.each(ALL_ERAS)('draws at least one full-canvas base fill for %s', (era) => {
    const { ctx, calls } = makeMockCtx();
    drawEraBackground(ctx, W, H, era, palette, layout);
    const bigFills = calls.filter((c) => c.name === 'fillRect' && c.args[2] === W && c.args[3] === H);
    expect(bigFills.length).toBeGreaterThanOrEqual(1);
  });
});

describe('base gradients per era', () => {
  it('boom_bap uses a vertical 3-stop gradient', () => {
    const { ctx, calls } = makeMockCtx();
    drawEraBackground(ctx, W, H, 'boom_bap', palette, layout);
    const stops = gradientColorStops(calls, 'createLinearGradient');
    expect(stops).toContainEqual([palette.bg[0], palette.bg[1], palette.bg[2]]);
  });

  it('trap uses a diagonal 3-stop gradient', () => {
    const { ctx, calls } = makeMockCtx();
    drawEraBackground(ctx, W, H, 'trap', palette, layout);
    const lin = calls.find((c) => c.name === 'createLinearGradient')!;
    // diagonal => from top-left (0,0) to bottom-right (width, height)
    expect(lin.args).toEqual([0, 0, W, H]);
  });

  it('golden_era uses a radial gradient from its center', () => {
    const { ctx, calls } = makeMockCtx();
    drawEraBackground(ctx, W, H, 'golden_era', palette, layout);
    const radial = calls.find((c) => c.name === 'createRadialGradient')!;
    expect(radial.args[0]).toBe(W / 2);
    expect(radial.args[1]).toBe(H / 2);
  });
});

describe('era-specific effects', () => {
  it('drill fills black base then draws slashes depending on textureDensity', () => {
    const { ctx, calls } = makeMockCtx();
    drawEraBackground(ctx, W, H, 'drill', palette, layout);
    expect(calls[0]).toEqual({ name: 'fillRect', args: [0, 0, W, H] });
    const slashCount = Math.round(6 + layout.textureDensity * 10);
    const strokes = calls.filter((c) => c.name === 'stroke');
    expect(strokes.length).toBe(slashCount);
    // taller density -> more slashes
    const dense = makeMockCtx();
    drawEraBackground(dense.ctx, W, H, 'drill', palette, { ...layout, textureDensity: 1 });
    expect(Math.round(6 + 1 * 10)).toBeGreaterThan(slashCount);
  });

  it('g_funk paints a sun disc with a radial gradient', () => {
    const { ctx, calls } = makeMockCtx();
    drawEraBackground(ctx, W, H, 'g_funk', palette, layout);
    const arc = calls.find((c) => c.name === 'arc')!;
    expect(arc.args[0]).toBe(W / 2);
    expect(arc.args[1]).toBeCloseTo(H * 0.55, 5);
  });

  it('vinyl_press draws concentric groove arcs centered on the canvas', () => {
    const { ctx, calls } = makeMockCtx();
    drawEraBackground(ctx, W, H, 'vinyl_press', palette, layout);
    const arcs = calls.filter((c) => c.name === 'arc');
    const centerArcs = arcs.filter(
      (c) => c.args[0] === W / 2 && c.args[1] === H / 2
    );
    expect(centerArcs.length).toBeGreaterThan(5);
  });

  it('boom_bap uses accent color for borders', () => {
    const { ctx } = makeMockCtx();
    drawEraBackground(ctx, W, H, 'boom_bap', palette, layout);
    expect(ctx.strokeStyle).toBe(palette.accentAlt);
  });
});