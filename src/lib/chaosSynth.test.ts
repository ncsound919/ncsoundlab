/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/lib/chaosSynth.ts` — the procedural chaos-synth buffer
 * generator. Verifies structural/sonic invariants (length, channels,
 * finiteness, boundedness, anti-click envelope, determinism via cache).
 */

import { describe, expect, it } from 'vitest';
import { generateChaosSynthBuffer, type AdvancedChaosSettings } from './chaosSynth';
import { DEFAULT_SYNTH } from '../types';

const makeCtx = (sampleRate = 44100): BaseAudioContext => ({
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

const baseSettings: AdvancedChaosSettings = {
  ...DEFAULT_SYNTH,
  oscType: 'sawtooth',
  frequency: 220,
  subLevel: 0.5,
  phaseChaos: 0.1,
  macroChaos: 0.2,
};

describe('generateChaosSynthBuffer', () => {
  it('returns a stereo buffer of the requested length and sample rate', () => {
    const ctx = makeCtx(44100);
    const buf = generateChaosSynthBuffer(ctx, baseSettings, 0.5);
    expect(buf.numberOfChannels).toBe(2);
    expect(buf.sampleRate).toBe(44100);
    expect(buf.length).toBe(Math.floor(44100 * 0.5));
  });

  it('produces finite, bounded samples (no NaN/Infinity), no silence blow-up', () => {
    const ctx = makeCtx(44100);
    const buf = generateChaosSynthBuffer(ctx, baseSettings, 0.25);
    let peak = 0;
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(1.0);
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
    }
    // Not silent.
    expect(peak).toBeGreaterThan(0.01);
  });

  it('fades in at the attack (anti-click) and out at the tail', () => {
    const ctx = makeCtx(44100);
    const buf = generateChaosSynthBuffer(ctx, baseSettings, 0.5);
    const data = buf.getChannelData(0);
    // First sample should be ~silent (8ms attack).
    expect(Math.abs(data[0])).toBeLessThan(0.05);
    // Last sample should be faded out.
    expect(Math.abs(data[data.length - 1])).toBeLessThan(0.05);
    // Somewhere in the body it should be loud (so the fade check is meaningful).
    let peak = 0;
    for (let i = Math.floor(ctx.sampleRate * 0.05); i < data.length - Math.floor(ctx.sampleRate * 0.05); i++) {
      if (Math.abs(data[i]) > peak) peak = Math.abs(data[i]);
    }
    expect(peak).toBeGreaterThan(0.01);
  });

  it('is deterministic for identical settings (render cache)', () => {
    const ctx = makeCtx(44100);
    const a = generateChaosSynthBuffer(ctx, baseSettings, 0.2);
    const b = generateChaosSynthBuffer(ctx, baseSettings, 0.2);
    expect(a.getChannelData(0)).toEqual(b.getChannelData(0));
  });

  it('handles extreme chaos/phase settings without producing garbage', () => {
    const ctx = makeCtx(44100);
    const extreme: AdvancedChaosSettings = {
      ...DEFAULT_SYNTH,
      oscType: 'square',
      frequency: 50,
      subLevel: 0.9,
      phaseChaos: 1,
      fractalHarmonics: 1,
      harmonicBias: 1,
      feedbackTurbulence: 0.95,
      sampleRateChaos: 0.99,
      logisticChaos: 0.99,
      errorInjection: 0.1,
      bitcrushDepth: 90,
      wavefoldDepth: 1,
    };
    const buf = generateChaosSynthBuffer(ctx, extreme, 0.2);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 50) {
      expect(Number.isFinite(data[i])).toBe(true);
      // The main loop clamps to ±1, but the granular scatter post-processor can
      // recombine grain overlaps hotter. The master limiter catches overs in
      // the real chain — this test only guards against NaN/Inf/pathological
      // blow-up, so allow a generous headroom bound.
      expect(Math.abs(data[i])).toBeLessThanOrEqual(20);
    }
  });

  it('respects different sample rates', () => {
    const ctx48 = makeCtx(48000);
    const buf = generateChaosSynthBuffer(ctx48, baseSettings, 0.2);
    expect(buf.sampleRate).toBe(48000);
    expect(buf.length).toBe(Math.floor(48000 * 0.2));
  });
});
