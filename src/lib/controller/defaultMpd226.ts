/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Default MPD226 profile.
 *
 * IMPORTANT / HONEST: the MPD226 is fully re-assignable with the Akai MPD226
 * Editor, and factory presets ship with different CC numbers depending on the
 * preset and firmware. The numbers below are the common MPC/MPD "starting
 * point" layout, NOT a guarantee for your unit. The visual panel has a per
 * control **Learn** button — wiggle the knob and the binding locks to whatever
 * your MPD226 actually sends. Learn is the reliable path; these defaults just
 * give you a working rig immediately on the most common preset.
 *
 * Pad note numbers *are* stable: pad bank A = notes 36–51, B = 52–67,
 * C = 68–83, D = 84–99 (the MPC convention, 16 per bank).
 */

import { CHORD_PARAM_RANGE, type ChordParamName } from './actions';
import { controlKey, padNoteFor, parseControlKey, PAD_BANK_PAGES, CONTROL_BANK_PAGES, CONTROLS_PER_BANK } from './mapping';
import type { ControllerBinding, ControllerProfile } from './types';

export const KNOB_LABELS = ['K1', 'K2', 'K3', 'K4'] as const;
export const FADER_LABELS = ['F1', 'F2', 'F3', 'F4'] as const;
export const SWITCH_LABELS = ['S1', 'S2', 'S3', 'S4'] as const;

export const PAD_BANK_LABELS = ['Pad Bank A', 'Pad Bank B', 'Pad Bank C', 'Pad Bank D'] as const;
export const CONTROL_BANK_LABELS = ['Ctrl Bank 1', 'Ctrl Bank 2', 'Ctrl Bank 3'] as const;

export { PAD_BANK_PAGES, CONTROL_BANK_PAGES, CONTROLS_PER_BANK };

interface ContinuousSpec {
  action: string;
  min: number;
  max: number;
  curve?: 'linear' | 'log';
}

interface TriggerSpec {
  action: string;
}

const cc = (number: number, action: string, opts: Partial<ControllerBinding> = {}): ControllerBinding => ({
  enabled: true,
  messageType: 'cc',
  number,
  channel: null,
  action,
  ...opts,
});

const continuous = (number: number, spec: ContinuousSpec): ControllerBinding =>
  cc(number, spec.action, { min: spec.min, max: spec.max, curve: spec.curve });

const trigger = (number: number, spec: TriggerSpec): ControllerBinding => cc(number, spec.action);

const chordParam = (number: number, param: ChordParamName): ControllerBinding => {
  const [min, max] = CHORD_PARAM_RANGE[param];
  return cc(number, `chord:param:${param}`, { min, max });
};

/**
 * Control-bank CC assignments, MEASURED from an MPD226 running preset #15
 * ("Soundlab"):
 *   - Control Bank 1 knobs:  3, 9, 14, 15
 *   - Control Bank 1 faders: 20, 21, 22, 23
 *   - Control Bank 1 switches: send no MIDI in this preset → disabled below
 * Banks 2 and 3 are unverified, so their bindings ship disabled — use Learn if
 * you switch control banks. The numbers are placeholders that never collide
 * with bank 1.
 */
const KNOB_CC: number[][] = [
  [3, 9, 14, 15],
  [16, 17, 18, 19],
  [24, 25, 26, 27],
];
const FADER_CC: number[][] = [
  [20, 21, 22, 23],
  [28, 29, 30, 31],
  [32, 33, 34, 35],
];
const SWITCH_CC: number[][] = [
  [36, 37, 38, 39],
  [40, 41, 42, 43],
  [44, 45, 46, 47],
];

/** Knob assignments per control bank — sound design, then more synth, then chord. */
const KNOB_ACTIONS: ContinuousSpec[][] = [
  [
    { action: 'fx:filterFreq', min: 200, max: 18000, curve: 'log' },
    { action: 'fx:filterRes', min: 0.1, max: 20 },
    { action: 'fx:distortion', min: 0, max: 100 },
    { action: 'fx:reverbMix', min: 0, max: 1 },
  ],
  [
    { action: 'synth:fmDepth', min: 0, max: 10 },
    { action: 'synth:wavefold', min: 0, max: 1 },
    { action: 'fx:bitcrush', min: 0, max: 100 },
    { action: 'synth:unisonDetune', min: 0, max: 50 },
  ],
  [
    { action: 'chord:param:inversion', min: 0, max: 3 },
    { action: 'chord:param:spread', min: 0, max: 1 },
    { action: 'chord:param:octave', min: 1, max: 6 },
    { action: 'chord:param:strumMs', min: 0, max: 120 },
  ],
];

