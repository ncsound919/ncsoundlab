/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Genome — a variant is a parameter vector plus a seed, never audio.
 *
 * A rendered variant is a few hundred bytes of JSON that reproduces exactly the
 * same sound from its seed, which is what lets a phone hold thousands of
 * variations in memory instead of thousands of buffers. Two invariants matter:
 *
 *  1. **Determinism.** Every random decision comes from `mulberry32(seed)`
 *     derived from the genome's own seed. No `Date.now()` anywhere, so a variant
 *     re-renders identically after a reboot or on another device.
 *  2. **The schema is the contract.** Ranges live in `GENOME_SCHEMA`; mutation,
 *     `clampParams` and `applyGenomeEdits` (the assistant's entry point) all go
 *     through it, so nothing downstream can receive an out-of-range parameter.
 *
 * This module describes *what to render*; rendering belongs to the audio
 * engine, which is why nothing here imports React, Tauri or the DOM.
 */

export type LayerKind = 'recording' | 'synth' | 'sub' | 'body' | 'noise';
export type Waveform = 'sine' | 'triangle' | 'saw' | 'square' | 'noise';
export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'lohi';

export interface LayerGene {
  kind: LayerKind;
  /** Layer level in the render, 0..1. */
  weight: number;
  waveform?: Waveform;
  /** Oscillator frequency for generated layers (Hz). */
  freqHz?: number;
  detuneCents?: number;
  /** Envelope decay for generated layers (seconds). */
  decayS?: number;
  /** 0..1 start phase — the cheap round-robin decorrelator. */
  phaseOffset?: number;
}

export interface GenomeParams {
  layers: LayerGene[];
  filter: { lowHz: number; highHz: number; type: FilterType };
  pitch: { rootHz: number; offsetCents: number };
  grain: { scatter: number; sizeMs: number; rateHz: number };
  crush: { bits: number; downsample: number };
  drive: { amount: number; mix: number };
  tremolo: { rateHz: number; depth: number };
  gainDb: number;
  fadeInMs: number;
  fadeOutMs: number;
  /** Milliseconds of attack that mutation must not touch. */
  transientLockMs: number;
  transientLockEnabled: boolean;
}

export interface Genome {
  id: string;
  /** null for the original take's genome. */
  parentId: string | null;
  /** Deterministic RNG seed; also the lineage fingerprint. */
  seed: number;
  params: GenomeParams;
  /** Monotonic revision of the parameter vector. */
  rev: number;
}

/** Bump when the parameter set changes shape. */
export const GENOME_VERSION = 1;

export interface NumericRange {
  min: number;
  max: number;
  step: number;
}

export interface EnumLeaf {
  __enum: readonly string[];
}

export type LeafSchema = NumericRange | EnumLeaf;

export interface LayerGeneSchema {
  kind: EnumLeaf;
  weight: NumericRange;
  waveform: EnumLeaf;
  freqHz: NumericRange;
  detuneCents: NumericRange;
  decayS: NumericRange;
  phaseOffset: NumericRange;
}

export interface GenomeSchema {
  layers: { __array: LayerGeneSchema; maxItems: number };
  filter: { lowHz: NumericRange; highHz: NumericRange; type: EnumLeaf };
  pitch: { rootHz: NumericRange; offsetCents: NumericRange };
  grain: { scatter: NumericRange; sizeMs: NumericRange; rateHz: NumericRange };
  crush: { bits: NumericRange; downsample: NumericRange };
  drive: { amount: NumericRange; mix: NumericRange };
  tremolo: { rateHz: NumericRange; depth: NumericRange };
  gainDb: NumericRange;
  fadeInMs: NumericRange;
  fadeOutMs: NumericRange;
  transientLockMs: NumericRange;
}

/** The single source of truth for every parameter's legal range. */
export const GENOME_SCHEMA: GenomeSchema = {
  layers: {
    __array: {
      kind: { __enum: ['recording', 'synth', 'sub', 'body', 'noise'] },
      weight: { min: 0, max: 1, step: 0.01 },
      waveform: { __enum: ['sine', 'triangle', 'saw', 'square', 'noise'] },
      freqHz: { min: 20, max: 8000, step: 1 },
      detuneCents: { min: -1200, max: 1200, step: 1 },
      decayS: { min: 0.01, max: 8, step: 0.01 },
      phaseOffset: { min: 0, max: 1, step: 0.01 },
    },
    maxItems: 4,
  },
  filter: {
    lowHz: { min: 20, max: 20000, step: 1 },
    highHz: { min: 20, max: 20000, step: 1 },
    type: { __enum: ['lowpass', 'highpass', 'bandpass', 'lohi'] },
  },
  pitch: {
    rootHz: { min: 20, max: 2000, step: 0.1 },
    offsetCents: { min: -2400, max: 2400, step: 1 },
  },
  grain: {
    scatter: { min: 0, max: 1, step: 0.01 },
    sizeMs: { min: 5, max: 500, step: 1 },
    rateHz: { min: 0.5, max: 60, step: 0.1 },
  },
  crush: {
    bits: { min: 4, max: 32, step: 1 },
    downsample: { min: 1, max: 32, step: 1 },
  },
  drive: {
    amount: { min: 0, max: 1, step: 0.01 },
    mix: { min: 0, max: 1, step: 0.01 },
  },
  tremolo: {
    rateHz: { min: 0.1, max: 20, step: 0.1 },
    depth: { min: 0, max: 1, step: 0.01 },
  },
  gainDb: { min: -48, max: 12, step: 0.1 },
  fadeInMs: { min: 0, max: 500, step: 1 },
  fadeOutMs: { min: 0, max: 2000, step: 1 },
  transientLockMs: { min: 0, max: 50, step: 1 },
};

/** Attack protection default: inside the 10–20 ms window the plan calls for. */
export const DEFAULT_TRANSIENT_LOCK_MS = 15;

export const MAX_LAYERS = GENOME_SCHEMA.layers.maxItems;

export function defaultParams(): GenomeParams {
  return {
    layers: [
      { kind: 'recording', weight: 1 },
      { kind: 'sub', weight: 0.25, waveform: 'sine', freqHz: 55, decayS: 0.6, phaseOffset: 0 },
    ],
    filter: { lowHz: 25, highHz: 18000, type: 'lohi' },
    pitch: { rootHz: 220, offsetCents: 0 },
    grain: { scatter: 0, sizeMs: 80, rateHz: 12 },
    crush: { bits: 16, downsample: 1 },
    drive: { amount: 0.1, mix: 0.2 },
    tremolo: { rateHz: 4, depth: 0 },
    gainDb: 0,
    fadeInMs: 2,
    fadeOutMs: 20,
    transientLockMs: DEFAULT_TRANSIENT_LOCK_MS,
    transientLockEnabled: true,
  };
}

const isNumericRange = (leaf: LeafSchema): leaf is NumericRange => 'min' in leaf;

const clampNumber = (value: unknown, range: NumericRange, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, value));
};

