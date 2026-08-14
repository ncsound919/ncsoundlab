/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/audio/dsp/AnalogEngineDSP.ts` — the analog oscillator
 * (polyBLEP), ZDF ladder filter, and pink noise generator.
 */

import { describe, expect, it } from 'vitest';
import {
  generateAnalogOscSample,
  ZDFLadderFilter,
  PinkNoiseState,
  getVoiceAgeParameters,
} from './AnalogEngineDSP';

const WAVEFORMS = ['sawtooth', 'square', 'triangle', 'sine', 'pink_noise'];

describe('generateAnalogOscSample', () => {
  it('returns finite, bounded samples for every waveform type', () => {
    for (const type of WAVEFORMS) {
      for (let phase = 0; phase < 1; phase += 0.05) {
        const s = generateAnalogOscSample(phase, 440 / 44100, type, 0.5);
        expect(Number.isFinite(s)).toBe(true);
        expect(Math.abs(s)).toBeLessThanOrEqual(1.5);
      }
    }
  });

  it('produces a clean sine for the default/sine type', () => {
    expect(generateAnalogOscSample(0, 0.01, 'sine')).toBeCloseTo(0, 6);
    // Sine passes through the shared tanh soft-clip: tanh(1.1)/1.05 ≈ 0.76.
    expect(generateAnalogOscSample(0.25, 0.01, 'sine')).toBeGreaterThan(0.6);
    expect(generateAnalogOscSample(0.75, 0.01, 'sine')).toBeLessThan(-0.6);
  });

  it('square wave is bipolar and pulse-width aware', () => {
    const high = generateAnalogOscSample(0.25, 0.01, 'square', 0.5);
    const low = generateAnalogOscSample(0.75, 0.01, 'square', 0.5);
    expect(high).toBeGreaterThan(0);
    expect(low).toBeLessThan(0);
  });

  it('is polyBLEP-corrected (sawtooth not a pure ramp near the edge)', () => {
    // At the wrap point the polyBLEP should pull the value away from ±1.
    const nearEdge = generateAnalogOscSample(0.995, 0.01, 'sawtooth');
    expect(Math.abs(nearEdge)).toBeLessThan(1.0);
  });

  it('noise output is bounded and not a constant', () => {
    const pink = new PinkNoiseState();
    const vals = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const s = generateAnalogOscSample(i / 50, 0.01, 'pink_noise', 0.5, 0, pink);
      expect(Math.abs(s)).toBeLessThanOrEqual(1);
      vals.add(s);
    }
    expect(vals.size).toBeGreaterThan(10); // actually varies
  });
});

describe('ZDFLadderFilter', () => {
  it('processes input without producing NaN/Infinity over many samples', () => {
    const f = new ZDFLadderFilter();
    let last = 0;
    for (let i = 0; i < 5000; i++) {
      const x = Math.sin((2 * Math.PI * 220 * i) / 44100);
      last = f.process(x, 1000, 0.5, 0.2, 44100);
      expect(Number.isFinite(last)).toBe(true);
    }
  });

  it('passes DC through (lowpass keeps the mean)', () => {
    const f = new ZDFLadderFilter();
    let out = 0;
    for (let i = 0; i < 2000; i++) out = f.process(0.5, 5000, 0.2, 0, 44100);
    expect(out).toBeGreaterThan(0.2);
  });

  it('attenuates a tone above cutoff more than a tone below it', () => {
    const below = new ZDFLadderFilter();
    const above = new ZDFLadderFilter();
    // 2kHz tone, cutoff 5kHz (pass) vs cutoff 300Hz (reject).
    let ampBelow = 0;
    let ampAbove = 0;
    for (let i = 0; i < 5000; i++) {
      const x = Math.sin((2 * Math.PI * 2000 * i) / 44100);
      ampBelow = Math.max(ampBelow, Math.abs(below.process(x, 5000, 0.2, 0, 44100)));
      ampAbove = Math.max(ampAbove, Math.abs(above.process(x, 300, 0.2, 0, 44100)));
    }
    expect(ampBelow).toBeGreaterThan(ampAbove);
  });

  it('does not blow up at extreme resonance', () => {
    const f = new ZDFLadderFilter();
    let last = 0;
    for (let i = 0; i < 3000; i++) {
      last = f.process(Math.sin((2 * Math.PI * 440 * i) / 44100) * 0.3, 1200, 9.9, 0.9, 44100);
      expect(Number.isFinite(last)).toBe(true);
    }
  });
});

describe('PinkNoiseState', () => {
  it('is bounded and varying', () => {
    const n = new PinkNoiseState();
    const vals = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const s = n.next();
      expect(Number.isFinite(s)).toBe(true);
      expect(Math.abs(s)).toBeLessThanOrEqual(1);
      vals.add(s);
    }
    expect(vals.size).toBeGreaterThan(20);
  });

  it('reset() returns it to a clean state', () => {
    const n = new PinkNoiseState();
    for (let i = 0; i < 100; i++) n.next();
    n.reset();
    expect(Number.isFinite(n.next())).toBe(true);
  });
});

describe('getVoiceAgeParameters', () => {
  it('returns a full parameter set for every valid age preset', () => {
    for (const age of ['mint', 'studio80s', 'dusty70s', 'broken'] as const) {
      const p = getVoiceAgeParameters(age);
      expect(typeof p.pitchDriftCents).toBe('number');
      expect(Number.isFinite(p.pitchDriftCents)).toBe(true);
      expect(typeof p.noiseFloorDb).toBe('number');
      expect(typeof p.leakage).toBe('number');
      expect(typeof p.cutoffDriftPct).toBe('number');
    }
  });

  it('throws on an unknown age (exhaustiveness guard)', () => {
    expect(() => getVoiceAgeParameters('made-up' as never)).toThrow();
  });
});
