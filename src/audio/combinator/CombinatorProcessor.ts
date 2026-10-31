/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Hex Combinator — serial multi-slot processor with motion (modulation).
 *
 * Every slot wraps a module from the shared `nc.studio-fx-catalog.v1` suite
 * (the same DSP NC Studio and NC Phone Beat run), so a Combinator slot and a
 * studio rack insert are the same engine — this file only decides how the
 * slot's parameters are driven.
 *
 * Control rate: motion sources are evaluated once per `blockSize` frames and
 * every rate in here is expressed per frame, so callers pass the elapsed
 * frame count. Evaluating per-sample would only burn CPU; advancing per block
 * without accounting for the block length made every LFO, sequencer and gate
 * run 32x slow.
 */
import { f, Db } from '../studioFx/primitives';
import { StudioFxChainProcessor } from '../studioFx/chain';
import { kindSpec, type FxSlot } from '../studioFx/catalog';
import { toSharedParams } from './sharedParams';
import type { CombinatorState, CombinatorSlot } from '../../types';
import { Lfo, type LfoShape } from './Lfo';
import { Follower } from './Follower';
import { Sequencer } from './Sequencer';
import { ModMatrix } from './ModMatrix';
import { MultibandSplitter } from './Multiband';

interface SlotRuntime {
  slot: CombinatorSlot;
  lfo?: Lfo;
  follower?: Follower;
  seq?: Sequencer;
  baseParams: Record<string, number>;
  processors: StudioFxChainProcessor[]; // [main] or [low, mid, high]
  splitter?: MultibandSplitter;
  /** Signature of the last LFO shape pushed into the oscillator. */
  lfoShapeSig?: string;
  /** Signature of the last step pattern pushed into the sequencer. */
  stepsSig?: string;
  stepsPerBeat?: number;
  glide?: number;
  followerTimes?: [number, number];
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Module ids the shared suite does not know; warned about once each. */
const unknownKinds = new Set<string>();

export class CombinatorProcessor {
  private sampleRate: number;
  private tempoBpm = 120;
  private state: CombinatorState | null = null;
  private runtimes: SlotRuntime[] = [];
  private modMatrix = new ModMatrix();
  private blockCounter = 0;
  private readonly blockSize = 32;
  private smoothedMotion: Record<string, number> = {};
  private gateHold = 0;
  private prevPeak = 0;
  /** Peak of the input since the last control block; drives the gate motion. */
  private blockPeak = 0;
  /** Reused every frame so the audio path never allocates. */
  private readonly scratch = new Float32Array(2);

  constructor(sampleRate: number, tempoBpm = 120) {
    this.sampleRate = sampleRate;
    this.tempoBpm = tempoBpm;
  }

  setSampleRate(sr: number): void {
    if (!Number.isFinite(sr) || sr <= 0 || sr === this.sampleRate) return;
    const state = this.state;
    this.sampleRate = sr;
    // Filters, splitters and time constants are all built at construction
    // rate, so runtimes have to be rebuilt rather than patched.
    this.runtimes = [];
    if (state) this.setCombinator(state);
  }

  setTempoBpm(bpm: number): void {
    this.tempoBpm = bpm;
    this.runtimes.forEach((rt) => {
      rt.processors.forEach((p) => p.setTempoBpm(bpm));
      if (rt.seq) rt.seq.setTempo(bpm, rt.stepsPerBeat ?? 4, this.sampleRate);
    });
  }

  /**
   * Installs (or replaces) the chain. Runtimes are reused whenever a slot
   * keeps its module, band layout and motion source, so moving a knob
   * reconfigures the live DSP instead of rebuilding it — a rebuild would
   * throw away filter and compressor state and click on every edit.
   */
  setCombinator(state: CombinatorState | null): void {
    this.state = state;
    if (!state || state.slots.length === 0) {
      this.runtimes = [];
      this.smoothedMotion = {};
      this.gateHold = 0;
      this.prevPeak = 0;
      this.blockPeak = 0;
      return;
    }
    this.modMatrix.setRoutes(state.routes ?? []);

    const previous = new Map(this.runtimes.map((rt) => [rt.slot.id, rt]));
    const next: SlotRuntime[] = [];
    for (const slot of state.slots) {
      if (!slot.enabled) continue;
      if (!kindSpec(slot.moduleId)) {
        if (!unknownKinds.has(slot.moduleId)) {
          unknownKinds.add(slot.moduleId);
          console.warn(`Combinator: "${slot.moduleId}" is not in the shared FX catalog; slot skipped.`);
        }
        continue;
      }
      const existing = previous.get(slot.id);
      if (existing && reusable(existing, slot)) {
        existing.slot = slot;
        existing.baseParams = { ...slot.params };
        this.refreshMotion(existing, slot);
        this.configureRuntime(existing);
        next.push(existing);
      } else {
        next.push(this.makeRuntime(slot));
      }
    }
    this.runtimes = next;
  }