const clampLeaf = (schema: LeafSchema, value: unknown, fallback: unknown): unknown => {
  if (isNumericRange(schema)) {
    return clampNumber(value, schema, typeof fallback === 'number' ? fallback : schema.min);
  }
  return typeof value === 'string' && schema.__enum.includes(value) ? value : fallback;
};

/** Merge an incoming object over the current one, key by key, clamping all of it. */
function mergeGroup<S extends Record<string, LeafSchema>, T extends object>(
  schema: S,
  incoming: unknown,
  current: T
): T {
  const out = { ...current } as Record<string, unknown>;
  if (!incoming || typeof incoming !== 'object') return out as T;
  const source = incoming as Record<string, unknown>;
  for (const key of Object.keys(schema)) {
    if (source[key] === undefined) continue;
    out[key] = clampLeaf(schema[key], source[key], (current as Record<string, unknown>)[key]);
  }
  return out as T;
}

/**
 * Merge arbitrary input over a base parameter set and clamp everything to the
 * schema. Unknown keys are dropped rather than passed through — this is the
 * function that makes assistant output safe to hand to the render engine.
 */
export function clampParams(input: unknown, base: GenomeParams = defaultParams()): GenomeParams {
  const source = (input ?? {}) as Record<string, unknown>;
  const out: GenomeParams = {
    ...base,
    layers: base.layers.map((layer) => ({ ...layer })),
    filter: { ...base.filter },
    pitch: { ...base.pitch },
    grain: { ...base.grain },
    crush: { ...base.crush },
    drive: { ...base.drive },
    tremolo: { ...base.tremolo },
  };

  out.filter = mergeGroup(GENOME_SCHEMA.filter, source.filter, out.filter);
  out.pitch = mergeGroup(GENOME_SCHEMA.pitch, source.pitch, out.pitch);
  out.grain = mergeGroup(GENOME_SCHEMA.grain, source.grain, out.grain);
  out.crush = mergeGroup(GENOME_SCHEMA.crush, source.crush, out.crush);
  out.drive = mergeGroup(GENOME_SCHEMA.drive, source.drive, out.drive);
  out.tremolo = mergeGroup(GENOME_SCHEMA.tremolo, source.tremolo, out.tremolo);
  out.gainDb = clampNumber(source.gainDb, GENOME_SCHEMA.gainDb, base.gainDb);
  out.fadeInMs = clampNumber(source.fadeInMs, GENOME_SCHEMA.fadeInMs, base.fadeInMs);
  out.fadeOutMs = clampNumber(source.fadeOutMs, GENOME_SCHEMA.fadeOutMs, base.fadeOutMs);
  out.transientLockMs = clampNumber(
    source.transientLockMs,
    GENOME_SCHEMA.transientLockMs,
    base.transientLockMs
  );
  if (typeof source.transientLockEnabled === 'boolean') {
    out.transientLockEnabled = source.transientLockEnabled;
  }

  const layerSchema = GENOME_SCHEMA.layers.__array;
  if (Array.isArray(source.layers)) {
    const incoming = source.layers
      .filter((layer): layer is Record<string, unknown> => !!layer && typeof layer === 'object')
      .slice(0, MAX_LAYERS);
    if (incoming.length > 0) {
      out.layers = incoming.map((layer) => {
        const template = base.layers[0] ?? { kind: 'recording' as LayerKind, weight: 1 };
        const gene = mergeGroup(
          {
            kind: layerSchema.kind,
            waveform: layerSchema.waveform,
            weight: layerSchema.weight,
            freqHz: layerSchema.freqHz,
            detuneCents: layerSchema.detuneCents,
            decayS: layerSchema.decayS,
            phaseOffset: layerSchema.phaseOffset,
          },
          layer,
          template as unknown as Record<string, LeafSchema>
        ) as unknown as LayerGene;
        // Optional genes stay optional: only carry them when the input had them.
        if (layer.waveform === undefined) delete gene.waveform;
        if (layer.freqHz === undefined) delete gene.freqHz;
        if (layer.detuneCents === undefined) delete gene.detuneCents;
        if (layer.decayS === undefined) delete gene.decayS;
        if (layer.phaseOffset === undefined) delete gene.phaseOffset;
        return gene;
      });
    }
  }

  // A high cut at or below the low cut would silence the take; keep them ordered.
  if (out.filter.type !== 'lowpass' && out.filter.highHz <= out.filter.lowHz) {
    out.filter.highHz = Math.min(GENOME_SCHEMA.filter.highHz.max, out.filter.lowHz * 2);
  }
  return out;
}

