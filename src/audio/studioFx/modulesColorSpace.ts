/** @license SPDX-License-Identifier: Apache-2.0 */
import { Biquad, Db, Dyn, f, Oversampler, PeakMeter, PI, SmoothValue, TAU } from './primitives';
import { slotValue, type FxSlot } from './catalog';
import type { StudioModule } from './types';

/** Tape / tube / transformer / console harmonic colors, oversampled. */
export class SaturationModule implements StudioModule {
  readonly kind = 'SATURATION';
  enabled = true;
  readonly latencySamples = 0;
  readonly gainReductionDb = 0;
  private type = 0;
  private drive = 1;
  private warmth = 0.4;
  private readonly mixSmoother: SmoothValue;
  private oversampler: Oversampler | null = null;
  private lpL = 0;
  private lpR = 0;
  private readonly scratch = new Float32Array(2);
  private readonly inputMeter = new PeakMeter();
  private readonly outputMeter = new PeakMeter();

  constructor(private readonly sampleRate: number) {
    this.mixSmoother = new SmoothValue(1, sampleRate, 12);
  }

  get inputPeakLevel(): number {
    return this.inputMeter.peak;
  }
  get outputPeakLevel(): number {
    return this.outputMeter.peak;
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.type = Math.min(Math.max(Math.trunc(slotValue(slot, 'type')), 0), 3);
    this.drive = Db.toLinear(slotValue(slot, 'driveDb'));
    this.warmth = slotValue(slot, 'warmth');
    this.mixSmoother.set(slotValue(slot, 'mix'));
    const factor = Math.min(Math.max(Math.trunc(slotValue(slot, 'oversample')), 1), 4);
    if (factor <= 1) this.oversampler = null;
    else if (!this.oversampler || this.oversampler.factor !== factor) {
      this.oversampler = new Oversampler(factor, this.sampleRate);
    }
  }

  private shapeFor(x: number, channel: number): number {
    switch (this.type) {
      case 0: {
        const driven = f(Math.tanh(f(x * f(1 + f(this.warmth * 0.4)))));
        let smoothed: number;
        if (channel === 0) {
          this.lpL = f(this.lpL + f(0.3 * f(driven - this.lpL)));
          smoothed = this.lpL;
        } else {
          this.lpR = f(this.lpR + f(0.3 * f(driven - this.lpR)));
          smoothed = this.lpR;
        }
        return f(f(driven * f(1 - f(this.warmth * 0.2))) + f(smoothed * f(this.warmth * 0.2)));
      }
      case 1: {
        const bias = f(1 + f(this.warmth * 0.5));
        const driven = f(x * f(1 + f(this.warmth * 0.3)));
        return driven >= 0 ? f(Math.tanh(f(driven * bias))) : f(Math.tanh(f(driven / bias)));
      }
      case 2: {
        const driven = f(x / f(1 + f(Math.abs(x) * f(0.8 - f(this.warmth * 0.4)))));
        let weighted: number;
        if (channel === 0) {
          this.lpL = f(this.lpL + f(0.055 * f(driven - this.lpL)));
          weighted = this.lpL;
        } else {
          this.lpR = f(this.lpR + f(0.055 * f(driven - this.lpR)));
          weighted = this.lpR;
        }
        return f(driven + f(f(weighted * this.warmth) * 0.5));
      }
      default: {
        const driven = f(Math.tanh(f(x * 1.35)));
        return f(f(driven * f(1 - f(this.warmth * 0.1))) + f(f(f(driven * driven) * driven) * f(this.warmth * 0.1)));
      }
    }
  }

