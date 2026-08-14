/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extra branch coverage for `src/lib/chaosSynth.ts` — drives the synthesis
 * loop's optional feature paths (phase distortion, dual-osc/unison, wavefolding,
 * noise colors, texture engines, ring mod, formant vocoding, filter families,
 * oversampling/decimation, grains) plus the LRU render-cache eviction.
 */

import { describe, it, expect } from 'vitest';
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

const makeSettings = (over: Record<string, unknown> = {}): AdvancedChaosSettings =>
  ({ ...DEFAULT_SYNTH, subLevel: 0.5, ...over }) as AdvancedChaosSettings;

const render = (settings: AdvancedChaosSettings, durationSec = 0.2, sampleRate = 44100) => {
  const ctx = makeCtx(sampleRate);
  return generateChaosSynthBuffer(ctx, settings, durationSec);
};

const expectFinite = (buf: AudioBuffer) => {
  expect(buf.numberOfChannels).toBe(2);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      expect(Number.isFinite(data[i])).toBe(true);
    }
  }
};

describe('generateChaosSynthBuffer feature paths', () => {
  it('kitchen-sink render hits phase distortion, dual osc, unison, wavefold, pink noise, ring mod, vocoder, filter family, oversampling-off, decimation and grains', () => {
    const buf = render(
      makeSettings({
        oscType: 'sawtooth',
        frequency: 220,
        phaseChaos: 0.3,
        pdAmount: 1,
        osc2Mix: 0.5,
        osc2Detune: 7,
        osc2Type: 'square',
        hardSync: true,
        unisonVoices: 7,
        unisonDetune: 20,
        unisonWidth: 0.8,
        wavefold: 0.5,
        noiseLevel: 0.3,
        noiseColor: 'pink',
        ringModMix: 0.3,
        logChaos: 0.5,
        textureLevel: 0.3,
        textureType: 'pink',
        vowelFormant: 'a',
        vowelMix: 0.4,
        filterFamily: 'moog_ladder',
        oversamplingEnabled: false,
        downsampleFactor: 2,
        grainCount: 8,
        grainDrift: 0.5,
        grainSizeJitter: 0.5,
        sprayRadius: 0.7,
      })
    );
    expectFinite(buf);
    expect(buf.length).toBe(Math.floor(44100 * 0.2));
    let peak = 0;
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf.getChannelData(0)[i]));
    expect(peak).toBeGreaterThan(0);
  });

  it('dual-osc mixing without hard sync exercises the free-phase path', () => {
    const buf = render(
      makeSettings({ osc2Mix: 0.6, osc2Detune: 12, osc2Type: 'triangle', hardSync: false })
    );
    expectFinite(buf);
  });

  it('every vowel formant assigns its frequencies and the bandpass banks process audio', () => {
    for (const vowel of ['a', 'e', 'i', 'o', 'u']) {
      const buf = render(makeSettings({ vowelFormant: vowel, vowelMix: 0.5, frequency: 220 }));
      expectFinite(buf);
    }
  });

  it('pitch attack envelope ramps at the very start of the note', () => {
    const buf = render(makeSettings({ pitchEnvAttack: 0.01, pitchEnvDepth: 12, frequency: 110 }));
    expectFinite(buf);
  });

  it('glide/portamento ramps from a semitone below when glideTime exceeds the note', () => {
    const buf = render(makeSettings({ glideTime: 0.5, frequency: 440 }));
    expectFinite(buf);
  });

  it('supports retrigger phase-offset modes 0 and 2 (and leaves 1 intact)', () => {
    for (const unisonPhaseOffset of [0, 2]) {
      const buf = render(makeSettings({ unisonPhaseOffset }));
      expectFinite(buf);
    }
  });

  it('renders every noise colour through the filter + mix stage', () => {
    for (const noiseColor of ['white', 'brown', 'blue']) {
      const buf = render(makeSettings({ noiseLevel: 0.4, noiseColor }));
      expectFinite(buf);
    }
  });

  it('renders every texture engine variant', () => {
    for (const textureType of ['noise', 'vinyl', 'tape', 'hum', 'digital', 'brown']) {
      const buf = render(makeSettings({ textureLevel: 0.4, textureType }));
      expectFinite(buf);
    }
  }, 30000);

  it('evicts the oldest render-cache entries once more than 32 distinct patches exist', () => {
    for (let i = 0; i < 33; i++) {
      const buf = render(makeSettings({ frequency: 60 + i }), 0.03);
      expectFinite(buf);
    }
    // Same settings as the last evicted render still render fine.
    const again = render(makeSettings({ frequency: 61 }), 0.03);
    expectFinite(again);
  }, 30000);
});
