/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Controller action catalog + dispatcher.
 *
 * Actions are plain strings ("pad:A:3", "chord:degree:5", "fx:filterFreq").
 * The catalog drives the visual assignment UI (labels + grouping); the
 * dispatcher is a pure function that translates an action + incoming value into
 * calls on a `ControllerHandlers` object. All the app-specific wiring lives in
 * the handlers, so this file is unit-testable with mock handlers.
 */

import type { ChordPadSettings } from './chordPads';

export type ChordParamName =
  | 'octave'
  | 'inversion'
  | 'strumMs'
  | 'spread'
  | 'rootPc'
  | 'scaleIndex'
  | 'qualityIndex';

export type ActionGroup =
  | 'Pads'
  | 'Chord Pads'
  | 'Chord Controls'
  | 'Transport'
  | 'Banks'
  | 'Tempo'
  | 'Mix'
  | 'Layer'
  | 'Sound Design'
  | 'Synth'
  | 'Pattern'
  | 'Groove'
  | 'Sampler'
  | 'Recourse'
  | 'Section';

/** Layer parameter a section knob/fader can drive (selected layer). */
export type SectionLayerParam =
  | 'gain'
  | 'pan'
  | 'pitch'
  | 'filterFreq'
  | 'filterRes'
  | 'attack'
  | 'release'
  | 'reverbMix';

/** Channel parameter a section knob/fader can drive (Nth layer in the stack). */
export type SectionChannelKind = 'gain' | 'pan';

export const SECTION_LAYER_PARAMS: SectionLayerParam[] = [
  'gain',
  'pan',
  'pitch',
  'filterFreq',
  'filterRes',
  'attack',
  'release',
  'reverbMix',
];

/** Compare Engine parameters a section knob/fader can drive. */
export type SectionCompareParam =
  | 'refGain'
  | 'loopStart'
  | 'loopEnd'
  | 'track'
  | 'source'
  | 'loop'
  | 'levelMatch'
  | 'loopSync';

/** Evolution Engine parameters a section knob/fader can drive. */
export type SectionEvolutionParam =
  | 'mode'
  | 'fx'
  | 'variation'
  | 'reEvolve'
  | 'play'
  | 'add'
  | 'save'
  | 'discard';

export const SECTION_COMPARE_PARAMS: SectionCompareParam[] = [
  'refGain',
  'loopStart',
  'loopEnd',
  'track',
  'source',
  'loop',
  'levelMatch',
  'loopSync',
];

export const SECTION_EVOLUTION_PARAMS: SectionEvolutionParam[] = [
  'mode',
  'fx',
  'variation',
  'reEvolve',
  'play',
  'add',
  'save',
  'discard',
];

export interface ActionDef {
  id: string;
  label: string;
  group: ActionGroup;
  /** Continuous actions receive a mapped value; triggers fire on press. */
  continuous?: boolean;
}

export interface ControllerHandlers {
  triggerPad(bank: string, index: number, velocity01: number): void;
  playNote(midi: number, velocity01: number): void;
  stopNote(midi: number): void;
  playChord(degree: number, velocity01: number): void;
  stopChord(degree: number): void;
  transport(cmd: 'play' | 'stop' | 'record' | 'tap' | 'toggle'): void;
  setBpm(v: number): void;
  setSwing(v: number): void;
  setMaster(v: number): void;
  setLayerGain(v: number): void;
  setLayerPan(v: number): void;
  setLayerTune(v: number): void;
  setLayerSend(bus: 'reverb' | 'delay', v: number): void;
  setFxParam(param: string, v: number): void;
  setSynthParam(param: string, v: number): void;
  setChordParam(param: ChordParamName, v: number): void;
  chordCommand(cmd: string): void;
  padCommand(cmd: string): void;
  patternCommand(cmd: string): void;
  selectBank(bank: string): void;
  nextBank(): void;
  grooveCommand(): void;
  // --- Sampler (optional so existing handler mocks stay valid) ---
  sampleCommand?(cmd: string): void;
  sampleParam?(param: string, value: number): void;
  samplePad?(index: number, velocity01: number): void;
  // --- Recourse composer (optional) ---
  recourseCommand?(cmd: string): void;
  recourseParam?(param: string, value: number): void;
  // --- Section follow (optional so existing handler mocks stay valid) ---
  sectionChannel?(index: number, kind: SectionChannelKind, value: number): void;
  sectionLayer?(param: SectionLayerParam, value: number): void;
  sectionCompare?(param: SectionCompareParam, value: number, on: boolean): void;
  sectionEvolution?(param: SectionEvolutionParam, value: number, on: boolean): void;
  /** Per-screen pad actions: select/trigger a layer, mute a channel, pick a variation or reference track. */
  sectionPad?(kind: string, index: number, on: boolean, value: number): void;
}

