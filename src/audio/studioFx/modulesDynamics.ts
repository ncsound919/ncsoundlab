/** @license SPDX-License-Identifier: Apache-2.0 */
import { Biquad, Db, Dyn, f, Oversampler, PeakEnvelope, PeakMeter, SmoothValue } from './primitives';
import { slotValue, type FxSlot } from './catalog';
import type { StudioModule } from './types';

/** UREI 1176 FET compressor with program-dependent release. */
export class Fet1176Module implements StudioModule {
  readonly kind = 'FET_1176';
  enabled = true;
  readonly latencySamples = 0;
  private drive = 1;
  private output = 1;
  private ratio = 4;
  private allButtons = false;
  private thresholdDb = -18;
  private attackCoeff: number;
  private releaseFastCoeff: number;
  private releaseSlowCoeff: number;
  private grDb = 0;
  private sustain = 0;
  private readonly detector: PeakEnvelope;
  private readonly sustainCoeff: number;
  private readonly mixSmoother: SmoothValue;
  private oversampler: Oversampler | null = null;
  private readonly scratch = new Float32Array(2);
  private readonly inputMeter = new PeakMeter();
  private readonly outputMeter = new PeakMeter();

  constructor(private readonly sampleRate: number) {
    this.attackCoeff = Dyn.dynCoeff(0.2, sampleRate);
    this.releaseFastCoeff = Dyn.dynCoeff(120, sampleRate);
    this.releaseSlowCoeff = Dyn.dynCoeff(500, sampleRate);
    this.detector = new PeakEnvelope(sampleRate);
    this.sustainCoeff = Dyn.dynCoeff(400, sampleRate);
    this.mixSmoother = new SmoothValue(1, sampleRate, 12);
  }

  get gainReductionDb(): number {
    return this.grDb;
  }
  get inputPeakLevel(): number {
    return this.inputMeter.peak;
  }
  get outputPeakLevel(): number {
    return this.outputMeter.peak;
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.drive = Db.toLinear(slotValue(slot, 'inputDb'));
    this.output = Db.toLinear(slotValue(slot, 'outputDb'));
    this.ratio = slotValue(slot, 'ratio');
    this.allButtons = slotValue(slot, 'allButtons') >= 0.5;
    this.attackCoeff = Dyn.dynCoeff(slotValue(slot, 'attackUs') / 1000, this.sampleRate);
    const release = slotValue(slot, 'releaseMs');
    const releaseScale = this.allButtons ? 1.8 : 1;
    this.releaseFastCoeff = Dyn.dynCoeff(release * releaseScale, this.sampleRate);
    this.releaseSlowCoeff = Dyn.dynCoeff(release * releaseScale * 3.5, this.sampleRate);
    this.mixSmoother.set(slotValue(slot, 'mix'));
    const factor = this.allButtons ? 4 : 2;
    if (!this.oversampler || this.oversampler.factor !== factor) {
      this.oversampler = new Oversampler(factor, this.sampleRate);
    }
  }

  private fetClamp(x: number, amount: number): number {
    if (amount <= 0.001) return x;
    const driven = f(x * f(1 + f(amount * 3)));
    return f(f(f(Math.tanh(driven)) * f(1 - f(amount * 0.15))) + f(x * f(amount * 0.15)));
  }

