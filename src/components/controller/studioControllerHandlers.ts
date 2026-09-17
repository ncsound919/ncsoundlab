/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Studio controller handlers.
 *
 * Builds the `ControllerHandlers` the MIDI engine dispatches into. All
 * app-specific work (audio triggering, patterns, chord voicing, layer params)
 * is injected through `StudioControllerDeps`, so this module is pure enough to
 * unit-test and the StudioSequencer only has to supply a deps object.
 *
 * The factory is created once per mounted sequencer (its internal chord/timer
 * state must survive re-renders); deps are read lazily via `getDeps()` so they
 * always reflect the latest React state.
 */

import { GROOVE_TEMPLATES, type GrooveTemplate } from '../../lib/grooveTemplates';
import { makeProgression, voiceChords, progressionChords, SCALE_PRESETS } from '../../lib/musicTheory';
import { chordPadTiming, type ChordPadSettings } from '../../lib/controller/chordPads';
import type { ControllerHandlers, SectionLayerParam, SectionCompareParam, SectionEvolutionParam } from '../../lib/controller/actions';
import type { TheoryChord } from '../../lib/theory/progression';
import type { SoundLayer } from '../../types';

export interface StudioControllerDeps {
  getPrograms: () => Record<string, (string | null)[]>;
  getActiveBank: () => string;
  setActiveBank: (bank: string) => void;
  followPadBank: () => boolean;
  getPadTune: () => Record<string, number>;
  getPadChoke: () => Record<string, number>;
  triggerLayer: (layerId: string, semitones: number, velocity01: number, chokeKey?: string) => void;
  playNote: (midi: number, velocity01: number) => void;
  stopNote: (midi: number) => void;
  getIsPlaying: () => boolean;
  togglePlay: () => void;
  toggleRecord: () => void;
  tapTempo: () => void;
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  setMaster: (level: number) => void;
  getActiveLayer: () => SoundLayer | null;
  /** Full layer stack in UI order (section channel ops address it by index). */
  getLayers: () => SoundLayer[];
  updateLayer: (id: string, updates: Partial<SoundLayer>) => void;
  setLayerSend: (layerId: string, bus: 'reverb' | 'delay', level: number) => void;
  getSelectedPad: () => number;
  clearPad: (index: number) => void;
  assignPad: (index: number) => void;
  togglePadMute: (layerId: string) => void;
  /** Select the Nth layer in the stack (per-screen pad action). */
  selectLayer: (index: number) => void;
  /** Toggle mute on the Nth layer in the stack (per-screen pad action). */
  toggleChannelMute: (index: number) => void;
  clearPattern: () => void;
  quantizePattern: () => void;
  humanizePattern: () => void;
  applyGroove: (template: GrooveTemplate) => void;
  getChord: () => ChordPadSettings;
  setChord: (patch: Partial<ChordPadSettings>) => void;
  setChordParam: (param: Parameters<ControllerHandlers['setChordParam']>[0], value: number) => void;
  generateProgression: () => TheoryChord[];
  applyProgressionToPattern: (chords: TheoryChord[]) => void;
  // --- Sampler (drives the Sound Lab sample editor when it is mounted) ---
  sampleCommand: (cmd: string) => void;
  sampleParam: (param: string, value: number) => void;
  samplePad: (index: number, velocity01: number) => void;
  // --- Recourse composer (drives the composer panel when it is mounted) ---
  recourseCommand: (cmd: string) => void;
  recourseParam: (param: string, value: number) => void;
  // --- Section follow: Compare Engine (store-backed) ---
  sectionCompare: (param: SectionCompareParam, value: number, on: boolean) => void;
  // --- Section follow: Evolution Engine (bridge-backed) ---
  sectionEvolution: (param: SectionEvolutionParam, value: number, on: boolean) => void;
}

/**
 * Section parameters that act as a one-shot press rather than a live level.
 * A control only fires these when it crosses from below to at/above half,
 * so holding a knob/fader there does not spam the action.
 */
const COMPARE_EDGE = new Set<SectionCompareParam>(['levelMatch']);
const EVOLUTION_EDGE = new Set<SectionEvolutionParam>(['reEvolve', 'add', 'save', 'discard']);

const CONTROLLER_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const shiftKey = (key: string, delta: number): string => {
  const i = CONTROLLER_KEYS.indexOf(key);
  return CONTROLLER_KEYS[(((i === -1 ? 0 : i) + delta) % 12 + 12) % 12];
};

export const cycleScale = (scale: string, delta: number): string => {
  const list = SCALE_PRESETS as readonly string[];
  const i = Math.max(0, list.indexOf(scale));
  return list[(i + delta + list.length) % list.length];
};

