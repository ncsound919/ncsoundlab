/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Bridges the Hex Combinator's sound-design vocabulary to the shared
 * `nc.studio-fx-catalog.v1` contract used by NC Studio, NC Phone Beat and the
 * web rack.
 *
 * The Combinator's presets are written the way a producer thinks —
 * `cutoff`, `threshold`, `attack`, `mix: 70`, `decay: 2.5` — while the shared
 * catalog is the machine contract — `lpHz`, `thresholdDb`, `attackUs`,
 * `mix` in 0..1, `decaySec`. `StudioFxChainProcessor.setChain` sanitises
 * against the catalog, so without this bridge every unknown key is silently
 * dropped and every out-of-range value is clamped: a wobble preset would run
 * at the catalog default (an open filter) and do nothing at all.
 *
 * Two rules, applied in order:
 *  1. Resolve each incoming key to a catalog key — exact match first, then the
 *     per-kind alias table, then a unit suffix probe (Db/Ms/Hz/Sec).
 *  2. Normalise the value into the catalog range. A value above the range but
 *     within 0..100 is read as a percentage of that range (`mix: 70` → 0.7,
 *     `depth: 50` → ~6 ms, `ratio: 100` → the 20:1 ceiling), anything else is
 *     clamped.
 *
 * Everything then goes through the shared `sanitizeParams`, so the catalog
 * stays the single authority for ranges and choice snapping.
 */
import { kindSpec, paramSpec, sanitizeParams, type FxParamSpec } from '../studioFx/catalog';

type AliasTable = Record<string, string>;

/**
 * Keys that do not match a catalog key and cannot be recovered by a unit
 * suffix. Only lists aliases that exist for the kind it is attached to, plus
 * the shared `*` fallbacks used across the catalog.
 */
const ALIASES: Record<string, AliasTable> = {
  '*': {
    cutoff: 'lpHz',
    predelay: 'preDelayMs',
    sideGain: 'sideAirDb',
  },
  FET_1176: { attack: 'attackUs' },
  SSL_CHANNEL_EQ: { low: 'lfDb', mid: 'lmfDb', high: 'hfDb' },
  NEVE_1073: { low: 'lfDb', mid: 'midDb', high: 'hfDb' },
  PULTEC_EQP1A: { low: 'lowBoostDb', high: 'highBoostDb' },
  VCA_BUS_COMP: { attack: 'attackMs' },
  OPTO_LA2A: { gain: 'gainDb' },
};

const UNIT_SUFFIXES = ['Db', 'Ms', 'Hz', 'Sec'];

function catalogHas(kind: string, key: string): boolean {
  return paramSpec(kind, key) !== undefined;
}

/** Catalog key for a Combinator key, or null when the module has no such control. */
export function resolveParamKey(kind: string, key: string): string | null {
  if (!kindSpec(kind)) return null;
  if (catalogHas(kind, key)) return key;
  const alias = ALIASES[kind]?.[key] ?? ALIASES['*']?.[key];
  if (alias && catalogHas(kind, alias)) return alias;
  for (const suffix of UNIT_SUFFIXES) {
    if (catalogHas(kind, key + suffix)) return key + suffix;
  }
  return null;
}

/** Reads an out-of-range value as a share of the control's span, else clamps. */
function normalize(spec: FxParamSpec, value: number): number {
  if (!Number.isFinite(value)) return spec.default;
  if (value >= spec.min && value <= spec.max) return value;
  if (value > spec.max && value <= 100) {
    const span = spec.max - spec.min;
    const scaled = spec.min + (value / 100) * span;
    if (scaled >= spec.min && scaled <= spec.max) return scaled;
  }
  return Math.min(spec.max, Math.max(spec.min, value));
}

/**
 * Converts one slot's Combinator params into catalog params. Unknown keys are
 * dropped, values are range-normalised, and the result is sanitised by the
 * shared catalog. Returns `{}` for a module the shared suite does not have.
 */
export function toSharedParams(kind: string, params: Record<string, number> | undefined): Record<string, number> {
  const spec = kindSpec(kind);
  if (!spec || !params) return {};
  const out: Record<string, number> = {};
  for (const rawKey of Object.keys(params)) {
    const value = params[rawKey];
    if (typeof value !== 'number') continue;
    let key = resolveParamKey(kind, rawKey);
    if (!key) continue;
    let mapped = value;
    // Pultec: a negative "high/low" is an attenuation, not a negative boost.
    if (kind === 'PULTEC_EQP1A' && value < 0) {
      if (rawKey === 'high') key = 'highAttenDb';
      else if (rawKey === 'low') key = 'lowAttenDb';
      mapped = -value;
    }
    const target = paramSpec(kind, key);
    if (!target) continue;
    out[key] = normalize(target, mapped);
  }
  // The tempo delay only reads `timeMs` on the free/slapback division; a
  // preset that names a time is asking for that free time, not a grid note.
  if (kind === 'TEMPO_DELAY' && out.timeMs !== undefined && params.division === undefined) {
    out.division = 6;
  }
  return sanitizeParams(kind, out);
}