  private fastReleaseBlend(fast: number, slow: number, blend: number): number {
    return f(fast + f(f(slow - fast) * Math.min(Math.max(blend, 0), 1)));
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    this.inputMeter.update(inL, inR);
    const dl = f(inL * this.drive);
    const dr = f(inR * this.drive);
    const peak = this.detector.update(Math.max(Math.abs(dl), Math.abs(dr)));
    const level = Dyn.levelDb(peak);
    const effectiveRatio = this.allButtons ? Math.max(this.ratio, 12) : this.ratio;
    const target = Dyn.computeGainReductionDb(level, this.thresholdDb, effectiveRatio, 0);
    this.sustain = f(this.sustain + f(Dyn.smoothingStep(this.sustainCoeff) * f(target - this.sustain)));
    const coeff =
      target > this.grDb
        ? this.attackCoeff
        : this.fastReleaseBlend(
            this.releaseFastCoeff,
            this.releaseSlowCoeff,
            Math.min(Math.max(this.sustain / 12, 0), 1),
          );
    this.grDb = f(target + f(coeff * f(this.grDb - target)));
    const gain = Db.toLinear(-this.grDb);
    let l = f(dl * gain);
    let r = f(dr * gain);
    const os = this.oversampler;
    if (os) {
      const edge = f(Math.min(Math.max(this.grDb / 18, 0), 1) * (this.allButtons ? 1 : 0.45));
      this.scratch[0] = l;
      this.scratch[1] = r;
      os.upsample(this.scratch[0], this.scratch[1]);
      for (let i = 0; i < os.factor; i++) {
        os.bufferL[i] = this.fetClamp(os.bufferL[i], edge);
        os.bufferR[i] = this.fetClamp(os.bufferR[i], edge);
      }
      os.downsample(this.scratch);
      l = this.scratch[0];
      r = this.scratch[1];
    }
    l = f(l * f(this.output / this.drive));
    r = f(r * f(this.output / this.drive));
    const mix = this.mixSmoother.next();
    out[0] = f(inL + f(f(l - inL) * mix));
    out[1] = f(inR + f(f(r - inR) * mix));
    this.outputMeter.update(out[0], out[1]);
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.grDb = 0;
    this.sustain = 0;
    this.detector.reset();
    this.oversampler?.reset();
    this.inputMeter.reset();
    this.outputMeter.reset();
  }
}

/** Teletronix LA-2A optical leveler: ~3:1, soft knee, two-stage release. */
export class OptoLa2aModule implements StudioModule {
  readonly kind = 'OPTO_LA2A';
  enabled = true;
  readonly latencySamples = 0;
  private drive = 1;
  private makeup = 1;
  private limitMode = false;
  private thresholdDb = -18;
  private readonly attackCoeff: number;
  private readonly fastRelease: number;
  private slowRelease: number;
  private grDb = 0;
  private peakGr = 0;
  private readonly detector: PeakEnvelope;
  private readonly slowDecayCoeff: number;
  private readonly mixSmoother: SmoothValue;
  private readonly inputMeter = new PeakMeter();
  private readonly outputMeter = new PeakMeter();

  constructor(private readonly sampleRate: number) {
    this.attackCoeff = Dyn.dynCoeff(10, sampleRate);
    this.fastRelease = Dyn.dynCoeff(60, sampleRate);
    this.slowRelease = Dyn.dynCoeff(1500, sampleRate);
    this.detector = new PeakEnvelope(sampleRate);
    this.slowDecayCoeff = Dyn.dynCoeff(4000, sampleRate);
    this.mixSmoother = new SmoothValue(1, sampleRate, 12);
  }

  get gainReductionDb(): number {
    return this.grDb;
  }
  get inputPeakLevel(): number {
    return this.inputMeter.peak;
  }
  get outputPeakLevel(): number {
    return this.outputMeter.peak;
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.drive = Db.toLinear(-6 + slotValue(slot, 'peakReduction') * 1.6);
    this.makeup = Db.toLinear(slotValue(slot, 'gainDb'));
    this.limitMode = slotValue(slot, 'limitMode') >= 0.5;
    this.thresholdDb = this.limitMode ? -12 : -20;
    this.slowRelease = Dyn.dynCoeff(1500 + this.peakGr * 400, this.sampleRate);
    this.mixSmoother.set(slotValue(slot, 'mix'));
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    this.inputMeter.update(inL, inR);
    const dl = f(inL * this.drive);
    const dr = f(inR * this.drive);
    const peak = this.detector.update(Math.max(Math.abs(dl), Math.abs(dr)));
    const level = Dyn.levelDb(peak);
    const ratio = this.limitMode ? 20 : 3;
    const knee = this.limitMode ? 4 : 8;
    const target = Dyn.computeGainReductionDb(level, this.thresholdDb, ratio, knee);
    const coeff =
      target > this.grDb ? this.attackCoeff : this.grDb > this.peakGr * 0.5 ? this.fastRelease : this.slowRelease;
    this.grDb = f(target + f(coeff * f(this.grDb - target)));
    this.peakGr = Math.max(this.peakGr, this.grDb);
    this.peakGr = f(this.peakGr * this.slowDecayCoeff);
    const gain = f(Db.toLinear(-this.grDb) * this.makeup);
    let l = f(dl * gain);
    let r = f(dr * gain);
    l = f(l - f(f(0.03 * l) * l));
    r = f(r - f(f(0.03 * r) * r));
    const mix = this.mixSmoother.next();
    out[0] = f(inL + f(f(l - inL) * mix));
    out[1] = f(inR + f(f(r - inR) * mix));
    this.outputMeter.update(out[0], out[1]);
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.grDb = 0;
    this.peakGr = 0;
    this.detector.reset();
    this.inputMeter.reset();
    this.outputMeter.reset();
  }
}