/** Deterministic id from the seed, so the same variant always has the same name. */
export function genomeId(seed: number): string {
  return `g-${(seed >>> 0).toString(36)}`;
}

/** Partial parameters at any depth — callers only specify what they change. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? U[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export interface SoundPreset {
  id: string;
  label: string;
  icon: string;
  edits: DeepPartial<GenomeParams>;
}

/**
 * One-tap moves for the shape editor. Presets only touch the sound, never the
 * seed, layers or transient lock, so applying one is a reversible tweak rather
 * than a new variant.
 */
export const SOUND_PRESETS: SoundPreset[] = [
  {
    id: 'warm',
    label: 'Warm',
    icon: '🟠',
    edits: {
      filter: { type: 'lohi', lowHz: 45, highHz: 5500 },
      drive: { amount: 0.28, mix: 0.32 },
      tremolo: { depth: 0.08 },
      gainDb: 0.5,
    },
  },
  {
    id: 'bright',
    label: 'Bright',
    icon: '✨',
    edits: {
      filter: { type: 'lohi', lowHz: 120, highHz: 16000 },
      pitch: { rootHz: 220, offsetCents: 7 },
    },
  },
  {
    id: 'grit',
    label: 'Grit',
    icon: '🔥',
    edits: {
      filter: { type: 'lohi', lowHz: 120, highHz: 7000 },
      drive: { amount: 0.65, mix: 0.6 },
      crush: { bits: 10, downsample: 3 },
    },
  },
  {
    id: 'air',
    label: 'Air',
    icon: '🌫️',
    edits: {
      filter: { type: 'highpass', lowHz: 700, highHz: 18000 },
      grain: { scatter: 0.25, sizeMs: 120 },
      tremolo: { depth: 0.25 },
    },
  },
];

export function makeGenome(
  seed: number,
  params: DeepPartial<GenomeParams> = {},
  parentId: string | null = null
): Genome {
  return {
    id: genomeId(seed),
    parentId,
    seed: seed >>> 0,
    params: clampParams(params),
    rev: 1,
  };
}

/** Deterministic 32-bit PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic child seed — the lineage fingerprint of a variant. */
export function deriveSeed(seed: number, salt: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ ((salt + 0x85ebca6b) >>> 0), 0xc2b2ae35) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

export type EvolutionTarget =
  | 'balanced'
  | 'sub-bass'
  | 'snappy-transient'
  | 'lofi-crunch'
  | 'ambient-cloud'
  | 'diverse';

export interface GeneLocks {
  layers?: boolean;
  filter?: boolean;
  pitch?: boolean;
  grain?: boolean;
  crush?: boolean;
  drive?: boolean;
  tremolo?: boolean;
  envelopes?: boolean;
  transient?: boolean;
}

export interface MutateOptions {
  /** Explicit seed for the mutation pass. Defaults to the genome's own seed. */
  seed?: number;
  /** Keep the parent's transient lock duration (default true). */
  respectTransientLock?: boolean;
  /** Freeze specific gene categories so mutation leaves them untouched. */
  locks?: GeneLocks;
  /** Sonic evolutionary target biasing mutations toward specific acoustic goals. */
  target?: EvolutionTarget;
}