export function createStudioControllerHandlers(getDeps: () => StudioControllerDeps): ControllerHandlers {
  // Survives re-renders: which notes each chord pad is currently holding, the
  // pending strum/preview timers, and the groove-template cursor.
  const heldChord = new Map<number, number[]>();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let grooveIndex = 0;

  // Rising-edge latch for section controls that act as a one-shot press.
  const edgeState = new Map<string, boolean>();
  const risingEdge = (key: string, on: boolean): boolean => {
    const prev = edgeState.get(key) ?? false;
    edgeState.set(key, on);
    return on && !prev;
  };

  const playChordDegree = (degree: number, velocity01: number) => {
    const deps = getDeps();
    const { notes, offsetsMs } = chordPadTiming(deps.getChord(), degree);
    (heldChord.get(degree) ?? []).forEach((n) => deps.stopNote(n));
    const started: number[] = [];
    notes.forEach((n, i) => {
      const delay = offsetsMs[i] ?? 0;
      if (delay <= 0) {
        deps.playNote(n, velocity01);
        started.push(n);
      } else {
        // Strummed note: only sound it if the pad is still held when it fires,
        // otherwise a quick tap would leave ghost notes ringing.
        const t = setTimeout(() => {
          const held = heldChord.get(degree);
          if (!held) return;
          getDeps().playNote(n, velocity01);
          held.push(n);
        }, delay);
        timers.push(t);
      }
    });
    heldChord.set(degree, started);
  };

  const stopChordDegree = (degree: number) => {
    const deps = getDeps();
    (heldChord.get(degree) ?? []).forEach((n) => deps.stopNote(n));
    heldChord.delete(degree);
  };

  const previewProgression = () => {
    const deps = getDeps();
    const chord = deps.getChord();
    const voicings = voiceChords(progressionChords(deps.generateProgression()), chord.octave);
    timers.forEach(clearTimeout);
    timers.length = 0;
    voicings.forEach((v, i) => {
      const startT = setTimeout(() => {
        const d = getDeps();
        v.notes.forEach((n) => d.playNote(n, 0.8));
        const stopT = setTimeout(() => v.notes.forEach((n) => getDeps().stopNote(n)), 1200);
        timers.push(stopT);
      }, i * 1400);
      timers.push(startT);
    });
  };

  return {
    triggerPad: (bank, index, velocity01) => {
      const deps = getDeps();
      if (deps.followPadBank()) deps.setActiveBank(bank);
      const layerId = deps.getPrograms()[bank]?.[index];
      if (!layerId) return;
      const semitones = deps.getPadTune()[layerId] || 0;
      const choke = deps.getPadChoke()[layerId] || 0;
      deps.triggerLayer(layerId, semitones, velocity01, choke > 0 ? `choke:${choke}` : undefined);
    },
    playNote: (midi, velocity01) => getDeps().playNote(midi, velocity01),
    stopNote: (midi) => getDeps().stopNote(midi),
    playChord: playChordDegree,
    stopChord: stopChordDegree,
    transport: (cmd) => {
      const deps = getDeps();
      if (cmd === 'play') { if (!deps.getIsPlaying()) deps.togglePlay(); }
      else if (cmd === 'stop') { if (deps.getIsPlaying()) deps.togglePlay(); }
      else if (cmd === 'toggle') deps.togglePlay();
      else if (cmd === 'record') deps.toggleRecord();
      else if (cmd === 'tap') deps.tapTempo();
    },
    setBpm: (v) => getDeps().setBpm(Math.max(60, Math.min(200, Math.round(v)))),
    setSwing: (v) => getDeps().setSwing(Math.max(0, Math.min(75, Math.round(v)))),
    setMaster: (v) => getDeps().setMaster(v),
    setLayerGain: (v) => {
      const deps = getDeps();
      const l = deps.getActiveLayer();
      if (l) deps.updateLayer(l.id, { gain: v });
    },
    setLayerPan: (v) => {
      const deps = getDeps();
      const l = deps.getActiveLayer();
      if (l) deps.updateLayer(l.id, { pan: v });
    },
    setLayerTune: (v) => {
      const deps = getDeps();
      const l = deps.getActiveLayer();
      if (l) deps.updateLayer(l.id, { pitch: Math.round(v) });
    },
    setLayerSend: (bus, v) => {
      const deps = getDeps();
      const l = deps.getActiveLayer();
      if (l) deps.setLayerSend(l.id, bus, v);
    },
    setFxParam: (param, v) => {
      const deps = getDeps();
      const l = deps.getActiveLayer();
      if (l) deps.updateLayer(l.id, { fx: { ...l.fx, [param]: v } });
    },
    setSynthParam: (param, v) => {
      const deps = getDeps();
      const l = deps.getActiveLayer();
      if (l?.synth) deps.updateLayer(l.id, { synth: { ...l.synth, [param]: v } });
    },
    setChordParam: (param, v) => getDeps().setChordParam(param, v),
    chordCommand: (cmd) => {
      const deps = getDeps();
      const chord = deps.getChord();
      if (cmd === 'toggle') deps.setChord({ seventh: !chord.seventh });
      else if (cmd === 'keyUp') deps.setChord({ key: shiftKey(chord.key, 1) });
      else if (cmd === 'keyDown') deps.setChord({ key: shiftKey(chord.key, -1) });
      else if (cmd === 'scaleUp') deps.setChord({ scale: cycleScale(chord.scale, 1) });
      else if (cmd === 'scaleDown') deps.setChord({ scale: cycleScale(chord.scale, -1) });
      else if (cmd === 'generate') previewProgression();
      else if (cmd === 'toPattern') deps.applyProgressionToPattern(progressionChords(deps.generateProgression()));
    },
    padCommand: (cmd) => {
      const deps = getDeps();
      const pad = deps.getSelectedPad();
      const layerId = deps.getPrograms()[deps.getActiveBank()]?.[pad];
      if (cmd === 'mute' && layerId) deps.togglePadMute(layerId);
      else if (cmd === 'clear') deps.clearPad(pad);
      else if (cmd === 'assign') deps.assignPad(pad);
    },
    patternCommand: (cmd) => {
      const deps = getDeps();
      if (cmd === 'clear') deps.clearPattern();
      else if (cmd === 'quantize') deps.quantizePattern();
      else if (cmd === 'humanize') deps.humanizePattern();
    },
    selectBank: (bank) => getDeps().setActiveBank(bank),
    nextBank: () => {
      const deps = getDeps();
      const banks = Object.keys(deps.getPrograms());
      const i = banks.indexOf(deps.getActiveBank());
      deps.setActiveBank(banks[(i + 1) % banks.length]);
    },
    grooveCommand: () => {
      const tpl = GROOVE_TEMPLATES[grooveIndex % GROOVE_TEMPLATES.length];
      grooveIndex += 1;
      getDeps().applyGroove(tpl);
    },
    sampleCommand: (cmd) => getDeps().sampleCommand(cmd),
    sampleParam: (param, value) => getDeps().sampleParam(param, value),
    samplePad: (index, velocity01) => getDeps().samplePad(index, velocity01),
    recourseCommand: (cmd) => getDeps().recourseCommand(cmd),
    recourseParam: (param, value) => getDeps().recourseParam(param, value),
    sectionChannel: (index, kind, v) => {
      const target = getDeps().getLayers()[index];
      if (!target) return;
      if (kind === 'gain') getDeps().updateLayer(target.id, { gain: v });
      else getDeps().updateLayer(target.id, { pan: v });
    },
    sectionLayer: (param, v) => {
      const l = getDeps().getActiveLayer();
      if (!l) return;
      applySectionLayerParam(getDeps(), l, param, v);
    },
    sectionCompare: (param, value, on) => {
      if (COMPARE_EDGE.has(param) && !risingEdge(`compare:${param}`, on)) return;
      getDeps().sectionCompare(param, value, on);
    },
    sectionEvolution: (param, value, on) => {
      if (EVOLUTION_EDGE.has(param) && !risingEdge(`evolution:${param}`, on)) return;
      getDeps().sectionEvolution(param, value, on);
    },
    sectionPad: (kind, index, on, value) => {
      if (!on) return;
      const deps = getDeps();
      switch (kind) {
        case 'layer': {
          const layer = deps.getLayers()[index];
          if (!layer) return;
          deps.selectLayer(index);
          deps.triggerLayer(layer.id, 0, value);
          break;
        }
        case 'mute':
          deps.toggleChannelMute(index);
          break;
        case 'variation':
          deps.sectionEvolution('variation', index, true);
          break;
        case 'track':
          deps.sectionCompare('track', index, true);
          break;
        default:
          break;
      }
    },
  };
}