  private trimForDrive(): number {
    return f(1 + f(f(this.drive - 1) * 0.18));
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    this.inputMeter.update(inL, inR);
    const os = this.oversampler;
    let l: number;
    let r: number;
    if (!os) {
      l = f(this.shapeFor(f(inL * this.drive), 0) / this.trimForDrive());
      r = f(this.shapeFor(f(inR * this.drive), 1) / this.trimForDrive());
    } else {
      os.upsample(f(inL * this.drive), f(inR * this.drive));
      for (let i = 0; i < os.factor; i++) {
        os.bufferL[i] = this.shapeFor(os.bufferL[i], 0);
        os.bufferR[i] = this.shapeFor(os.bufferR[i], 1);
      }
      os.downsample(this.scratch);
      const trim = this.trimForDrive();
      l = f(this.scratch[0] / trim);
      r = f(this.scratch[1] / trim);
    }
    const mix = this.mixSmoother.next();
    out[0] = f(inL + f(f(l - inL) * mix));
    out[1] = f(inR + f(f(r - inR) * mix));
    this.outputMeter.update(out[0], out[1]);
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.lpL = 0;
    this.lpR = 0;
    this.oversampler?.reset();
    this.inputMeter.reset();
    this.outputMeter.reset();
  }
}

/** Tape machine: record saturation, head bump, HF loss, wow/flutter and noise. */
export class TapeMachineModule implements StudioModule {
  readonly kind = 'TAPE_MACHINE';
  enabled = true;
  readonly latencySamples = 0;
  readonly gainReductionDb = 0;
  private drive = 1;
  private speedIps = 15;
  private bias = 0;
  private wowFlutter = 0.35;
  private noiseOn = false;
  private outGain = 1;
  private oversampler: Oversampler | null = null;
  private readonly headBumpL: Biquad;
  private readonly headBumpR: Biquad;
  private readonly hfLossL: Biquad;
  private readonly hfLossR: Biquad;
  private readonly subsonicL: Biquad;
  private readonly subsonicR: Biquad;
  private readonly delaySize: number;
  private readonly delayL: Float32Array;
  private readonly delayR: Float32Array;
  private writeIndex = 0;
  private wowPhase = 0;
  private flutterPhase = 0;
  private wowRate = 1.2;
  private flutterRate = 7.5;
  private noiseState = 0x12345678;
  private readonly scratch = new Float32Array(2);
  private readonly inputMeter = new PeakMeter();
  private readonly outputMeter = new PeakMeter();

  constructor(private readonly sampleRate: number) {
    this.headBumpL = new Biquad(sampleRate);
    this.headBumpR = new Biquad(sampleRate);
    this.hfLossL = new Biquad(sampleRate);
    this.hfLossR = new Biquad(sampleRate);
    this.subsonicL = new Biquad(sampleRate);
    this.subsonicR = new Biquad(sampleRate);
    this.delaySize = Math.trunc(sampleRate * 0.02) + 4;
    this.delayL = new Float32Array(this.delaySize);
    this.delayR = new Float32Array(this.delaySize);
  }

  get inputPeakLevel(): number {
    return this.inputMeter.peak;
  }
  get outputPeakLevel(): number {
    return this.outputMeter.peak;
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.drive = Db.toLinear(slotValue(slot, 'driveDb'));
    this.speedIps = slotValue(slot, 'speedIps');
    this.bias = slotValue(slot, 'bias');
    this.wowFlutter = slotValue(slot, 'wowFlutter');
    this.noiseOn = slotValue(slot, 'noise') >= 0.5;
    this.outGain = Db.toLinear(slotValue(slot, 'outDb'));
    const factor = Math.abs(this.bias) > 0.1 || this.drive > 2 ? 4 : 2;
    if (!this.oversampler || this.oversampler.factor !== factor) {
      this.oversampler = new Oversampler(factor, this.sampleRate);
    }
    const bumpHz = this.speedIps <= 7.5 ? 40 : this.speedIps <= 15 ? 60 : 95;
    const bumpDb = this.speedIps <= 7.5 ? 3.5 : this.speedIps <= 15 ? 2.5 : 1.5;
    this.headBumpL.setLowShelf(bumpHz, bumpDb, 0.8);
    this.headBumpR.setLowShelf(bumpHz, bumpDb, 0.8);
    const hfBase = this.speedIps <= 7.5 ? 12000 : this.speedIps <= 15 ? 16000 : 20000;
    const hf = hfBase * (1 - Math.max(this.bias, 0) * 0.25);
    this.hfLossL.setLowPass(Math.max(hf, 6000), 0.707);
    this.hfLossR.setLowPass(Math.max(hf, 6000), 0.707);
    this.subsonicL.setHighPass(25, 0.707);
    this.subsonicR.setHighPass(25, 0.707);
    this.wowRate = 1.2;
    this.flutterRate = 7.5;
  }