  private multiband(slot: CombinatorSlot): boolean {
    const { low, mid, high } = slot.bands;
    // All three bands on = one full-range insert; any band soloed/divided
    // splits the signal so each band can be treated (or bypassed) alone.
    return !(low && mid && high);
  }

  private static bandEnabled(slot: CombinatorSlot, index: number): boolean {
    if (index === 0) return slot.bands.low;
    if (index === 1) return slot.bands.mid;
    return slot.bands.high;
  }

  private makeRuntime(slot: CombinatorSlot): SlotRuntime {
    const rt: SlotRuntime = { slot, baseParams: { ...slot.params }, processors: [] };
    const mp = slot.motionParams as Record<string, unknown>;
    if (slot.motion === 'lfo') {
      rt.lfo = new Lfo();
    } else if (slot.motion === 'follower' || slot.motion === 'sidechain') {
      rt.follower = new Follower(this.sampleRate, num(mp.attack, 10), num(mp.release, 100));
    } else if (slot.motion === 'sequencer') {
      // refreshMotion below owns tempo/steps/glide: leaving its cached
      // signatures unset is what makes it configure a fresh Sequencer.
      rt.seq = new Sequencer();
    }
    this.refreshMotion(rt, slot);

    if (this.multiband(slot)) {
      rt.splitter = new MultibandSplitter(this.sampleRate, slot.crossovers[0], slot.crossovers[1]);
      rt.processors = [0, 1, 2].map(() => new StudioFxChainProcessor(this.sampleRate, this.tempoBpm));
    } else {
      rt.processors = [new StudioFxChainProcessor(this.sampleRate, this.tempoBpm)];
    }
    this.configureRuntime(rt);
    return rt;
  }

  /** Pushes motion configuration that actually changed into the source. */
  private refreshMotion(rt: SlotRuntime, slot: CombinatorSlot): void {
    const mp = slot.motionParams as Record<string, unknown>;
    if (rt.lfo) {
      const shape = String(mp.shape ?? 'sine');
      const sig = `${shape}|${JSON.stringify(slot.lfoShape ?? null)}`;
      if (sig !== rt.lfoShapeSig) {
        rt.lfoShapeSig = sig;
        try {
          rt.lfo.setShape(shape as LfoShape);
        } catch {
          rt.lfo.setShape('sine');
        }
        if (slot.lfoShape && slot.lfoShape.points.length > 0) {
          rt.lfo.setCustomPoints(slot.lfoShape.points, slot.lfoShape.interp);
        }
      }
    }
    if (rt.follower) {
      const attack = num(mp.attack, 10);
      const release = num(mp.release, 100);
      if (!rt.followerTimes || rt.followerTimes[0] !== attack || rt.followerTimes[1] !== release) {
        rt.followerTimes = [attack, release];
        rt.follower.configure(attack, release, this.sampleRate);
      }
    }
    if (rt.seq) {
      const steps = Array.isArray(mp.steps) ? (mp.steps as number[]) : [1, 0, 1, 0];
      const stepsSig = JSON.stringify(steps);
      if (stepsSig !== rt.stepsSig) {
        rt.stepsSig = stepsSig;
        rt.seq.setSteps(steps);
      }
      const stepsPerBeat = num(mp.stepsPerBeat, 4);
      if (rt.stepsPerBeat !== stepsPerBeat) {
        rt.stepsPerBeat = stepsPerBeat;
        rt.seq.setTempo(this.tempoBpm, stepsPerBeat, this.sampleRate);
      }
      const glide = clamp01(num(mp.glide, 0));
      if (rt.glide !== glide) {
        rt.glide = glide;
        rt.seq.setGlide(glide);
      }
    }
  }