/** Write one selected-layer parameter (pure w.r.t. deps besides updateLayer). */
function applySectionLayerParam(
  deps: StudioControllerDeps,
  l: SoundLayer,
  param: SectionLayerParam,
  v: number,
): void {
  switch (param) {
    case 'gain':
      deps.updateLayer(l.id, { gain: v });
      break;
    case 'pan':
      deps.updateLayer(l.id, { pan: v });
      break;
    case 'pitch':
      deps.updateLayer(l.id, { pitch: Math.round(v) });
      break;
    case 'filterFreq':
    case 'filterRes':
    case 'reverbMix':
      deps.updateLayer(l.id, { fx: { ...l.fx, [param]: v } });
      break;
    case 'attack':
      deps.updateLayer(l.id, { envelope: { ...l.envelope, attack: v } });
      break;
    case 'release':
      deps.updateLayer(l.id, { envelope: { ...l.envelope, release: v } });
      break;
    default: {
      const _exhaustive: never = param;
      void _exhaustive;
    }
  }
}

/** Shared progression generator for a chord-settings object. */
export function generateProgressionFromChord(chord: ChordPadSettings): TheoryChord[] {
  return makeProgression(chord.key, {
    scaleType: chord.scale,
    bars: 4,
    complexity: chord.seventh ? 1 : 0,
    seed: Date.now() % 100000,
    trials: 4,
  });
}
