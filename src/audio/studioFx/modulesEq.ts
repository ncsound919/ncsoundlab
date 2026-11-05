/** @license SPDX-License-Identifier: Apache-2.0 */
import { Biquad, BiquadCascade, Db, f, Oversampler, SmoothValue } from './primitives';
import { slotValue, type FxSlot } from './catalog';
import type { StudioModule } from './types';

/**
 * Trim / auto gain staging. Feeds analog-modelled inserts at the -18 dBFS
 * sweet spot; auto-stage rides a slow RMS detector towards it.
 */
export class TrimModule implements StudioModule {
  readonly kind = 'TRIM';
  enabled = true;
  readonly latencySamples = 0;
  readonly gainReductionDb = 0;
  readonly inputPeakLevel = 0;
  readonly outputPeakLevel = 0;
  private gain = 1;
  private manualGain = 1;
  private autoStage = false;
  private rms = 0;
  private readonly rmsCoeff: number;
  private readonly targetRms = Db.toLinear(-18);

  constructor(private readonly sampleRate: number) {
    this.rmsCoeff = f(Math.exp(-1 / (0.3 * sampleRate)));
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    this.manualGain = Db.toLinear(slotValue(slot, 'gainDb'));
    this.autoStage = slotValue(slot, 'autoStage') >= 0.5;
    if (!this.autoStage) this.rms = 0;
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    if (this.autoStage) {
      const mono = f((inL + inR) * 0.5);
      this.rms = f(this.rms + f(f(1 - this.rmsCoeff) * f(f(mono * mono) - this.rms)));
      const level = f(Math.sqrt(Math.max(this.rms, 0)));
      const desired = level > 1e-5 ? Math.min(Math.max(this.targetRms / level, 0.25), 4) : 1;
      this.gain = f(this.gain + f(0.001 * (desired - this.gain)));
    } else {
      this.gain = 1;
    }
    const total = f(this.manualGain * this.gain);
    out[0] = f(inL * total);
    out[1] = f(inR * total);
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.rms = 0;
    this.gain = 1;
  }
}

/** Utility 12 dB/oct high and low pass. A disabled band is bypassed, not filtered. */
export class FilterModule implements StudioModule {
  readonly kind = 'FILTER';
  enabled = true;
  readonly latencySamples = 0;
  readonly gainReductionDb = 0;
  readonly inputPeakLevel = 0;
  readonly outputPeakLevel = 0;
  private readonly hpL: BiquadCascade;
  private readonly hpR: BiquadCascade;
  private readonly lpL: BiquadCascade;
  private readonly lpR: BiquadCascade;

  constructor(private readonly sampleRate: number) {
    this.hpL = new BiquadCascade(sampleRate, 1);
    this.hpR = new BiquadCascade(sampleRate, 1);
    this.lpL = new BiquadCascade(sampleRate, 1);
    this.lpR = new BiquadCascade(sampleRate, 1);
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    const hp = slotValue(slot, 'hpHz');
    const lp = slotValue(slot, 'lpHz');
    if (hp > 15) {
      this.hpL.setSecondOrderHighPass(hp);
      this.hpR.setSecondOrderHighPass(hp);
    } else {
      this.hpL.bypass();
      this.hpR.bypass();
    }
    // 0 is off; every other value is a real cutoff (the biquad clamps itself).
    if (lp > 0) {
      this.lpL.setSecondOrderLowPass(lp);
      this.lpR.setSecondOrderLowPass(lp);
    } else {
      this.lpL.bypass();
      this.lpR.bypass();
    }
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    out[0] = this.lpL.process(this.hpL.process(inL));
    out[1] = this.lpR.process(this.hpR.process(inR));
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.hpL.reset();
    this.hpR.reset();
    this.lpL.reset();
    this.lpR.reset();
  }
}