export interface DispatchContext {
  /** Value after the binding's min/max/invert mapping. */
  value: number;
  /** 0..1 normalized value. */
  unit: number;
  /** Raw 0..127 value. */
  raw: number;
  /** True for note-on / CC >= 64 / realtime press. */
  on: boolean;
  handlers: ControllerHandlers;
}

/** Static (non-generated) action definitions. */
export const ACTION_DEFS: ActionDef[] = [
  { id: 'transport:play', label: 'Transport · Play', group: 'Transport' },
  { id: 'transport:stop', label: 'Transport · Stop', group: 'Transport' },
  { id: 'transport:record', label: 'Transport · Record', group: 'Transport' },
  { id: 'transport:tap', label: 'Transport · Tap tempo', group: 'Transport' },
  { id: 'transport:toggle', label: 'Transport · Play/Stop', group: 'Transport' },

  { id: 'bank:A', label: 'Program bank A', group: 'Banks' },
  { id: 'bank:B', label: 'Program bank B', group: 'Banks' },
  { id: 'bank:C', label: 'Program bank C', group: 'Banks' },
  { id: 'bank:D', label: 'Program bank D', group: 'Banks' },
  { id: 'bank:next', label: 'Program bank · next', group: 'Banks' },

  { id: 'tempo:bpm', label: 'Tempo (BPM)', group: 'Tempo', continuous: true },
  { id: 'tempo:swing', label: 'Swing %', group: 'Tempo', continuous: true },

  { id: 'mix:master', label: 'Master volume', group: 'Mix', continuous: true },
  { id: 'mix:layerGain', label: 'Layer gain', group: 'Mix', continuous: true },
  { id: 'mix:layerPan', label: 'Layer pan', group: 'Mix', continuous: true },
  { id: 'mix:layerSendReverb', label: 'Reverb send', group: 'Mix', continuous: true },
  { id: 'mix:layerSendDelay', label: 'Delay send', group: 'Mix', continuous: true },

  { id: 'layer:tune', label: 'Layer tune (semitones)', group: 'Layer', continuous: true },

  { id: 'fx:filterFreq', label: 'Filter cutoff', group: 'Sound Design', continuous: true },
  { id: 'fx:filterRes', label: 'Filter resonance', group: 'Sound Design', continuous: true },
  { id: 'fx:distortion', label: 'Distortion drive', group: 'Sound Design', continuous: true },
  { id: 'fx:bitcrush', label: 'Bitcrush', group: 'Sound Design', continuous: true },
  { id: 'fx:reverbMix', label: 'Reverb mix', group: 'Sound Design', continuous: true },
  { id: 'fx:chorusMix', label: 'Chorus mix', group: 'Sound Design', continuous: true },
  { id: 'fx:delayFeedback', label: 'Delay feedback', group: 'Sound Design', continuous: true },
  { id: 'fx:lfoRate', label: 'LFO rate', group: 'Sound Design', continuous: true },
  { id: 'fx:lfoDepth', label: 'LFO depth', group: 'Sound Design', continuous: true },

  { id: 'synth:fmDepth', label: 'FM depth', group: 'Synth', continuous: true },
  { id: 'synth:wavefold', label: 'Wavefold', group: 'Synth', continuous: true },
  { id: 'synth:subLevel', label: 'Sub oscillator level', group: 'Synth', continuous: true },
  { id: 'synth:unisonDetune', label: 'Unison detune', group: 'Synth', continuous: true },
  { id: 'synth:noiseLevel', label: 'Noise level', group: 'Synth', continuous: true },
  { id: 'synth:ringModMix', label: 'Ring mod mix', group: 'Synth', continuous: true },
  { id: 'synth:vowelMix', label: 'Vowel mix', group: 'Synth', continuous: true },
  { id: 'synth:bitcrushDepth', label: 'Bitcrush depth', group: 'Synth', continuous: true },
  { id: 'synth:detune', label: 'Detune (cents)', group: 'Synth', continuous: true },

  { id: 'chord:param:octave', label: 'Chord · octave', group: 'Chord Controls', continuous: true },
  { id: 'chord:param:inversion', label: 'Chord · inversion', group: 'Chord Controls', continuous: true },
  { id: 'chord:param:strumMs', label: 'Chord · strum (ms)', group: 'Chord Controls', continuous: true },
  { id: 'chord:param:spread', label: 'Chord · spread', group: 'Chord Controls', continuous: true },
  { id: 'chord:param:rootPc', label: 'Chord · key (12)', group: 'Chord Controls', continuous: true },
  { id: 'chord:param:scaleIndex', label: 'Chord · scale (list)', group: 'Chord Controls', continuous: true },
  { id: 'chord:param:qualityIndex', label: 'Chord · 7ths toggle', group: 'Chord Controls', continuous: true },

  { id: 'chord:toggle', label: 'Chord pads · 7ths on/off', group: 'Chord Pads' },
  { id: 'chord:generate', label: 'Chord · generate + preview', group: 'Chord Pads' },
  { id: 'chord:toPattern', label: 'Chord · write to pattern row', group: 'Chord Pads' },
  { id: 'chord:keyUp', label: 'Chord · key up', group: 'Chord Pads' },
  { id: 'chord:keyDown', label: 'Chord · key down', group: 'Chord Pads' },
  { id: 'chord:scaleUp', label: 'Chord · scale up', group: 'Chord Pads' },
  { id: 'chord:scaleDown', label: 'Chord · scale down', group: 'Chord Pads' },

  { id: 'pad:mute', label: 'Selected pad · mute', group: 'Pads' },
  { id: 'pad:clear', label: 'Selected pad · clear', group: 'Pads' },
  { id: 'pad:assign', label: 'Selected pad · assign active layer', group: 'Pads' },

  { id: 'pattern:clear', label: 'Pattern · clear', group: 'Pattern' },
  { id: 'pattern:quantize', label: 'Pattern · quantize', group: 'Pattern' },
  { id: 'pattern:humanize', label: 'Pattern · humanize', group: 'Pattern' },

  { id: 'groove:next', label: 'Groove · next template', group: 'Groove' },

  { id: 'sample:preview', label: 'Sampler · preview play/stop', group: 'Sampler' },
  { id: 'sample:stop', label: 'Sampler · stop preview', group: 'Sampler' },
  { id: 'sample:reverse', label: 'Sampler · reverse', group: 'Sampler' },
  { id: 'sample:normalize', label: 'Sampler · normalize', group: 'Sampler' },
  { id: 'sample:invert', label: 'Sampler · phase invert', group: 'Sampler' },
  { id: 'sample:crop', label: 'Sampler · crop to selection', group: 'Sampler' },
  { id: 'sample:fadeIn', label: 'Sampler · fade in', group: 'Sampler' },
  { id: 'sample:fadeOut', label: 'Sampler · fade out', group: 'Sampler' },
  { id: 'sample:glitch', label: 'Sampler · glitch', group: 'Sampler' },
  { id: 'sample:param:zoom', label: 'Sampler · zoom', group: 'Sampler', continuous: true },
  { id: 'sample:param:amp', label: 'Sampler · amplitude zoom', group: 'Sampler', continuous: true },
  { id: 'sample:param:selStart', label: 'Sampler · selection start', group: 'Sampler', continuous: true },
  { id: 'sample:param:selEnd', label: 'Sampler · selection end', group: 'Sampler', continuous: true },
  { id: 'sample:param:selLength', label: 'Sampler · selection length', group: 'Sampler', continuous: true },
  { id: 'sample:param:selCenter', label: 'Sampler · selection center', group: 'Sampler', continuous: true },
  { id: 'sample:param:pitch', label: 'Sampler · pad pitch (st)', group: 'Sampler', continuous: true },
  { id: 'sample:param:gain', label: 'Sampler · preview gain', group: 'Sampler', continuous: true },

  { id: 'recourse:generate', label: 'Recourse · generate', group: 'Recourse' },
  { id: 'recourse:load', label: 'Recourse · load into SoundLab', group: 'Recourse' },
  { id: 'recourse:toPattern', label: 'Recourse · chords → pattern', group: 'Recourse' },
  { id: 'recourse:useKey', label: 'Recourse · use as chord key', group: 'Recourse' },
  { id: 'recourse:stylePrev', label: 'Recourse · style ◀', group: 'Recourse' },
  { id: 'recourse:styleNext', label: 'Recourse · style ▶', group: 'Recourse' },
  { id: 'recourse:modeNext', label: 'Recourse · loop/arrangement', group: 'Recourse' },
  { id: 'recourse:barsNext', label: 'Recourse · bars 4/8/16', group: 'Recourse' },
  { id: 'recourse:seedDown', label: 'Recourse · seed −', group: 'Recourse' },
  { id: 'recourse:seedUp', label: 'Recourse · seed +', group: 'Recourse' },
  { id: 'recourse:seedRandom', label: 'Recourse · new seed', group: 'Recourse' },
  { id: 'recourse:keyDown', label: 'Recourse · key −', group: 'Recourse' },
  { id: 'recourse:keyUp', label: 'Recourse · key +', group: 'Recourse' },
  { id: 'recourse:param:styleIndex', label: 'Recourse · style (list)', group: 'Recourse', continuous: true },
  { id: 'recourse:param:seed', label: 'Recourse · seed', group: 'Recourse', continuous: true },
  { id: 'recourse:param:keyIndex', label: 'Recourse · key (12)', group: 'Recourse', continuous: true },
  { id: 'recourse:param:barsIndex', label: 'Recourse · bars (list)', group: 'Recourse', continuous: true },
  { id: 'recourse:param:mode', label: 'Recourse · mode loop/arr', group: 'Recourse', continuous: true },

  { id: 'section:layer:gain', label: 'Section · selected layer gain', group: 'Section', continuous: true },
  { id: 'section:layer:pan', label: 'Section · selected layer pan', group: 'Section', continuous: true },
  { id: 'section:layer:pitch', label: 'Section · selected layer pitch', group: 'Section', continuous: true },
  { id: 'section:layer:filterFreq', label: 'Section · selected layer cutoff', group: 'Section', continuous: true },
  { id: 'section:layer:filterRes', label: 'Section · selected layer resonance', group: 'Section', continuous: true },
  { id: 'section:layer:attack', label: 'Section · selected layer attack', group: 'Section', continuous: true },
  { id: 'section:layer:release', label: 'Section · selected layer release', group: 'Section', continuous: true },
  { id: 'section:layer:reverbMix', label: 'Section · selected layer reverb', group: 'Section', continuous: true },

  { id: 'section:compare:refGain', label: 'Section · Compare ref gain', group: 'Section', continuous: true },
  { id: 'section:compare:loopStart', label: 'Section · Compare loop start', group: 'Section', continuous: true },
  { id: 'section:compare:loopEnd', label: 'Section · Compare loop end', group: 'Section', continuous: true },
  { id: 'section:compare:track', label: 'Section · Compare ref track', group: 'Section', continuous: true },
  { id: 'section:compare:source', label: 'Section · Compare source A/B', group: 'Section', continuous: true },
  { id: 'section:compare:loop', label: 'Section · Compare loop on/off', group: 'Section', continuous: true },
  { id: 'section:compare:levelMatch', label: 'Section · Compare level match', group: 'Section', continuous: true },
  { id: 'section:compare:loopSync', label: 'Section · Compare loop sync', group: 'Section', continuous: true },

  { id: 'section:evolution:mode', label: 'Section · Evolution mode', group: 'Section', continuous: true },
  { id: 'section:evolution:fx', label: 'Section · Evolution FX mode', group: 'Section', continuous: true },
  { id: 'section:evolution:variation', label: 'Section · Evolution variation', group: 'Section', continuous: true },
  { id: 'section:evolution:reEvolve', label: 'Section · Evolution new generation', group: 'Section', continuous: true },
  { id: 'section:evolution:play', label: 'Section · Evolution preview', group: 'Section', continuous: true },
  { id: 'section:evolution:add', label: 'Section · Evolution add to layer', group: 'Section', continuous: true },
  { id: 'section:evolution:save', label: 'Section · Evolution save to kit', group: 'Section', continuous: true },
  { id: 'section:evolution:discard', label: 'Section · Evolution discard', group: 'Section', continuous: true },
];

