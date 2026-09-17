/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Regression tests for the seven synth parameters that were previously exposed
 * in the UI but never read by the renderer: resonanceBloom, selfOscillation,
 * zeroCrossingMutator, analogFilterMode, fmAmount, ringMod and oversampling.
 *
 * Settings are neutralised (no random drift/slop/chaos) so two renders with the
 * same settings are bit-identical and a real difference means the parameter did
 * something.
 */

import { describe, it, expect } from 'vitest';
import { generateChaosSynthBuffer, type AdvancedChaosSettings } from './chaosSynth';
import { DEFAULT_SYNTH } from '../types';

const makeCtx = (sampleRate = 44100): BaseAudioContext =>
  ({
    sampleRate,
    createBuffer: (channels: number, length: number, rate: number) => {
      const channelData = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        duration: length / rate,
        getChannelData: (ch: number) => channelData[ch] ?? channelData[0],
        copyToChannel: (src: Float32Array, ch: number) => channelData[ch]?.set(src),
        copyFromChannel: () => {},
      };
    },
  } as unknown as BaseAudioContext);

const settings = (over: Record<string, unknown> = {}): AdvancedChaosSettings =>
  ({
    ...DEFAULT_SYNTH,
    oscType: 'sawtooth',
    frequency: 220,
    subLevel: 0,
    // Neutralise every source of randomness so renders are deterministic.
    driftAmount: 0,
    slopAmount: 0,
    vintageMacro: 0,
    phaseChaos: 0,
    analogDriftSpeed: 0.01,
    noiseLevel: 0,
    textureLevel: 0,
    macroChaos: 0,
    filterCutoff: 1800,
    filterResonance: 0.4,
    ...over,
  }) as AdvancedChaosSettings;

const render = (over: Record<string, unknown> = {}) =>
  generateChaosSynthBuffer(makeCtx(), settings(over), 0.15);

const channel = (buf: AudioBuffer, c = 0): Float32Array => buf.getChannelData(c);

const meanAbsDiff = (a: AudioBuffer, b: AudioBuffer): number => {
  const da = channel(a);
  const db = channel(b);
  let sum = 0;
  const n = Math.min(da.length, db.length);
  for (let i = 0; i < n; i++) sum += Math.abs(da[i] - db[i]);
  return sum / Math.max(1, n);
};

const expectFinite = (buf: AudioBuffer) => {
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = channel(buf, c);
    for (let i = 0; i < d.length; i++) {
      expect(Number.isFinite(d[i])).toBe(true);
    }
  }
};

describe('previously-dead synth params now affect the render', () => {
  const baseline = render();

  it('fmAmount adds FM index', () => {
    const out = render({ fmAmount: 0.8, fmDepth: 0 });
    expectFinite(out);
    expect(meanAbsDiff(baseline, out)).toBeGreaterThan(0.001);
  });

  it('ringMod adds ring-modulation depth', () => {
    const out = render({ ringMod: 0.8, ringModMix: 0, ringModFreq: 330 });
    expectFinite(out);
    expect(meanAbsDiff(baseline, out)).toBeGreaterThan(0.001);
  });

  it('resonanceBloom swells the filter resonance', () => {
    const out = render({ resonanceBloom: 0.9 });
    expectFinite(out);
    expect(meanAbsDiff(baseline, out)).toBeGreaterThan(0.0005);
  });

  it('selfOscillation adds a resonant comb ring', () => {
    const out = render({ selfOscillation: 0.9 });
    expectFinite(out);
    expect(meanAbsDiff(baseline, out)).toBeGreaterThan(0.0005);
  });

  it('zeroCrossingMutator alters the waveform at zero crossings', () => {
    const out = render({ zeroCrossingMutator: 0.9 });
    expectFinite(out);
    // The mutation only lands on zero crossings, so the whole-buffer mean delta
    // is small by nature — but it must be non-zero.
    expect(meanAbsDiff(baseline, out)).toBeGreaterThan(0.00005);
  });

  it('oversampling factor changes the saturation path', () => {
    const os1 = render({ oversampling: 1 });
    const os4 = render({ oversampling: 4 });
    expectFinite(os1);
    expectFinite(os4);
    expect(meanAbsDiff(os1, os4)).toBeGreaterThan(0.0001);
  });

  it('analogFilterMode selects a different filter model (finite + different)', () => {
    const svf = render({ analogFilterMode: 'zdfSvf' });
    const biquad = render({ analogFilterMode: 'biquad' });
    expectFinite(svf);
    expectFinite(biquad);
    expect(meanAbsDiff(baseline, svf)).toBeGreaterThan(0.0005);
    expect(meanAbsDiff(baseline, biquad)).toBeGreaterThan(0.0005);
  });
});
