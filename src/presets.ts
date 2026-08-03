import { RackModule } from './types';
import { DEFAULT_EQ_SETTINGS } from './audio/dsp/AdvancedParametricEQ';
import { DEFAULT_COMPRESSOR_SETTINGS } from './audio/dsp/AdvancedCompressor';

export const presets: Record<string, () => RackModule[]> = {
  'Vocal Polish Chain': () => [
    {
      id: 'p-eq-1',
      type: 'eq',
      enabled: true,
      settings: DEFAULT_EQ_SETTINGS,
    },
    {
      id: 'p-comp-1',
      type: 'compressor',
      enabled: true,
      settings: { ...DEFAULT_COMPRESSOR_SETTINGS, mode: 'opto', threshold: -20, ratio: 4 },
    },
    {
      id: 'p-exciter-1',
      type: 'exciter',
      enabled: true,
      settings: { amount: 35, freq: 3500 },
    },
    {
      id: 'p-reverb-1',
      type: 'reverb',
      enabled: true,
      settings: { mix: 20, decay: 2.2 },
    },
  ],
  'Analog Drum Punch': () => [
    {
      id: 'p-tape-1',
      type: 'tape',
      enabled: true,
      settings: { drive: 4.5, bias: 60, wowFlutter: 10 },
    },
    {
      id: 'p-comp-2',
      type: 'compressor',
      enabled: true,
      settings: { ...DEFAULT_COMPRESSOR_SETTINGS, mode: 'fet', attackMs: 2, releaseMs: 80, ratio: 8 },
    },
    {
      id: 'p-clipper-1',
      type: 'clipper',
      enabled: true,
      settings: { threshold: -2, ceil: -0.1 },
    },
  ],
  'Lo-Fi Tape Chill': () => [
    {
      id: 'p-tape-2',
      type: 'tape',
      enabled: true,
      settings: { drive: 8, bias: 40, wowFlutter: 45 },
    },
    {
      id: 'p-tremolo-1',
      type: 'tremolo',
      enabled: true,
      settings: { rate: 3.5, depth: 40, shape: 'sine' },
    },
    {
      id: 'p-delay-1',
      type: 'delay',
      enabled: true,
      settings: { mix: 35, time: 380, feedback: 50 },
    },
  ],
  'Mastering Bus Glue': () => [
    {
      id: 'p-eq-m1',
      type: 'eq',
      enabled: true,
      settings: DEFAULT_EQ_SETTINGS,
    },
    {
      id: 'p-comp-m1',
      type: 'compressor',
      enabled: true,
      settings: { ...DEFAULT_COMPRESSOR_SETTINGS, mode: 'vca', ratio: 2, threshold: -12, attackMs: 30 },
    },
    {
      id: 'p-imager-m1',
      type: 'imager',
      enabled: true,
      settings: { width: 125, bassMonoCutoff: 100 },
    },
    {
      id: 'p-limiter-m1',
      type: 'limiter',
      enabled: true,
      settings: { threshold: -1, release: 120, ceiling: -0.1 },
    },
  ],
};