/** Neve 1073 preamp + fixed-frequency EQ with a Class-A style drive stage. */
export class Neve1073Module implements StudioModule {
  readonly kind = 'NEVE_1073';
  enabled = true;
  readonly latencySamples = 0;
  readonly gainReductionDb = 0;
  readonly inputPeakLevel = 0;
  readonly outputPeakLevel = 0;
  private readonly hpL: BiquadCascade;
  private readonly hpR: BiquadCascade;
  private readonly lfL: Biquad;
  private readonly lfR: Biquad;
  private readonly midL: Biquad;
  private readonly midR: Biquad;
  private readonly hfL: Biquad;
  private readonly hfR: Biquad;
  private readonly outSmoother: SmoothValue;
  private readonly driveSmoother: SmoothValue;
  private readonly transformerL: SmoothValue;
  private readonly transformerR: SmoothValue;
  private oversampler: Oversampler | null = null;

  constructor(private readonly sampleRate: number) {
    this.hpL = new BiquadCascade(sampleRate, 2);
    this.hpR = new BiquadCascade(sampleRate, 2);
    this.lfL = new Biquad(sampleRate);
    this.lfR = new Biquad(sampleRate);
    this.midL = new Biquad(sampleRate);
    this.midR = new Biquad(sampleRate);
    this.hfL = new Biquad(sampleRate);
    this.hfR = new Biquad(sampleRate);
    this.outSmoother = new SmoothValue(1, sampleRate, 20);
    this.driveSmoother = new SmoothValue(0, sampleRate, 25);
    this.transformerL = new SmoothValue(0, sampleRate, 1.1);
    this.transformerR = new SmoothValue(0, sampleRate, 1.1);
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    const hpf = Math.max(slotValue(slot, 'hpfHz'), 20);
    this.hpL.setThirdOrderHighPass(hpf);
    this.hpR.setThirdOrderHighPass(hpf);
    this.lfL.setLowShelf(slotValue(slot, 'lfHz'), slotValue(slot, 'lfDb'));
    this.lfR.setLowShelf(slotValue(slot, 'lfHz'), slotValue(slot, 'lfDb'));
    const midHz = slotValue(slot, 'midHz');
    const q = Math.min(Math.max(f(0.6 + (midHz / 7200) * 1.1), 0.6), 1.8);
    this.midL.setPeaking(midHz, slotValue(slot, 'midDb'), q);
    this.midR.setPeaking(midHz, slotValue(slot, 'midDb'), q);
    this.hfL.setHighShelf(12000, slotValue(slot, 'hfDb'));
    this.hfR.setHighShelf(12000, slotValue(slot, 'hfDb'));
    this.outSmoother.set(Db.toLinear(slotValue(slot, 'outDb')));
    this.driveSmoother.set(slotValue(slot, 'driveDb'));
    if (!this.oversampler || this.oversampler.factor !== 2) {
      this.oversampler = new Oversampler(2, this.sampleRate);
    }
  }

  private shape(x: number): number {
    const driveDb = this.driveSmoother.next();
    if (driveDb <= 0.01) return x;
    const drive = Db.toLinear(driveDb);
    const driven = f(x * drive);
    const shaped = driven >= 0 ? f(driven / f(1 + f(driven * 0.45))) : f(driven / f(1 - f(driven * 0.32)));
    return f(shaped / f(1 + f(f(drive - 1) * 0.06)));
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    let l: number;
    let r: number;
    const os = this.oversampler;
    if (os) {
      os.upsample(inL, inR);
      for (let i = 0; i < os.factor; i++) {
        os.bufferL[i] = this.shape(os.bufferL[i]);
        os.bufferR[i] = this.shape(os.bufferR[i]);
      }
      os.downsample(out);
      l = out[0];
      r = out[1];
    } else {
      l = this.shape(inL);
      r = this.shape(inR);
    }
    l = this.lfL.process(this.midL.process(this.hfL.process(l)));
    r = this.lfR.process(this.midR.process(this.hfR.process(r)));
    l = this.hpL.process(l);
    r = this.hpR.process(r);
    this.transformerL.set(l);
    this.transformerR.set(r);
    const bloomL = this.transformerL.next();
    const bloomR = this.transformerR.next();
    l = f(l + f(bloomL * 0.05));
    r = f(r + f(bloomR * 0.05));
    const gain = this.outSmoother.next();
    out[0] = f(l * gain);
    out[1] = f(r * gain);
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.oversampler?.reset();
    this.hpL.reset();
    this.hpR.reset();
    this.lfL.reset();
    this.lfR.reset();
    this.midL.reset();
    this.midR.reset();
    this.hfL.reset();
    this.hfR.reset();
  }
}