/** SSL G bus compressor with feedback detection and multi-stage Auto release. */
export class VcaBusCompModule implements StudioModule {
  readonly kind = 'VCA_BUS_COMP';
  enabled = true;
  readonly latencySamples = 0;
  private thresholdDb = -10;
  private ratio = 2;
  private attackCoeff: number;
  private readonly release100: number;
  private readonly release600: number;
  private readonly release1200: number;
  private fixedReleaseCoeff: number;
  private autoRelease = true;
  private makeup = 1;
  private grDb = 0;
  private stage = 0;
  private stageTimer = 0;
  private lastOutL = 0;
  private lastOutR = 0;
  private readonly detector: PeakEnvelope;
  private readonly mixSmoother: SmoothValue;
  private readonly inputMeter = new PeakMeter();
  private readonly outputMeter = new PeakMeter();

  constructor(private readonly sampleRate: number) {
    this.attackCoeff = Dyn.dynCoeff(10, sampleRate);
    this.release100 = Dyn.dynCoeff(100, sampleRate);
    this.release600 = Dyn.dynCoeff(600, sampleRate);
    this.release1200 = Dyn.dynCoeff(1200, sampleRate);
    this.fixedReleaseCoeff = Dyn.dynCoeff(300, sampleRate);
    this.detector = new PeakEnvelope(sampleRate, 20);
    this.mixSmoother = new SmoothValue(1, sampleRate, 12);
  }

  get gainReductionDb(): number {
    return this.grDb;
  }
  get inputPeakLevel(): number {
    return this.inputMeter.peak;
  }
  get outputPeakLevel(): number {
    return this.outputMeter.peak;
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.thresholdDb = slotValue(slot, 'thresholdDb');
    this.ratio = slotValue(slot, 'ratio');
    this.attackCoeff = Dyn.dynCoeff(slotValue(slot, 'attackMs'), this.sampleRate);
    this.autoRelease = slotValue(slot, 'autoRelease') >= 0.5;
    this.fixedReleaseCoeff = Dyn.dynCoeff(slotValue(slot, 'releaseMs'), this.sampleRate);
    this.makeup = Db.toLinear(slotValue(slot, 'makeupDb'));
    this.mixSmoother.set(slotValue(slot, 'mix'));
  }

