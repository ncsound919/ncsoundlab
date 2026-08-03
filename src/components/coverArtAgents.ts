/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic Cover Art Agent Pipeline
 * ---------------------------------------
 * Given the same (seed, era) input, every agent below produces the exact
 * same output, every time, in every browser. No Math.random(), no Date.now(),
 * no external entropy. This is required so a producer can regenerate the
 * exact same cover from a saved seed (e.g. for reprints, variant packs, or
 * "give me option #4 again").
 *
 * PRNG: mulberry32 — fast, tiny, well-distributed for this use case.
 * Not cryptographically secure. Not meant to be.
 */

import { HipHopEra } from '../types';

export type { HipHopEra };

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash. Turns any string into a stable uint32 seed. */
export function hashStringToSeed(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 PRNG. Returns a function that yields floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derives the master seed for a cover from its identifying fields. */
export function deriveCoverSeed(input: {
  title: string;
  producer: string;
  era: string;
  seedOverride?: number;
}): number {
  if (typeof input.seedOverride === 'number') return input.seedOverride >>> 0;
  return hashStringToSeed(`${input.era}::${input.producer}::${input.title}`);
}

/** Pick a deterministic array element using a PRNG stream. */
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** Deterministic float in [min, max]. */
function range(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

// ---------------------------------------------------------------------------
// Era definitions
// ---------------------------------------------------------------------------

export interface PaletteResult {
  bg: [string, string, string]; // 3-stop gradient
  accent: string;
  accentAlt: string;
  text: string;
  textMuted: string;
}

export interface LayoutResult {
  titleAnchor: 'bottom-left' | 'bottom-center' | 'center' | 'top-left';
  badgePosition: 'top-right' | 'top-left' | 'bottom-right';
  textureDensity: number; // 0..1
  rotationDeg: number; // subtle tilt for stamps/badges
  lineBreakStrategy: 'half-split' | 'single-line' | 'stacked-each-word';
}

export interface TypographyResult {
  titleWeight: number;
  titleTracking: number; // letter-spacing px
  titleFontStack: string;
  headerFontStack: string;
  titleSizePx: number;
}

export interface AgentPipelineResult {
  seed: number;
  palette: PaletteResult;
  layout: LayoutResult;
  typography: TypographyResult;
}

/**
 * Fallback era used whenever a lookup (palette/layout/typography bank) is
 * missing an entry for the requested era — e.g. a newly added HipHopEra
 * value that hasn't had its banks filled in yet. Centralized here so all
 * three agents fall back consistently instead of each hardcoding boom_bap.
 */
const FALLBACK_ERA: HipHopEra = 'boom_bap';

// Curated palette banks per era — hand-picked so every seeded pick still
// looks era-authentic. The RNG selects *within* a curated bank, never
// fully random RGB, so output is always usable. Each era now carries 4
// palette variants (up from 2) for meaningfully more visual spread across
// regenerations of the same title/producer with a different seedOverride.
const PALETTE_BANKS: Record<HipHopEra, PaletteResult[]> = {
  boom_bap: [
    { bg: ['#2b2620', '#1c1812', '#100d0a'], accent: '#c9a05c', accentAlt: '#8a3324', text: '#f1e6d2', textMuted: '#b8a888' },
    { bg: ['#241f1a', '#181410', '#0c0a08'], accent: '#b8862f', accentAlt: '#6e2a1f', text: '#efe3ce', textMuted: '#a99878' },
    { bg: ['#231e19', '#161310', '#0a0807'], accent: '#a67c3d', accentAlt: '#5c2318', text: '#ece0c9', textMuted: '#a4947a' },
    { bg: ['#2a2118', '#1a140e', '#0e0a07'], accent: '#d4a94a', accentAlt: '#78351f', text: '#f5e8cc', textMuted: '#bda87f' },
  ],
  golden_era: [
    { bg: ['#231a0c', '#170f06', '#0c0803'], accent: '#d9a441', accentAlt: '#7a5a2c', text: '#f4e6c8', textMuted: '#c2a877' },
    { bg: ['#1e1a10', '#14110a', '#0a0805'], accent: '#c99a3a', accentAlt: '#8c6a2e', text: '#efe0bd', textMuted: '#b39d6f' },
    { bg: ['#221c0f', '#161207', '#0b0904'], accent: '#e0b054', accentAlt: '#6b4d24', text: '#f7e9c9', textMuted: '#c7ad7d' },
    { bg: ['#1c170d', '#120f08', '#090704'], accent: '#cf9f3f', accentAlt: '#7d5c30', text: '#f0e0bc', textMuted: '#b9a173' },
  ],
  trap: [
    { bg: ['#12030f', '#0a0410', '#03020a'], accent: '#c026d3', accentAlt: '#0ea5e9', text: '#f5f0fa', textMuted: '#9d8fb0' },
    { bg: ['#150610', '#0c0512', '#050308'], accent: '#e11d48', accentAlt: '#7c3aed', text: '#f7eef2', textMuted: '#a78ba8' },
    { bg: ['#100813', '#0a0512', '#040209'], accent: '#a21caf', accentAlt: '#22d3ee', text: '#f5eefb', textMuted: '#9689ab' },
    { bg: ['#140510', '#0d030d', '#050208'], accent: '#f472b6', accentAlt: '#6d28d9', text: '#faf0f7', textMuted: '#a88aac' },
  ],
  drill: [
    { bg: ['#0a0a0c', '#08080a', '#000000'], accent: '#dc2626', accentAlt: '#1d4ed8', text: '#ffffff', textMuted: '#8a8a90' },
    { bg: ['#0c0c10', '#08080c', '#000000'], accent: '#2563eb', accentAlt: '#b91c1c', text: '#ffffff', textMuted: '#83838a' },
    { bg: ['#0b0b0d', '#050506', '#000000'], accent: '#94a3b8', accentAlt: '#dc2626', text: '#ffffff', textMuted: '#7a7a80' },
    { bg: ['#09090b', '#060608', '#000000'], accent: '#eab308', accentAlt: '#1e293b', text: '#ffffff', textMuted: '#87878d' },
  ],
  g_funk: [
    { bg: ['#3a1a0f', '#5c2a12', '#1a0d08'], accent: '#f2a71b', accentAlt: '#d94f2b', text: '#fff3d9', textMuted: '#e0b578' },
    { bg: ['#341206', '#63290e', '#180a05'], accent: '#f5b731', accentAlt: '#c23a2b', text: '#fff1cf', textMuted: '#dbab6c' },
    { bg: ['#3d1a08', '#6e310f', '#1c0d05'], accent: '#ffb020', accentAlt: '#e0562f', text: '#fff5df', textMuted: '#e6bd82' },
    { bg: ['#331507', '#5a280f', '#170b05'], accent: '#e89b1a', accentAlt: '#b83a26', text: '#faeecb', textMuted: '#d6a870' },
  ],
  vinyl_press: [
    { bg: ['#181614', '#100e0c', '#0a0908'], accent: '#e8dcc4', accentAlt: '#a33a2b', text: '#f2ebd9', textMuted: '#9c9184' },
    { bg: ['#151311', '#0d0b0a', '#070605'], accent: '#d6c9a8', accentAlt: '#8f4335', text: '#ede4cf', textMuted: '#948a7c' },
    { bg: ['#171512', '#0f0d0b', '#080706'], accent: '#ceb98f', accentAlt: '#7a3a2c', text: '#eee4cf', textMuted: '#968b7c' },
    { bg: ['#141210', '#0c0a09', '#060505'], accent: '#e3d6b8', accentAlt: '#9c4a33', text: '#f4ecd9', textMuted: '#a09584' },
  ],
  // --- New eras ---
  conscious_jazz: [
    { bg: ['#1a2420', '#101815', '#080c0a'], accent: '#8fae8a', accentAlt: '#c9975a', text: '#eef2ec', textMuted: '#9fae9a' },
    { bg: ['#151f1c', '#0c1512', '#060a08'], accent: '#a3bfa0', accentAlt: '#b3854a', text: '#e9f0e6', textMuted: '#96a892' },
    { bg: ['#1c231e', '#111611', '#080a08'], accent: '#7fa878', accentAlt: '#d1a35e', text: '#eef2ea', textMuted: '#9bab96' },
    { bg: ['#182420', '#0e1613', '#070c0a'], accent: '#98b892', accentAlt: '#c08d4f', text: '#eaf1e7', textMuted: '#93a48f' },
  ],
  crunk: [
    { bg: ['#240a08', '#170504', '#0c0302'], accent: '#ff5a1f', accentAlt: '#ffd60a', text: '#fff2e6', textMuted: '#d9a582' },
    { bg: ['#1e0806', '#130403', '#090201'], accent: '#f2450f', accentAlt: '#ffcc00', text: '#fdefe2', textMuted: '#cf9c7a' },
    { bg: ['#280b07', '#190604', '#0d0302'], accent: '#ff6b2b', accentAlt: '#f5c518', text: '#fff3e8', textMuted: '#dba888' },
    { bg: ['#220906', '#160503', '#0b0302'], accent: '#e8440f', accentAlt: '#ffb703', text: '#fbeee0', textMuted: '#d3a07d' },
  ],
  cloud_rap: [
    { bg: ['#141826', '#0c0f1a', '#05060c'], accent: '#a5b4fc', accentAlt: '#f0abfc', text: '#f1f2fb', textMuted: '#a8adc7' },
    { bg: ['#10121f', '#090a15', '#04040a'], accent: '#93c5fd', accentAlt: '#c4b5fd', text: '#eef0fa', textMuted: '#9ea3bf' },
    { bg: ['#161a2c', '#0d0f1c', '#06070d'], accent: '#bae6fd', accentAlt: '#ddd6fe', text: '#f3f4fc', textMuted: '#aab0cc' },
    { bg: ['#121422', '#0a0b16', '#040409'], accent: '#c7d2fe', accentAlt: '#fbcfe8', text: '#f0f1fb', textMuted: '#a4a9c5' },
  ],
  grime: [
    { bg: ['#0d0d10', '#08080a', '#000000'], accent: '#39ff14', accentAlt: '#ff003c', text: '#f4fff2', textMuted: '#8a9488' },
    { bg: ['#0a0a0d', '#050506', '#000000'], accent: '#00e5ff', accentAlt: '#ff2e6b', text: '#eefdff', textMuted: '#85949a' },
    { bg: ['#0c0c0f', '#070708', '#000000'], accent: '#ccff00', accentAlt: '#7a1cff', text: '#f6ffe8', textMuted: '#8c9480' },
    { bg: ['#0b0b0e', '#060608', '#000000'], accent: '#ff6b00', accentAlt: '#00d1ff', text: '#fff4ea', textMuted: '#928a7f' },
  ],
  mixtape_era: [
    { bg: ['#1c1c1e', '#121213', '#0a0a0b'], accent: '#f5f5f5', accentAlt: '#ff3b30', text: '#ffffff', textMuted: '#9a9a9c' },
    { bg: ['#18181c', '#0f0f12', '#08080a'], accent: '#ffcc00', accentAlt: '#0a84ff', text: '#f7f7f8', textMuted: '#96969b' },
    { bg: ['#1a1a1d', '#101012', '#08080a'], accent: '#ff453a', accentAlt: '#32d74b', text: '#fbfbfc', textMuted: '#9c9ca0' },
    { bg: ['#161619', '#0d0d0f', '#070708'], accent: '#64d2ff', accentAlt: '#ff9f0a', text: '#f6f6f8', textMuted: '#949498' },
  ],
};

const LAYOUT_BANKS: Record<HipHopEra, Partial<LayoutResult>[]> = {
  boom_bap: [
    { titleAnchor: 'bottom-left', badgePosition: 'top-right', lineBreakStrategy: 'half-split' },
    { titleAnchor: 'bottom-left', badgePosition: 'top-left', lineBreakStrategy: 'stacked-each-word' },
    { titleAnchor: 'center', badgePosition: 'top-right', lineBreakStrategy: 'single-line' },
    { titleAnchor: 'bottom-center', badgePosition: 'top-left', lineBreakStrategy: 'half-split' },
  ],
  golden_era: [
    { titleAnchor: 'bottom-center', badgePosition: 'top-right', lineBreakStrategy: 'single-line' },
    { titleAnchor: 'center', badgePosition: 'bottom-right', lineBreakStrategy: 'half-split' },
    { titleAnchor: 'bottom-left', badgePosition: 'top-left', lineBreakStrategy: 'stacked-each-word' },
    { titleAnchor: 'top-left', badgePosition: 'bottom-right', lineBreakStrategy: 'single-line' },
  ],
  trap: [
    { titleAnchor: 'bottom-left', badgePosition: 'top-right', lineBreakStrategy: 'stacked-each-word' },
    { titleAnchor: 'top-left', badgePosition: 'bottom-right', lineBreakStrategy: 'half-split' },
    { titleAnchor: 'center', badgePosition: 'top-left', lineBreakStrategy: 'stacked-each-word' },
    { titleAnchor: 'bottom-center', badgePosition: 'bottom-right', lineBreakStrategy: 'single-line' },
  ],
  drill: [
    { titleAnchor: 'top-left', badgePosition: 'bottom-right', lineBreakStrategy: 'stacked-each-word' },
    { titleAnchor: 'bottom-left', badgePosition: 'top-right', lineBreakStrategy: 'half-split' },
    { titleAnchor: 'center', badgePosition: 'bottom-right', lineBreakStrategy: 'stacked-each-word' },
    { titleAnchor: 'top-left', badgePosition: 'top-right', lineBreakStrategy: 'single-line' },
  ],
  g_funk: [
    { titleAnchor: 'bottom-center', badgePosition: 'top-left', lineBreakStrategy: 'single-line' },
    { titleAnchor: 'bottom-left', badgePosition: 'top-right', lineBreakStrategy: 'half-split' },
    { titleAnchor: 'center', badgePosition: 'top-right', lineBreakStrategy: 'single-line' },
    { titleAnchor: 'bottom-center', badgePosition: 'bottom-right', lineBreakStrategy: 'half-split' },
  ],
  vinyl_press: [
    { titleAnchor: 'center', badgePosition: 'bottom-right', lineBreakStrategy: 'single-line' },
    { titleAnchor: 'bottom-center', badgePosition: 'top-right', lineBreakStrategy: 'half-split' },
    { titleAnchor: 'top-left', badgePosition: 'bottom-right', lineBreakStrategy: 'single-line' },
    { titleAnchor: 'center', badgePosition: 'top-left', lineBreakStrategy: 'stacked-each-word' },
  ],
  // --- New eras ---
  conscious_jazz: [
    { titleAnchor: 'bottom-left', badgePosition: 'top-left', lineBreakStrategy: 'single-line' },
    { titleAnchor: 'center', badgePosition: 'bottom-right', lineBreakStrategy: 'single-line' },
    { titleAnchor: 'bottom-center', badgePosition: 'top-right', lineBreakStrategy: 'half-split' },
    { titleAnchor: 'top-left', badgePosition: 'bottom-right', lineBreakStrategy: 'single-line' },
  ],
  crunk: [
    { titleAnchor: 'center', badgePosition: 'top-right', lineBreakStrategy: 'stacked-each-word' },
    { titleAnchor: 'bottom-center', badgePosition: 'top-left', lineBreakStrategy: 'stacked-each-word' },
    { titleAnchor: 'bottom-left', badgePosition: 'bottom-right', lineBreakStrategy: 'half-split' },
    { titleAnchor: 'center', badgePosition: 'bottom-right', lineBreakStrategy: 'stacked-each-word' },
  ],
  cloud_rap: [
    { titleAnchor: 'center', badgePosition: 'bottom-right', lineBreakStrategy: 'single-line' },
    { titleAnchor: 'bottom-center', badgePosition: 'top-left', lineBreakStrategy: 'single-line' },
    { titleAnchor: 'top-left', badgePosition: 'bottom-right', lineBreakStrategy: 'half-split' },
    { titleAnchor: 'center', badgePosition: 'top-right', lineBreakStrategy: 'single-line' },
  ],
  grime: [
    { titleAnchor: 'top-left', badgePosition: 'bottom-right', lineBreakStrategy: 'stacked-each-word' },
    { titleAnchor: 'bottom-left', badgePosition: 'top-right', lineBreakStrategy: 'half-split' },
    { titleAnchor: 'center', badgePosition: 'top-left', lineBreakStrategy: 'stacked-each-word' },
    { titleAnchor: 'bottom-center', badgePosition: 'bottom-right', lineBreakStrategy: 'half-split' },
  ],
  mixtape_era: [
    { titleAnchor: 'bottom-left', badgePosition: 'top-right', lineBreakStrategy: 'half-split' },
    { titleAnchor: 'top-left', badgePosition: 'top-right', lineBreakStrategy: 'single-line' },
    { titleAnchor: 'bottom-center', badgePosition: 'bottom-right', lineBreakStrategy: 'stacked-each-word' },
    { titleAnchor: 'center', badgePosition: 'top-left', lineBreakStrategy: 'half-split' },
  ],
};

const TYPOGRAPHY_BANKS: Record<HipHopEra, Partial<TypographyResult>[]> = {
  boom_bap: [
    { titleWeight: 900, titleTracking: -1, titleFontStack: '"Arial Black", "Helvetica Neue", sans-serif' },
    { titleWeight: 800, titleTracking: 0, titleFontStack: 'Georgia, "Times New Roman", serif' },
    { titleWeight: 850, titleTracking: -0.5, titleFontStack: '"Impact", "Arial Black", sans-serif' },
    { titleWeight: 700, titleTracking: 0.5, titleFontStack: '"Palatino Linotype", serif' },
  ],
  golden_era: [
    { titleWeight: 800, titleTracking: 0.5, titleFontStack: 'Georgia, "Times New Roman", serif' },
    { titleWeight: 700, titleTracking: 1, titleFontStack: '"Courier New", monospace' },
    { titleWeight: 750, titleTracking: 0, titleFontStack: '"Book Antiqua", Palatino, serif' },
    { titleWeight: 900, titleTracking: -0.5, titleFontStack: '"Arial Black", sans-serif' },
  ],
  trap: [
    { titleWeight: 900, titleTracking: -2, titleFontStack: '"Arial Narrow", sans-serif' },
    { titleWeight: 900, titleTracking: -1.5, titleFontStack: '"Helvetica Neue", sans-serif' },
    { titleWeight: 900, titleTracking: -2.5, titleFontStack: '"Futura", "Century Gothic", sans-serif' },
    { titleWeight: 850, titleTracking: -1, titleFontStack: '"Segoe UI", sans-serif' },
  ],
  drill: [
    { titleWeight: 900, titleTracking: -1, titleFontStack: '"Arial Narrow", "Helvetica Neue", sans-serif' },
    { titleWeight: 800, titleTracking: 2, titleFontStack: '"Courier New", monospace' },
    { titleWeight: 900, titleTracking: -2, titleFontStack: '"Impact", sans-serif' },
    { titleWeight: 700, titleTracking: 3, titleFontStack: '"Consolas", monospace' },
  ],
  g_funk: [
    { titleWeight: 800, titleTracking: 1, titleFontStack: '"Brush Script MT", cursive, sans-serif' },
    { titleWeight: 900, titleTracking: 0, titleFontStack: '"Arial Black", sans-serif' },
    { titleWeight: 750, titleTracking: 0.5, titleFontStack: '"Segoe Script", cursive' },
    { titleWeight: 850, titleTracking: -0.5, titleFontStack: '"Cooper Black", Georgia, serif' },
  ],
  vinyl_press: [
    { titleWeight: 700, titleTracking: 1.5, titleFontStack: 'Georgia, serif' },
    { titleWeight: 800, titleTracking: 0.5, titleFontStack: '"Times New Roman", serif' },
    { titleWeight: 650, titleTracking: 2, titleFontStack: '"Baskerville", serif' },
    { titleWeight: 750, titleTracking: 1, titleFontStack: '"Garamond", serif' },
  ],
  // --- New eras ---
  conscious_jazz: [
    { titleWeight: 700, titleTracking: 1, titleFontStack: '"Book Antiqua", Palatino, serif' },
    { titleWeight: 650, titleTracking: 1.5, titleFontStack: 'Garamond, serif' },
    { titleWeight: 750, titleTracking: 0.5, titleFontStack: '"Baskerville", Georgia, serif' },
    { titleWeight: 700, titleTracking: 2, titleFontStack: '"Courier New", monospace' },
  ],
  crunk: [
    { titleWeight: 900, titleTracking: -1, titleFontStack: '"Impact", "Arial Black", sans-serif' },
    { titleWeight: 900, titleTracking: 0, titleFontStack: '"Arial Black", sans-serif' },
    { titleWeight: 850, titleTracking: -2, titleFontStack: '"Haettenschweiler", "Arial Narrow", sans-serif' },
    { titleWeight: 900, titleTracking: -1.5, titleFontStack: '"Franklin Gothic Heavy", sans-serif' },
  ],
  cloud_rap: [
    { titleWeight: 300, titleTracking: 3, titleFontStack: '"Helvetica Neue", sans-serif' },
    { titleWeight: 200, titleTracking: 4, titleFontStack: '"Segoe UI Light", sans-serif' },
    { titleWeight: 350, titleTracking: 2, titleFontStack: '"Avenir Next", sans-serif' },
    { titleWeight: 250, titleTracking: 3.5, titleFontStack: '"Century Gothic", sans-serif' },
  ],
  grime: [
    { titleWeight: 900, titleTracking: -2, titleFontStack: '"Arial Narrow", sans-serif' },
    { titleWeight: 900, titleTracking: -1, titleFontStack: '"Impact", sans-serif' },
    { titleWeight: 800, titleTracking: 1, titleFontStack: '"Consolas", monospace' },
    { titleWeight: 900, titleTracking: -2.5, titleFontStack: '"Helvetica Neue Condensed", sans-serif' },
  ],
  mixtape_era: [
    { titleWeight: 900, titleTracking: -1, titleFontStack: '"Arial Black", sans-serif' },
    { titleWeight: 800, titleTracking: 0, titleFontStack: '"Helvetica Neue", sans-serif' },
    { titleWeight: 850, titleTracking: -1.5, titleFontStack: '"Franklin Gothic Medium", sans-serif' },
    { titleWeight: 900, titleTracking: 1, titleFontStack: '"Verdana", sans-serif' },
  ],
};

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

/** PaletteAgent — deterministically selects + slightly perturbs a bank entry. */
export function runPaletteAgent(rng: () => number, era: HipHopEra): PaletteResult {
  const base = pick(rng, PALETTE_BANKS[era] || PALETTE_BANKS[FALLBACK_ERA]);
  return base;
}

/** LayoutAgent — deterministically selects composition rules + jitter. */
export function runLayoutAgent(rng: () => number, era: HipHopEra): LayoutResult {
  const base = pick(rng, LAYOUT_BANKS[era] || LAYOUT_BANKS[FALLBACK_ERA]);
  return {
    titleAnchor: base.titleAnchor ?? 'bottom-left',
    badgePosition: base.badgePosition ?? 'top-right',
    lineBreakStrategy: base.lineBreakStrategy ?? 'half-split',
    textureDensity: range(rng, 0.35, 0.85),
    rotationDeg: range(rng, -3, 3),
  };
}

/** TypographyAgent — deterministically selects type pairing. */
export function runTypographyAgent(rng: () => number, era: HipHopEra): TypographyResult {
  const base = pick(rng, TYPOGRAPHY_BANKS[era] || TYPOGRAPHY_BANKS[FALLBACK_ERA]);
  return {
    titleWeight: base.titleWeight ?? 800,
    titleTracking: base.titleTracking ?? 0,
    titleFontStack: base.titleFontStack ?? 'sans-serif',
    headerFontStack: '"Courier New", monospace',
    titleSizePx: Math.round(range(rng, 38, 46)),
  };
}

/**
 * Runs the full deterministic pipeline: seed -> palette -> layout -> typography.
 * Each agent draws from the SAME rng stream in a fixed order, so the overall
 * result is a pure function of (title, producer, era, seedOverride).
 */
export function runCoverArtPipeline(input: {
  title: string;
  producer: string;
  era: HipHopEra;
  seedOverride?: number;
}): AgentPipelineResult {
  const seed = deriveCoverSeed(input);
  const rng = mulberry32(seed);

  const palette = runPaletteAgent(rng, input.era);
  const layout = runLayoutAgent(rng, input.era);
  const typography = runTypographyAgent(rng, input.era);

  return { seed, palette, layout, typography };
}