/** SSL 4000 E channel EQ: switchable shelves/bells and variable-Q mids. */
export class SslChannelEqModule implements StudioModule {
  readonly kind = 'SSL_CHANNEL_EQ';
  enabled = true;
  readonly latencySamples = 0;
  readonly gainReductionDb = 0;
  readonly inputPeakLevel = 0;
  readonly outputPeakLevel = 0;
  private readonly hpL: BiquadCascade;
  private readonly hpR: BiquadCascade;
  private readonly lfL: Biquad;
  private readonly lfR: Biquad;
  private readonly lmfL: Biquad;
  private readonly lmfR: Biquad;
  private readonly hmfL: Biquad;
  private readonly hmfR: Biquad;
  private readonly hfL: Biquad;
  private readonly hfR: Biquad;
  private readonly outSmoother: SmoothValue;
  private readonly driveSmoother: SmoothValue;

  constructor(private readonly sampleRate: number) {
    this.hpL = new BiquadCascade(sampleRate, 2);
    this.hpR = new BiquadCascade(sampleRate, 2);
    this.lfL = new Biquad(sampleRate);
    this.lfR = new Biquad(sampleRate);
    this.lmfL = new Biquad(sampleRate);
    this.lmfR = new Biquad(sampleRate);
    this.hmfL = new Biquad(sampleRate);
    this.hmfR = new Biquad(sampleRate);
    this.hfL = new Biquad(sampleRate);
    this.hfR = new Biquad(sampleRate);
    this.outSmoother = new SmoothValue(1, sampleRate, 20);
    this.driveSmoother = new SmoothValue(0, sampleRate, 30);
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    const hp = slotValue(slot, 'hpHz');
    if (hp >= 15) {
      this.hpL.setThirdOrderHighPass(hp);
      this.hpR.setThirdOrderHighPass(hp);
    } else {
      this.hpL.bypass();
      this.hpR.bypass();
    }
    if (slotValue(slot, 'lfBell') >= 0.5) {
      this.lfL.setPeaking(slotValue(slot, 'lfHz'), slotValue(slot, 'lfDb'), 0.9);
      this.lfR.setPeaking(slotValue(slot, 'lfHz'), slotValue(slot, 'lfDb'), 0.9);
    } else {
      this.lfL.setLowShelf(slotValue(slot, 'lfHz'), slotValue(slot, 'lfDb'), 0.85);
      this.lfR.setLowShelf(slotValue(slot, 'lfHz'), slotValue(slot, 'lfDb'), 0.85);
    }
    this.lmfL.setPeaking(slotValue(slot, 'lmfHz'), slotValue(slot, 'lmfDb'), slotValue(slot, 'lmfQ'));
    this.lmfR.setPeaking(slotValue(slot, 'lmfHz'), slotValue(slot, 'lmfDb'), slotValue(slot, 'lmfQ'));
    this.hmfL.setPeaking(slotValue(slot, 'hmfHz'), slotValue(slot, 'hmfDb'), slotValue(slot, 'hmfQ'));
    this.hmfR.setPeaking(slotValue(slot, 'hmfHz'), slotValue(slot, 'hmfDb'), slotValue(slot, 'hmfQ'));
    if (slotValue(slot, 'hfBell') >= 0.5) {
      this.hfL.setPeaking(slotValue(slot, 'hfHz'), slotValue(slot, 'hfDb'), 0.9);
      this.hfR.setPeaking(slotValue(slot, 'hfHz'), slotValue(slot, 'hfDb'), 0.9);
    } else {
      this.hfL.setHighShelf(slotValue(slot, 'hfHz'), slotValue(slot, 'hfDb'), 0.85);
      this.hfR.setHighShelf(slotValue(slot, 'hfHz'), slotValue(slot, 'hfDb'), 0.85);
    }
    this.outSmoother.set(Db.toLinear(slotValue(slot, 'outDb')));
    this.driveSmoother.set(Math.max(slotValue(slot, 'hmfDb'), 0));
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    let l = this.hfL.process(this.hmfL.process(this.lmfL.process(this.lfL.process(this.hpL.process(inL)))));
    let r = this.hfR.process(this.hmfR.process(this.lmfR.process(this.lfR.process(this.hpR.process(inR)))));
    const drive = this.driveSmoother.next();
    if (drive > 1) {
      const amt = f(Math.min(Math.max(f((drive - 1) / 18), 0), 1) * 0.35);
      l = f(l * f(1 + f(amt * f(f(l * l) - 0.33))));
      r = f(r * f(1 + f(amt * f(f(r * r) - 0.33))));
    }
    const gain = this.outSmoother.next();
    out[0] = f(l * gain);
    out[1] = f(r * gain);
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.hpL.reset();
    this.hpR.reset();
    this.lfL.reset();
    this.lfR.reset();
    this.lmfL.reset();
    this.lmfR.reset();
    this.hmfL.reset();
    this.hmfR.reset();
    this.hfL.reset();
    this.hfR.reset();
  }
}