  private recordShape(x: number): number {
    const biasDrive = f(1 + f(0.35 * f(1 - Math.max(this.bias, 0))));
    const driven = f(x * biasDrive);
    const shape = f(Math.tanh(driven));
    return f(shape - f(f(0.06 * shape) * f(shape * shape)));
  }

  private nextNoise(): number {
    this.noiseState = (Math.imul(this.noiseState, 1664525) + 1013904223) | 0;
    return f(((this.noiseState >>> 8) & 0xffff) / 32768 - 1);
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    this.inputMeter.update(inL, inR);
    const os = this.oversampler;
    let l: number;
    let r: number;
    if (!os) {
      l = this.recordShape(f(inL * this.drive));
      r = this.recordShape(f(inR * this.drive));
    } else {
      os.upsample(f(inL * this.drive), f(inR * this.drive));
      for (let i = 0; i < os.factor; i++) {
        os.bufferL[i] = this.recordShape(os.bufferL[i]);
        os.bufferR[i] = this.recordShape(os.bufferR[i]);
      }
      os.downsample(this.scratch);
      l = this.scratch[0];
      r = this.scratch[1];
    }

    this.wowPhase = f(this.wowPhase + f(f(TAU * this.wowRate) / this.sampleRate));
    if (this.wowPhase >= TAU) this.wowPhase = f(this.wowPhase - TAU);
    this.flutterPhase = f(this.flutterPhase + f(f(TAU * this.flutterRate) / this.sampleRate));
    if (this.flutterPhase >= TAU) this.flutterPhase = f(this.flutterPhase - TAU);
    const baseDelayFrames = f(this.sampleRate * 0.004);
    const modFrames = f(
      f(f(this.wowFlutter * this.sampleRate) * 0.00006) *
        f(f(0.7 * f(Math.sin(this.wowPhase))) + f(0.3 * f(Math.sin(this.flutterPhase)))),
    );
    const readL = this.wrap(this.writeIndex - baseDelayFrames - modFrames);
    const readR = this.wrap(this.writeIndex - f(baseDelayFrames + f(modFrames * 1.02)));
    const iL = Math.trunc(readL);
    const fL = readL - iL;
    const iR = Math.trunc(readR);
    const fR = readR - iR;
    const outDelayedL = f(f(this.delayL[iL] * f(1 - fL)) + f(this.delayL[(iL + 1) % this.delaySize] * fL));
    const outDelayedR = f(f(this.delayR[iR] * f(1 - fR)) + f(this.delayR[(iR + 1) % this.delaySize] * fR));
    this.delayL[this.writeIndex] = l;
    this.delayR[this.writeIndex] = r;
    this.writeIndex = (this.writeIndex + 1) % this.delaySize;
    l = outDelayedL;
    r = outDelayedR;

    l = this.headBumpL.process(this.subsonicL.process(l));
    r = this.headBumpR.process(this.subsonicR.process(r));
    l = this.hfLossL.process(l);
    r = this.hfLossR.process(r);
    if (this.noiseOn) {
      l = f(l + f(this.nextNoise() * 0.0006));
      r = f(r + f(this.nextNoise() * 0.0006));
    }
    out[0] = f(l * this.outGain);
    out[1] = f(r * this.outGain);
    this.outputMeter.update(out[0], out[1]);
  }

  private wrap(value: number): number {
    return ((value % this.delaySize) + this.delaySize) % this.delaySize;
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.delayL.fill(0);
    this.delayR.fill(0);
    this.writeIndex = 0;
    this.wowPhase = 0;
    this.flutterPhase = 0;
    this.headBumpL.reset();
    this.headBumpR.reset();
    this.hfLossL.reset();
    this.hfLossR.reset();
    this.subsonicL.reset();
    this.subsonicR.reset();
    this.oversampler?.reset();
    this.inputMeter.reset();
    this.outputMeter.reset();
  }
}