/** Fader assignments per control bank — master/mix, sends, then chord/key. */
const FADER_ACTIONS: ContinuousSpec[][] = [
  [
    { action: 'mix:master', min: 0, max: 1.5 },
    { action: 'mix:layerGain', min: 0, max: 1.5 },
    { action: 'mix:layerPan', min: -1, max: 1 },
    { action: 'tempo:bpm', min: 60, max: 200 },
  ],
  [
    { action: 'mix:layerSendReverb', min: 0, max: 1 },
    { action: 'mix:layerSendDelay', min: 0, max: 1 },
    { action: 'tempo:swing', min: 0, max: 75 },
    { action: 'layer:tune', min: -24, max: 24 },
  ],
  [
    { action: 'chord:param:rootPc', min: 0, max: 11 },
    { action: 'chord:param:scaleIndex', min: 0, max: 8 },
    { action: 'chord:param:qualityIndex', min: 0, max: 1 },
    { action: 'chord:param:spread', min: 0, max: 1 },
  ],
];

/** Switch assignments per control bank — transport/pattern, pad edits, banks. */
const SWITCH_ACTIONS: string[][] = [
  ['transport:play', 'transport:stop', 'transport:record', 'pattern:quantize'],
  ['pad:mute', 'pad:clear', 'pattern:humanize', 'groove:next'],
  ['bank:next', 'chord:toggle', 'chord:generate', 'chord:toPattern'],
];

export function createDefaultMpd226Profile(): ControllerProfile {
  const bindings: Record<string, ControllerBinding> = {};

  // Pads: banks A–C are program pads, bank D is the chord pad bank.
  for (let page = 0; page < PAD_BANK_PAGES; page++) {
    const bank = ['A', 'B', 'C', 'D'][page];
    for (let i = 0; i < 16; i++) {
      const action = page === 3 ? `chord:degree:${i}` : `pad:${bank}:${i}`;
      bindings[controlKey('pad', page, i)] = {
        enabled: true,
        messageType: 'note',
        number: padNoteFor(page, i),
        channel: null,
        action,
      };
    }
  }

  // Knobs / faders / switches across the three control banks. Only Control
  // Bank 1 was verified against hardware; banks 2–3 ship disabled. The
  // switches send no MIDI in preset #15, so they are expected to be configured
  // in the MPD226 Editor to CC 36/37/38/39 (Momentary) — Control Bank 1 switch
  // bindings are enabled for that, the other banks stay off.
  for (let page = 0; page < CONTROL_BANK_PAGES; page++) {
    const verified = page === 0;
    for (let i = 0; i < CONTROLS_PER_BANK; i++) {
      bindings[controlKey('knob', page, i)] = { ...continuous(KNOB_CC[page][i], KNOB_ACTIONS[page][i]), enabled: verified };
      bindings[controlKey('fader', page, i)] = { ...continuous(FADER_CC[page][i], FADER_ACTIONS[page][i]), enabled: verified };

      const switchAction = SWITCH_ACTIONS[page][i];
      const base = switchAction.startsWith('chord:param:')
        ? chordParam(SWITCH_CC[page][i], switchAction.split(':')[2] as ChordParamName)
        : trigger(SWITCH_CC[page][i], { action: switchAction });
      bindings[controlKey('switch', page, i)] = { ...base, enabled: verified };
    }
  }

  // Transport: measured preset #15 sends plain CCs (momentary, value 127):
  // Play = CC 118, Stop = CC 117, Record = CC 119. The MPD's MIDI-realtime
  // mode is also bound so other presets/firmware still work.
  bindings[controlKey('transport', 0, 'play')] = trigger(118, { action: 'transport:play' });
  bindings[controlKey('transport', 0, 'stop')] = trigger(117, { action: 'transport:stop' });
  bindings[controlKey('transport', 0, 'record')] = trigger(119, { action: 'transport:record' });
  bindings[controlKey('transport', 0, 'rt-start')] = {
    enabled: true,
    messageType: 'realtime',
    number: 0,
    channel: null,
    action: 'transport:play',
  };
  bindings[controlKey('transport', 0, 'rt-stop')] = {
    enabled: true,
    messageType: 'realtime',
    number: 2,
    channel: null,
    action: 'transport:stop',
  };

  return {
    id: 'mpd226-default',
    name: 'Akai MPD226 · Soundlab #15',
    bindings,
    followPadBank: true,
    enabledInputIds: [],
  };
}

