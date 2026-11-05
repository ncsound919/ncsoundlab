/** @license SPDX-License-Identifier: Apache-2.0 */
/**
 * Ladder filter + phone-mic modules of the shared suite.
 *
 * Counterpart of `LadderFilterModule.kt` and `PhoneMicModules.kt`. The
 * ladder is the resonant filter every wobble/growl preset asks for; the
 * HPF/LPF pair in `modulesEq` cannot express a swept cutoff with resonance.
 *
 * Every intermediate is funnelled through `f()` (Math.fround) so the
 * arithmetic rounds exactly where the JVM's Float arithmetic rounds — without
 * that the recursive filter drifts and the parity vectors stop matching.
 */
import { Db, Dyn, f, PeakMeter, Biquad } from './primitives';
import { slotValue, type FxSlot } from './catalog';
import type { StudioModule } from './types';

const TWO_PI = 6.2831855;

/** Deterministic self-noise, identical to `PhoneMicModules.nextNoise()`. */
function makeNoiseSource() {
  let state = 0x12345678;
  return {
    next(): number {
      state = (Math.imul(state, 1664525) + 1013904223) | 0;
      const u = (state >>> 8) & 0xffffff;
      return f(f(u / 16777216) - 0.5);
    },
    reset() {
      state = 0x12345678;
    },
  };
}

/**
 * Resonant 4-pole ladder. `resonance` 0..20 sweeps the feedback coefficient
 * from 0 to self-oscillation; `drive` 0..10 is pre-filter drive into tanh;
 * `mode` picks the Moog / Juno / Prophet family.
 */
export class LadderFilterModule implements StudioModule {
  readonly kind = 'LADDER_FILTER';
  enabled = true;
  readonly latencySamples = 0;
  readonly gainReductionDb = 0;

  private cutoffHz = 1200;
  private resonance = 4;
  private drive = 0;
  private mode = 0;

  private g = 0;
  private g4 = 0;
  private k = 0;
  private driveScale = 1;

  private readonly stateL = new Float32Array(4);
  private readonly stateR = new Float32Array(4);
  private readonly inMeter = new PeakMeter();
  private readonly outMeter = new PeakMeter();

  get inputPeakLevel(): number {
    return this.inMeter.peak;
  }

  get outputPeakLevel(): number {
    return this.outMeter.peak;
  }

  constructor(private readonly sampleRate: number) {}

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.cutoffHz = slotValue(slot, 'cutoffHz');
    this.resonance = slotValue(slot, 'resonance');
    this.drive = slotValue(slot, 'drive');
    this.mode = Math.min(2, Math.max(0, Math.trunc(slotValue(slot, 'mode'))));

    const sr = this.sampleRate > 0 ? this.sampleRate : 44100;
    const fc = Math.min(Math.max(this.cutoffHz, 1), sr * 0.45);
    // w0 is radians per sample, so the pre-warped coefficient is tan(w0 / 2).
    const w0 = f(f(TWO_PI * fc) / sr);
    this.g = Math.min(f(Math.tan(f(w0 * 0.5))), 0.95);
    const bigG = f(this.g / f(1 + this.g));
    this.g4 = f(f(f(bigG * bigG) * bigG) * bigG);