  private autoReleaseCoeff(currentGrDb: number): number {
    if (currentGrDb > 1.5) {
      this.stageTimer = 0;
      this.stage = currentGrDb > 6 ? 2 : currentGrDb > 3 ? 1 : 0;
    } else {
      this.stageTimer += 1;
      if (this.stageTimer > (this.sampleRate * 3) / 2 && this.stage > 0) this.stage -= 1;
    }
    return this.stage === 0 ? this.release100 : this.stage === 1 ? this.release600 : this.release1200;
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    this.inputMeter.update(inL, inR);
    const peak = this.detector.update(Math.max(Math.abs(this.lastOutL), Math.abs(this.lastOutR)));
    const level = Dyn.levelDb(peak);
    const target = Dyn.computeGainReductionDb(level, this.thresholdDb, this.ratio, 2);
    const releaseCoeff = this.autoRelease ? this.autoReleaseCoeff(this.grDb) : this.fixedReleaseCoeff;
    const coeff = target > this.grDb ? this.attackCoeff : releaseCoeff;
    this.grDb = f(target + f(coeff * f(this.grDb - target)));
    const gain = f(Db.toLinear(-this.grDb) * this.makeup);
    const wetL = f(inL * gain);
    const wetR = f(inR * gain);
    this.lastOutL = wetL;
    this.lastOutR = wetR;
    const mix = this.mixSmoother.next();
    out[0] = f(inL + f(f(wetL - inL) * mix));
    out[1] = f(inR + f(f(wetR - inR) * mix));
    this.outputMeter.update(out[0], out[1]);
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.grDb = 0;
    this.stage = 0;
    this.stageTimer = 0;
    this.lastOutL = 0;
    this.lastOutR = 0;
    this.detector.reset();
    this.inputMeter.reset();
    this.outputMeter.reset();
  }
}

/** Vari-mu tube compressor: ratio stiffens with gain reduction. */
export class VariMuCompModule implements StudioModule {
  readonly kind = 'VARI_MU_COMP';
  enabled = true;
  readonly latencySamples = 0;
  private drive = 1;
  private makeup = 1;
  private dcThresholdDb = -12;
  private ratio = 2.5;
  private attackCoeff: number;
  private releaseCoeff: number;
  private programLongCoeff: number;
  private programDependent = false;
  private grDb = 0;
  private grHistory = 0;
  private readonly detector: PeakEnvelope;
  private readonly historyCoeff: number;
  private readonly mixSmoother: SmoothValue;
  private readonly inputMeter = new PeakMeter();
  private readonly outputMeter = new PeakMeter();

  constructor(private readonly sampleRate: number) {
    this.attackCoeff = Dyn.dynCoeff(0.4, sampleRate);
    this.releaseCoeff = Dyn.dynCoeff(2000, sampleRate);
    this.programLongCoeff = Dyn.dynCoeff(10000, sampleRate);
    this.detector = new PeakEnvelope(sampleRate);
    this.historyCoeff = Dyn.dynCoeff(2500, sampleRate);
    this.mixSmoother = new SmoothValue(1, sampleRate, 12);
  }

  get gainReductionDb(): number {
    return this.grDb;
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
    this.makeup = Db.toLinear(slotValue(slot, 'makeupDb'));
    this.dcThresholdDb = slotValue(slot, 'thresholdDb');
    this.ratio = slotValue(slot, 'ratio');
    const tc = Math.min(Math.max(Math.trunc(slotValue(slot, 'timeConstant')), 0), 5);
    let attackMs = 0.2;
    let releaseMs = 300;
    switch (tc) {
      case 0: attackMs = 0.2; releaseMs = 300; this.programDependent = false; break;
      case 1: attackMs = 0.2; releaseMs = 800; this.programDependent = false; break;
      case 2: attackMs = 0.4; releaseMs = 2000; this.programDependent = false; break;
      case 3: attackMs = 0.8; releaseMs = 5000; this.programDependent = false; break;
      case 4: attackMs = 0.2; releaseMs = 2000; this.programDependent = true; break;
      default: attackMs = 0.4; releaseMs = 300; this.programDependent = true; break;
    }
    this.attackCoeff = Dyn.dynCoeff(attackMs, this.sampleRate);
    this.releaseCoeff = Dyn.dynCoeff(releaseMs, this.sampleRate);
    this.programLongCoeff = Dyn.dynCoeff(tc === 5 ? 25000 : 10000, this.sampleRate);
    this.mixSmoother.set(slotValue(slot, 'mix'));
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    this.inputMeter.update(inL, inR);
    const dl = f(inL * this.drive);
    const dr = f(inR * this.drive);
    const peak = this.detector.update(Math.max(Math.abs(dl), Math.abs(dr)));
    const level = Dyn.levelDb(peak);
    const effectiveRatio = f(this.ratio * f(1 + this.grDb / 12));
    const knee = Math.min(Math.max(f(f(this.dcThresholdDb * -0.5) + 6), 2), 14);
    const target = Dyn.computeGainReductionDb(level, this.dcThresholdDb, effectiveRatio, knee);
    const release = this.programDependent && this.grHistory > 4 ? this.programLongCoeff : this.releaseCoeff;
    const coeff = target > this.grDb ? this.attackCoeff : release;
    this.grDb = f(target + f(coeff * f(this.grDb - target)));
    this.grHistory = f(this.grHistory + f(Dyn.smoothingStep(this.historyCoeff) * f(this.grDb - this.grHistory)));
    const gain = f(Db.toLinear(-this.grDb) * this.makeup);
    let l = f(dl * gain);
    let r = f(dr * gain);
    l = f(f(l - f(f(0.08 * l) * l)) + f(f(0.02 * l) * f(l * l)));
    r = f(f(r - f(f(0.08 * r) * r)) + f(f(0.02 * r) * f(r * r)));
    const mix = this.mixSmoother.next();
    out[0] = f(inL + f(f(l - inL) * mix));
    out[1] = f(inR + f(f(r - inR) * mix));
    this.outputMeter.update(out[0], out[1]);
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.grDb = 0;
    this.grHistory = 0;
    this.detector.reset();
    this.inputMeter.reset();
    this.outputMeter.reset();
  }
}