/** Four-line feedback delay network reverb (plate / hall / room). */
export class AlgorithmicReverbModule implements StudioModule {
  readonly kind: string;
  enabled = true;
  readonly latencySamples = 0;
  readonly gainReductionDb = 0;
  private readonly baseDelaysMs = [29.7, 37.1, 41.1, 43.7];
  private readonly lineLen: number[];
  private readonly lineBuf: Float32Array[];
  private lineWrite = 0;
  private readonly dampingFilters: Biquad[];
  private readonly lineFeedback = new Float32Array(4);
  private readonly outs = new Float32Array(4);
  private readonly mixed = new Float32Array(4);
  private readonly interpInput = new Float32Array(4);
  private readonly interpOutput = new Float32Array(4);
  private readonly outputGain: number;
  private readonly apLen: number[];
  private readonly apBuf: Float32Array[];
  private readonly apWrite = new Int32Array(4);
  private readonly apGain = 0.62;
  private readonly preDelaySize: number;
  private readonly preDelayBuf: Float32Array;
  private preDelayWrite = 0;
  private preDelayFrames = 0;
  private readonly lowCutL: Biquad;
  private readonly lowCutR: Biquad;
  private readonly highCutL: Biquad;
  private readonly highCutR: Biquad;
  private readonly tiltL: Biquad;
  private readonly tiltR: Biquad;
  private readonly mixSmoother: SmoothValue;
  private width = 0.9;
  private decaySec = 1.5;
  private modulation = 0;
  private modRate = 0.6;
  private modPhase = 0;
  private readonly inputMeter = new PeakMeter();
  private readonly outputMeter = new PeakMeter();

  constructor(private readonly sampleRate: number, kind: 'PLATE_REVERB' | 'HALL_REVERB' | 'ROOM_REVERB') {
    this.kind = kind;
    this.lineLen = this.baseDelaysMs.map((ms) => Math.max(Math.trunc((sampleRate * ms) / 1000), 8));
    this.lineBuf = this.lineLen.map((len) => new Float32Array(len + 1));
    this.dampingFilters = Array.from({ length: 4 }, () => {
      const filter = new Biquad(sampleRate);
      filter.setBypass();
      return filter;
    });
    this.outputGain = f(1 / Math.sqrt(2));
    this.apLen = [
      Math.trunc(sampleRate * 0.0047),
      Math.trunc(sampleRate * 0.0037),
      Math.trunc(sampleRate * 0.0021),
      Math.trunc(sampleRate * 0.0013),
    ];
    this.apBuf = this.apLen.map((len) => new Float32Array(len + 1));
    this.preDelaySize = Math.trunc(sampleRate * 0.15) + 4;
    this.preDelayBuf = new Float32Array(this.preDelaySize);
    this.lowCutL = new Biquad(sampleRate);
    this.lowCutR = new Biquad(sampleRate);
    this.highCutL = new Biquad(sampleRate);
    this.highCutR = new Biquad(sampleRate);
    this.tiltL = new Biquad(sampleRate);
    this.tiltR = new Biquad(sampleRate);
    this.mixSmoother = new SmoothValue(0.25, sampleRate, 20);
  }

  get inputPeakLevel(): number {
    return this.inputMeter.peak;
  }
  get outputPeakLevel(): number {
    return this.outputMeter.peak;
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.decaySec = slotValue(slot, 'decaySec');
    this.preDelayFrames = Math.min(
      Math.max(Math.trunc(f(f(slotValue(slot, 'preDelayMs') / 1000) * this.sampleRate)), 0),
      this.preDelaySize - 4,
    );
    const hp = slotValue(slot, 'hpHz');
    const lp = slotValue(slot, 'lpHz');
    this.lowCutL.setHighPass(hp, 0.707);
    this.lowCutR.setHighPass(hp, 0.707);
    this.highCutL.setLowPass(lp, 0.707);
    this.highCutR.setLowPass(lp, 0.707);
    this.width = slotValue(slot, 'width');
    this.mixSmoother.set(slotValue(slot, 'mix'));

    const mode = this.kind === 'PLATE_REVERB' ? 0 : this.kind === 'ROOM_REVERB' ? 2 : 1;
    const [dampFreq, hfDecayRatio] = mode === 0 ? [7500, 0.75] : mode === 2 ? [6000, 0.7] : [5000, 0.7];
    const passesPerSecond = this.sampleRate / (this.lineLen.reduce((a, b) => a + b, 0) / this.lineLen.length);
    const dialled = Math.max(this.decaySec, 0.05);
    const extraLossPerSecondDb = 60 / (dialled * hfDecayRatio) - 60 / dialled;
    const dampDb = -Math.min(Math.max(extraLossPerSecondDb / passesPerSecond, 0), 4);
    this.dampingFilters.forEach((filter) => filter.setHighShelf(dampFreq, dampDb));
    this.modulation = mode === 1 ? 1 : 0.35;
    this.modRate = mode === 1 ? 0.45 : 0.9;
    const tilt = mode === 0 ? 1.5 : mode === 2 ? 0 : -1.5;
    this.tiltL.setHighShelf(6000, tilt);
    this.tiltR.setHighShelf(6000, tilt);
    this.recomputeFeedback();
  }

