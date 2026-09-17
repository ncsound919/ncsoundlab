/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Typed action registry (Phase 2.1).
 *
 * The MIDI controller catalog (`src/lib/controller/actions.ts`) is the app's
 * vocabulary of actions. It is string-keyed, but carries no parameter metadata:
 * every action is driven by a single mapped 0..1 / 0..127 value. That is fine
 * for a knob, and useless for a programmatic caller that needs to know *what*
 * a "tempo:bpm" action accepts, in what units, and within what range.
 *
 * This module adds that missing machine-readable layer: per-action parameter
 * specs (type, range, unit, enum options), canonical control ranges, and
 * pure validation/clamping helpers. A natural-language command layer, a
 * controller-profile editor, or a script can discover and validate actions
 * without hard-coding ranges.
 *
 * Nothing here executes anything. Execution stays with `dispatchAction`
 * (controller surface) and the app's own store calls. This module is pure
 * data + pure functions, which keeps it trivially unit-testable.
 *
 * Action ids not already present in the MIDI catalog (e.g. `pattern:toggleCell`,
 * `mix:setBus`) are declared here with explicit flags — they exist for
 * programmatic callers, not for MIDI learn.
 */

import { ACTION_DEFS, describeAction, type ActionGroup } from '../controller/actions';
import type { ModuleType } from '../../types';
import { BPM_MAX, BPM_MIN, SWING_MAX_PERCENT } from '../controlRanges';

export type ParamValue = number | string | boolean;
export type ParamType = 'number' | 'enum' | 'boolean' | 'string';

export interface ParamSpec {
  name: string;
  type: ParamType;
  /** Inclusive bounds for `number` params. */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Allowed values for `enum` params. */
  options?: readonly string[];
  label?: string;
}

export interface ActionSpec {
  id: string;
  label: string;
  group: ActionGroup;
  params: readonly ParamSpec[];
  /** True when the action changes what you hear. */
  mutatesAudio: boolean;
  /** True when the change lands in the undo snapshot (see §14 / Phase 2.2). */
  undoable: boolean;
}

/** Canonical control ranges — the single source of truth for programmatic callers. */
export const RANGE = {
  bpm: { min: BPM_MIN, max: BPM_MAX, step: 1, unit: 'BPM' },
  swingPercent: { min: 0, max: SWING_MAX_PERCENT, step: 1, unit: '%' },
  unit: { min: 0, max: 1, step: 0.01 },
  pan: { min: -1, max: 1, step: 0.01 },
  semitones: { min: -24, max: 24, step: 1, unit: 'st' },
  velocity: { min: 1, max: 127, step: 1 },
  step: { min: 0, max: 31, step: 1 },
  busGain: { min: 0, max: 2, step: 0.01 },
} as const;

export const PATTERN_IDS = ['A', 'B', 'C', 'D'] as const;
export const BANK_IDS = ['A', 'B', 'C', 'D'] as const;
export const BUS_IDS = ['reverb', 'delay'] as const;
export const MODULE_TYPES: readonly ModuleType[] = [
  'eq', 'compressor', 'limiter', 'clipper', 'saturator', 'tape', 'exciter',
  'delay', 'reverb', 'chorus', 'flanger', 'phaser', 'tremolo', 'imager',
];

const num = (
  name: string,
  r: { min: number; max: number; step?: number; unit?: string },
  label?: string
): ParamSpec => ({ name, type: 'number', min: r.min, max: r.max, step: r.step, unit: r.unit, label });

const enumP = (name: string, options: readonly string[], label?: string): ParamSpec => ({
  name, type: 'enum', options, label,
});

const bool = (name: string, label?: string): ParamSpec => ({ name, type: 'boolean', label });

const str = (name: string, label?: string): ParamSpec => ({ name, type: 'string', label });

const AMOUNT: readonly ParamSpec[] = [num('amount', RANGE.unit, 'Amount')];