/**
 * Mutate a variant.
 *
 * `strength` 0..1 scales how far each parameter may move. Discrete genes only
 * flip above a threshold, so a gentle drag does not turn a kick into a pad. The
 * transient lock is never shortened: an evolved variant keeps its attack.
 */
export function mutate(genome: Genome, strength: number, options: MutateOptions = {}): Genome {
  const target = options.target ?? 'balanced';
  const locks = options.locks ?? {};
  const multiplier = target === 'diverse' ? 1.4 : 1.0;
  const amount = Math.min(1, Math.max(0, strength * multiplier));
  const rng = mulberry32((options.seed ?? genome.seed) >>> 0);
  const respectLock = locks.transient ?? (options.respectTransientLock ?? true);
  const parent = genome.params;
  const layerSchema = GENOME_SCHEMA.layers.__array;

  const jitter = (range: NumericRange, value: number, weight = 1): number => {
    const span = (range.max - range.min) * amount * 0.35 * weight;
    const next = value + (rng() * 2 - 1) * span;
    const snapped = Math.round(next / range.step) * range.step;
    return Math.min(range.max, Math.max(range.min, Number(snapped.toFixed(4))));
  };
  const chance = (scaled: number): boolean => rng() < Math.min(0.95, amount * scaled);

  // 1. Filter parameters (biased by target if unlocked)
  let filterType = parent.filter.type;
  let filterLow = parent.filter.lowHz;
  let filterHigh = parent.filter.highHz;

  if (!locks.filter) {
    if (target === 'sub-bass') {
      filterType = 'lowpass';
      filterHigh = Math.min(300, Math.max(60, jitter(GENOME_SCHEMA.filter.highHz, Math.min(parent.filter.highHz, 180), 0.5)));
    } else if (target === 'snappy-transient') {
      filterType = chance(0.5) ? 'highpass' : parent.filter.type;
      filterLow = Math.max(80, jitter(GENOME_SCHEMA.filter.lowHz, Math.max(parent.filter.lowHz, 140), 0.5));
    } else if (target === 'lofi-crunch') {
      filterType = 'lohi';
      filterLow = Math.max(150, Math.min(500, jitter(GENOME_SCHEMA.filter.lowHz, 300, 0.5)));
      filterHigh = Math.max(2500, Math.min(5500, jitter(GENOME_SCHEMA.filter.highHz, 4000, 0.5)));
    } else {
      filterLow = jitter(GENOME_SCHEMA.filter.lowHz, parent.filter.lowHz, 0.6);
      filterHigh = jitter(GENOME_SCHEMA.filter.highHz, parent.filter.highHz, 0.6);
    }
  }

  // 2. Pitch parameters
  const pitchOffset = locks.pitch
    ? parent.pitch.offsetCents
    : jitter(GENOME_SCHEMA.pitch.offsetCents, parent.pitch.offsetCents, 0.5);

  // 3. Grain parameters
  let grainScatter = parent.grain.scatter;
  let grainSize = parent.grain.sizeMs;
  let grainRate = parent.grain.rateHz;

  if (!locks.grain) {
    if (target === 'ambient-cloud') {
      grainScatter = Math.max(0.4, jitter(GENOME_SCHEMA.grain.scatter, Math.max(parent.grain.scatter, 0.65), 0.8));
      grainSize = Math.max(50, jitter(GENOME_SCHEMA.grain.sizeMs, 100, 0.7));
      grainRate = jitter(GENOME_SCHEMA.grain.rateHz, 12, 0.6);
    } else {
      grainScatter = jitter(GENOME_SCHEMA.grain.scatter, parent.grain.scatter);
      grainSize = jitter(GENOME_SCHEMA.grain.sizeMs, parent.grain.sizeMs, 0.5);
      grainRate = jitter(GENOME_SCHEMA.grain.rateHz, parent.grain.rateHz, 0.5);
    }
  }

  // 4. Crush parameters
  let crushBits = parent.crush.bits;
  let crushDownsample = parent.crush.downsample;

  if (!locks.crush) {
    if (target === 'lofi-crunch') {
      crushBits = Math.max(6, Math.min(12, Math.round(jitter(GENOME_SCHEMA.crush.bits, 10, 0.8))));
      crushDownsample = Math.max(2, Math.min(8, Math.round(jitter(GENOME_SCHEMA.crush.downsample, 4, 0.8))));
    } else if (amount > 0.4 && chance(amount)) {
      crushBits = jitter(GENOME_SCHEMA.crush.bits, parent.crush.bits, 0.5);
      crushDownsample = jitter(GENOME_SCHEMA.crush.downsample, parent.crush.downsample, 0.5);
    }
  }

  // 5. Drive parameters
  let driveAmount = parent.drive.amount;
  let driveMix = parent.drive.mix;

  if (!locks.drive) {
    if (target === 'lofi-crunch' || target === 'sub-bass') {
      driveAmount = Math.max(0.2, jitter(GENOME_SCHEMA.drive.amount, Math.max(parent.drive.amount, 0.45), 0.7));
      driveMix = Math.max(0.15, jitter(GENOME_SCHEMA.drive.mix, Math.max(parent.drive.mix, 0.35), 0.7));
    } else {
      driveAmount = jitter(GENOME_SCHEMA.drive.amount, parent.drive.amount);
      driveMix = jitter(GENOME_SCHEMA.drive.mix, parent.drive.mix);
    }
  }

  // 6. Tremolo parameters
  let tremoloRate = parent.tremolo.rateHz;
  let tremoloDepth = parent.tremolo.depth;

  if (!locks.tremolo) {
    if (target === 'ambient-cloud') {
      tremoloRate = jitter(GENOME_SCHEMA.tremolo.rateHz, 2.5, 0.6);
      tremoloDepth = Math.max(0.2, jitter(GENOME_SCHEMA.tremolo.depth, 0.4, 0.7));
    } else {
      tremoloRate = jitter(GENOME_SCHEMA.tremolo.rateHz, parent.tremolo.rateHz, 0.5);
      tremoloDepth = jitter(GENOME_SCHEMA.tremolo.depth, parent.tremolo.depth, 0.5);
    }
  }

  // 7. Envelopes
  let fadeIn = parent.fadeInMs;
  let fadeOut = parent.fadeOutMs;

  if (!locks.envelopes) {
    if (target === 'ambient-cloud') {
      fadeIn = Math.max(20, jitter(GENOME_SCHEMA.fadeInMs, 40, 0.6));
      fadeOut = Math.max(250, jitter(GENOME_SCHEMA.fadeOutMs, 500, 0.8));
    } else if (target === 'snappy-transient') {
      fadeIn = 0;
      fadeOut = Math.min(180, Math.max(25, jitter(GENOME_SCHEMA.fadeOutMs, 80, 0.6)));
    } else {
      fadeIn = jitter(GENOME_SCHEMA.fadeInMs, parent.fadeInMs, 0.4);
      fadeOut = jitter(GENOME_SCHEMA.fadeOutMs, parent.fadeOutMs, 0.4);
    }
  }

  // 8. Transient Lock duration
  const lockMs = respectLock
    ? parent.transientLockMs
    : jitter(GENOME_SCHEMA.transientLockMs, parent.transientLockMs, 0.25);

  const params: GenomeParams = {
    layers: parent.layers.map((layer) => ({ ...layer })),
    filter: {
      type: filterType,
      lowHz: filterLow,
      highHz: filterHigh,
    },
    pitch: {
      rootHz: parent.pitch.rootHz,
      offsetCents: pitchOffset,
    },
    grain: {
      scatter: grainScatter,
      sizeMs: grainSize,
      rateHz: grainRate,
    },
    crush: { bits: crushBits, downsample: crushDownsample },
    drive: { amount: driveAmount, mix: driveMix },
    tremolo: { rateHz: tremoloRate, depth: tremoloDepth },
    gainDb: jitter(GENOME_SCHEMA.gainDb, parent.gainDb, 0.4),
    fadeInMs: fadeIn,
    fadeOutMs: fadeOut,
    transientLockMs: lockMs,
    transientLockEnabled: parent.transientLockEnabled,
  };

  // 9. Layer mutations
  if (!locks.layers) {
    params.layers = params.layers.map((layer) => {
      const next: LayerGene = { ...layer };
      next.weight = jitter({ min: 0, max: 1, step: 0.01 }, layer.weight, 0.7);
      if (layer.kind !== 'recording') {
        next.phaseOffset = jitter({ min: 0, max: 1, step: 0.01 }, layer.phaseOffset ?? 0, 1.2);
        if (layer.freqHz !== undefined) next.freqHz = jitter(layerSchema.freqHz, layer.freqHz, 0.3);
        if (layer.decayS !== undefined) next.decayS = jitter(layerSchema.decayS, layer.decayS, 0.6);
      }
      if (layer.waveform && amount > 0.5 && chance(amount * 0.5)) {
        const waveforms = layerSchema.waveform.__enum;
        next.waveform = waveforms[Math.floor(rng() * waveforms.length)] as Waveform;
      }
      return next;
    });

    if (amount > 0.55 || target === 'sub-bass') {
      if (target === 'sub-bass' && !params.layers.some((l) => l.kind === 'sub')) {
        params.layers.push({
          kind: 'sub',
          weight: 0.55,
          waveform: 'sine',
          freqHz: 45 + Math.round(rng() * 30),
          decayS: 0.4,
          phaseOffset: 0,
        });
      } else if (params.layers.length < MAX_LAYERS && chance(amount * 0.4)) {
        params.layers.push({
          kind: rng() < 0.5 ? 'sub' : 'noise',
          weight: Math.round(rng() * 40) / 100,
          waveform: rng() < 0.5 ? 'sine' : 'noise',
          freqHz: 40 + Math.round(rng() * 120),
          decayS: 0.2 + Math.round(rng() * 200) / 100,
          phaseOffset: Math.round(rng() * 100) / 100,
        });
      } else if (params.layers.length > 1 && chance(amount * 0.3)) {
        const dropIndex = 1 + Math.floor(rng() * (params.layers.length - 1));
        params.layers.splice(Math.min(dropIndex, params.layers.length - 1), 1);
      }
    }
  }

  const child = makeGenome(deriveSeed(genome.seed, (options.seed ?? genome.seed) >>> 0), params, genome.id);
  child.rev = genome.rev + 1;
  return child;
}

