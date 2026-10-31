/**
 * @license SPDX-License-Identifier: Apache-2.0
 */
import type { CombinatorState } from '../types';

export interface CombinatorPreset {
  id: string;
  name: string;
  category: string;
  tags: string[];
  author: string;
  theoryNote: string;
  bpm: number;
  state: CombinatorState;
}

import { REAL_PRESETS } from './combinatorPresetLibrary';

export const COMBINATOR_PRESETS: CombinatorPreset[] = [
  ...REAL_PRESETS,
  {
    id: 'hero-pump',
    name: 'Sidechain Pump',
    category: 'Movement',
    tags: ['sidechain', 'pump', 'house'],
    author: 'NC Sound Lab',
    theoryNote: '1/4-note gain ducking creates the classic pumping feel; release tuned to tempo.',
    bpm: 124,
    state: {
      slots: [
        {
          id: 's1',
          moduleId: 'SIDECHAIN_DUCK',
          enabled: true,
          mix: 1,
          preGainDb: 0,
          postGainDb: 0,
          polarity: false,
          bands: { low: true, mid: true, high: true },
          crossovers: [200, 2000],
          params: { threshold: -20, ratio: 8, attack: 5, release: 120 },
          motion: 'follower',
          motionParams: { depth: 1, attack: 5, release: 120, target: 'threshold' as any },
          locked: false,
        },
      ],
      routes: [],
      masterMix: 1,
      bpm: 124,
      tightMode: true,
      xyAssign: { x: 's1.threshold', y: 's1.release' },
      morphAmount: 0,
    },
  },
  {
    id: 'hero-wobble',
    name: 'Wobble Bass',
    category: 'Bass design',
    tags: ['wobble', 'lfo', 'bass'],
    author: 'NC Sound Lab',
    theoryNote: 'LFO-driven filter cutoff at 1/8 notes creates rhythmic wobble; resonance adds growl.',
    bpm: 140,
    state: {
      slots: [
        {
          id: 's1',
          moduleId: 'LADDER_FILTER',
          enabled: true,
          mix: 1,
          preGainDb: 0,
          postGainDb: 0,
          polarity: false,
          bands: { low: true, mid: true, high: true },
          crossovers: [200, 2000],
          params: { cutoff: 800, resonance: 8, drive: 2 },
          motion: 'lfo',
          motionParams: { depth: 0.8, rateBeats: 0.5, shape: 'sine' as any, target: 'cutoff' as any },
          lfoShape: { points: [{ t: 0, v: -1 }, { t: 0.5, v: 1 }, { t: 1, v: -1 }], interp: 'smooth' },
          locked: false,
        },
      ],
      routes: [],
      masterMix: 1,
      bpm: 140,
      tightMode: true,
      xyAssign: { x: 's1.cutoff', y: 's1.resonance' },
      morphAmount: 0,
    },
  },
];

export function findPreset(id: string): CombinatorPreset | undefined {
  return COMBINATOR_PRESETS.find((p) => p.id === id);
}

export function searchPresets(query: string): CombinatorPreset[] {
  const q = query.toLowerCase();
  return COMBINATOR_PRESETS.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q)) ||
      p.category.toLowerCase().includes(q),
  );
}