  private recomputeFeedback(): void {
    for (let i = 0; i < 4; i++) {
      const lenSec = this.lineLen[i] / this.sampleRate;
      this.lineFeedback[i] = Math.min(
        Math.max(f(Math.pow(10, (-3 * lenSec) / Math.max(this.decaySec, 0.05))), 0.02),
        0.9995,
      );
    }
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    this.inputMeter.update(inL, inR);
    const mono = f((inL + inR) * 0.5);
    this.preDelayBuf[this.preDelayWrite] = mono;
    const preRead = (this.preDelayWrite - this.preDelayFrames + this.preDelaySize) % this.preDelaySize;
    let diffused = this.preDelayBuf[preRead];
    // Early reflections: a few discrete taps give the reverb a sense of
    // space and attack before the diffuse tail builds up. The taps are
    // offset from the post-pre-delay read point, so the whole wet path
    // (reflections and tail alike) starts after the pre-delay — matching the
    // Kotlin engine, where tapping the raw write head instead let reflections
    // land inside the pre-delay gap.
    const erOrigin = this.preDelayWrite - this.preDelayFrames;
    const er1 = f(this.preDelayBuf[(erOrigin - Math.max(1, Math.trunc(f(this.sampleRate * 0.007))) + 2 * this.preDelaySize) % this.preDelaySize] * 0.32);
    const er2 = f(this.preDelayBuf[(erOrigin - Math.max(1, Math.trunc(f(this.sampleRate * 0.013))) + 2 * this.preDelaySize) % this.preDelaySize] * 0.24);
    const er3 = f(this.preDelayBuf[(erOrigin - Math.max(1, Math.trunc(f(this.sampleRate * 0.021))) + 2 * this.preDelaySize) % this.preDelaySize] * 0.16);
    diffused = f(diffused + f(f(er1 + er2) + er3));
    this.preDelayWrite = (this.preDelayWrite + 1) % this.preDelaySize;

    for (let i = 0; i < 4; i++) {
      const n = this.apLen[i] + 1;
      const buf = this.apBuf[i];
      const idx = this.apWrite[i];
      const stored = buf[idx];
      const v = f(diffused - f(this.apGain * stored));
      buf[idx] = v;
      diffused = f(stored + f(this.apGain * v));
      this.apWrite[i] = (idx + 1) % n;
    }

    this.modPhase = f(this.modPhase + f(f(TAU * this.modRate) / this.sampleRate));
    if (this.modPhase >= TAU) this.modPhase = f(this.modPhase - TAU);
    const modSamples = f(f(this.modulation * 1.6) * f(Math.sin(this.modPhase)));

    for (let i = 0; i < 4; i++) {
      const len = this.lineLen[i];
      const n = len + 1;
      const direction = i % 2 === 0 ? 1 : -1;
      let readPos = f(this.lineWrite - len + f(modSamples * direction));
      readPos = ((readPos % n) + n) % n;
      const i0 = Math.trunc(readPos);
      const frac = f(readPos - i0);
      const sample = this.lineBuf[i][i0];
      let delayed: number;
      if (frac <= 1e-6) {
        this.interpInput[i] = sample;
        this.interpOutput[i] = sample;
        delayed = sample;
      } else {
        const eta = f(f(1 - frac) / f(1 + frac));
        const interpolated = f(f(eta * f(sample - this.interpOutput[i])) + this.interpInput[i]);
        this.interpInput[i] = sample;
        this.interpOutput[i] = interpolated;
        delayed = interpolated;
      }
      this.outs[i] = this.dampingFilters[i].process(delayed);
    }

    const h0 = f(f(f(this.outs[0] + this.outs[1]) + f(this.outs[2] + this.outs[3])) * 0.5);
    const h1 = f(f(f(this.outs[0] - this.outs[1]) + f(this.outs[2] - this.outs[3])) * 0.5);
    const h2 = f(f(f(this.outs[0] + this.outs[1]) - f(this.outs[2] + this.outs[3])) * 0.5);
    const h3 = f(f(f(this.outs[0] - this.outs[1]) - f(this.outs[2] - this.outs[3])) * 0.5);
    this.mixed[0] = h0;
    this.mixed[1] = h1;
    this.mixed[2] = h2;
    this.mixed[3] = h3;

    for (let i = 0; i < 4; i++) {
      const n = this.lineLen[i] + 1;
      const idx = Math.trunc(this.lineWrite % n);
      this.lineBuf[i][idx] = f(f(diffused * 0.5) + f(this.mixed[i] * this.lineFeedback[i]));
    }
    this.lineWrite += 1;
    if (this.lineWrite > 2 ** 40) this.lineWrite = 0;

    let wetL = f(this.outs[0] - this.outs[2]);
    let wetR = f(this.outs[1] - this.outs[3]);
    wetL = f(this.highCutL.process(this.lowCutL.process(this.tiltL.process(wetL))) * this.outputGain);
    wetR = f(this.highCutR.process(this.lowCutR.process(this.tiltR.process(wetR))) * this.outputGain);
    const mid = f((wetL + wetR) * 0.5);
    const side = f(f((wetL - wetR) * 0.5) * this.width);
    wetL = f(mid + side);
    wetR = f(mid - side);

    const mix = this.mixSmoother.next();
    out[0] = f(inL + f(f(wetL - inL) * mix));
    out[1] = f(inR + f(f(wetR - inR) * mix));
    this.outputMeter.update(out[0], out[1]);
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.lineBuf.forEach((buf) => buf.fill(0));
    this.apBuf.forEach((buf) => buf.fill(0));
    this.apWrite.fill(0);
    this.preDelayBuf.fill(0);
    this.dampingFilters.forEach((filter) => filter.reset());
    this.interpInput.fill(0);
    this.interpOutput.fill(0);
    this.lineWrite = 0;
    this.preDelayWrite = 0;
    this.modPhase = 0;
    this.lowCutL.reset();
    this.lowCutR.reset();
    this.highCutL.reset();
    this.highCutR.reset();
    this.tiltL.reset();
    this.tiltR.reset();
    this.inputMeter.reset();
    this.outputMeter.reset();
  }
}