const PAD_BANK_LETTERS = ['A', 'B', 'C', 'D'];

/** Full catalog for the assignment UI, including generated pad/chord/note actions. */
export function catalogForContext(opts: { padPage?: number; padBank?: string } = {}): ActionDef[] {
  const padBank = opts.padBank ?? PAD_BANK_LETTERS[opts.padPage ?? 0] ?? 'A';
  const generated: ActionDef[] = [];
  for (let i = 0; i < 16; i++) {
    generated.push({
      id: `pad:${padBank}:${i}`,
      label: `Program bank ${padBank} · pad ${String(i + 1).padStart(2, '0')}`,
      group: 'Pads',
    });
  }
  for (let i = 0; i < 16; i++) {
    const degree = (i % 7) + 1;
    const octave = Math.floor(i / 7);
    generated.push({
      id: `chord:degree:${i}`,
      label: `Chord · degree ${degree}${octave ? ` (+${octave} oct)` : ''}`,
      group: 'Chord Pads',
    });
  }
  for (let i = 0; i < 16; i++) {
    generated.push({
      id: `sample:pad:${i}`,
      label: `Sampler pad ${String(i + 1).padStart(2, '0')} (±${Math.abs(i - 8)} st)`,
      group: 'Sampler',
    });
  }
  return [...generated, ...ACTION_DEFS];
}

