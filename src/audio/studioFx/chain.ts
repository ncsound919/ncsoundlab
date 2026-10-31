/** @license SPDX-License-Identifier: Apache-2.0 */
import { f } from './primitives';
import { slotValue, sanitizeParams, type FxSlot } from './catalog';
import type { StudioModule } from './types';
import {
  AirShelfModule,
  FilterModule,
  MidSideEqModule,
  Neve1073Module,
  PultecEqp1aModule,
  SslChannelEqModule,
  TrimModule,
} from './modulesEq';
import {
  ChannelLimiterModule,
  DeEsserModule,
  Fet1176Module,
  OptoLa2aModule,
  ParallelCompModule,
  SidechainDuckModule,
  TruePeakLimiterModule,
  VariMuCompModule,
  VcaBusCompModule,
} from './modulesDynamics';
import {
  AlgorithmicReverbModule,
  ChorusWidthModule,
  SaturationModule,
  TapeMachineModule,
  TempoDelayModule,
} from './modulesColorSpace';
import {
  LadderFilterModule,
  PhoneMicEmulationModule,
  PhoneNoiseReductionModule,
} from './modulesLadder';

export function createModule(kind: string, sampleRate: number): StudioModule | null {
  switch (kind) {
    case 'TRIM': return new TrimModule(sampleRate);
    case 'FILTER': return new FilterModule(sampleRate);
    case 'LADDER_FILTER': return new LadderFilterModule(sampleRate);
    case 'NEVE_1073': return new Neve1073Module(sampleRate);
    case 'SSL_CHANNEL_EQ': return new SslChannelEqModule(sampleRate);
    case 'PULTEC_EQP1A': return new PultecEqp1aModule(sampleRate);
    case 'AIR_SHELF': return new AirShelfModule(sampleRate);
    case 'MID_SIDE_EQ': return new MidSideEqModule(sampleRate);
    case 'FET_1176': return new Fet1176Module(sampleRate);
    case 'OPTO_LA2A': return new OptoLa2aModule(sampleRate);
    case 'VCA_BUS_COMP': return new VcaBusCompModule(sampleRate);
    case 'VARI_MU_COMP': return new VariMuCompModule(sampleRate);
    case 'PARALLEL_COMP': return new ParallelCompModule(sampleRate);
    case 'DE_ESSER': return new DeEsserModule(sampleRate);
    case 'SIDECHAIN_DUCK': return new SidechainDuckModule(sampleRate);
    case 'SATURATION': return new SaturationModule(sampleRate);
    case 'TAPE_MACHINE': return new TapeMachineModule(sampleRate);
    case 'PLATE_REVERB': return new AlgorithmicReverbModule(sampleRate, 'PLATE_REVERB');
    case 'HALL_REVERB': return new AlgorithmicReverbModule(sampleRate, 'HALL_REVERB');
    case 'ROOM_REVERB': return new AlgorithmicReverbModule(sampleRate, 'ROOM_REVERB');
    case 'TEMPO_DELAY': return new TempoDelayModule(sampleRate);
    case 'CHORUS_WIDTH': return new ChorusWidthModule(sampleRate);
    case 'TRUE_PEAK_LIMITER': return new TruePeakLimiterModule(sampleRate);
    case 'CHANNEL_LIMITER': return new ChannelLimiterModule(sampleRate);
    case 'PHONE_NOISE_REDUCTION': return new PhoneNoiseReductionModule(sampleRate);
    case 'PHONE_MIC_EMULATION': return new PhoneMicEmulationModule(sampleRate);
    default: return null;
  }
}

/**
 * Ordered insert chain. Rebuilds only when the chain shape changes; a parameter
 * move reconfigures the live module, so filter and compressor state survives
 * and editing never clicks. Mirrors `TrackPluginRack` in the shared core.
 */
export class StudioFxChainProcessor {
  private modules: StudioModule[] = [];
  private ids: string[] = [];
  private chain: FxSlot[] = [];
  private tempoBpm: number;
  private readonly scratch = new Float32Array(2);

  constructor(private readonly sampleRate: number, tempoBpm = 120) {
    this.tempoBpm = tempoBpm;
  }