/** Tempo-locked filtered ducking delay. */
export class TempoDelayModule implements StudioModule {
  readonly kind = 'TEMPO_DELAY';
  enabled = true;
  readonly latencySamples = 0;
  readonly gainReductionDb = 0;
  private readonly maxDelay: number;
  private readonly bufferL: Float32Array;
  private readonly bufferR: Float32Array;
  private writeIndex = 0;
  private delayFramesL = 1;
  private delayFramesR = 1;
  private feedbackAmount = 0.25;
  private readonly hpL: Biquad;
  private readonly hpR: Biquad;
  private readonly lpL: Biquad;
  private readonly lpR: Biquad;
  private pingPong = false;
  private ducking = true;
  private duckGain = 1;
  private readonly duckRelease: number;
  private readonly mixSmoother: SmoothValue;
  private tempoBpm = 120;
  private division = 1;
  private freeTimeMs = 110;
  private readonly inputMeter = new PeakMeter();
  private readonly outputMeter = new PeakMeter();

  constructor(private readonly sampleRate: number) {
    this.maxDelay = Math.trunc(sampleRate * 2.5) + 8;
    this.bufferL = new Float32Array(this.maxDelay);
    this.bufferR = new Float32Array(this.maxDelay);
    this.hpL = new Biquad(sampleRate);
    this.hpR = new Biquad(sampleRate);
    this.lpL = new Biquad(sampleRate);
    this.lpR = new Biquad(sampleRate);
    this.duckRelease = Dyn.dynCoeff(180, sampleRate);
    this.mixSmoother = new SmoothValue(0.25, sampleRate, 18);
  }

