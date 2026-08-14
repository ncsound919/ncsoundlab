/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/audio/dsp/FilterFamily.ts` (Phase 6.6 — Juno filter families).
 */

import { describe, expect, it } from 'vitest';
import { createFilterFamily, type FilterFamily } from './FilterFamily';

const FAMILIES: FilterFamily[] = [
  'moog_ladder',
  'sem_state_variable',
  'ms20_highpass_lowpass',
  'juno_roland',
  'prophet_curtis',
  'oberheim_multimode',
];

const sr = 44100;

/** RMS of a filter's output for a sawtooth-ish input. */
function measure(inputSignal: 'saw' | 'sine', cutoff: number, res: number, drive: number, family: FilterFamily): number {
  const f = createFilterFamily(family);
  let phase = 0;
  const phaseInc = 220 / sr;
  let sum = 0;
  const n = sr; // 1s
  for (let i = 0; i < n; i++) {
    let x: number;
    if (inputSignal === 'saw') {
      x = 2.0 * phase - 1.0;
      phase = (phase + phaseInc) % 1.0;
    } else {
      x = Math.sin(2 * Math.PI * phase);
      phase = (phase + phaseInc) % 1.0;
    }
    const y = f.process(x, cutoff, res, drive, sr);
    sum += y * y;
  }
  return Math.sqrt(sum / n);
}

describe('createFilterFamily', () => {
  it('returns a working filter for every family', () => {
    for (const family of FAMILIES) {
      const f = createFilterFamily(family);
      const y = f.process(0.5, 1000, 1, 0.3, sr);
      expect(Number.isFinite(y)).toBe(true);
      f.reset();
    }
  });

  it('all families pass low frequencies (high cutoff → audible output)', () => {
    // 220 Hz sine with cutoff at 20 kHz. Every family except the MS-20 lets it
    // through — the MS-20's highpass stage is the exception (see the dedicated
    // test below).
    const nonMs20 = FAMILIES.filter((f) => f !== 'ms20_highpass_lowpass');
    for (const family of nonMs20) {
      const rms = measure('sine', 20000, 0.5, 0, family);
      expect(rms, family).toBeGreaterThan(0.1);
    }
  });

  it('24 dB ladder attenuates more than 12 dB SVF at a low cutoff', () => {
    // A 220 Hz saw with cutoff at 200 Hz: the 4-pole ladder rolls off ~24 dB/oct
    // so it attenuates more than the 12 dB/oct SEM SVF.
    const ladder = measure('saw', 200, 0.5, 0, 'moog_ladder');
    const svf = measure('saw', 200, 0.5, 0, 'sem_state_variable');
    expect(svf).toBeGreaterThan(ladder * 1.2);
  });

  it('reset clears state (no residual after zero input)', () => {
    const f = createFilterFamily('moog_ladder');
    // Feed a burst, then reset, then feed silence — output should be near 0.
    for (let i = 0; i < 1000; i++) f.process(0.5, 1000, 1, 0, sr);
    f.reset();
    let maxAbs = 0;
    for (let i = 0; i < 100; i++) {
      const y = f.process(0, 1000, 1, 0, sr);
      maxAbs = Math.max(maxAbs, Math.abs(y));
    }
    expect(maxAbs).toBeLessThan(0.01);
  });

  it('prophet self-oscillates at very high resonance', () => {
    // Curtis ladder with Q→10 approaches self-oscillation: output should keep
    // ringing even with near-zero input (not collapse to silence).
    const f = createFilterFamily('prophet_curtis');
    f.process(0.5, 2000, 10, 0, sr);
    let energy = 0;
    for (let i = 0; i < 500; i++) {
      const y = f.process(0, 2000, 10, 0, sr);
      energy += y * y;
    }
    expect(energy).toBeGreaterThan(1e-4);
  });

  it('ms20 is a true HP→LP cascade (removes DC offset)', () => {
    // A plain lowpass passes a constant DC input; the MS-20's highpass stage
    // must remove it. Feed a constant 0.5 at a low cutoff and the output should
    // settle near zero (the old plain-LP implementation failed this).
    const f = createFilterFamily('ms20_highpass_lowpass');
    f.reset();
    let tailAbs = 0;
    for (let i = 0; i < sr; i++) {
      const y = f.process(0.5, 200, 0.5, 0, sr);
      if (i > sr - 100) tailAbs += Math.abs(y);
    }
    const tailAvg = tailAbs / 100;
    expect(tailAvg).toBeLessThan(0.02);
    // HP/LP track the cutoff together: low cutoff passes low frequencies…
    const rmsLowCut = measure('sine', 200, 0.5, 0, 'ms20_highpass_lowpass');
    expect(rmsLowCut).toBeGreaterThan(0.05);
    // …while a high cutoff lets the highpass stage strip the low end.
    const rmsHighCut = measure('sine', 20000, 0.5, 0, 'ms20_highpass_lowpass');
    expect(rmsHighCut).toBeLessThan(0.02);
  });

  it('never emits NaN/Infinity at extreme settings', () => {
    // Extreme resonance/drive/cutoff (including Nyquist edge + cutoff=1) must
    // never produce non-finite output — one NaN would poison the whole buffer.
    const extremes: Array<[number, number, number]> = [
      [1, 10, 10],
      [sr * 0.45, 10, 10],
      [sr * 0.45, 0, 0],
      [1, 0, 0],
      [sr * 0.45, 10, 0],
      [1, 10, 0],
    ];
    for (const family of FAMILIES) {
      const f = createFilterFamily(family);
      for (const [cutoff, res, drive] of extremes) {
        for (let i = 0; i < 2000; i++) {
          const x = Math.sin((2 * Math.PI * 220 * i) / sr) * 0.9;
          const y = f.process(x, cutoff, res, drive, sr);
          expect(Number.isFinite(y)).toBe(true);
        }
      }
    }
  }, 20000);

  it('handles multiple sample rates without divergence', () => {
    // Use a cutoff near the input frequency so every family (incl. MS-20's
    // highpass) still produces audible output at every rate. We run a fixed
    // window of `onesPerMs` ms per rate to keep the test well under the timeout.
    const onesPerMs = 10;
    for (const rate of [44100, 48000, 96000]) {
      const n = Math.floor((rate * onesPerMs) / 1000);
      for (const family of FAMILIES) {
        const f = createFilterFamily(family);
        let sum = 0;
        for (let i = 0; i < n; i++) {
          const x = Math.sin((2 * Math.PI * 220 * i) / rate) * 0.8;
          const y = f.process(x, 400, 1, 0.5, rate);
          expect(Number.isFinite(y)).toBe(true);
          sum += Math.abs(y);
        }
        expect(sum, `${family}@${rate}`).toBeGreaterThan(0);
      }
    }
  }, 15000);
});
