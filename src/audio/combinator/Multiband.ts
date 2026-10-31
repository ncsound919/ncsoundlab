/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Hex Combinator — Linkwitz-Riley 4th-order crossover splitter (3 bands).
 *
 * Each leg is LR4: two identical Butterworth (Q = 0.7071) sections in series,
 * one set per channel. LR4 legs are in phase at the crossover, so `low + high`
 * reconstructs the input exactly and the mid band can be taken as the
 * complementary residual — that is what makes a bypassed band transparent and
 * keeps the sum of the three bands unity gain.
 *
 * The previous version ran both channels through one shared filter state
 * (right leaked through left's history) and built the mid band from a
 * bandpass×bandpass cascade while configuring a high-pass it never used.
 */
import { Biquad } from '../studioFx/primitives';

export interface BandGains {
  low: number;
  mid: number;
  high: number;
}

export class MultibandSplitter {
  private readonly sampleRate: number;
  private readonly lp1L: Biquad;
  private readonly lp2L: Biquad;
  private readonly lp1R: Biquad;
  private readonly lp2R: Biquad;
  private readonly hp1L: Biquad;
  private readonly hp2L: Biquad;
  private readonly hp1R: Biquad;
  private readonly hp2R: Biquad;

  constructor(sampleRate: number, lowX = 200, highX = 2000) {
    this.sampleRate = sampleRate;
    this.lp1L = new Biquad(sampleRate);
    this.lp2L = new Biquad(sampleRate);
    this.lp1R = new Biquad(sampleRate);
    this.lp2R = new Biquad(sampleRate);
    this.hp1L = new Biquad(sampleRate);
    this.hp2L = new Biquad(sampleRate);
    this.hp1R = new Biquad(sampleRate);
    this.hp2R = new Biquad(sampleRate);
    this.setCrossovers(lowX, highX);
  }

  setCrossovers(lowX: number, highX: number): void {
    const low = Math.min(Math.max(lowX, 20), this.sampleRate * 0.45);
    const high = Math.min(Math.max(highX, low + 20), this.sampleRate * 0.45);
    for (const stage of [this.lp1L, this.lp2L, this.lp1R, this.lp2R]) stage.setLowPass(low, 0.7071);
    for (const stage of [this.hp1L, this.hp2L, this.hp1R, this.hp2R]) stage.setHighPass(high, 0.7071);
  }

  /**
   * Splits one input frame. `mid` is the residual, so
   * `low + mid + high === input` sample for sample.
   */
  process(inL: number, inR: number): { low: [number, number]; mid: [number, number]; high: [number, number] } {
    const lowL = this.lp2L.process(this.lp1L.process(inL));
    const lowR = this.lp2R.process(this.lp1R.process(inR));
    const highL = this.hp2L.process(this.hp1L.process(inL));
    const highR = this.hp2R.process(this.hp1R.process(inR));
    return {
      low: [lowL, lowR],
      mid: [inL - lowL - highL, inR - lowR - highR],
      high: [highL, highR],
    };
  }

  reset(): void {
    for (const stage of [this.lp1L, this.lp2L, this.lp1R, this.lp2R, this.hp1L, this.hp2L, this.hp1R, this.hp2R]) {
      stage.reset();
    }
  }
}