export class ParallelCompModule implements StudioModule {
  readonly kind = 'PARALLEL_COMP';
  enabled = true;
  readonly latencySamples = 0;
  private thresholdDb = -22;
  private ratio = 8;
  private attackCoeff: number;
  private releaseCoeff: number;
  private readonly blendSmoother: SmoothValue;
  private makeup = 1;
  private grDb = 0;
  private readonly detector: PeakEnvelope;
  private readonly inputMeter = new PeakMeter();
  private readonly outputMeter = new PeakMeter();

  constructor(private readonly sampleRate: number) {
    this.attackCoeff = Dyn.dynCoeff(5, sampleRate);
    this.releaseCoeff = Dyn.dynCoeff(120, sampleRate);
    this.blendSmoother = new SmoothValue(0.35, sampleRate, 15);
    this.detector = new PeakEnvelope(sampleRate);
  }

  get gainReductionDb(): number {
    return this.grDb;
  }
  get inputPeakLevel(): number {
    return this.inputMeter.peak;
  }
  get outputPeakLevel(): number {
    return this.outputMeter.peak;
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.thresholdDb = slotValue(slot, 'thresholdDb');
    this.ratio = slotValue(slot, 'ratio');
    this.attackCoeff = Dyn.dynCoeff(slotValue(slot, 'attackMs'), this.sampleRate);
    this.releaseCoeff = Dyn.dynCoeff(slotValue(slot, 'releaseMs'), this.sampleRate);
    this.blendSmoother.set(slotValue(slot, 'blend'));
    this.makeup = Db.toLinear(slotValue(slot, 'makeupDb'));
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    this.inputMeter.update(inL, inR);
    const peak = this.detector.update(Math.max(Math.abs(inL), Math.abs(inR)));
    const level = Dyn.levelDb(peak);
    const target = Dyn.computeGainReductionDb(level, this.thresholdDb, this.ratio, 0);
    const coeff = target > this.grDb ? this.attackCoeff : this.releaseCoeff;
    this.grDb = f(target + f(coeff * f(this.grDb - target)));
    const gain = f(Db.toLinear(-this.grDb) * this.makeup);
    const blend = this.blendSmoother.next();
    out[0] = f(inL + f(f(f(inL * gain) - inL) * blend));
    out[1] = f(inR + f(f(f(inR * gain) - inR) * blend));
    this.outputMeter.update(out[0], out[1]);
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.grDb = 0;
    this.detector.reset();
    this.inputMeter.reset();
    this.outputMeter.reset();
  }
}

