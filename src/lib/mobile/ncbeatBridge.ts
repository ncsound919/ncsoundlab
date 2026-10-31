/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NC Phone Beat (.ncbeat) Interchange Bridge.
 *
 * Bridges the Field Sound Design engine with NC Phone Beat and NC Studio DAW.
 * Produces the canonical `.ncbeat` ZIP container conforming to `ncbeat.v1` spec
 * (defined in `NCBEAT_FORMAT.md`).
 *
 * Zero external host dependencies (no React, no Tauri, no DOM).
 */

import { encodeWavMono } from '../../audio/mobile/wavCodec';
import type { FieldKit } from './fieldKit';

export const NCBEAT_SCHEMA = 'ncbeat.v1';
export const NCBEAT_APP = 'nc-phone-beat';
export const DRUM_PATTERN_SCHEMA = 'drum.v1';
export const NCBEAT_SAMPLE_RATE = 48000;

export interface NcbeatManifest {
  schema: typeof NCBEAT_SCHEMA;
  app: typeof NCBEAT_APP;
  appVersion: string;
  exportedAt: string;
  tempoBpm: number;
  sampleRate: number;
  channels: number;
  patternSchema: typeof DRUM_PATTERN_SCHEMA;
  patternName: string;
  grid: string;
  lengthSteps: number;
  loopLengthFrames: number;
  trackCount: number;
  files: {
    pattern: string;
    mixer: string;
    stems: string[];
    samples: string[];
  };
}

export interface NcbeatPatternStep {
  pad: number;
  i: number;
  vel: number;
  ratchet?: number;
  prob?: number;
}

export interface NcbeatPattern {
  schema: typeof DRUM_PATTERN_SCHEMA;
  name: string;
  grid: string;
  length_steps: number;
  swing: number;
  steps: NcbeatPatternStep[];
}

export interface NcbeatTrack {
  id: number;
  type: number;
  gain: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  params: number[];
}

export interface NcbeatMixer {
  version: number;
  bpm: number;
  lengthSteps: number;
  grid: string;
  swing: number;
  bank: number;
  master: number;
  fx: number[];
  song: Array<{ pattern: number; repeats: number }>;
  tracks: NcbeatTrack[];
}

export interface NcbeatPackageFile {
  path: string;
  data: Uint8Array | string;
}

export interface BuildNcbeatOptions {
  tempoBpm?: number;
  exportedAt?: string;
  patternName?: string;
  /** Source sample rate for the exported WAVs. Defaults to NCBEAT_SAMPLE_RATE. */
  sampleRate?: number;
}

/**
 * Calculate total frames in one loop:
 * lengthSteps * beatsPerStep(grid) * (60 / bpm) * sampleRate
 */
export function calculateLoopFrames(
  lengthSteps = 16,
  tempoBpm = 140,
  grid = '1/16',
  sampleRate = NCBEAT_SAMPLE_RATE
): number {
  const beatsPerStep: Record<string, number> = {
    '1/8': 0.5,
    '1/16': 0.25,
    '1/32': 0.125,
    '1/16T': 1 / 12,
    '1/32T': 1 / 24,
  };
  const bps = beatsPerStep[grid] ?? 0.25;
  const seconds = lengthSteps * bps * (60 / Math.max(40, Math.min(300, tempoBpm)));
  return Math.round(seconds * sampleRate);
}

/**
 * Build manifest.json matching ncbeat.v1 schema.
 */
export function buildNcbeatManifest(
  kit: FieldKit,
  samplePaths: string[],
  sourceSampleRateOrOptions: number | BuildNcbeatOptions = NCBEAT_SAMPLE_RATE,
  options: BuildNcbeatOptions = {}
): NcbeatManifest {
  let opts: BuildNcbeatOptions;
  let sourceSampleRate: number;
  if (typeof sourceSampleRateOrOptions === 'object' && sourceSampleRateOrOptions !== null) {
    opts = sourceSampleRateOrOptions;
    sourceSampleRate = opts.sampleRate ?? NCBEAT_SAMPLE_RATE;
  } else {
    opts = options;
    sourceSampleRate = typeof sourceSampleRateOrOptions === 'number' ? sourceSampleRateOrOptions : NCBEAT_SAMPLE_RATE;
  }
  if (!Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0) {
    throw new Error(`buildNcbeatManifest needs a positive sample rate, got ${sourceSampleRate}`);
  }
  const tempoBpm = opts.tempoBpm ?? 140;
  const lengthSteps = 16;
  const grid = '1/16';
  const loopFrames = calculateLoopFrames(lengthSteps, tempoBpm, grid, sourceSampleRate);
  const sanitized = kit.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const patternName = opts.patternName ?? (sanitized.length > 0 ? sanitized : 'field-beat');

  return {
    schema: NCBEAT_SCHEMA,
    app: NCBEAT_APP,
    appVersion: '1',
    exportedAt: opts.exportedAt ?? new Date().toISOString(),
    tempoBpm,
    sampleRate: sourceSampleRate,
    channels: 1,
    patternSchema: DRUM_PATTERN_SCHEMA,
    patternName,
    grid,
    lengthSteps,
    loopLengthFrames: loopFrames,
    trackCount: Math.min(16, Math.max(1, samplePaths.length)),
    files: {
      pattern: 'pattern.json',
      mixer: 'mixer.json',
      stems: ['stems/master.wav'],
      samples: samplePaths,
    },
  };
}