  get inputPeakLevel(): number {
    return this.inputMeter.peak;
  }
  get outputPeakLevel(): number {
    return this.outputMeter.peak;
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.division = slotValue(slot, 'division');
    this.freeTimeMs = slotValue(slot, 'timeMs');
    this.feedbackAmount = slotValue(slot, 'feedback');
    this.pingPong = slotValue(slot, 'pingPong') >= 0.5;
    this.ducking = slotValue(slot, 'ducking') >= 0.5;
    this.mixSmoother.set(slotValue(slot, 'mix'));
    this.hpL.setHighPass(slotValue(slot, 'hpHz'), 0.707);
    this.hpR.setHighPass(slotValue(slot, 'hpHz'), 0.707);
    this.lpL.setLowPass(slotValue(slot, 'lpHz'), 0.707);
    this.lpR.setLowPass(slotValue(slot, 'lpHz'), 0.707);
    this.updateTimes();
  }

  setTempoBpm(bpm: number): void {
    this.tempoBpm = Math.min(Math.max(bpm, 20), 300);
    this.updateTimes();
  }

  private updateTimes(): void {
    const beatMs = 60000 / this.tempoBpm;
    let ms: number;
    switch (Math.trunc(this.division)) {
      case 0: ms = beatMs / 4; break;
      case 1: ms = beatMs / 2; break;
      case 2: ms = beatMs * 0.75; break;
      case 3: ms = beatMs; break;
      case 4: ms = beatMs * 1.5; break;
      case 5: ms = beatMs * 2; break;
      default: ms = this.freeTimeMs; break;
    }
    this.delayFramesL = Math.min(Math.max(Math.trunc(f(f(ms / 1000) * this.sampleRate)), 1), this.maxDelay - 4);
    this.delayFramesR = this.pingPong
      ? this.delayFramesL
      : Math.min(Math.max(Math.trunc(f(f(f(ms * 1.02) / 1000) * this.sampleRate)), 1), this.maxDelay - 4);
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    this.inputMeter.update(inL, inR);
    const readL = (this.writeIndex - this.delayFramesL + this.maxDelay) % this.maxDelay;
    const readR = (this.writeIndex - this.delayFramesR + this.maxDelay) % this.maxDelay;
    const delayedL = this.bufferL[readL];
    const delayedR = this.bufferR[readR];
    const fbL = this.lpL.process(this.hpL.process(delayedL));
    const fbR = this.lpR.process(this.hpR.process(delayedR));
    if (this.pingPong) {
      this.bufferL[this.writeIndex] = f(inL + f(fbR * this.feedbackAmount));
      this.bufferR[this.writeIndex] = f(inR + f(fbL * this.feedbackAmount));
    } else {
      this.bufferL[this.writeIndex] = f(inL + f(fbL * this.feedbackAmount));
      this.bufferR[this.writeIndex] = f(inR + f(fbR * this.feedbackAmount));
    }
    this.writeIndex = (this.writeIndex + 1) % this.maxDelay;

    if (this.ducking) {
      const dry = Math.max(Math.abs(inL), Math.abs(inR));
      const target = dry > Db.toLinear(-30) ? 0.35 : 1;
      this.duckGain = target < this.duckGain ? target : f(target + f(this.duckRelease * f(this.duckGain - target)));
    } else {
      this.duckGain = 1;
    }

    const mix = this.mixSmoother.next();
    const wetL = f(delayedL * this.duckGain);
    const wetR = f(delayedR * this.duckGain);
    out[0] = f(f(inL * f(1 - mix)) + f(wetL * mix));
    out[1] = f(f(inR * f(1 - mix)) + f(wetR * mix));
    this.outputMeter.update(out[0], out[1]);
  }