/**
 * Crossover: per-gene selection from either parent driven by one seed, so the
 * child is reproducible from `(a.seed, b.seed, seed)` alone.
 */
export function crossover(a: Genome, b: Genome, seed?: number): Genome {
  const mixedSeed = deriveSeed(deriveSeed(a.seed, b.seed), seed ?? 1);
  const rng = mulberry32(mixedSeed);
  const pick = <T>(left: T, right: T): T => (rng() < 0.5 ? left : right);

  const first = pick(a.params.layers, b.params.layers);
  const second = first === a.params.layers ? b.params.layers : a.params.layers;
  const layers = first.map((layer) => ({ ...layer }));
  for (const layer of second) {
    if (layers.length >= MAX_LAYERS) break;
    if (!layers.some((existing) => existing.kind === layer.kind)) {
      layers.push({ ...layer });
    }
  }

  const params: GenomeParams = {
    layers: layers.length > 0 ? layers : [{ kind: 'recording', weight: 1 }],
    filter: {
      lowHz: pick(a.params.filter.lowHz, b.params.filter.lowHz),
      highHz: pick(a.params.filter.highHz, b.params.filter.highHz),
      type: pick(a.params.filter.type, b.params.filter.type),
    },
    pitch: {
      rootHz: pick(a.params.pitch.rootHz, b.params.pitch.rootHz),
      offsetCents: pick(a.params.pitch.offsetCents, b.params.pitch.offsetCents),
    },
    grain: {
      scatter: pick(a.params.grain.scatter, b.params.grain.scatter),
      sizeMs: pick(a.params.grain.sizeMs, b.params.grain.sizeMs),
      rateHz: pick(a.params.grain.rateHz, b.params.grain.rateHz),
    },
    crush: {
      bits: pick(a.params.crush.bits, b.params.crush.bits),
      downsample: pick(a.params.crush.downsample, b.params.crush.downsample),
    },
    drive: {
      amount: pick(a.params.drive.amount, b.params.drive.amount),
      mix: pick(a.params.drive.mix, b.params.drive.mix),
    },
    tremolo: {
      rateHz: pick(a.params.tremolo.rateHz, b.params.tremolo.rateHz),
      depth: pick(a.params.tremolo.depth, b.params.tremolo.depth),
    },
    gainDb: pick(a.params.gainDb, b.params.gainDb),
    fadeInMs: pick(a.params.fadeInMs, b.params.fadeInMs),
    fadeOutMs: pick(a.params.fadeOutMs, b.params.fadeOutMs),
    // The safer (longer) lock wins: crossing two variants must not expose an
    // attack that one parent was protecting.
    transientLockMs: Math.max(a.params.transientLockMs, b.params.transientLockMs),
    transientLockEnabled: a.params.transientLockEnabled || b.params.transientLockEnabled,
  };

  const child = makeGenome(mixedSeed, params, a.id);
  child.rev = Math.max(a.rev, b.rev) + 1;
  return child;
}