export function describeAction(id: string): ActionDef {
  const found = ACTION_DEFS.find((d) => d.id === id);
  if (found) return found;

  const parts = id.split(':');
  if (parts[0] === 'pad' && parts.length === 3) {
    return { id, label: `Program bank ${parts[1]} · pad ${Number(parts[2]) + 1}`, group: 'Pads' };
  }
  if (parts[0] === 'chord' && parts[1] === 'degree') {
    const i = Number(parts[2]);
    return { id, label: `Chord · degree ${(i % 7) + 1}${i >= 7 ? ` (+${Math.floor(i / 7)} oct)` : ''}`, group: 'Chord Pads' };
  }
  if (parts[0] === 'note') return { id, label: `Note ${parts[1]}`, group: 'Pads' };
  if (parts[0] === 'sample' && parts[1] === 'pad') {
    const i = Number(parts[2]);
    return { id, label: `Sampler pad ${String(i + 1).padStart(2, '0')} (±${Math.abs(i - 8)} st)`, group: 'Sampler' };
  }
  if (parts[0] === 'section' && parts[1] === 'pad' && parts[2]) {
    const i = Number(parts[3]);
    const label =
      parts[2] === 'layer' ? `Layer ${i + 1}`
        : parts[2] === 'mute' ? `Mute ch ${i + 1}`
          : parts[2] === 'variation' ? `Variation ${i + 1}`
            : parts[2] === 'track' ? `Ref track ${i + 1}`
              : parts[2];
    return { id, label: `Section · ${label}`, group: 'Section' };
  }
  if (parts[0] === 'section' && parts[1] === 'channel' && (parts[2] === 'gain' || parts[2] === 'pan')) {
    const i = Number(parts[3]);
    return { id, label: `Section · channel ${i + 1} ${parts[2]}`, group: 'Section', continuous: true };
  }
  if (parts[0] === 'section' && parts[1] === 'layer' && (SECTION_LAYER_PARAMS as string[]).includes(parts[2])) {
    return { id, label: `Section · selected layer ${parts[2]}`, group: 'Section', continuous: true };
  }
  if (parts[0] === 'section' && parts[1] === 'compare' && (SECTION_COMPARE_PARAMS as string[]).includes(parts[2])) {
    return { id, label: `Section · Compare ${parts[2]}`, group: 'Section', continuous: true };
  }
  if (parts[0] === 'section' && parts[1] === 'evolution' && (SECTION_EVOLUTION_PARAMS as string[]).includes(parts[2])) {
    return { id, label: `Section · Evolution ${parts[2]}`, group: 'Section', continuous: true };
  }
  return { id, label: id, group: 'Pads' };
}