    const ceiling = this.mode === 1 ? 3.9 : this.mode === 2 ? 3.99 : 3.95;
    this.k = Math.min(f(this.resonance * f(ceiling / 20)), ceiling);
    this.driveScale = this.mode === 1 ? 1.2 : this.mode === 2 ? 1.6 : 2;
  }

  private render(x: number, state: Float32Array): number {
    const bigG = f(this.g / f(1 + this.g));
    const bigG2 = f(bigG * bigG);
    const s0 = state[0];
    const s1 = state[1];
    const s2 = state[2];
    const s3 = state[3];

    const driven = f(Math.tanh(f(x * f(1 + f(f(this.drive / 10) * this.driveScale)))));

    const oneMinus = f(1 - bigG);
    // y4 at u = 0: G^3(1-G)s0 + G^2(1-G)s1 + G(1-G)s2 + (1-G)s3.
    const s0Term = f(f(f(s0 * oneMinus) * bigG2) * bigG);
    const s1Term = f(f(s1 * oneMinus) * bigG2);
    const s2Term = f(f(s2 * oneMinus) * bigG);
    const s3Term = f(s3 * oneMinus);
    const sum = f(f(s0Term + s1Term) + f(s2Term + s3Term));
    const u = f(f(driven - f(this.k * sum)) / f(1 + f(this.k * this.g4)));

    const v0 = f((u - s0) * bigG);
    const y0 = f(v0 + s0);
    state[0] = f(y0 + v0);

    const v1 = f((y0 - s1) * bigG);
    const y1 = f(v1 + s1);
    state[1] = f(y1 + v1);

    const v2 = f((y1 - s2) * bigG);
    const y2 = f(v2 + s2);
    state[2] = f(y2 + v2);

    const v3 = f((y2 - s3) * bigG);
    const y3 = f(v3 + s3);
    state[3] = f(y3 + v3);

    // One non-finite sample would poison every later stage; clear the stages
    // so the filter recovers instead of staying silent forever.
    if (!Number.isFinite(y3)) {
      state.fill(0);
      return 0;
    }
    return y3;
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    this.inMeter.update(inL, inR);
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    const l = this.render(inL, this.stateL);
    const r = this.render(inR, this.stateR);
    this.outMeter.update(l, r);
    out[0] = l;
    out[1] = r;
  }

  reset(): void {
    this.stateL.fill(0);
    this.stateR.fill(0);
    this.inMeter.reset();
    this.outMeter.reset();
  }

  setKey(): void {}
  setTempoBpm(): void {}
}

/** Full reduction is reached this far below the threshold (-12 dB). */
const CLOSE_AT = 0.25;
/** A knock stands this much above the recent peak (9.5 dB). */
const KNOCK_RATIO = 3;
/** Wind counts once the sub-band owns this much of the signal. */
const WIND_OPEN = 0.7;
const WIND_CUTOFF_HZ = 150;

/**
 * PHONE_NOISE_REDUCTION - broadband downward-expanding noise gate, matching
 * `PhoneNoiseReductionModule.kt` operation for operation.
 *
 * The threshold is explicit rather than adaptive: a noise floor that follows
 * its own input eventually converges on the programme and closes on quiet
 * sustained material. Wind is handled by subtracting the sub-150 Hz band in
 * proportion to how much of the signal it owns, and handling by ducking a
 * transient that stands well above the recent peak. Stereo is linked to one
 * gain so the image never wanders as the gate opens and closes.
 */
export class PhoneNoiseReductionModule implements StudioModule {
  readonly kind = 'PHONE_NOISE_REDUCTION';
  enabled = true;
  readonly latencySamples = 0;

  private reductionDb = 12;
  private thresholdDb = -35;
  private smoothingMs = 100;
  private windDetection = true;
  private handlingDetection = true;

  // Linked broadband detector.
  private env = 0;
  private gain = 1;

  // Wind: a fixed low-pass whose output is subtracted in proportion.
  private readonly windLpL: Biquad;
  private readonly windLpR: Biquad;
  private lfEnv = 0;
  private fullEnv = 0;
  private windAmount = 0;

  // Handling: a peak-hold reference and a decaying duck.
  private handlingRef = 0;
  private duck = 0;

  // Control coefficients, rebuilt in configure().
  private envRelease = 1;
  private gainSmooth = 1;
  private refHold = 1;
  private duckRelease = 1;
  private windSmooth = 1;
  private minGain = 1;
  private thresholdLinear = 0;
  private windDepth = 0;
  private duckDepth = 0;

  private readonly inMeter = new PeakMeter();
  private readonly outMeter = new PeakMeter();

  get inputPeakLevel(): number {
    return this.inMeter.peak;
  }

  get outputPeakLevel(): number {
    return this.outMeter.peak;
  }

  get gainReductionDb(): number {
    return -Dyn.levelDb(this.gain);
  }

