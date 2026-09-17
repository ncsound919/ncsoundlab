/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Per-screen controller remapping.
 *
 * The same physical pads/knobs/faders do the visible screen's job: on the Mixer
 * they ride channel gains/pans, on Synth & FX they shape the selected layer, in
 * 3D Space they place it in the room, and so on. This is what makes the MPD the
 * centrepiece: its on-screen labels are always the *resolved* action for the
 * current screen, not the raw profile binding.
 *
 * Rules, kept deliberately narrow so the rig stays predictable:
 * - Only `beat` mode is remapped. Sampler/Recourse profiles are fixed-purpose;
 *   auto-remapping their controls would break the job those modes exist for.
 * - Only Control Bank 1 (`knob:0:*` / `fader:0:*` / `switch:0:*`) and Pad Bank A
 *   (`pad:0:*`) are remapped — the hardware-verified bank. Banks 2–3 and pad
 *   banks B–D keep their profile behavior.
 * - A disabled binding is never remapped (the user's mute wins).
 * - The override carries its own min/max/curve: the binding's range belongs to
 *   the profile action (e.g. filter cutoff), not to the screen job (e.g. pan),
 *   so reusing it would silently mis-scale the parameter.
 */

import type { ControllerBinding } from './types';
import type { TabType } from '../workflowStages';

/** Workspace screens the controller can follow (mirrors App's TabType). */
export type ControllerSection = TabType;

export const DEFAULT_SECTION: ControllerSection = 'produce';

export interface SectionOverride {
  action: string;
  min: number;
  max: number;
  curve?: 'linear' | 'log';
  /** Short human label for the on-screen readout ("Ch 1 gain"). */
  label: string;
}

const range = (label: string, action: string, min: number, max: number, curve?: 'log'): SectionOverride =>
  ({ label, action, min, max, curve });

/** Pad-bank-A actions, indexed by pad. */
const padOverrides = (make: (i: number) => SectionOverride): Record<string, SectionOverride> => {
  const out: Record<string, SectionOverride> = {};
  for (let i = 0; i < 16; i++) out[`pad:0:${i}`] = make(i);
  return out;
};

const layerPad = (i: number): SectionOverride => ({
  action: `section:pad:layer:${i}`,
  min: 0,
  max: 1,
  label: `Layer ${i + 1}`,
});

/** Sound Design — samples + synth of the selected layer. */
const DESIGN_OVERRIDES: Record<string, SectionOverride> = {
  'knob:0:0': range('Cutoff', 'section:layer:filterFreq', 200, 18000, 'log'),
  'knob:0:1': range('Resonance', 'section:layer:filterRes', 0.1, 20),
  'knob:0:2': range('Attack', 'section:layer:attack', 0.001, 2),
  'knob:0:3': range('Release', 'section:layer:release', 0.01, 5),
  'fader:0:0': range('Layer gain', 'section:layer:gain', 0, 1.5),
  'fader:0:1': range('Layer pan', 'section:layer:pan', -1, 1),
  'fader:0:2': range('Layer pitch', 'section:layer:pitch', -24, 24),
  'fader:0:3': range('Reverb', 'section:layer:reverbMix', 0, 1),
  ...padOverrides(layerPad),
};

const MIXER_OVERRIDES: Record<string, SectionOverride> = {};
for (let i = 0; i < 4; i++) {
  MIXER_OVERRIDES[`fader:0:${i}`] = range(`Ch ${i + 1} gain`, `section:channel:gain:${i}`, 0, 1.5);
  MIXER_OVERRIDES[`knob:0:${i}`] = range(`Ch ${i + 1} pan`, `section:channel:pan:${i}`, -1, 1);
}
Object.assign(
  MIXER_OVERRIDES,
  padOverrides((i) => ({ action: `section:pad:mute:${i}`, min: 0, max: 1, label: `Ch ${i + 1} mute` }))
);

const SPATIAL_OVERRIDES: Record<string, SectionOverride> = {
  'knob:0:0': range('Room L/R', 'section:layer:pan', -1, 1),
  'knob:0:1': range('Room depth', 'section:layer:gain', 0, 1.5),
  'knob:0:2': range('Room size', 'section:layer:reverbMix', 0, 1),
  'knob:0:3': range('Distance air', 'section:layer:filterFreq', 200, 18000, 'log'),
  'fader:0:0': range('Ch 1 gain', 'section:channel:gain:0', 0, 1.5),
  'fader:0:1': range('Ch 2 gain', 'section:channel:gain:1', 0, 1.5),
  'fader:0:2': range('Ch 3 gain', 'section:channel:gain:2', 0, 1.5),
  'fader:0:3': range('Ch 4 gain', 'section:channel:gain:3', 0, 1.5),
  ...padOverrides(layerPad),
};

/**
 * Compare Engine: knobs ride the reference parameters, faders act as live
 * A/B + toggle switches (level-based; ≥ half = engaged), pads pick the track.
 */
const COMPARE_OVERRIDES: Record<string, SectionOverride> = {
  'knob:0:0': range('Ref gain', 'section:compare:refGain', -18, 18),
  'knob:0:1': range('Loop start', 'section:compare:loopStart', 0, 60),
  'knob:0:2': range('Loop end', 'section:compare:loopEnd', 0, 60),
  'knob:0:3': range('Ref track', 'section:compare:track', 0, 15),
  'fader:0:0': range('Source A/B', 'section:compare:source', 0, 1),
  'fader:0:1': range('Loop', 'section:compare:loop', 0, 1),
  'fader:0:2': range('Level match', 'section:compare:levelMatch', 0, 1),
  'fader:0:3': range('Loop sync', 'section:compare:loopSync', 0, 1),
  ...padOverrides((i) => ({ action: `section:pad:track:${i}`, min: 0, max: 1, label: `Ref ${i + 1}` })),
};

/**
 * Evolution Engine: knobs pick the generation (mode / FX / variation) and fire
 * a new generation; faders preview, add, save and discard the selected
 * variation. Pads jump to a variation. Toggles are level-based (≥ half = on).
 */
const EVOLUTION_OVERRIDES: Record<string, SectionOverride> = {
  'knob:0:0': range('Mode', 'section:evolution:mode', 0, 2),
  'knob:0:1': range('FX mode', 'section:evolution:fx', 0, 2),
  'knob:0:2': range('Variation', 'section:evolution:variation', 0, 15),
  'knob:0:3': range('Evolve', 'section:evolution:reEvolve', 0, 1),
  'fader:0:0': range('Preview', 'section:evolution:play', 0, 1),
  'fader:0:1': range('Add to layer', 'section:evolution:add', 0, 1),
  'fader:0:2': range('Save to kit', 'section:evolution:save', 0, 1),
  'fader:0:3': range('Discard', 'section:evolution:discard', 0, 1),
  ...padOverrides((i) => ({ action: `section:pad:variation:${i}`, min: 0, max: 1, label: `Var ${i + 1}` })),
};

const OVERRIDES: Record<string, Record<string, SectionOverride>> = {
  soundlab: DESIGN_OVERRIDES,
  tweaking: DESIGN_OVERRIDES,
  mixer: MIXER_OVERRIDES,
  spatial: SPATIAL_OVERRIDES,
  compare: COMPARE_OVERRIDES,
  evolution: EVOLUTION_OVERRIDES,
};

/** The override for a (screen, control), or null when the profile rules. */
export function sectionOverrideFor(section: string, controlKey: string): SectionOverride | null {
  return OVERRIDES[section]?.[controlKey] ?? null;
}

export interface SectionBindingInput {
  /** Active controller mode — only 'beat' is ever remapped. */
  mode: string;
  section: string;
  controlKey: string;
  binding: ControllerBinding;
}

/**
 * Resolve the effective binding for an incoming message. Returns a binding
 * with the section action + range when the remap applies, otherwise null
 * (the caller keeps the profile binding). Pure and unit-tested.
 */
export function resolveSectionBinding(input: SectionBindingInput): ControllerBinding | null {
  const { mode, section, controlKey, binding } = input;
  if (mode !== 'beat') return null;
  if (!binding.enabled) return null;
  if (!(section in OVERRIDES)) return null;
  const override = sectionOverrideFor(section, controlKey);
  if (!override) return null;
  return {
    ...binding,
    action: override.action,
    min: override.min,
    max: override.max,
    curve: override.curve ?? 'linear',
  };
}

/** One-line summary of what the 8 continuous controls currently drive. */
export function sectionRoleSummary(section: string): string {
  switch (section) {
    case 'soundlab':
    case 'tweaking':
      return 'K → cutoff · reso · attack · release · F → gain · pan · pitch · verb';
    case 'mixer':
      return 'F1–4 → ch 1–4 gain · K1–4 → ch 1–4 pan · pads → mute';
    case 'spatial':
      return 'K → L/R · depth · room · air · F1–4 → ch gain · pads → select layer';
    case 'compare':
      return 'K → ref gain · loop start/end · track · F → A/B · loop · match · sync';
    case 'evolution':
      return 'K → mode · FX · variation · evolve · F → preview · add · save · discard';
    default:
      return 'Profile bindings';
  }
}

/** Short screen name for the readout. */
export function sectionDisplayName(section: string): string {
  switch (section) {
    case 'soundlab':
      return 'Layering';
    case 'tweaking':
      return 'Synth & FX';
    case 'produce':
      return 'Beat Studio';
    case 'mixer':
      return 'Mixer';
    case 'spatial':
      return '3D Space';
    case 'compare':
      return 'Compare';
    case 'evolution':
      return 'Evolution';
    case 'kitcreator':
      return 'Kit Creator';
    case 'catalog':
      return 'Catalog';
    default:
      return section;
  }
}