/**
 * Multi-parent pool crossover: picks genes across an entire pool of 2+ kept variants,
 * with deterministic pseudo-random distribution driven by a seed.
 */
export function poolCrossover(pool: Genome[], seed?: number): Genome {
  if (pool.length === 0) throw new Error('Cannot crossover empty pool');
  if (pool.length === 1) return pool[0];
  if (pool.length === 2) return crossover(pool[0], pool[1], seed);

  let comboSeed = seed ?? 1;
  for (const p of pool) {
    comboSeed = deriveSeed(comboSeed, p.seed);
  }
  const rng = mulberry32(comboSeed);
  const pick = <T>(items: T[]): T => items[Math.floor(rng() * items.length)];

  // Aggregate layer genes without exceeding MAX_LAYERS
  const poolLayers = pool.map((p) => p.params.layers);
  const initialLayers = pick(poolLayers).map((l) => ({ ...l }));
  for (const other of poolLayers) {
    for (const l of other) {
      if (initialLayers.length >= MAX_LAYERS) break;
      if (!initialLayers.some((existing) => existing.kind === l.kind)) {
        initialLayers.push({ ...l });
      }
    }
  }

  const pickParam = <K extends keyof GenomeParams>(key: K): GenomeParams[K] => {
    return pick(pool.map((p) => p.params[key]));
  };

  const params: GenomeParams = {
    layers: initialLayers.length > 0 ? initialLayers : [{ kind: 'recording', weight: 1 }],
    filter: pickParam('filter'),
    pitch: pickParam('pitch'),
    grain: pickParam('grain'),
    crush: pickParam('crush'),
    drive: pickParam('drive'),
    tremolo: pickParam('tremolo'),
    gainDb: pickParam('gainDb'),
    fadeInMs: pickParam('fadeInMs'),
    fadeOutMs: pickParam('fadeOutMs'),
    transientLockMs: Math.max(...pool.map((p) => p.params.transientLockMs)),
    transientLockEnabled: pool.some((p) => p.params.transientLockEnabled),
  };

  const child = makeGenome(comboSeed, params, pool[0].id);
  child.rev = Math.max(...pool.map((p) => p.rev)) + 1;
  return child;
}

