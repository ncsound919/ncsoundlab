/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Per-layer parametric EQ (Phase 3.4).
 *
 * A layer carries an optional `eq: EQBand[]` array — each band is a
 * parametric biquad (peak / low-shelf / high-shelf / low-pass / high-pass /
 * notch / band-pass / all-pass). Bands are applied serially in the layer's
 * audio chain (between the existing filter cascade and the LFO matrix).
 *
 * The helper `createEqChain` returns the input and output nodes of the EQ
 * chain so the caller can splice it into the existing per-layer node graph.
 */

export type EQBandType =
  | 'peaking'
  | 'lowshelf'
  | 'highshelf'
  | 'lowpass'
  | 'highpass'
  | 'notch'
  | 'bandpass'
  | 'allpass';

export interface EQBand {
  /** Centre/edge frequency in Hz. */
  frequency: number;
  /** Gain in dB (ignored for non-shelf/peak types). */
  gainDb: number;
  /** Quality factor (resonance). 0.1..10 typical. */
  q: number;
  /** Filter shape. */
  type: EQBandType;
  /** Disable this band without removing it. */
  enabled?: boolean;
}

export const DEFAULT_EQ_BANDS: EQBand[] = [
  { type: 'highpass', frequency: 30, gainDb: 0, q: 0.7, enabled: false },
  { type: 'lowshelf', frequency: 120, gainDb: 0, q: 0.7, enabled: false },
  { type: 'peaking', frequency: 800, gainDb: 0, q: 1.0, enabled: false },
  { type: 'peaking', frequency: 3000, gainDb: 0, q: 1.0, enabled: false },
  { type: 'highshelf', frequency: 8000, gainDb: 0, q: 0.7, enabled: false },
];

export const EQ_BAND_TYPES: EQBandType[] = [
  'peaking',
  'lowshelf',
  'highshelf',
  'lowpass',
  'highpass',
  'notch',
  'bandpass',
  'allpass',
];

export interface EQChainNodes {
  /** Connect the previous stage's output to this node. */
  input: AudioNode;
  /** Connect this node's output to the next stage. */
  output: AudioNode;
  /** The underlying BiquadFilterNodes, in chain order. */
  filters: BiquadFilterNode[];
}

export interface BiquadFilterLike {
  type: BiquadFilterType;
  frequency: { value: number; setValueAtTime: (v: number, t: number) => void };
  Q: { value: number; setValueAtTime: (v: number, t: number) => void };
  gain: { value: number; setValueAtTime: (v: number, t: number) => void };
  connect: (target: AudioNode) => void;
}

export interface AudioContextLike {
  createBiquadFilter: () => BiquadFilterLike;
  currentTime: number;
}

/**
 * Build a chain of BiquadFilterNodes from a list of bands. Filters connect
 * serially; disabled bands are skipped (their `connect` is omitted so the
 * signal passes through unchanged). The returned `input` is the head of
 * the chain and `output` is its tail.
 */
export const createEqChain = (
  ctx: AudioContextLike,
  bands: EQBand[] | undefined,
  startTimeSec = 0
): EQChainNodes => {
  const filters: BiquadFilterNode[] = [];
  if (!bands || bands.length === 0) {
    return {
      input: null as unknown as AudioNode,
      output: null as unknown as AudioNode,
      filters,
    };
  }
  let head: AudioNode | null = null;
  let tail: AudioNode | null = null;
  let prev: AudioNode | null = null;
  for (const band of bands) {
    if (band.enabled === false) continue;
    const f = ctx.createBiquadFilter();
    f.type = band.type;
    f.frequency.setValueAtTime(safeNum(band.frequency, 1000), startTimeSec);
    f.Q.setValueAtTime(safeNum(band.q, 1), startTimeSec);
    f.gain.setValueAtTime(safeNum(band.gainDb, 0), startTimeSec);
    const asBiquad = f as unknown as BiquadFilterNode;
    filters.push(asBiquad);
    if (prev) prev.connect(asBiquad);
    prev = asBiquad;
    if (!head) head = asBiquad;
    tail = asBiquad;
  }
  return {
    input: head as unknown as AudioNode,
    output: tail as unknown as AudioNode,
    filters,
  };
};

/**
 * Update the parameters of an existing chain (e.g. when the user moves a
 * slider). `chain` must be a chain previously produced by `createEqChain`
 * using the same `ctx`.
 */
export const updateEqChain = (
  chain: EQChainNodes,
  bands: EQBand[] | undefined,
  timeSec: number
): void => {
  if (!bands) return;
  let i = 0;
  for (const band of bands) {
    if (band.enabled === false) continue;
    const f = chain.filters[i];
    if (!f) break;
    f.frequency.setValueAtTime(safeNum(band.frequency, 1000), timeSec);
    f.Q.setValueAtTime(safeNum(band.q, 1), timeSec);
    f.gain.setValueAtTime(safeNum(band.gainDb, 0), timeSec);
    i++;
  }
};

const safeNum = (v: unknown, fallback: number): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return v;
};

/**
 * Estimate the magnitude response (in dB) of a band at the given frequency.
 * Used by the EQ UI to draw the response curve. Mirrors the Web Audio
 * cookbook formula for the 5 canonical biquad types.
 */
export const eqBandResponseDb = (band: EQBand, freq: number): number => {
  if (band.enabled === false) return 0;
  const f = band.frequency;
  const g = band.gainDb;
  const q = Math.max(0.0001, band.q);
  switch (band.type) {
    case 'peaking': {
      // Approximation of RBJ peaking biquad magnitude.
      const A = Math.pow(10, g / 40);
      const f0 = f;
      const octaves = Math.log2(freq / f0);
      return g / (1 + Math.pow(2 * octaves * q, 2));
    }
    case 'lowshelf': {
      // Approximate shelf: full gain below freq, 0 above.
      return freq <= f ? g : 0;
    }
    case 'highshelf': {
      return freq >= f ? g : 0;
    }
    case 'lowpass':
      return freq <= f ? 0 : -24;
    case 'highpass':
      return freq >= f ? 0 : -24;
    case 'notch':
      return Math.abs(Math.log2(freq / f)) < 1 / q ? -24 : 0;
    case 'bandpass':
      return Math.abs(Math.log2(freq / f)) < 1 / q ? 0 : -24;
    case 'allpass':
      return 0;
    default:
      return 0;
  }
};