/** Split-band de-esser: only the sibilance band is attenuated. */
export class DeEsserModule implements StudioModule {
  readonly kind = 'DE_ESSER';
  enabled = true;
  readonly latencySamples = 0;
  private readonly bandL: Biquad;
  private readonly bandR: Biquad;
  private readonly bandLowL: Biquad;
  private readonly bandLowR: Biquad;
  private thresholdDb = -22;
  private maxReductionDb = 3;
  private splitBand = true;
  private grDb = 0;
  private readonly detector: PeakEnvelope;
  private readonly attackCoeff: number;
  private readonly releaseCoeff: number;
  private readonly inputMeter = new PeakMeter();

  constructor(private readonly sampleRate: number) {
    this.bandL = new Biquad(sampleRate);
    this.bandR = new Biquad(sampleRate);
    this.bandLowL = new Biquad(sampleRate);
    this.bandLowR = new Biquad(sampleRate);
    this.detector = new PeakEnvelope(sampleRate, 8);
    this.attackCoeff = Dyn.dynCoeff(3, sampleRate);
    this.releaseCoeff = Dyn.dynCoeff(45, sampleRate);
  }

  get gainReductionDb(): number {
    return this.grDb;
  }
  get inputPeakLevel(): number {
    return this.inputMeter.peak;
  }
  get outputPeakLevel(): number {
    return this.inputMeter.peak;
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.thresholdDb = slotValue(slot, 'thresholdDb');
    this.maxReductionDb = slotValue(slot, 'amountDb');
    this.splitBand = slotValue(slot, 'split') >= 0.5;
    const freq = slotValue(slot, 'freqHz');
    this.bandL.setPeaking(freq, 12, 0.9);
    this.bandR.setPeaking(freq, 12, 0.9);
    this.bandLowL.setLowPass(freq * 0.55, 0.707);
    this.bandLowR.setLowPass(freq * 0.55, 0.707);
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    this.inputMeter.update(inL, inR);
    const mono = f((inL + inR) * 0.5);
    const band = this.detector.update(this.bandL.process(mono));
    const level = Dyn.levelDb(band);
    const over = Math.max(level - this.thresholdDb, 0);
    const target = Math.min(over, this.maxReductionDb * 2);
    const coeff = target > this.grDb ? this.attackCoeff : this.releaseCoeff;
    this.grDb = f(target + f(coeff * f(this.grDb - target)));
    const reduction = Math.min(this.grDb, this.maxReductionDb);
    const bandGain = Db.toLinear(-reduction);
    if (this.splitBand) {
      const lowMonoL = this.bandLowL.process(inL);
      const lowMonoR = this.bandLowR.process(inR);
      const sibL = f(inL - lowMonoL);
      const sibR = f(inR - lowMonoR);
      out[0] = f(lowMonoL + f(sibL * bandGain));
      out[1] = f(lowMonoR + f(sibR * bandGain));
    } else {
      const gain = Db.toLinear(-reduction * 0.6);
      out[0] = f(inL * gain);
      out[1] = f(inR * gain);
    }
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.bandL.reset();
    this.bandR.reset();
    this.bandLowL.reset();
    this.bandLowR.reset();
    this.grDb = 0;
    this.detector.reset();
    this.inputMeter.reset();
  }
}

/** Sidechain duck for kick/bass separation. */
export class SidechainDuckModule implements StudioModule {
  readonly kind = 'SIDECHAIN_DUCK';
  enabled = true;
  readonly latencySamples = 0;
  private thresholdDb = -20;
  private ratio = 6;
  private attackCoeff: number;
  private releaseCoeff: number;
  private floorDb = -12;
  private grDb = 0;
  private keyL = 0;
  private keyR = 0;
  private readonly detector: PeakEnvelope;
  private readonly inputMeter = new PeakMeter();

  constructor(private readonly sampleRate: number) {
    this.attackCoeff = Dyn.dynCoeff(5, sampleRate);
    this.releaseCoeff = Dyn.dynCoeff(120, sampleRate);
    this.detector = new PeakEnvelope(sampleRate, 25);
  }