  constructor(private readonly sampleRate: number) {
    this.windLpL = new Biquad(sampleRate);
    this.windLpR = new Biquad(sampleRate);
    this.windLpL.setLowPass(WIND_CUTOFF_HZ, 0.7071);
    this.windLpR.setLowPass(WIND_CUTOFF_HZ, 0.7071);
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.reductionDb = slotValue(slot, 'reductionDb');
    this.thresholdDb = slotValue(slot, 'thresholdDb');
    this.smoothingMs = slotValue(slot, 'smoothingMs');
    this.windDetection = slotValue(slot, 'windDetection') >= 0.5;
    this.handlingDetection = slotValue(slot, 'handlingDetection') >= 0.5;

    this.minGain = Db.toLinear(f(-this.reductionDb));
    this.thresholdLinear = Db.toLinear(this.thresholdDb);
    this.windDepth = Math.min(Math.max(f(1 - this.minGain), 0), 0.9);
    this.duckDepth = Math.min(Math.max(f(1 - Math.sqrt(this.minGain)), 0), 0.9);
    this.envRelease = Dyn.dynCoeff(this.smoothingMs, this.sampleRate);
    this.gainSmooth = Dyn.dynCoeff(f(this.smoothingMs * 0.25), this.sampleRate);
    this.refHold = Dyn.dynCoeff(this.smoothingMs, this.sampleRate);
    this.duckRelease = Dyn.dynCoeff(Math.min(this.smoothingMs, 80), this.sampleRate);
    this.windSmooth = Dyn.dynCoeff(this.smoothingMs, this.sampleRate);
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    const peak = Math.max(Math.abs(inL), Math.abs(inR));
    this.inMeter.update(peak, peak);

    // Broadband gate: open at the threshold, fully reduced below it.
    this.env = Math.max(peak, f(this.env * this.envRelease));
    const ratio = Math.min(Math.max(f(this.env / this.thresholdLinear), 0), 1);
    const closing = Math.min(Math.max(f(f(1 - ratio) / f(1 - CLOSE_AT)), 0), 1);
    const targetGain = f(1 - f(closing * f(1 - this.minGain)));
    this.gain = f(targetGain + f(this.gainSmooth * f(this.gain - targetGain)));

    // A knock stands well above the recent peak; duck it, then let it go.
    this.duck = f(this.duck * this.duckRelease);
    if (this.handlingDetection && this.handlingRef > 1e-4 && peak > f(this.handlingRef * KNOCK_RATIO)) {
      this.duck = this.duckDepth;
    }
    this.handlingRef = Math.max(peak, f(this.handlingRef * this.refHold));

    // Wind is an LF burst, so subtract the LF band in proportion to how much
    // of the signal it owns rather than gating the whole signal.
    const lpL = this.windLpL.process(inL);
    const lpR = this.windLpR.process(inR);
    const lpMono = Math.abs(f(f(lpL + lpR) * 0.5));
    const fullMono = Math.abs(f(f(inL + inR) * 0.5));
    this.lfEnv = Math.max(lpMono, f(this.lfEnv * this.windSmooth));
    this.fullEnv = Math.max(fullMono, f(this.fullEnv * this.windSmooth));
    const dominance = this.windDetection ? f(this.lfEnv / Math.max(this.fullEnv, f(1e-6))) : 0;
    const windTarget = Math.min(
      Math.max(f(f(dominance - WIND_OPEN) / f(1 - WIND_OPEN)), 0),
      1,
    );
    this.windAmount = f(windTarget + f(this.windSmooth * f(this.windAmount - windTarget)));

    const applied = f(this.gain * f(1 - this.duck));
    out[0] = f(f(inL - f(f(f(this.windAmount * this.windDepth) * lpL))) * applied);
    out[1] = f(f(inR - f(f(f(this.windAmount * this.windDepth) * lpR))) * applied);
    this.outMeter.update(out[0], out[1]);
  }

  reset(): void {
    this.env = 0;
    this.gain = 1;
    this.lfEnv = 0;
    this.fullEnv = 0;
    this.windAmount = 0;
    this.handlingRef = 0;
    this.duck = 0;
    this.windLpL.reset();
    this.windLpR.reset();
    this.inMeter.reset();
    this.outMeter.reset();
  }

  setKey(): void {}
  setTempoBpm(): void {}
}

/** EQ voicing + proximity + self-noise + dynamic-range expansion. */
export class PhoneMicEmulationModule implements StudioModule {
  readonly kind = 'PHONE_MIC_EMULATION';
  enabled = true;
  readonly latencySamples = 0;
  readonly gainReductionDb = 0;

  private targetMic = 0;
  private distanceMeters = 0.3;
  private proximityAmount = 1;
  private selfNoiseAmount = 0.5;
  private dynamicRangeExpansion = 0.5;