  private configureRuntime(rt: SlotRuntime): void {
    const slot = rt.slot;
    rt.processors.forEach((p, i) => {
      p.setTempoBpm(this.tempoBpm);
      p.setChain([this.makeFxSlot(slot, rt.baseParams, i)]);
    });
  }

  /**
   * Builds the shared-catalog slot for one band: Combinator vocabulary in,
   * `nc.studio-fx-catalog.v1` params out.
   */
  private makeFxSlot(slot: CombinatorSlot, params: Record<string, number>, index: number): FxSlot {
    const split = this.multiband(slot);
    return {
      id: slot.id,
      kind: slot.moduleId,
      enabled: !split || CombinatorProcessor.bandEnabled(slot, index),
      params: toSharedParams(slot.moduleId, params),
    };
  }

  private motionValue(rt: SlotRuntime, frames: number): number {
    const slot = rt.slot;
    const mp = slot.motionParams as Record<string, number>;
    const depth = num(mp.depth, 1);
    let v = 0;
    switch (slot.motion) {
      case 'macro':
        // Macro is 0..1 and has to reach the normaliser as -1..1, otherwise
        // the midpoint lands at 0.75 instead of the neutral 0.5.
        v = num(mp.macro, 0.5) * 2 - 1;
        break;
      case 'lfo':
        if (rt.lfo) {
          const rateHz = num(mp.rateHz, (this.tempoBpm / 60) * num(mp.rateBeats, 1));
          if (mp.retrigger && mp.trigger) {
            rt.lfo.reset();
            mp.trigger = 0;
          }
          v = rt.lfo.tick((rateHz * frames) / this.sampleRate);
        }
        break;
      case 'follower':
      case 'sidechain':
        if (rt.follower) v = rt.follower.valueNow() * 2 - 1;
        break;
      case 'gate': {
        const peak = this.blockPeak;
        this.blockPeak = 0;
        if (peak > this.prevPeak * 1.5 + 0.05 && peak > 0.1) {
          this.gateHold = Math.round((num(mp.holdMs, 100) * this.sampleRate) / 1000);
        }
        this.prevPeak = this.prevPeak * 0.9 + peak * 0.1;
        v = this.gateHold > 0 ? 1 : -1;
        if (this.gateHold > 0) this.gateHold = Math.max(0, this.gateHold - frames);
        break;
      }
      case 'sequencer':
        if (rt.seq) v = rt.seq.tick(frames) * 2 - 1;
        break;
      case 'xy':
        v = num(mp.xyX, 0.5) * 2 - 1;
        break;
      case 'evolution':
        v = num(mp.evo, 0.5) * 2 - 1;
        break;
    }

    const raw =
      slot.motion === 'gate'
        ? v > 0
          ? 1
          : 0
        : f(((v + 1) * 0.5) * depth + (1 - depth) * 0.5);
    const prev = this.smoothedMotion[slot.id] ?? raw;
    const smoothed = f(prev + (raw - prev) * 0.2);
    this.smoothedMotion[slot.id] = smoothed;
    return smoothed;
  }

  /** Applies an XY-pad destination (`slotId.paramKey`) to the live params. */
  private applyXyAssign(dst: string | undefined, value: number, paramsBySlot: Record<string, Record<string, number>>): void {
    if (!dst || typeof value !== 'number') return;
    const dot = dst.indexOf('.');
    if (dot <= 0) return;
    const params = paramsBySlot[dst.slice(0, dot)];
    if (!params) return;
    const key = dst.slice(dot + 1);
    const current = params[key];
    if (typeof current !== 'number' || !Number.isFinite(current)) return;
    // 0.5 (pad centred) is a no-op; the extremes scale by ±25 %.
    params[key] = f(current * (1 + (value - 0.5) * 0.5));
  }