/**
 * Normalized parameter distance between two genomes in [0, 1].
 * Calculates normalized Euclidean distance across key perceptual parameters.
 */
export function genomeDistance(a: Genome, b: Genome): number {
  const norm = (val: number, range: NumericRange) =>
    (val - range.min) / (range.max - range.min);

  const pa = a.params;
  const pb = b.params;

  let sumSq = 0;
  let count = 0;

  const compare = (va: number, vb: number, range: NumericRange, weight = 1.0) => {
    const diff = (norm(va, range) - norm(vb, range)) * weight;
    sumSq += diff * diff;
    count += weight * weight;
  };

  compare(pa.filter.lowHz, pb.filter.lowHz, GENOME_SCHEMA.filter.lowHz, 1.2);
  compare(pa.filter.highHz, pb.filter.highHz, GENOME_SCHEMA.filter.highHz, 1.2);
  compare(pa.pitch.offsetCents, pb.pitch.offsetCents, GENOME_SCHEMA.pitch.offsetCents, 1.0);
  compare(pa.grain.scatter, pb.grain.scatter, GENOME_SCHEMA.grain.scatter, 0.9);
  compare(pa.crush.bits, pb.crush.bits, GENOME_SCHEMA.crush.bits, 0.8);
  compare(pa.drive.amount, pb.drive.amount, GENOME_SCHEMA.drive.amount, 0.8);
  compare(pa.tremolo.depth, pb.tremolo.depth, GENOME_SCHEMA.tremolo.depth, 0.6);
  compare(pa.fadeInMs, pb.fadeInMs, GENOME_SCHEMA.fadeInMs, 0.5);
  compare(pa.fadeOutMs, pb.fadeOutMs, GENOME_SCHEMA.fadeOutMs, 0.5);

  const aKinds = new Set(pa.layers.map((l) => l.kind));
  const bKinds = new Set(pb.layers.map((l) => l.kind));
  let layerMismatch = 0;
  aKinds.forEach((k) => {
    if (!bKinds.has(k)) layerMismatch++;
  });
  bKinds.forEach((k) => {
    if (!aKinds.has(k)) layerMismatch++;
  });
  sumSq += (layerMismatch / MAX_LAYERS) * 1.5;
  count += 1.5;

  return Math.min(1, Math.sqrt(sumSq / count));
}

const roundTo = (value: number, step: number): number => {
  const rounded = Math.round(value / step) * step;
  return Number(rounded.toFixed(step < 1 ? 3 : 1));
};

/** Stable JSON: keys in schema order, numbers rounded to their step. */
export function serializeGenome(genome: Genome): string {
  const p = clampParams(genome.params);
  const payload = {
    v: GENOME_VERSION,
    id: genome.id,
    parentId: genome.parentId,
    seed: genome.seed,
    rev: genome.rev,
    params: {
      layers: p.layers.map((layer) => ({
        kind: layer.kind,
        weight: roundTo(layer.weight, 0.01),
        ...(layer.waveform ? { waveform: layer.waveform } : {}),
        ...(layer.freqHz !== undefined ? { freqHz: roundTo(layer.freqHz, 1) } : {}),
        ...(layer.detuneCents !== undefined ? { detuneCents: roundTo(layer.detuneCents, 1) } : {}),
        ...(layer.decayS !== undefined ? { decayS: roundTo(layer.decayS, 0.01) } : {}),
        ...(layer.phaseOffset !== undefined ? { phaseOffset: roundTo(layer.phaseOffset, 0.01) } : {}),
      })),
      filter: {
        lowHz: roundTo(p.filter.lowHz, 1),
        highHz: roundTo(p.filter.highHz, 1),
        type: p.filter.type,
      },
      pitch: {
        rootHz: roundTo(p.pitch.rootHz, 0.1),
        offsetCents: roundTo(p.pitch.offsetCents, 1),
      },
      grain: {
        scatter: roundTo(p.grain.scatter, 0.01),
        sizeMs: roundTo(p.grain.sizeMs, 1),
        rateHz: roundTo(p.grain.rateHz, 0.1),
      },
      crush: { bits: roundTo(p.crush.bits, 1), downsample: roundTo(p.crush.downsample, 1) },
      drive: { amount: roundTo(p.drive.amount, 0.01), mix: roundTo(p.drive.mix, 0.01) },
      tremolo: {
        rateHz: roundTo(p.tremolo.rateHz, 0.1),
        depth: roundTo(p.tremolo.depth, 0.01),
      },
      gainDb: roundTo(p.gainDb, 0.1),
      fadeInMs: roundTo(p.fadeInMs, 1),
      fadeOutMs: roundTo(p.fadeOutMs, 1),
      transientLockMs: roundTo(p.transientLockMs, 1),
      transientLockEnabled: p.transientLockEnabled,
    },
  };
  return JSON.stringify(payload);
}