export const isContinuousAction = (id: string): boolean => describeAction(id).continuous === true;

const CHORD_PARAMS: ChordParamName[] = [
  'octave',
  'inversion',
  'strumMs',
  'spread',
  'rootPc',
  'scaleIndex',
  'qualityIndex',
];

/** Chord settings ranges, shared by defaults and the dispatcher's clamp. */
export const CHORD_PARAM_RANGE: Record<ChordParamName, [number, number]> = {
  octave: [1, 6],
  inversion: [0, 3],
  strumMs: [0, 120],
  spread: [0, 1],
  rootPc: [0, 11],
  scaleIndex: [0, 8],
  qualityIndex: [0, 1],
};

/** Apply a continuous chord parameter to a settings object (pure). */
export function applyChordParam(
  settings: ChordPadSettings,
  param: ChordParamName,
  value: number
): ChordPadSettings {
  const range = CHORD_PARAM_RANGE[param];
  if (!range) return settings;
  const [min, max] = range;
  const v = Math.max(min, Math.min(max, value));
  switch (param) {
    case 'octave':
      return { ...settings, octave: Math.round(v) };
    case 'inversion':
      return { ...settings, inversion: Math.round(v) };
    case 'strumMs':
      return { ...settings, strumMs: Math.round(v) };
    case 'spread':
      return { ...settings, spread: v };
    case 'rootPc':
      return { ...settings, key: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][Math.round(v) % 12] };
    case 'scaleIndex':
      return { ...settings, scale: ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian', 'harmonic minor', 'melodic minor'][Math.round(v) % 9] };
    case 'qualityIndex':
      return { ...settings, seventh: v >= 0.5 };
    default:
      return settings;
  }
}