/** Parameter specs for actions that already exist in the MIDI catalog. */
export const ACTION_PARAM_SPECS: Record<string, readonly ParamSpec[]> = {
  'tempo:bpm': [num('bpm', RANGE.bpm, 'Tempo')],
  'tempo:swing': [num('percent', RANGE.swingPercent, 'Swing')],

  'mix:master': [num('level', RANGE.unit, 'Master level')],
  'mix:layerGain': [num('gain', RANGE.unit, 'Layer gain')],
  'mix:layerPan': [num('pan', RANGE.pan, 'Layer pan')],
  'mix:layerSendReverb': [num('level', RANGE.unit, 'Reverb send')],
  'mix:layerSendDelay': [num('level', RANGE.unit, 'Delay send')],

  'layer:tune': [num('semitones', RANGE.semitones, 'Tune')],

  'fx:filterFreq': [num('hz', { min: 20, max: 20000, step: 1, unit: 'Hz' }, 'Cutoff')],
  'fx:filterRes': [num('q', { min: 0, max: 20, step: 0.1, unit: 'Q' }, 'Resonance')],
  'fx:distortion': AMOUNT,
  'fx:bitcrush': AMOUNT,
  'fx:reverbMix': AMOUNT,
  'fx:chorusMix': AMOUNT,
  'fx:delayFeedback': AMOUNT,
  'fx:lfoRate': [num('hz', { min: 0.01, max: 20, step: 0.01, unit: 'Hz' }, 'LFO rate')],
  'fx:lfoDepth': AMOUNT,

  'chord:param:octave': [num('octave', { min: 1, max: 6, step: 1 })],
  'chord:param:inversion': [num('inversion', { min: 0, max: 3, step: 1 })],
  'chord:param:strumMs': [num('ms', { min: 0, max: 120, step: 1, unit: 'ms' }, 'Strum')],
  'chord:param:spread': [num('spread', { min: 0, max: 1, step: 0.01 })],
  'chord:param:rootPc': [num('pitchClass', { min: 0, max: 11, step: 1 }, 'Key (pitch class)')],
  'chord:param:scaleIndex': [num('index', { min: 0, max: 8, step: 1 }, 'Scale index')],
  'chord:param:qualityIndex': [num('index', { min: 0, max: 1, step: 1 }, '7ths toggle')],
};

