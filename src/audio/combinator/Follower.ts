/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Hex Combinator — envelope follower (input or sidechain).
 */
import { f } from '../studioFx/primitives';

export type FollowerCurve = 'linear' | 'exp' | 'log';

export class Follower {
  private value = 0;
  private attackCoeff: number;
  private releaseCoeff: number;

  constructor(sampleRate: number, attackMs = 10, releaseMs = 100) {
    this.attackCoeff = this.coeff(attackMs, sampleRate);
    this.releaseCoeff = this.coeff(releaseMs, sampleRate);
  }

  private coeff(ms: number, sr: number): number {
    return f(Math.exp(-1 / ((Math.max(ms, 0.005) * sr) / 1000)));
  }

  configure(attackMs: number, releaseMs: number, sampleRate: number): void {
    this.attackCoeff = this.coeff(attackMs, sampleRate);
    this.releaseCoeff = this.coeff(releaseMs, sampleRate);
  }

  process(input: number): number {
    const rect = Math.abs(input);
    if (rect > this.value) {
      this.value = f(this.value + (1 - this.attackCoeff) * (rect - this.value));
    } else {
      this.value = f(this.value * this.releaseCoeff);
    }
    return this.value;
  }

  valueNow(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
  }

  /** Map 0..1 follower level to 0..1 with curve. */
  static shape(level: number, curve: FollowerCurve): number {
    const x = Math.min(1, Math.max(0, level));
    if (curve === 'exp') return f(x * x);
    if (curve === 'log') return f(Math.sqrt(x));
    return f(x);
  }
}
