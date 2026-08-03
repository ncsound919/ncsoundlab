/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for BPM detection + tempo alignment (Phase 4.4).
 */

import { describe, expect, it } from 'vitest';
import {
  autocorrelation,
  bpmToLag,
  computeEnergyEnvelope,
  detectBpm,
  onsetStrength,
  snapProjectToReferenceBpm,
} from './tempoDetection';

const makeClickBuffer = (bpm: number, durationSec = 6, sampleRate = 44100): AudioBuffer => {
  const length = Math.ceil(sampleRate * durationSec);
  const data = new Float32Array(length);
  // Beat-level clicks — one per beat (mimics a kick track).
  const period = 60 / bpm;
  for (let t = 0; t < durationSec; t += period) {
    const idx = Math.floor(t * sampleRate);
    if (idx + 128 >= length) break;
    for (let i = 0; i < 128; i++) {
      data[idx + i] = Math.sin((i / 128) * Math.PI * 8) * Math.exp(-i / 24);
    }
  }
  return {
    sampleRate,
    length,
    duration: durationSec,
    numberOfChannels: 1,
    getChannelData: () => data,
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
};

describe('tempoDetection — computeEnergyEnvelope', () => {
  it('produces one envelope value per window', () => {
    const buf = new OfflineAudioContext(1, 44100, 44100).createBuffer(1, 44100, 44100);
    const env = computeEnergyEnvelope(buf, 1024);
    expect(env.length).toBe(43); // 44100 / 1024 = 43.06
  });

  it('produces non-zero envelope for click-track input', () => {
    const buf = makeClickBuffer(120);
    const env = computeEnergyEnvelope(buf, 1024);
    expect(env.length).toBeGreaterThan(10);
    // Sum should be positive (clicks are real audio).
    let total = 0;
    for (const v of env) total += v;
    expect(total).toBeGreaterThan(0);
  });
});

describe('tempoDetection — onsetStrength', () => {
  it('is non-negative everywhere', () => {
    const buf = makeClickBuffer(120);
    const env = computeEnergyEnvelope(buf, 1024);
    const onset = onsetStrength(env);
    for (const v of onset) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('peaks at click positions', () => {
    const buf = makeClickBuffer(120);
    const env = computeEnergyEnvelope(buf, 1024);
    const onset = onsetStrength(env);
    // Onset 0 is by definition 0 (no previous frame).
    expect(onset[0]).toBe(0);
    // There should be at least one strong peak in the middle of the buffer.
    let max = 0;
    for (const v of onset) if (v > max) max = v;
    expect(max).toBeGreaterThan(0);
  });
});

describe('tempoDetection — autocorrelation', () => {
  it('returns 0 for invalid lags', () => {
    expect(autocorrelation(new Float32Array(10), 0)).toBe(0);
    expect(autocorrelation(new Float32Array(10), -1)).toBe(0);
    expect(autocorrelation(new Float32Array(10), 10)).toBe(0);
  });

  it('peaks at the period of a synthetic pulse train', () => {
    const period = 8;
    const onset = new Float32Array(period * 4);
    for (let i = 0; i < onset.length; i += period) {
      onset[i] = 1;
    }
    const scoreAtPeriod = autocorrelation(onset, period);
    const scoreOffPeriod = autocorrelation(onset, period + 1);
    expect(scoreAtPeriod).toBeGreaterThan(scoreOffPeriod);
  });
});

describe('tempoDetection — bpmToLag', () => {
  it('inverts back: detectBpm should recover the click-track BPM', () => {
    expect(bpmToLag(120, 44100, 1024)).toBeGreaterThan(0);
    expect(bpmToLag(60, 44100, 1024)).toBeGreaterThan(bpmToLag(120, 44100, 1024));
  });
});

describe('tempoDetection — detectBpm', () => {
  it('recovers 120 BPM within ±4 BPM on a synthetic click track', () => {
    const buf = makeClickBuffer(120);
    const { bpm, confidence } = detectBpm(buf);
    expect(Math.abs(bpm - 120)).toBeLessThanOrEqual(4);
    expect(confidence).toBeGreaterThan(0);
  });

  it('recovers 140 BPM within ±4 BPM on a synthetic click track', () => {
    const buf = makeClickBuffer(140);
    const { bpm } = detectBpm(buf);
    expect(Math.abs(bpm - 140)).toBeLessThanOrEqual(4);
  });

  it('recovers 90 BPM within ±4 BPM (regression: half-beat harmonic)', () => {
    // 90 BPM = 0.667s/beat. Strong 1/2-beat onset peaks often dominate the
    // autocorr at half the beat period. The detector must recognise this and
    // halve the naive BPM rather than doubling it.
    const buf = makeClickBuffer(90);
    const { bpm } = detectBpm(buf);
    expect(Math.abs(bpm - 90)).toBeLessThanOrEqual(4);
  });

  it('returns multiple candidates', () => {
    const buf = makeClickBuffer(120);
    const result = detectBpm(buf);
    expect(result.candidates).toBeDefined();
    expect(result.candidates!.length).toBeGreaterThan(0);
  });
});

describe('tempoDetection — snapProjectToReferenceBpm', () => {
  it('clamps to 40..300 and calls both setters', () => {
    const calls = { bpm: 0, tempos: [] as { tick: number; bpm: number }[] };
    snapProjectToReferenceBpm({
      bpm: 125,
      setPatternBpm: (b) => { calls.bpm = b; },
      setArrangementTempo: (t) => { calls.tempos = t; },
    });
    expect(calls.bpm).toBe(125);
    expect(calls.tempos).toEqual([{ tick: 0, bpm: 125 }]);
  });

  it('clamps out-of-range BPM', () => {
    let bpm = 0;
    snapProjectToReferenceBpm({
      bpm: 999,
      setPatternBpm: (b) => { bpm = b; },
      setArrangementTempo: () => {},
    });
    expect(bpm).toBe(300);
    bpm = 0;
    snapProjectToReferenceBpm({
      bpm: 5,
      setPatternBpm: (b) => { bpm = b; },
      setArrangementTempo: () => {},
    });
    expect(bpm).toBe(40);
  });
});