/** Actions available to programmatic callers that are absent from the MIDI catalog. */
export const NEW_ACTION_SPECS: readonly ActionSpec[] = [
  {
    id: 'pattern:toggleCell',
    label: 'Pattern · toggle step',
    group: 'Pattern',
    params: [enumP('patternId', PATTERN_IDS, 'Pattern'), str('layerId', 'Layer'), num('step', RANGE.step, 'Step')],
    mutatesAudio: true,
    undoable: true,
  },
  {
    id: 'pattern:setVelocity',
    label: 'Pattern · set step velocity',
    group: 'Pattern',
    params: [
      enumP('patternId', PATTERN_IDS, 'Pattern'),
      str('layerId', 'Layer'),
      num('step', RANGE.step, 'Step'),
      num('velocity', RANGE.velocity, 'Velocity'),
    ],
    mutatesAudio: true,
    undoable: true,
  },
  {
    id: 'pattern:setStepLength',
    label: 'Pattern · set step length',
    group: 'Pattern',
    params: [enumP('length', ['16', '32'], 'Steps per pattern')],
    mutatesAudio: true,
    undoable: true,
  },
  {
    id: 'pattern:clearRow',
    label: 'Pattern · clear layer row',
    group: 'Pattern',
    params: [enumP('patternId', PATTERN_IDS, 'Pattern'), str('layerId', 'Layer (omit to clear all rows)')],
    mutatesAudio: true,
    undoable: true,
  },
  {
    id: 'mix:setBus',
    label: 'Mix · configure FX bus',
    group: 'Mix',
    params: [
      enumP('busId', BUS_IDS, 'Bus'),
      num('gain', RANGE.busGain, 'Return gain'),
      num('pan', RANGE.pan, 'Pan'),
      bool('enabled', 'Enabled'),
    ],
    mutatesAudio: true,
    undoable: true,
  },
  {
    id: 'mix:setLayerSend',
    label: 'Mix · set layer send level',
    group: 'Mix',
    params: [str('layerId', 'Layer'), enumP('busId', BUS_IDS, 'Bus'), num('level', RANGE.unit, 'Send level')],
    mutatesAudio: true,
    undoable: true,
  },
  {
    id: 'layer:setGain',
    label: 'Layer · set gain',
    group: 'Layer',
    params: [str('layerId', 'Layer'), num('gain', RANGE.unit, 'Gain')],
    mutatesAudio: true,
    undoable: true,
  },
  {
    id: 'layer:setPan',
    label: 'Layer · set pan',
    group: 'Layer',
    params: [str('layerId', 'Layer'), num('pan', RANGE.pan, 'Pan')],
    mutatesAudio: true,
    undoable: true,
  },
  {
    id: 'layer:setMute',
    label: 'Layer · set mute',
    group: 'Layer',
    params: [str('layerId', 'Layer'), bool('muted', 'Muted')],
    mutatesAudio: true,
    undoable: true,
  },
  {
    id: 'layer:setSolo',
    label: 'Layer · set solo',
    group: 'Layer',
    params: [str('layerId', 'Layer'), bool('soloed', 'Soloed')],
    mutatesAudio: true,
    undoable: true,
  },
  {
    id: 'master:setDynamics',
    label: 'Master · compressor / limiter',
    group: 'Mix',
    params: [
      num('thresholdDb', { min: -60, max: 0, step: 0.1, unit: 'dB' }, 'Threshold'),
      num('ratio', { min: 1, max: 20, step: 0.1 }, 'Ratio'),
      num('attackSec', { min: 0, max: 0.5, step: 0.001, unit: 's' }, 'Attack'),
      num('releaseSec', { min: 0.01, max: 2, step: 0.01, unit: 's' }, 'Release'),
      num('makeupDb', { min: -12, max: 24, step: 0.1, unit: 'dB' }, 'Makeup'),
      bool('enabled', 'Enabled'),
    ],
    mutatesAudio: true,
    undoable: true,
  },
  {
    id: 'rack:addModule',
    label: 'Rack · add module',
    group: 'Sound Design',
    params: [enumP('type', MODULE_TYPES, 'Module type')],
    mutatesAudio: true,
    undoable: true,
  },
  {
    id: 'rack:setModuleEnabled',
    label: 'Rack · enable/disable module',
    group: 'Sound Design',
    params: [str('moduleId', 'Module'), bool('enabled', 'Enabled')],
    mutatesAudio: true,
    undoable: true,
  },
  {
    id: 'rack:removeModule',
    label: 'Rack · remove module',
    group: 'Sound Design',
    params: [str('moduleId', 'Module')],
    mutatesAudio: true,
    undoable: true,
  },
];

/**
 * Groups whose actions change what you hear. Used as the coarse default for
 * `mutatesAudio`; per-action overrides belong in the explicit spec tables.
 */
const MUTATING_GROUPS: ReadonlySet<ActionGroup> = new Set<ActionGroup>([
  'Pads', 'Chord Pads', 'Transport', 'Tempo', 'Mix', 'Layer',
  'Sound Design', 'Synth', 'Pattern', 'Groove', 'Sampler', 'Recourse',
]);

/**
 * Groups whose changes are captured by the undo snapshot after Phase 2.2
 * (layers, patterns, programs, activeBank, master level/rack, tempo, swing,
 * arrangement, buses, layer sends, master dynamics). Deliberately conservative:
 * bridge/selection surfaces (Sampler, Recourse, Transport, Compare) are omitted
 * because they are not snapshot-covered. Update this when coverage changes.
 */
const UNDOABLE_GROUPS: ReadonlySet<ActionGroup> = new Set<ActionGroup>([
  'Banks', 'Tempo', 'Mix', 'Layer', 'Sound Design', 'Synth', 'Pattern', 'Groove',
]);