  get gainReductionDb(): number {
    return this.grDb;
  }
  get inputPeakLevel(): number {
    return this.inputMeter.peak;
  }
  get outputPeakLevel(): number {
    return this.inputMeter.peak;
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.thresholdDb = slotValue(slot, 'thresholdDb');
    this.ratio = slotValue(slot, 'ratio');
    this.attackCoeff = Dyn.dynCoeff(slotValue(slot, 'attackMs'), this.sampleRate);
    this.releaseCoeff = Dyn.dynCoeff(slotValue(slot, 'releaseMs'), this.sampleRate);
    this.floorDb = slotValue(slot, 'floorDb');
  }

  setKey(l: number, r: number): void {
    this.keyL = l;
    this.keyR = r;
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    this.inputMeter.update(inL, inR);
    const keyPeak = this.detector.update(Math.max(Math.abs(this.keyL), Math.abs(this.keyR)));
    const level = Dyn.levelDb(keyPeak);
    let target = Dyn.computeGainReductionDb(level, this.thresholdDb, this.ratio, 3);
    target = Math.min(target, -this.floorDb);
    const coeff = target > this.grDb ? this.attackCoeff : this.releaseCoeff;
    this.grDb = f(target + f(coeff * f(this.grDb - target)));
    const gain = Db.toLinear(-this.grDb);
    out[0] = f(inL * gain);
    out[1] = f(inR * gain);
  }

  setTempoBpm(): void {}
  reset(): void {
    this.grDb = 0;
    this.keyL = 0;
    this.keyR = 0;
    this.detector.reset();
    this.inputMeter.reset();
  }
}

/**
 * True-peak limiter; detection and gain run oversampled.
 *
 * The clamp is a hard ceiling, not a soft curve: a soft curve easing in from
 * above the knee approaches `ceiling + 1/k`, so a -1 dBTP setting could still
 * emit over 0 dBFS. It runs twice for the same reason as in
 * `DynamicsModules.kt` - once on the oversampled signal to bound the waveform
 * between base-rate samples, once on the decimated samples because the
 * Butterworth decimator rings about 22% past a hard-clamped input.
 */
export class TruePeakLimiterModule implements StudioModule {
  readonly kind = 'TRUE_PEAK_LIMITER';
  enabled = true;
  private ceiling = Db.toLinear(-1);
  /**
   * 1.5 ms lookahead, matching `TruePeakLimiterModule.kt`: the gain is driven
   * by the sample about to arrive, so the transient is already attenuated when
   * it leaves the delay line. Without it the limiter is a brute-force clipper
   * and the shared parity vectors do not match.
   */
  private readonly lookAhead: number;
  private readonly delayL: Float32Array;
  private readonly delayR: Float32Array;
  private delayPos = 0;
  private count = 0;
  private releaseCoeff: number;
  private oversampler: Oversampler | null = null;
  private gain = 1;
  private grDb = 0;
  private readonly inputMeter = new PeakMeter();
  private readonly outputMeter = new PeakMeter();

  constructor(private readonly sampleRate: number) {
    this.releaseCoeff = Dyn.dynCoeff(120, sampleRate);
    this.lookAhead = Math.max(1, Math.trunc(sampleRate * 0.0015));
    this.delayL = new Float32Array(this.lookAhead);
    this.delayR = new Float32Array(this.lookAhead);
  }

  get latencySamples(): number {
    return this.lookAhead;
  }

  get gainReductionDb(): number {
    return this.grDb;
  }
  get inputPeakLevel(): number {
    return this.inputMeter.peak;
  }
  get outputPeakLevel(): number {
    return this.outputMeter.peak;
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.ceiling = Db.toLinear(slotValue(slot, 'ceilingDb'));
    this.releaseCoeff = Dyn.dynCoeff(slotValue(slot, 'releaseMs'), this.sampleRate);
    const factor = Math.min(Math.max(Math.trunc(slotValue(slot, 'oversample')), 1), 4);
    if (factor <= 1) this.oversampler = null;
    else if (!this.oversampler || this.oversampler.factor !== factor) {
      this.oversampler = new Oversampler(factor, this.sampleRate);
    }
  }