/** A blank but usable profile: just the 64 pads, no knobs/faders/switches. */
export function createBlankProfile(name = 'Blank'): ControllerProfile {
  const bindings: Record<string, ControllerBinding> = {};
  for (let page = 0; page < PAD_BANK_PAGES; page++) {
    const bank = ['A', 'B', 'C', 'D'][page];
    for (let i = 0; i < 16; i++) {
      bindings[controlKey('pad', page, i)] = {
        enabled: true,
        messageType: 'note',
        number: padNoteFor(page, i),
        channel: null,
        action: `pad:${bank}:${i}`,
      };
    }
  }
  return { id: 'blank', name, bindings, followPadBank: true, enabledInputIds: [] };
}

export interface DefaultActionSpec {
  action: string;
  min?: number;
  max?: number;
  curve?: 'linear' | 'log';
}

/**
 * The action a control gets when it is assigned by touching it in learn mode
 * (or when a binding is created for an empty control). Gives every pad / knob /
 * fader / switch an immediately useful function that can then be re-pointed.
 */
export function defaultActionFor(controlKeyValue: string): DefaultActionSpec {
  const parsed = parseControlKey(controlKeyValue);
  if (!parsed) return { action: '' };
  const { kind, page, index } = parsed;
  const i = Number(index);

  switch (kind) {
    case 'pad': {
      const bank = ['A', 'B', 'C', 'D'][page] ?? 'A';
      return { action: page === 3 ? `chord:degree:${i}` : `pad:${bank}:${i}` };
    }
    case 'knob': {
      const spec = KNOB_ACTIONS[page]?.[i] ?? KNOB_ACTIONS[0][i % KNOB_ACTIONS[0].length];
      return { action: spec.action, min: spec.min, max: spec.max, curve: spec.curve };
    }
    case 'fader': {
      const spec = FADER_ACTIONS[page]?.[i] ?? FADER_ACTIONS[0][i % FADER_ACTIONS[0].length];
      return { action: spec.action, min: spec.min, max: spec.max };
    }
    case 'switch': {
      const action = SWITCH_ACTIONS[page]?.[i] ?? SWITCH_ACTIONS[0][i % SWITCH_ACTIONS[0].length];
      return { action };
    }
    case 'transport': {
      if (index === 'play' || index === 'rt-start') return { action: 'transport:play' };
      if (index === 'stop' || index === 'rt-stop') return { action: 'transport:stop' };
      if (index === 'record') return { action: 'transport:record' };
      if (index === 'tap') return { action: 'transport:tap' };
      return { action: '' };
    }
    default:
      return { action: '' };
  }
}

/**
 * Sampler-focused profile: with this active the unit edits the loaded sample
 * instead of the drum kit — pad bank A is a chromatic keygroup, the Control
 * Bank 1 knobs/faders move the on-screen editor, the switches run destructive
 * DSP, and the transport previews. Pad banks B–D stay as program pads so you
 * can still finger-drum.
 */
export function createMpd226SamplerProfile(): ControllerProfile {
  const base = createDefaultMpd226Profile();
  const bindings: Record<string, ControllerBinding> = { ...base.bindings };

  for (let i = 0; i < 16; i++) {
    bindings[controlKey('pad', 0, i)] = {
      enabled: true,
      messageType: 'note',
      number: padNoteFor(0, i),
      channel: null,
      action: `sample:pad:${i}`,
    };
  }

  // Knobs: screen + selection.
  bindings[controlKey('knob', 0, 0)] = cc(3, 'sample:param:zoom', { min: 0.5, max: 64, curve: 'log' });
  bindings[controlKey('knob', 0, 1)] = cc(9, 'sample:param:amp', { min: 1, max: 4 });
  bindings[controlKey('knob', 0, 2)] = cc(14, 'sample:param:selStart', { min: 0, max: 1 });
  bindings[controlKey('knob', 0, 3)] = cc(15, 'sample:param:selEnd', { min: 0, max: 1 });

  // Faders: playback + selection shaping.
  bindings[controlKey('fader', 0, 0)] = cc(20, 'sample:param:pitch', { min: -12, max: 12 });
  bindings[controlKey('fader', 0, 1)] = cc(21, 'sample:param:gain', { min: 0, max: 1 });
  bindings[controlKey('fader', 0, 2)] = cc(22, 'sample:param:selLength', { min: 0.01, max: 1 });
  bindings[controlKey('fader', 0, 3)] = cc(23, 'sample:param:selCenter', { min: 0, max: 1 });

  // Switches: destructive DSP.
  bindings[controlKey('switch', 0, 0)] = cc(36, 'sample:reverse');
  bindings[controlKey('switch', 0, 1)] = cc(37, 'sample:normalize');
  bindings[controlKey('switch', 0, 2)] = cc(38, 'sample:crop');
  bindings[controlKey('switch', 0, 3)] = cc(39, 'sample:fadeIn');

  // Transport: preview / stop / glitch.
  bindings[controlKey('transport', 0, 'play')] = cc(118, 'sample:preview');
  bindings[controlKey('transport', 0, 'stop')] = cc(117, 'sample:stop');
  bindings[controlKey('transport', 0, 'record')] = cc(119, 'sample:glitch');
  // MIDI-realtime transport must follow this mode too (other presets/firmware
  // send realtime Start/Stop rather than CCs).
  bindings[controlKey('transport', 0, 'rt-start')] = {
    ...bindings[controlKey('transport', 0, 'rt-start')],
    action: 'sample:preview',
  };
  bindings[controlKey('transport', 0, 'rt-stop')] = {
    ...bindings[controlKey('transport', 0, 'rt-stop')],
    action: 'sample:stop',
  };

  return { ...base, id: 'mpd226-sampler', name: 'Akai MPD226 · Sampler', bindings };
}