  setKey(): void {}
  reset(): void {
    this.bufferL.fill(0);
    this.bufferR.fill(0);
    this.writeIndex = 0;
    this.duckGain = 1;
    this.hpL.reset();
    this.hpR.reset();
    this.lpL.reset();
    this.lpR.reset();
    this.inputMeter.reset();
    this.outputMeter.reset();
  }
}

/** Juno-style chorus I/II and a Haas/doubler width mode. */
export class ChorusWidthModule implements StudioModule {
  readonly kind = 'CHORUS_WIDTH';
  enabled = true;
  readonly latencySamples = 0;
  readonly gainReductionDb = 0;
  private readonly maxDelay: number;
  private readonly bufferL: Float32Array;
  private readonly bufferR: Float32Array;
  private writeIndex = 0;
  private phase = 0;
  private mode = 1;
  private rateHz = 0.8;
  private depthMs = 3.5;
  private width = 0.6;
  private readonly mixSmoother: SmoothValue;
  private readonly inputMeter = new PeakMeter();
  private readonly outputMeter = new PeakMeter();

  constructor(private readonly sampleRate: number) {
    this.maxDelay = Math.trunc(sampleRate * 0.06) + 8;
    this.bufferL = new Float32Array(this.maxDelay);
    this.bufferR = new Float32Array(this.maxDelay);
    this.mixSmoother = new SmoothValue(0.35, sampleRate, 18);
  }

  get inputPeakLevel(): number {
    return this.inputMeter.peak;
  }
  get outputPeakLevel(): number {
    return this.outputMeter.peak;
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.mode = Math.min(Math.max(Math.trunc(slotValue(slot, 'mode')), 0), 2);
    this.rateHz = slotValue(slot, 'rateHz');
    this.depthMs = slotValue(slot, 'depthMs');
    this.width = slotValue(slot, 'width');
    this.mixSmoother.set(slotValue(slot, 'mix'));
  }

  private read(delayFrames: number, buffer: Float32Array): number {
    let pos = (this.writeIndex - delayFrames) % this.maxDelay;
    if (pos < 0) pos += this.maxDelay;
    const i0 = Math.trunc(pos);
    const frac = pos - i0;
    const i1 = (i0 + 1) % this.maxDelay;
    return f(f(buffer[i0] * f(1 - frac)) + f(buffer[i1] * frac));
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    this.inputMeter.update(inL, inR);
    this.phase = f(this.phase + f(f(TAU * this.rateHz) / this.sampleRate));
    if (this.phase >= TAU) this.phase = f(this.phase - TAU);
    const depthScale = this.mode === 0 ? 0.45 : this.mode === 1 ? 1 : 1.4;
    const baseMs = this.mode === 0 ? 8 : this.mode === 1 ? 12 : 18;
    const depthFrames = f(f(this.depthMs * depthScale) * this.sampleRate) / 1000;
    const baseFrames = f(baseMs * this.sampleRate) / 1000;
    const delayL = f(baseFrames + f(f(0.5 + f(0.5 * Math.sin(this.phase))) * depthFrames));
    const delayR = f(baseFrames + f(f(0.5 + f(0.5 * Math.sin(f(this.phase + f(PI * 0.8))))) * depthFrames));
    const wetL = this.read(delayL, this.bufferL);
    const wetR = this.read(delayR, this.bufferR);
    this.bufferL[this.writeIndex] = inL;
    this.bufferR[this.writeIndex] = inR;
    this.writeIndex = (this.writeIndex + 1) % this.maxDelay;

    const mix = this.mixSmoother.next();
    const blendedL = f(inL + f(f(wetL - inL) * mix));
    const blendedR = f(inR + f(f(wetR - inR) * mix));
    const mid = f((blendedL + blendedR) * 0.5);
    const side = f(f((blendedL - blendedR) * 0.5) * f(0.6 + this.width));
    out[0] = f(mid + side);
    out[1] = f(mid - side);
    this.outputMeter.update(out[0], out[1]);
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.bufferL.fill(0);
    this.bufferR.fill(0);
    this.writeIndex = 0;
    this.phase = 0;
    this.inputMeter.reset();
    this.outputMeter.reset();
  }
}