  private updateParams(frames: number): void {
    if (!this.state) return;
    const state = this.state;
    const sourceValues: Record<string, number> = {};
    for (const rt of this.runtimes) sourceValues[rt.slot.id] = this.motionValue(rt, frames);

    const xy = state.xyPos;
    const x = num(xy?.x, 0.5);
    const y = num(xy?.y, 0.5);
    sourceValues['xy:x'] = x;
    sourceValues['xy:y'] = y;

    const paramsBySlot: Record<string, Record<string, number>> = {};
    for (const rt of this.runtimes) {
      const params = { ...rt.baseParams };
      const target = (rt.slot.motionParams as Record<string, unknown>).target;
      if (typeof target === 'string' && target && params[target] !== undefined) {
        const mv = sourceValues[rt.slot.id] ?? 0.5;
        params[target] = f(params[target] * (0.5 + mv));
      }
      paramsBySlot[rt.slot.id] = params;
    }
    this.applyXyAssign(state.xyAssign?.x, x, paramsBySlot);
    this.applyXyAssign(state.xyAssign?.y, y, paramsBySlot);
    this.modMatrix.apply(sourceValues, paramsBySlot);

    for (const rt of this.runtimes) {
      const params = paramsBySlot[rt.slot.id];
      rt.processors.forEach((p, i) => p.setChain([this.makeFxSlot(rt.slot, params, i)]));
    }
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    const mid = (inL + inR) * 0.5;
    const absMid = mid < 0 ? -mid : mid;
    if (absMid > this.blockPeak) this.blockPeak = absMid;
    // The follower reads the slot's input before any slot processes it.
    for (const rt of this.runtimes) {
      if (rt.follower) rt.follower.process(mid);
    }

    if (this.blockCounter === 0) this.updateParams(this.blockSize);
    this.blockCounter = (this.blockCounter + 1) % this.blockSize;

    let curL = inL;
    let curR = inR;
    for (const rt of this.runtimes) {
      const slot = rt.slot;
      const pre = Db.toLinear(num(slot.preGainDb, 0));
      const post = Db.toLinear(num(slot.postGainDb, 0));
      const feedL = f(curL * pre);
      const feedR = f(curR * pre);

      let wetL: number;
      let wetR: number;
      if (rt.splitter && rt.processors.length === 3) {
        const bands = rt.splitter.process(feedL, feedR);
        const sources: Array<[number, number]> = [bands.low, bands.mid, bands.high];
        let accL = 0;
        let accR = 0;
        for (let i = 0; i < 3; i++) {
          let bandL = sources[i][0];
          let bandR = sources[i][1];
          if (CombinatorProcessor.bandEnabled(slot, i)) {
            rt.processors[i].processInto(bandL, bandR, this.scratch);
            bandL = this.scratch[0];
            bandR = this.scratch[1];
          }
          accL += bandL;
          accR += bandR;
        }
        wetL = accL;
        wetR = accR;
      } else {
        rt.processors[0].processInto(feedL, feedR, this.scratch);
        wetL = this.scratch[0];
        wetR = this.scratch[1];
      }

      const mix = clamp01(num(slot.mix, 1));
      curL = f(f(feedL * (1 - mix) + wetL * mix) * post);
      curR = f(f(feedR * (1 - mix) + wetR * mix) * post);
      if (slot.polarity) {
        curL = -curL;
        curR = -curR;
      }
    }

    const mix = clamp01(num(this.state?.masterMix, 1));
    out[0] = f(inL * (1 - mix) + curL * mix);
    out[1] = f(inR * (1 - mix) + curR * mix);
  }

  setKey(l: number, r: number): void {
    this.runtimes.forEach((rt) => rt.processors.forEach((p) => p.setKey(l, r)));
  }

  reset(): void {
    this.gateHold = 0;
    this.prevPeak = 0;
    this.blockPeak = 0;
    this.blockCounter = 0;
    this.smoothedMotion = {};
    this.runtimes.forEach((rt) => {
      rt.processors.forEach((p) => p.reset());
      rt.lfo?.reset();
      rt.follower?.reset();
      rt.seq?.reset();
      rt.splitter?.reset();
    });
  }

  get isEmpty(): boolean {
    return this.runtimes.length === 0;
  }
}

/** A slot can keep its DSP state only if its identity and band layout match. */
function reusable(rt: SlotRuntime, slot: CombinatorSlot): boolean {
  if (rt.slot.moduleId !== slot.moduleId) return false;
  if (rt.slot.motion !== slot.motion) return false;
  if (rt.slot.bands.low !== slot.bands.low || rt.slot.bands.mid !== slot.bands.mid || rt.slot.bands.high !== slot.bands.high) {
    return false;
  }
  if (rt.slot.crossovers[0] !== slot.crossovers[0] || rt.slot.crossovers[1] !== slot.crossovers[1]) return false;
  return rt.processors.length === (isSplit(slot) ? 3 : 1);
}

function isSplit(slot: CombinatorSlot): boolean {
  const { low, mid, high } = slot.bands;
  return !(low && mid && high);
}
