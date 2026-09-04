/**
 * Recourse bridge — hydrate a `recourse-soundlab-piece` (emitted by the Recourse
 * composer) into SoundLab state: synth SoundLayers + a playable Pattern + a
 * song chain. Playback itself is driven by the app's own sequencer (Web Audio
 * needs a user gesture, so the bridge LOADS the piece and requests play; audible
 * start happens when the user clicks play or a prior gesture exists).
 *
 * Pure parts live here so they are unit-testable in Node; only the loader
 * touches React/app state and it is wired from App.tsx.
 */

import {
  SoundLayer,
  Pattern,
  SynthSettings,
  DEFAULT_SYNTH,
  DEFAULT_ENVELOPE,
  DEFAULT_FX,
} from '../types';

export interface RecoursePieceLayer {
  id: string;
  name: string;
  role: 'keysVoice' | 'bass' | 'lead' | 'kick' | 'snare' | 'hat';
  kind: 'synth';
  midi?: number;
}
export interface RecoursePieceCell {
  on: boolean;
  note?: number;
  duration?: number;
}
export interface RecoursePiece {
  format: 'recourse-soundlab-piece';
  version: number;
  style: string;
  title: string;
  bpm: number;
  bars: number;
  headChord: { rootPc: number; quality: string; rootName: string };
  layers: RecoursePieceLayer[];
  pattern: Record<string, RecoursePieceCell[]>;
  chainBars: number;
}

/** role -> a timbre bent toward the part. Merged over DEFAULT_SYNTH.
 *  Only keys that exist on SynthSettings are used (strict typed literals). */
const ROLE_PRESETS: Record<string, Partial<SynthSettings>> = {
  keysVoice: { oscType: 'sawtooth', osc2Type: 'sawtooth', osc2Mix: 0.5, subLevel: 0.4, filterFamily: 'juno_roland', filterDrive: 0.35 },
  bass: { oscType: 'sine', subLevel: 0.9, pitchEnvDepth: -12, filterFamily: 'moog_ladder', filterDrive: 0.3 },
  lead: { oscType: 'sawtooth', osc2Type: 'square', osc2Mix: 0.5, subLevel: 0.3, filterFamily: 'prophet_curtis', pitchEnvDepth: 4, noiseLevel: 0.1 },
  kick: { oscType: 'sine', frequency: 55, subLevel: 0.95, pitchEnvDepth: -36, pitchEnvDecay: 0.1 },
  snare: { oscType: 'sine', frequency: 200, subLevel: 0.2, noiseLevel: 1, noiseColor: 'white', noiseFilterCutoff: 1800, pitchEnvDecay: 0.05 },
  hat: { oscType: 'sine', frequency: 800, subLevel: 0.1, noiseLevel: 1, noiseColor: 'white', noiseFilterCutoff: 9000, pitchEnvDecay: 0.02 },
};

/** A synth SoundLayer with a stable id matching the piece's pattern row keys. */
export function synthLayerFor(pl: RecoursePieceLayer): SoundLayer {
  const preset = ROLE_PRESETS[pl.role] ?? {};
  return {
    id: pl.id,
    name: pl.name || pl.role,
    type: 'synth',
    enabled: true,
    gain: 0.8,
    pan: 0,
    pitch: 0,
    envelope: { ...DEFAULT_ENVELOPE },
    fx: { ...DEFAULT_FX },
    synth: { ...DEFAULT_SYNTH, ...preset },
  };
}

/** One 16-step Pattern 'A' whose rows are keyed by the (stable) layer ids. */
export function patternFor(piece: RecoursePiece): Pattern {
  const layerRows: Record<string, Array<{ on: boolean; note?: number; duration?: number }>> = {};
  for (const layer of piece.layers) {
    layerRows[layer.id] = (piece.pattern[layer.id] ?? []).slice(0, 16);
  }
  return {
    id: 'A',
    name: piece.title || 'Recourse',
    layerRows,
    timeSignature: [4, 4],
    stepLength: 16,
    swing: 0,
    bpm: Math.max(30, Math.min(300, piece.bpm ?? 90)),
  };
}

/** Validate the incoming piece shape before touching app state. */
export function isRecoursePiece(x: unknown): x is RecoursePiece {
  if (!x || typeof x !== 'object') return false;
  const p = x as RecoursePiece;
  return p.format === 'recourse-soundlab-piece' && Array.isArray(p.layers) && !!p.pattern && typeof p.bpm === 'number';
}