const EXPLICIT_BY_ID: ReadonlyMap<string, ActionSpec> = new Map(
  NEW_ACTION_SPECS.map((s) => [s.id, s])
);

const GENERIC_CONTINUOUS: readonly ParamSpec[] = [num('value', RANGE.unit)];

/** Resolve the full typed spec for any action id (catalog or generated). */
export function specForAction(id: string): ActionSpec {
  const explicit = EXPLICIT_BY_ID.get(id);
  if (explicit) return explicit;

  const def = describeAction(id);
  const params = ACTION_PARAM_SPECS[id] ?? (def.continuous ? GENERIC_CONTINUOUS : []);
  return {
    id,
    label: def.label,
    group: def.group,
    params,
    mutatesAudio: MUTATING_GROUPS.has(def.group),
    undoable: UNDOABLE_GROUPS.has(def.group),
  };
}

/** Every statically-known action spec (generated ids like `pad:A:0` excluded). */
export function allActionSpecs(): ActionSpec[] {
  const ids = new Set<string>([
    ...ACTION_DEFS.map((d) => d.id),
    ...NEW_ACTION_SPECS.map((s) => s.id),
  ]);
  return [...ids].map(specForAction);
}

/** Clamp/coerce a single value against a param spec. Never throws. */
export function clampParam(spec: ParamSpec, value: ParamValue): ParamValue {
  if (spec.type === 'number') {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return spec.min ?? 0;
    let v = n;
    if (spec.min !== undefined) v = Math.max(spec.min, v);
    if (spec.max !== undefined) v = Math.min(spec.max, v);
    return v;
  }
  if (spec.type === 'boolean') {
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1' || value === 1;
  }
  return String(value);
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** Safe values (clamped/coerced) for callers that proceed despite errors. */
  normalized: Record<string, ParamValue>;
}

/**
 * Validate a caller's arguments against an action's spec.
 *
 * This is the anti-hallucination primitive: a model may only emit an action id
 * that resolves, and only pass parameters that exist, type-check, and fall
 * inside the declared range. Out-of-range numbers are reported as errors AND
 * returned clamped, so a caller cannot silently drive a value out of bounds.
 */
export function validateActionArgs(
  id: string,
  args: Record<string, unknown> = {}
): ValidationResult {
  const spec = specForAction(id);
  const errors: string[] = [];
  const normalized: Record<string, ParamValue> = {};
  const known = new Set(spec.params.map((p) => p.name));

  for (const key of Object.keys(args)) {
    if (!known.has(key)) errors.push(`unknown parameter "${key}" for action "${id}"`);
  }

  for (const p of spec.params) {
    if (!(p.name in args)) {
      errors.push(`missing required parameter "${p.name}" for action "${id}"`);
      continue;
    }
    const raw = args[p.name];

    if (p.type === 'number') {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) {
        errors.push(`parameter "${p.name}" must be a finite number`);
        continue;
      }
      if (p.min !== undefined && n < p.min) {
        errors.push(`parameter "${p.name}" (${n}) is below minimum ${p.min}`);
      }
      if (p.max !== undefined && n > p.max) {
        errors.push(`parameter "${p.name}" (${n}) is above maximum ${p.max}`);
      }
      normalized[p.name] = clampParam(p, n);
      continue;
    }

    if (p.type === 'boolean') {
      if (typeof raw !== 'boolean') {
        errors.push(`parameter "${p.name}" must be a boolean`);
        continue;
      }
      normalized[p.name] = raw;
      continue;
    }

    const s = String(raw);
    if (p.type === 'enum') {
      if (!p.options?.includes(s)) {
        errors.push(`parameter "${p.name}" must be one of: ${(p.options ?? []).join(', ')}`);
        continue;
      }
    }
    normalized[p.name] = s;
  }

  return { ok: errors.length === 0, errors, normalized };
}