/**
 * Build a default 16-step pattern triggering the first 4-8 pads.
 */
export function buildNcbeatPattern(
  padCount: number,
  options: BuildNcbeatOptions = {}
): NcbeatPattern {
  const count = Math.min(16, Math.max(1, padCount));
  const steps: NcbeatPatternStep[] = [];

  // Standard showcase groove across the pads:
  // Pad 0 (kick/low hit) on 0, 8
  // Pad 1 (snare/crack) on 4, 12
  // Pad 2 (hihat/texture) on 2, 6, 10, 14
  // Higher pads scatter on remaining steps
  for (let i = 0; i < 16; i++) {
    const pad = i % count;
    steps.push({
      pad,
      i,
      vel: 90 + Math.round(20 * Math.sin(i * 1.5)),
    });
  }

  return {
    schema: DRUM_PATTERN_SCHEMA,
    name: options.patternName ?? 'field-kit',
    grid: '1/16',
    length_steps: 16,
    swing: 0,
    steps,
  };
}

/**
 * Build mixer.json matching Phone Beat engine's v2 format.
 */
export function buildNcbeatMixer(trackCount: number, tempoBpm = 140): NcbeatMixer {
  const tracks: NcbeatTrack[] = [];
  const count = Math.min(16, Math.max(1, trackCount));

  for (let i = 0; i < count; i++) {
    tracks.push({
      id: i,
      type: 0, // Sampler / Kit pad track
      gain: 1.0,
      pan: (i % 2 === 0 ? -0.1 : 0.1) * (i / count),
      mute: false,
      solo: false,
      params: new Array(24).fill(0),
    });
  }

  return {
    version: 2,
    bpm: tempoBpm,
    lengthSteps: 16,
    grid: '1/16',
    swing: 0.0,
    bank: 0,
    master: 1.0,
    fx: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    song: [{ pattern: 0, repeats: 4 }],
    tracks,
  };
}

/**
 * Generate full file entries ready to be zipped into an `.ncbeat` package.
 */
export function buildNcbeatPackage(
  kit: FieldKit,
  sliceSamples: Float32Array[],
  sourceSampleRate: number,
  options: BuildNcbeatOptions = {}
): NcbeatPackageFile[] {
  const tempoBpm = options.tempoBpm ?? 140;
  const files: NcbeatPackageFile[] = [];
  const samplePaths: string[] = [];

  // Up to 16 pads:
  const padCount = Math.min(16, Math.max(1, kit.slices.length));

  for (let i = 0; i < padCount; i++) {
    const path = `samples/pad${String(i).padStart(2, '0')}.wav`;
    samplePaths.push(path);
    const samples = sliceSamples[i] ?? new Float32Array(sourceSampleRate * 0.1);
    // Encode pad WAV
    const wavBytes = encodeWavMono(samples, sourceSampleRate);
    files.push({ path, data: wavBytes });
  }

  // Master preview loop stem (simple mix of all pads played on beat)
  const loopFrames = calculateLoopFrames(16, tempoBpm, '1/16', sourceSampleRate);
  const masterMix = new Float32Array(loopFrames);
  const stepFrames = Math.floor(loopFrames / 16);

  for (let i = 0; i < 16; i++) {
    const padIndex = i % padCount;
    const padData = sliceSamples[padIndex];
    if (padData) {
      const start = i * stepFrames;
      const copyLen = Math.min(padData.length, loopFrames - start);
      for (let s = 0; s < copyLen; s++) {
        masterMix[start + s] = Math.max(-1, Math.min(1, masterMix[start + s] + padData[s] * 0.5));
      }
    }
  }

  files.push({
    path: 'stems/master.wav',
    data: encodeWavMono(masterMix, sourceSampleRate),
  });

  const manifest = buildNcbeatManifest(kit, samplePaths, sourceSampleRate, options);
  const pattern = buildNcbeatPattern(padCount, options);
  const mixer = buildNcbeatMixer(padCount, tempoBpm);

  files.push({ path: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
  files.push({ path: 'pattern.json', data: JSON.stringify(pattern, null, 2) });
  files.push({ path: 'mixer.json', data: JSON.stringify(mixer, null, 2) });

  return files;
}