/**
 * Execute an action. Returns true when the action was recognized. Never
 * throws on unknown ids — unknown actions are reported as unhandled so the UI
 * can surface them.
 */
export function dispatchAction(action: string, ctx: DispatchContext): boolean {
  const { value, unit, on, handlers } = ctx;
  const parts = action.split(':');
  const head = parts[0];
  const rest = parts.slice(1);

  switch (head) {
    case 'pad': {
      if (rest.length === 2 && PAD_BANK_LETTERS.includes(rest[0])) {
        if (on) handlers.triggerPad(rest[0], Number(rest[1]), unit);
        return true;
      }
      if (rest.length === 1) {
        if (on) handlers.padCommand(rest[0]);
        return true;
      }
      return false;
    }
    case 'chord': {
      if (rest[0] === 'degree') {
        const degree = Number(rest[1]);
        if (on) handlers.playChord(degree, unit);
        else handlers.stopChord(degree);
        return true;
      }
      if (rest[0] === 'param' && rest[1]) {
        const param = rest[1] as ChordParamName;
        if (CHORD_PARAMS.includes(param)) handlers.setChordParam(param, value);
        return true;
      }
      if (on) handlers.chordCommand(rest.join(':'));
      return true;
    }
    case 'note': {
      const m = Number(rest[0]);
      if (on) handlers.playNote(m, unit);
      else handlers.stopNote(m);
      return true;
    }
    case 'transport': {
      if (on) handlers.transport(rest[0] as 'play' | 'stop' | 'record' | 'tap' | 'toggle');
      return true;
    }
    case 'bank': {
      if (on) {
        if (rest[0] === 'next') handlers.nextBank();
        else handlers.selectBank(rest[0]);
      }
      return true;
    }
    case 'tempo': {
      if (rest[0] === 'bpm') handlers.setBpm(value);
      else if (rest[0] === 'swing') handlers.setSwing(value);
      else return false;
      return true;
    }
    case 'mix': {
      switch (rest[0]) {
        case 'master': handlers.setMaster(value); break;
        case 'layerGain': handlers.setLayerGain(value); break;
        case 'layerPan': handlers.setLayerPan(value); break;
        case 'layerSendReverb': handlers.setLayerSend('reverb', value); break;
        case 'layerSendDelay': handlers.setLayerSend('delay', value); break;
        default: return false;
      }
      return true;
    }
    case 'layer': {
      if (rest[0] === 'tune') handlers.setLayerTune(value);
      else return false;
      return true;
    }
    case 'fx': {
      handlers.setFxParam(rest[0], value);
      return true;
    }
    case 'synth': {
      handlers.setSynthParam(rest[0], value);
      return true;
    }
    case 'pattern': {
      if (on) handlers.patternCommand(rest[0]);
      return true;
    }
    case 'groove': {
      if (on) handlers.grooveCommand();
      return true;
    }
    case 'sample': {
      if (rest[0] === 'pad') {
        const index = Number(rest[1]);
        if (on) handlers.samplePad?.(index, unit);
        return true;
      }
      if (rest[0] === 'param' && rest[1]) {
        handlers.sampleParam?.(rest[1], value);
        return true;
      }
      if (on) handlers.sampleCommand?.(rest.join(':'));
      return true;
    }
    case 'recourse': {
      if (rest[0] === 'param' && rest[1]) {
        handlers.recourseParam?.(rest[1], value);
        return true;
      }
      if (on) handlers.recourseCommand?.(rest.join(':'));
      return true;
    }
    case 'section': {
      if (rest[0] === 'pad' && rest[1] !== undefined) {
        handlers.sectionPad?.(rest[1], Number(rest[2]), on, unit);
        return true;
      }
      if (rest[0] === 'channel' && (rest[1] === 'gain' || rest[1] === 'pan')) {
        handlers.sectionChannel?.(Number(rest[2]), rest[1], value);
        return true;
      }
      if (rest[0] === 'layer' && (SECTION_LAYER_PARAMS as string[]).includes(rest[1])) {
        handlers.sectionLayer?.(rest[1] as SectionLayerParam, value);
        return true;
      }
      if (rest[0] === 'compare' && (SECTION_COMPARE_PARAMS as string[]).includes(rest[1])) {
        handlers.sectionCompare?.(rest[1] as SectionCompareParam, value, on);
        return true;
      }
      if (rest[0] === 'evolution' && (SECTION_EVOLUTION_PARAMS as string[]).includes(rest[1])) {
        handlers.sectionEvolution?.(rest[1] as SectionEvolutionParam, value, on);
        return true;
      }
      return false;
    }
    default:
      return false;
  }
}