/** Parse a serialized genome; null for anything that is not ours. */
export function deserializeGenome(json: string): Genome | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.seed !== 'number' || !Number.isFinite(record.seed)) return null;
  return {
    id: typeof record.id === 'string' ? record.id : genomeId(record.seed),
    parentId: typeof record.parentId === 'string' ? record.parentId : null,
    seed: record.seed >>> 0,
    params: clampParams(record.params),
    rev: typeof record.rev === 'number' ? record.rev : 1,
  };
}

/**
 * Apply a partial edit — the deterministic side of "the assistant never touches
 * audio". Absolute values only; anything unknown or out of range is clamped or
 * dropped, and the result re-serialises.
 */
export function applyGenomeEdits(genome: Genome, edits: unknown): Genome {
  return { ...genome, params: clampParams(edits, genome.params), rev: genome.rev + 1 };
}

/**
 * JSON Schema derived from `GENOME_SCHEMA`. This is what gets handed to the
 * on-device model for grammar/schema-constrained decoding, so the model can
 * only emit parameters the engine already understands.
 */
export function genomeJsonSchema(): Record<string, unknown> {
  const leaf = (schema: LeafSchema): Record<string, unknown> =>
    isNumericRange(schema)
      ? { type: 'number', minimum: schema.min, maximum: schema.max, multipleOf: schema.step }
      : { type: 'string', enum: [...schema.__enum] };
  const group = (schema: Record<string, LeafSchema>): Record<string, unknown> => ({
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, leaf(value)])),
  });
  const layer = GENOME_SCHEMA.layers.__array;
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    properties: {
      layers: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_LAYERS,
        items: group(layer as unknown as Record<string, LeafSchema>),
      },
      filter: group(GENOME_SCHEMA.filter),
      pitch: group(GENOME_SCHEMA.pitch),
      grain: group(GENOME_SCHEMA.grain),
      crush: group(GENOME_SCHEMA.crush),
      drive: group(GENOME_SCHEMA.drive),
      tremolo: group(GENOME_SCHEMA.tremolo),
      gainDb: leaf(GENOME_SCHEMA.gainDb),
      fadeInMs: leaf(GENOME_SCHEMA.fadeInMs),
      fadeOutMs: leaf(GENOME_SCHEMA.fadeOutMs),
      transientLockMs: leaf(GENOME_SCHEMA.transientLockMs),
      transientLockEnabled: { type: 'boolean' },
    },
  };
}

/** Short human summary for the variant card. */
export function describeGenome(genome: Genome): string {
  const p = genome.params;
  const parts: string[] = [];
  parts.push(
    p.filter.type === 'lohi'
      ? `${Math.round(p.filter.lowHz)}–${Math.round(p.filter.highHz)} Hz`
      : `${p.filter.type} ${Math.round(p.filter.type === 'highpass' ? p.filter.lowHz : p.filter.highHz)} Hz`
  );
  const generated = p.layers.filter((layer) => layer.kind !== 'recording');
  if (generated.length > 0) {
    parts.push(
      generated
        .map((layer) => {
          const level = `${Math.round(layer.weight * 100)}%`;
          // Noise is unpitched by definition; printing "noise 0/noise" reads
          // like a broken frequency, not a layer.
          if (layer.kind === 'noise') return `noise @ ${level}`;
          return `${layer.kind} ${Math.round(layer.freqHz ?? 0)}${layer.waveform ? `/${layer.waveform}` : ''} @ ${level}`;
        })
        .join(' + ')
    );
  }
  if (p.pitch.offsetCents !== 0) {
    parts.push(`${p.pitch.offsetCents > 0 ? '+' : ''}${Math.round(p.pitch.offsetCents)}¢`);
  }
  if (p.grain.scatter > 0.05) parts.push(`grain ${Math.round(p.grain.scatter * 100)}%`);
  if (p.crush.bits < 16) parts.push(`${p.crush.bits}-bit`);
  if (p.drive.mix > 0.05) parts.push(`drive ${Math.round(p.drive.mix * 100)}%`);
  return parts.join(' · ');
}

/** Bytes a serialized genome occupies — a variant stays in the hundreds. */
export const genomeByteSize = (genome: Genome): number => serializeGenome(genome).length;