  /** Final safety net: never emit a sample above the configured ceiling. */
  private limitToCeiling(x: number): number {
    if (x > this.ceiling) return this.ceiling;
    if (x < -this.ceiling) return -this.ceiling;
    return x;
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    this.inputMeter.update(inL, inR);

    // The future peak drives the gain applied to the delayed (current) output.
    const futurePeak = Math.max(Math.abs(inL), Math.abs(inR));
    const targetGain =
      futurePeak * this.gain > this.ceiling ? this.ceiling / Math.max(futurePeak, 1e-6) : 1;
    this.gain =
      targetGain < this.gain ? targetGain : f(targetGain + f(this.releaseCoeff * f(this.gain - targetGain)));

    const delayedL = this.delayL[this.delayPos];
    const delayedR = this.delayR[this.delayPos];
    this.delayL[this.delayPos] = inL;
    this.delayR[this.delayPos] = inR;
    this.delayPos = (this.delayPos + 1) % this.lookAhead;
    if (this.count < this.lookAhead) this.count++;

    if (this.count < this.lookAhead) {
      out[0] = 0;
      out[1] = 0;
      this.grDb = -Dyn.levelDb(this.gain);
      this.outputMeter.update(0, 0);
      return;
    }

    const os = this.oversampler;
    if (os) {
      os.upsample(delayedL, delayedR);
      for (let i = 0; i < os.factor; i++) {
        os.bufferL[i] = this.limitToCeiling(f(os.bufferL[i] * this.gain));
        os.bufferR[i] = this.limitToCeiling(f(os.bufferR[i] * this.gain));
      }
      os.downsample(out);
      // The decimator's step response overshoots a hard-clamped input, so the
      // ceiling has to be re-asserted on what is really handed to the
      // converter - otherwise a -1 dBTP setting still emits over 0 dBFS on
      // transient material.
      out[0] = this.limitToCeiling(out[0]);
      out[1] = this.limitToCeiling(out[1]);
    } else {
      out[0] = this.limitToCeiling(f(delayedL * this.gain));
      out[1] = this.limitToCeiling(f(delayedR * this.gain));
    }
    this.grDb = -Dyn.levelDb(this.gain);
    this.outputMeter.update(out[0], out[1]);
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.gain = 1;
    this.grDb = 0;
    this.oversampler?.reset();
    this.delayL.fill(0);
    this.delayR.fill(0);
    this.delayPos = 0;
    this.count = 0;
    this.inputMeter.reset();
    this.outputMeter.reset();
  }
}

/** Brickwall channel limiter. */
export class ChannelLimiterModule implements StudioModule {
  readonly kind = 'CHANNEL_LIMITER';
  enabled = true;
  readonly latencySamples = 0;
  private ceiling = Db.toLinear(-0.5);
  private releaseCoeff: number;
  private gain = 1;
  private grDb = 0;
  private readonly inputMeter = new PeakMeter();

  constructor(private readonly sampleRate: number) {
    this.releaseCoeff = Dyn.dynCoeff(30, sampleRate);
  }

  get gainReductionDb(): number {
    return this.grDb;
  }
  get inputPeakLevel(): number {
    return this.inputMeter.peak;
  }
  get outputPeakLevel(): number {
    return this.inputMeter.peak;
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.ceiling = Db.toLinear(slotValue(slot, 'ceilingDb'));
    this.releaseCoeff = Dyn.dynCoeff(slotValue(slot, 'releaseMs'), this.sampleRate);
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    this.inputMeter.update(inL, inR);
    const peak = Math.max(Math.abs(inL), Math.abs(inR));
    const targetGain = peak * this.gain > this.ceiling ? this.ceiling / Math.max(peak, 1e-6) : 1;
    this.gain = targetGain < this.gain ? targetGain : f(targetGain + f(this.releaseCoeff * f(this.gain - targetGain)));
    out[0] = f(inL * this.gain);
    out[1] = f(inR * this.gain);
    this.grDb = -Dyn.levelDb(this.gain);
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.gain = 1;
    this.grDb = 0;
    this.inputMeter.reset();
  }
}