  get isEmpty(): boolean {
    return this.modules.length === 0;
  }

  get slots(): FxSlot[] {
    return this.chain;
  }

  setTempoBpm(bpm: number): void {
    this.tempoBpm = bpm;
    this.modules.forEach((module) => module.setTempoBpm(bpm));
  }

  setChain(slots: FxSlot[]): void {
    const next = slots.map((slot) => ({ ...slot, params: sanitizeParams(slot.kind, slot.params ?? {}) }));
    const sameShape =
      next.length === this.modules.length &&
      next.every((slot, index) => slot.kind === this.modules[index].kind && slot.id === this.ids[index]);
    if (sameShape) {
      next.forEach((slot, index) => this.modules[index].configure(slot));
    } else {
      this.build(next);
    }
    this.chain = next;
  }

  private build(slots: FxSlot[]): void {
    const modules: StudioModule[] = [];
    const ids: string[] = [];
    for (const slot of slots) {
      const module = createModule(slot.kind, this.sampleRate);
      if (!module) continue;
      module.configure(slot);
      module.setTempoBpm(this.tempoBpm);
      modules.push(module);
      ids.push(slot.id);
    }
    this.modules = modules;
    this.ids = ids;
  }

  clear(): void {
    this.modules = [];
    this.ids = [];
    this.chain = [];
  }

  processInto(inL: number, inR: number, out: Float32Array): void {
    if (this.modules.length === 0) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    out[0] = inL;
    out[1] = inR;
    for (const module of this.modules) {
      module.processSampleInto(out[0], out[1], this.scratch);
      out[0] = this.scratch[0];
      out[1] = this.scratch[1];
    }
  }

  setKey(l: number, r: number): void {
    this.modules.forEach((module) => module.setKey(l, r));
  }

  reset(): void {
    this.modules.forEach((module) => module.reset());
  }

  get gainReductionDb(): number {
    return this.modules.reduce((max, module) => Math.max(max, module.gainReductionDb), 0);
  }

  get hasSidechain(): boolean {
    return this.modules.some((module) => module.kind === 'SIDECHAIN_DUCK');
  }

  readout(): Array<{ id: string; kind: string; enabled: boolean; gainReductionDb: number; hasMeter: boolean }> {
    const metered = new Set([
      'FET_1176', 'OPTO_LA2A', 'VCA_BUS_COMP', 'VARI_MU_COMP', 'PARALLEL_COMP',
      'DE_ESSER', 'SIDECHAIN_DUCK', 'TRUE_PEAK_LIMITER', 'CHANNEL_LIMITER',
      'PHONE_NOISE_REDUCTION', 'PHONE_MIC_EMULATION',
    ]);
    return this.modules.map((module, index) => ({
      id: this.ids[index] ?? '',
      kind: module.kind,
      enabled: this.chain[index]?.enabled ?? true,
      gainReductionDb: module.gainReductionDb,
      hasMeter: metered.has(module.kind),
    }));
  }
}

/**
 * Offline render used by export and by the parity test. [input] is interleaved
 * mono or stereo; the return buffer has the same shape.
 */
export function renderChain(
  input: Float32Array,
  channels: 1 | 2,
  sampleRate: number,
  slots: FxSlot[],
  tempoBpm = 120,
): Float32Array {
  const frames = Math.floor(input.length / channels);
  const output = new Float32Array(input.length);
  if (frames === 0) return output;
  const rack = new StudioFxChainProcessor(sampleRate, tempoBpm);
  rack.setChain(slots);
  const scratch = new Float32Array(2);
  for (let i = 0; i < frames; i++) {
    const base = i * channels;
    const inL = input[base];
    const inR = channels === 2 ? input[base + 1] : inL;
    rack.processInto(inL, inR, scratch);
    if (channels === 2) {
      output[base] = scratch[0];
      output[base + 1] = scratch[1];
    } else {
      output[base] = f((scratch[0] + scratch[1]) * 0.5);
    }
  }
  return output;
}

/** Reads one slot's value, including a documented default. */
export function valueOf(slot: FxSlot, key: string): number {
  return slotValue(slot, key);
}