  // One filter per channel: sharing a Biquad makes R continue from L's state.
  private readonly lowShelfL: Biquad;
  private readonly lowShelfR: Biquad;
  private readonly peak2k5L: Biquad;
  private readonly peak2k5R: Biquad;
  private readonly highShelfL: Biquad;
  private readonly highShelfR: Biquad;
  private readonly highPassL: Biquad;
  private readonly highPassR: Biquad;
  private readonly inMeter = new PeakMeter();
  private readonly outMeter = new PeakMeter();
  private readonly noise = makeNoiseSource();

  get inputPeakLevel(): number {
    return this.inMeter.peak;
  }

  get outputPeakLevel(): number {
    return this.outMeter.peak;
  }

  constructor(private readonly sampleRate: number) {
    this.lowShelfL = new Biquad(sampleRate);
    this.lowShelfR = new Biquad(sampleRate);
    this.peak2k5L = new Biquad(sampleRate);
    this.peak2k5R = new Biquad(sampleRate);
    this.highShelfL = new Biquad(sampleRate);
    this.highShelfR = new Biquad(sampleRate);
    this.highPassL = new Biquad(sampleRate);
    this.highPassR = new Biquad(sampleRate);
    this.configureFilters();
  }

  private configureFilters(): void {
    const [shelfFreq, shelfGain, peakGain, airFreq, airGain, hp] =
      this.targetMic === 1
        ? [80, 4, -3, 6000, -4, 50]
        : this.targetMic === 2
          ? [100, 2, -1, 10000, -1, 80]
          : [100, 3, -2, 8000, -3, 80];
    for (const filter of [this.lowShelfL, this.lowShelfR]) filter.setLowShelf(shelfFreq, shelfGain, 0.7);
    for (const filter of [this.peak2k5L, this.peak2k5R]) filter.setPeaking(2500, peakGain, 1.5);
    for (const filter of [this.highShelfL, this.highShelfR]) filter.setHighShelf(airFreq, airGain, 0.7);
    for (const filter of [this.highPassL, this.highPassR]) filter.setHighPass(hp, 0.7071);
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.targetMic = Math.min(2, Math.max(0, Math.trunc(slotValue(slot, 'targetMic'))));
    this.distanceMeters = slotValue(slot, 'distanceMeters');
    this.proximityAmount = slotValue(slot, 'proximityAmount');
    this.selfNoiseAmount = slotValue(slot, 'selfNoiseAmount');
    this.dynamicRangeExpansion = slotValue(slot, 'dynamicRangeExpansion');
    this.configureFilters();
  }

  private static expand(value: number, threshold: number, amount: number): number {
    const abs = Math.abs(value);
    if (abs >= threshold || amount <= 0) return value;
    const boost = f(f(f(threshold - abs) * amount) * 2);
    return f(value * f(1 + boost));
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    this.inMeter.update(inL, inR);
    let l = this.highPassL.process(inL);
    let r = this.highPassR.process(inR);
    l = this.lowShelfL.process(l);
    r = this.lowShelfR.process(r);
    l = this.peak2k5L.process(l);
    r = this.peak2k5R.process(r);
    l = this.highShelfL.process(l);
    r = this.highShelfR.process(r);

    const proximityBoost =
      this.distanceMeters > 0
        ? f(this.proximityAmount * Math.min(Math.max(f(1 / this.distanceMeters), 0), 6))
        : 0;
    const proximityGain = Db.toLinear(proximityBoost);
    l = f(l * proximityGain);
    r = f(r * proximityGain);

    const noise = f(f(this.noise.next() * 0.002) * this.selfNoiseAmount);
    l = f(l + noise);
    r = f(r + noise);

    const threshold = Db.toLinear(-30);
    l = PhoneMicEmulationModule.expand(l, threshold, this.dynamicRangeExpansion);
    r = PhoneMicEmulationModule.expand(r, threshold, this.dynamicRangeExpansion);

    this.outMeter.update(l, r);
    out[0] = l;
    out[1] = r;
  }

  reset(): void {
    for (const filter of [
      this.lowShelfL, this.lowShelfR, this.peak2k5L, this.peak2k5R,
      this.highShelfL, this.highShelfR, this.highPassL, this.highPassR,
    ]) {
      filter.reset();
    }
    this.inMeter.reset();
    this.outMeter.reset();
    this.noise.reset();
  }

  setKey(): void {}
  setTempoBpm(): void {}
}