/** Pultec EQP-1A: low boost+cut trick, broad high boost, passive make-up. */
export class PultecEqp1aModule implements StudioModule {
  readonly kind = 'PULTEC_EQP1A';
  enabled = true;
  readonly latencySamples = 0;
  readonly gainReductionDb = 0;
  readonly inputPeakLevel = 0;
  readonly outputPeakLevel = 0;
  private readonly lowBoostL: Biquad;
  private readonly lowBoostR: Biquad;
  private readonly lowAttenL: Biquad;
  private readonly lowAttenR: Biquad;
  private readonly highBoostL: Biquad;
  private readonly highBoostR: Biquad;
  private readonly highAttenL: Biquad;
  private readonly highAttenR: Biquad;
  private readonly outSmoother: SmoothValue;

  constructor(private readonly sampleRate: number) {
    this.lowBoostL = new Biquad(sampleRate);
    this.lowBoostR = new Biquad(sampleRate);
    this.lowAttenL = new Biquad(sampleRate);
    this.lowAttenR = new Biquad(sampleRate);
    this.highBoostL = new Biquad(sampleRate);
    this.highBoostR = new Biquad(sampleRate);
    this.highAttenL = new Biquad(sampleRate);
    this.highAttenR = new Biquad(sampleRate);
    this.outSmoother = new SmoothValue(1, sampleRate, 20);
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    const lowBoost = slotValue(slot, 'lowBoostDb');
    const lowAtten = slotValue(slot, 'lowAttenDb');
    if (slotValue(slot, 'lowBoostHz') > 0) {
      this.lowBoostL.setLowShelf(slotValue(slot, 'lowBoostHz'), lowBoost);
      this.lowBoostR.setLowShelf(slotValue(slot, 'lowBoostHz'), lowBoost);
    } else {
      this.lowBoostL.setBypass();
      this.lowBoostR.setBypass();
    }
    if (lowAtten > 0.01) {
      const attenFreq = Math.min(slotValue(slot, 'lowAttenHz') * 1.5, this.sampleRate * 0.35);
      this.lowAttenL.setPeaking(attenFreq, -lowAtten, 0.7);
      this.lowAttenR.setPeaking(attenFreq, -lowAtten, 0.7);
    } else {
      this.lowAttenL.setBypass();
      this.lowAttenR.setBypass();
    }
    if (slotValue(slot, 'highBoostDb') > 0.01) {
      this.highBoostL.setPeaking(slotValue(slot, 'highBoostHz'), slotValue(slot, 'highBoostDb'), 0.8);
      this.highBoostR.setPeaking(slotValue(slot, 'highBoostHz'), slotValue(slot, 'highBoostDb'), 0.8);
    } else {
      this.highBoostL.setBypass();
      this.highBoostR.setBypass();
    }
    if (slotValue(slot, 'highAttenDb') > 0.01) {
      this.highAttenL.setHighShelf(slotValue(slot, 'highAttenHz'), -slotValue(slot, 'highAttenDb'), 0.7);
      this.highAttenR.setHighShelf(slotValue(slot, 'highAttenHz'), -slotValue(slot, 'highAttenDb'), 0.7);
    } else {
      this.highAttenL.setBypass();
      this.highAttenR.setBypass();
    }
    this.outSmoother.set(Db.toLinear(slotValue(slot, 'outDb') + 20));
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    let l = this.lowAttenL.process(this.lowBoostL.process(inL));
    let r = this.lowAttenR.process(this.lowBoostR.process(inR));
    l = this.highAttenL.process(this.highBoostL.process(l));
    r = this.highAttenR.process(this.highBoostR.process(r));
    l = f(l / f(1 + f(Math.abs(l) * 0.06)));
    r = f(r / f(1 + f(Math.abs(r) * 0.06)));
    const gain = this.outSmoother.next();
    out[0] = f(l * gain);
    out[1] = f(r * gain);
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.lowBoostL.reset();
    this.lowBoostR.reset();
    this.lowAttenL.reset();
    this.lowAttenR.reset();
    this.highBoostL.reset();
    this.highBoostR.reset();
    this.highAttenL.reset();
    this.highAttenR.reset();
  }
}

