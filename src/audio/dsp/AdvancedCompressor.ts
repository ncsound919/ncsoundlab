/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CompressorMode = 'vca' | 'opto' | 'fet' | 'clean';

export interface AdvancedCompressorSettings {
  threshold: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  makeupGain: number;
  mode: CompressorMode;
  mixPercent: number;
  autoRelease?: boolean;
  topology?: 'feed-forward' | 'feed-back' | 'dual';
  detector?: 'peak' | 'rms' | 'program';
  kneeMode?: 'hard' | 'soft' | 'variable';
  oversampling?: '1x' | '2x' | '4x' | '8x' | '16x';
}

export interface CompressorPreset {
  id: string;
  label: string;
  settings: Partial<AdvancedCompressorSettings>;
}

export const COMPRESSOR_PRESETS: CompressorPreset[] = [
  {
    id: 'mix-eq-bus',
    label: 'Glue Bus (VCA 2:1)',
    settings: {
      mode: 'vca',
      threshold: -18,
      ratio: 2,
      attackMs: 30,
      releaseMs: 100,
      makeupGain: 1.5,
      mixPercent: 100,
      autoRelease: false,
    },
  },
  {
    id: 'vocal-opto',
    label: 'Smooth Vocal (Opto T4)',
    settings: {
      mode: 'opto',
      threshold: -22,
      ratio: 4,
      attackMs: 10,
      releaseMs: 150,
      makeupGain: 3,
      mixPercent: 100,
      autoRelease: true,
    },
  },
  {
    id: 'drum-fet-slam',
    label: 'Punchy Drum (FET All-Buttons)',
    settings: {
      mode: 'fet',
      threshold: -14,
      ratio: 8,
      attackMs: 1.5,
      releaseMs: 60,
      makeupGain: 4,
      mixPercent: 80,
      autoRelease: false,
    },
  },
  {
    id: 'master-transparent',
    label: 'Clean Mastering Peak Limiter',
    settings: {
      mode: 'clean',
      threshold: -10,
      ratio: 1.5,
      attackMs: 50,
      releaseMs: 250,
      makeupGain: 0.8,
      mixPercent: 100,
      autoRelease: true,
    },
  },
];

export const DEFAULT_COMPRESSOR_SETTINGS: AdvancedCompressorSettings = {
  threshold: -18,
  ratio: 4,
  attackMs: 10,
  releaseMs: 100,
  makeupGain: 2,
  mode: 'vca',
  mixPercent: 100,
  autoRelease: false,
  topology: 'feed-forward',
  detector: 'peak',
  kneeMode: 'soft',
  oversampling: '1x',
};

export function applyCompressorPreset(
  current: AdvancedCompressorSettings,
  preset: CompressorPreset
): AdvancedCompressorSettings {
  return {
    ...current,
    ...preset.settings,
  };
}
