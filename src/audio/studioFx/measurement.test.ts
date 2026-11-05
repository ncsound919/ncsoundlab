/** @license SPDX-License-Identifier: Apache-2.0 */
import { describe, expect, it } from 'vitest';
import { makeSlot } from './catalog';
import { renderChain } from './chain';
import { TruePeakLimiterModule } from './modulesDynamics';
import { BiquadCascade, Db } from './primitives';

/**
 * Objective measurements, mirroring `FxDspMeasurementTest.kt` in
 * `shared/kotlin-core`.
 *
 * `parity.test.ts` proves this port renders the same samples as the Kotlin
 * engine, but the parity fixture drives the limiter with material that never
 * reaches its clamp and never checks where an impulse lands - so the ceiling
 * and latency contracts would pass on both sides while being wrong on both.
 * These are measured from rendered audio rather than read off the module, for
 * the same reason: a readout cannot vouch for itself.
 */
describe('studio FX objective measurements', () => {
  const SAMPLE_RATE = 48000;
  const FRAMES = SAMPLE_RATE;
  const SETTLE = 4096;

  /** Seeded LCG noise so a run never differs from the run before it. */
  function noise(n: number, seed: number): Float32Array {
    let state = seed;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) | 0;
      const u = (state >>> 8) & 0xffffff;
      out[i] = (u / 16777216 - 0.5) * 1.98;
    }
    return out;
  }

  function sine(freq: number, amplitude: number): Float32Array {
    const out = new Float32Array(FRAMES);
    for (let i = 0; i < FRAMES; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
    return out;
  }

  function peakOf(x: Float32Array): number {
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    return peak;
  }

  it('never emits a sample above the limiter ceiling', () => {
    const ceiling = Db.toLinear(-1);
    const chain = [makeSlot('TRUE_PEAK_LIMITER')];

    const cases: Array<[string, Float32Array]> = [
      ['hot sine', sine(1000, 0.99)],
      ['hot noise', noise(FRAMES, 0x5eed)],
      ['sine near Nyquist', sine(17000, 0.99)],
    ];

    for (const [label, input] of cases) {
      const out = renderChain(input, 1, SAMPLE_RATE, chain);
      const peak = peakOf(out);
      expect(
        peak,
        `${label}: limiter emitted ${peak}, above its ceiling of ${ceiling} (-1 dBTP), ` +
          `overshoot by ${Db.fromLinear(peak / ceiling)} dB`,
      ).toBeLessThanOrEqual(ceiling + 1e-4);
    }
  });

  it('reports the latency the limiter really adds', () => {
    // Oversampling off: the decimation filters carry their own group delay,
    // which would obscure the delay line being measured.
    const module = new TruePeakLimiterModule(SAMPLE_RATE);
    module.configure(makeSlot('TRUE_PEAK_LIMITER', { oversample: 1 }));

    const impulseAt = 100;
    const input = new Float32Array(FRAMES);
    input[impulseAt] = 0.1; // low enough that the gain computer stays open

    const out = new Float32Array(2);
    let peakIndex = 0;
    let peak = 0;
    for (let i = 0; i < input.length; i++) {
      module.processSampleInto(input[i], 0, out);
      if (Math.abs(out[0]) > peak) {
        peak = Math.abs(out[0]);
        peakIndex = i;
      }
    }

    expect(peak, 'limiter swallowed the impulse entirely').toBeGreaterThan(0);
    expect(peakIndex - impulseAt, 'reported latency does not match measured delay').toBe(
      module.latencySamples,
    );
  });

  /**
   * The reason the nonlinear modules run oversampled at all: harmonics above
   * Nyquist fold back to frequencies that were never in the signal, and no
   * filter afterwards can tell them apart. Drive a tone high enough that its
   * 3rd-8th harmonics all land past Nyquist, then look only at the bins those
   * harmonics fold into.
   */
  it('oversampling suppresses the aliases saturation folds into the audible band', () => {
    const fundamental = 9000;
    const input = sine(fundamental, 0.9);
    // k*9 kHz folded back into 0..24 kHz for k = 3..8
    const aliasBins = [21000, 12000, 3000, 6000, 15000];

    const foldedAliasPower = (oversample: number): number => {
      const chain = [
        makeSlot('SATURATION', { type: 1, driveDb: 18, warmth: 1, mix: 1, oversample }),
      ];
      const out = renderChain(input, 1, SAMPLE_RATE, chain);
      const settled = out.subarray(SETTLE);
      let power = 0;
      for (const bin of aliasBins) {
        const a = amplitudeAt(settled, bin);
        power += a * a;
      }
      return power;
    };

    const without = foldedAliasPower(1);
    const with4x = foldedAliasPower(4);
    expect(without, 'test signal did not alias at all').toBeGreaterThan(1e-6);
    expect(
      with4x,
      `4x oversampling only cut folded alias energy from ${without} to ${with4x} ` +
        '(need at least a 12 dB reduction)',
    ).toBeLessThanOrEqual(without * 0.25);
  });

  /**
   * Tape is modelled odd-symmetric, tube asymmetric, and that difference is
   * what the `warmth` control trades on. Note what is *not* asserted: tube is
   * not even-harmonic dominant - at maximum warmth its 2nd sits roughly 13 dB
   * below its 3rd.
   */
  it('tube saturation is the asymmetric model and tape the symmetric one', () => {
    const input = sine(1000, 0.5);

    const harmonic = (type: number, freq: number): number => {
      const chain = [
        makeSlot('SATURATION', { type, driveDb: 12, warmth: 1, mix: 1, oversample: 4 }),
      ];
      const out = renderChain(input, 1, SAMPLE_RATE, chain);
      return amplitudeAt(out.subarray(SETTLE), freq);
    };

    const tape1 = harmonic(0, 1000);
    const tape2 = harmonic(0, 2000);
    const tape3 = harmonic(0, 3000);
    const tube1 = harmonic(1, 1000);
    const tube2 = harmonic(1, 2000);
    const tube3 = harmonic(1, 3000);

    expect(tape1, 'no fundamental measured, so the rest proves nothing').toBeGreaterThan(0);
    expect(tube1, 'no fundamental measured, so the rest proves nothing').toBeGreaterThan(0);
    expect(
      tape2,
      `tape lost its symmetry: H2 ${tape2} against H3 ${tape3}`,
    ).toBeLessThanOrEqual(0.25 * tape3);
    expect(
      tube2,
      `tube H2 ${tube2} is not clearly above the symmetric tape model's ${tape2}`,
    ).toBeGreaterThan(4 * tape2);
    expect(tube2, `tube H2 ${tube2} is too quiet against its fundamental ${tube1}`).toBeGreaterThanOrEqual(
      0.02 * tube1,
    );
    expect(tube3).toBeGreaterThan(0);
  });

  /**
   * The SSL/Neve console HPF is labelled 18 dB/oct. It used to be two
   * 2nd-order sections (24 dB/oct) with Q=0.5 in the second one, which put a
   * 6 dB notch at the dialled frequency. Measure the real response: -3 dB at
   * the cutoff and 18 dB per octave in the stopband.
   */
  it('keeps the console HPF at 18 dB/oct without a notch at cutoff', () => {
    const cutoff = 500;

    const gainAt = (freq: number): number => {
      const cascade = new BiquadCascade(SAMPLE_RATE, 2);
      cascade.setThirdOrderHighPass(cutoff);
      const tone = sine(freq, 0.5);
      let inputPower = 0;
      let outputPower = 0;
      for (let i = 0; i < tone.length; i++) {
        const y = cascade.process(tone[i]);
        if (i >= SETTLE) {
          inputPower += tone[i] * tone[i];
          outputPower += y * y;
        }
      }
      return Math.sqrt(outputPower / inputPower);
    };

    const atCutoffDb = 20 * Math.log10(gainAt(cutoff));
    expect(
      Math.abs(atCutoffDb + 3),
      `cutoff gain is ${atCutoffDb.toFixed(2)} dB; a 3rd-order Butterworth must be -3 dB, ` +
        'and a 6 dB notch means a Q=0.5 second stage came back',
    ).toBeLessThan(0.5);

    const octaveDb = 20 * Math.log10(gainAt(cutoff / 4) / gainAt(cutoff / 8));
    expect(
      octaveDb,
      `stopband slope is ${octaveDb.toFixed(2)} dB/octave; the label and the SSL/Neve presets promise 18`,
    ).toBeGreaterThan(16.5);
    expect(octaveDb).toBeLessThan(19.5);
  });

  /**
   * Amplitude of the component at `freq`, Hann-windowed Goertzel. The window
   * keeps a strong neighbouring harmonic from bleeding into the bin under
   * test, which is what makes "is there alias energy here?" meaningful.
   */
  function amplitudeAt(x: Float32Array, freq: number): number {
    const n = x.length;
    const w = (2 * Math.PI * freq) / SAMPLE_RATE;
    const coeff = 2 * Math.cos(w);
    let s1 = 0;
    let s2 = 0;
    let windowSum = 0;
    for (let i = 0; i < n; i++) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      windowSum += window;
      const s0 = x[i] * window + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    const real = s1 - s2 * Math.cos(w);
    const imag = s2 * Math.sin(w);
    return (2 * Math.hypot(real, imag)) / windowSum;
  }
});