/**
 * Recourse-composer profile: pad bank A becomes composer commands, the knobs /
 * faders shape the generation (style / seed / key / bars / mode), the switches
 * fire the most-used commands, and the transport generates / loads.
 */
export function createMpd226RecourseProfile(): ControllerProfile {
  const base = createDefaultMpd226Profile();
  const bindings: Record<string, ControllerBinding> = { ...base.bindings };

  const padActions = [
    'recourse:generate', 'recourse:load', 'recourse:toPattern', 'recourse:useKey',
    'recourse:stylePrev', 'recourse:styleNext', 'recourse:modeNext', 'recourse:barsNext',
    'recourse:seedDown', 'recourse:seedUp', 'recourse:keyDown', 'recourse:keyUp',
    'recourse:seedRandom',
  ];
  padActions.forEach((action, i) => {
    bindings[controlKey('pad', 0, i)] = {
      enabled: true,
      messageType: 'note',
      number: padNoteFor(0, i),
      channel: null,
      action,
    };
  });

  bindings[controlKey('knob', 0, 0)] = cc(3, 'recourse:param:styleIndex', { min: 0, max: 6 });
  bindings[controlKey('knob', 0, 1)] = cc(9, 'recourse:param:seed', { min: 1, max: 200 });
  bindings[controlKey('knob', 0, 2)] = cc(14, 'recourse:param:keyIndex', { min: 0, max: 11 });
  bindings[controlKey('knob', 0, 3)] = cc(15, 'recourse:param:barsIndex', { min: 0, max: 2 });

  bindings[controlKey('fader', 0, 0)] = cc(20, 'recourse:param:mode', { min: 0, max: 1 });
  bindings[controlKey('fader', 0, 1)] = cc(21, 'recourse:param:seed', { min: 1, max: 200 });
  bindings[controlKey('fader', 0, 2)] = cc(22, 'recourse:param:keyIndex', { min: 0, max: 11 });
  bindings[controlKey('fader', 0, 3)] = cc(23, 'recourse:param:barsIndex', { min: 0, max: 2 });

  bindings[controlKey('switch', 0, 0)] = cc(36, 'recourse:generate');
  bindings[controlKey('switch', 0, 1)] = cc(37, 'recourse:modeNext');
  bindings[controlKey('switch', 0, 2)] = cc(38, 'recourse:seedRandom');
  bindings[controlKey('switch', 0, 3)] = cc(39, 'recourse:load');

  bindings[controlKey('transport', 0, 'play')] = cc(118, 'recourse:generate');
  bindings[controlKey('transport', 0, 'stop')] = cc(117, 'recourse:modeNext');
  bindings[controlKey('transport', 0, 'record')] = cc(119, 'recourse:load');
  bindings[controlKey('transport', 0, 'rt-start')] = {
    ...bindings[controlKey('transport', 0, 'rt-start')],
    action: 'recourse:generate',
  };
  bindings[controlKey('transport', 0, 'rt-stop')] = {
    ...bindings[controlKey('transport', 0, 'rt-stop')],
    action: 'recourse:modeNext',
  };

  return { ...base, id: 'mpd226-recourse', name: 'Akai MPD226 · Recourse', bindings };
}
