/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * Hex Combinator — step sequencer motion source.
 */
import { f } from '../studioFx/primitives';

export class Sequencer {
  private steps: number[] = [1];
  private index = 0;
  private samplesPerStep = 44100;
  private counter = 0;
  private glide = 0; // 0..1

  setSteps(steps: number[]): void {
    this.steps = steps.length > 0 ? [...steps] : [0];
    this.index = 0;
    this.counter = 0;
  }

  setTempo(bpm: number, stepsPerBeat: number, sampleRate: number): void {
    const samplesPerBeat = (60 / Math.max(1, bpm)) * sampleRate;
    this.samplesPerStep = Math.max(1, Math.round(samplesPerBeat / Math.max(1, stepsPerBeat)));
  }

  setGlide(v: number): void {
    this.glide = Math.min(1, Math.max(0, v));
  }

  /**
   * Advance by `frames` samples (default 1) and return the current step value.
   * The Combinator samples its motion sources once per control block, so the
   * caller passes the block length — otherwise a step lasts `samplesPerStep`
   * blocks, which is 32x too slow at the default block size.
   */
  tick(frames = 1): number {
    this.counter += Math.max(1, frames);
    if (this.counter >= this.samplesPerStep) {
      this.counter = 0;
      this.index = (this.index + 1) % this.steps.length;
    }
    const cur = this.steps[this.index] ?? 0;
    const next = this.steps[(this.index + 1) % this.steps.length] ?? cur;
    const frac = this.counter / this.samplesPerStep;
    const smooth = this.glide > 0 ? frac * this.glide : 1; // if glide 0, hard step
    const v = this.glide > 0 ? cur + (next - cur) * Math.min(1, smooth) : cur;
    return f(v);
  }

  reset(): void {
    this.index = 0;
    this.counter = 0;
  }

  currentIndex(): number {
    return this.index;
  }
}