export class AirShelfModule implements StudioModule {
  readonly kind = 'AIR_SHELF';
  enabled = true;
  readonly latencySamples = 0;
  readonly gainReductionDb = 0;
  readonly inputPeakLevel = 0;
  readonly outputPeakLevel = 0;
  private readonly l: Biquad;
  private readonly r: Biquad;

  constructor(sampleRate: number) {
    this.l = new Biquad(sampleRate);
    this.r = new Biquad(sampleRate);
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    const freq = slotValue(slot, 'freqHz');
    const gain = slotValue(slot, 'gainDb');
    if (gain === 0) {
      this.l.setBypass();
      this.r.setBypass();
    } else {
      this.l.setHighShelf(freq, gain);
      this.r.setHighShelf(freq, gain);
    }
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    out[0] = this.l.process(inL);
    out[1] = this.r.process(inR);
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.l.reset();
    this.r.reset();
  }
}

/** Mid-side EQ and width: mono lows, side air, and a width trim. */
export class MidSideEqModule implements StudioModule {
  readonly kind = 'MID_SIDE_EQ';
  enabled = true;
  readonly latencySamples = 0;
  readonly gainReductionDb = 0;
  readonly inputPeakLevel = 0;
  readonly outputPeakLevel = 0;
  private readonly sideHpL: Biquad;
  private readonly sideHpR: Biquad;
  private readonly sideAirL: Biquad;
  private readonly sideAirR: Biquad;
  private width = 1;

  constructor(sampleRate: number) {
    this.sideHpL = new Biquad(sampleRate);
    this.sideHpR = new Biquad(sampleRate);
    this.sideAirL = new Biquad(sampleRate);
    this.sideAirR = new Biquad(sampleRate);
  }

  configure(slot: FxSlot): void {
    this.enabled = slot.enabled;
    const hp = slotValue(slot, 'sideHpHz');
    if (hp > 15) {
      this.sideHpL.setHighPass(hp, 0.707);
      this.sideHpR.setHighPass(hp, 0.707);
    } else {
      this.sideHpL.setBypass();
      this.sideHpR.setBypass();
    }
    const air = slotValue(slot, 'sideAirDb');
    if (air !== 0) {
      this.sideAirL.setHighShelf(9000, air);
      this.sideAirR.setHighShelf(9000, air);
    } else {
      this.sideAirL.setBypass();
      this.sideAirR.setBypass();
    }
    this.width = Math.min(Math.max(slotValue(slot, 'width'), 0.25), 2);
  }

  processSampleInto(inL: number, inR: number, out: Float32Array): void {
    if (!this.enabled) {
      out[0] = inL;
      out[1] = inR;
      return;
    }
    const mid = f((inL + inR) * 0.5);
    let side = f((inL - inR) * 0.5);
    side = this.sideAirL.process(this.sideHpL.process(side));
    side = f(side * this.width);
    out[0] = f(mid + side);
    out[1] = f(mid - side);
  }

  setKey(): void {}
  setTempoBpm(): void {}
  reset(): void {
    this.sideHpL.reset();
    this.sideHpR.reset();
    this.sideAirL.reset();
    this.sideAirR.reset();
  }
}
