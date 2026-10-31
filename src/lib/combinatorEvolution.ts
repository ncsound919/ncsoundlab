/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Mutate a CombinatorState into variants (Sound Lab evolution style).
 */
import type { CombinatorState, CombinatorSlot } from '../types';

const MODULES = ['FILTER', 'SATURATION', 'TAPE_MACHINE', 'CHORUS_WIDTH', 'TEMPO_DELAY', 'FET_1176', 'BITCRUSH' as any];
const MOTIONS: CombinatorSlot['motion'][] = ['macro', 'lfo', 'follower', 'sequencer', 'xy'];

function mutateSlot(s: CombinatorSlot, chaos: number): CombinatorSlot {
  const out: CombinatorSlot = JSON.parse(JSON.stringify(s));
  if (Math.random() < chaos) {
    out.moduleId = (MODULES[Math.floor(Math.random() * MODULES.length)] as string) || out.moduleId;
  }
  if (Math.random() < chaos) {
    out.motion = MOTIONS[Math.floor(Math.random() * MOTIONS.length)];
  }
  for (const k of Object.keys(out.params)) {
    if (Math.random() < chaos * 0.5) {
      const v = out.params[k];
      out.params[k] = v * (0.5 + Math.random());
    }
  }
  out.mix = Math.min(1, Math.max(0, out.mix + (Math.random() - 0.5) * chaos * 0.4));
  return out;
}

export function evolveCombinatorState(base: CombinatorState, count = 8, chaos = 0.5): CombinatorState[] {
  const out: CombinatorState[] = [];
  for (let i = 0; i < count; i++) {
    const variant: CombinatorState = JSON.parse(JSON.stringify(base));
    variant.slots = variant.slots.map((s) => mutateSlot(s, chaos));
    variant.masterMix = Math.min(1, Math.max(0, variant.masterMix + (Math.random() - 0.5) * chaos * 0.2));
    variant.presetId = undefined;
    out.push(variant);
  }
  return out;
}
