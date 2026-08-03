/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/audio/dsp/TimeStretch.ts` (Phase 5.2).
 */

import { describe, expect, it } from 'vitest';
import { stretchSampleBuffer, stretchToDuration } from './TimeStretch';

// jsdom lacks a working `new AudioBuffer()`. Fabricate the minimal shape the
// DSP touches (numberOfChannels, sampleRate, length, getChannelData).
const makeTone = (durationSec: number, freq = 440, sampleRate = 16000): AudioBuffer => {
  const length = Math.floor(sampleRate * durationSec);
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5;
  }
  return {
    numberOfChannels: 1,
    sampleRate,
    length,
    duration: length / sampleRate,
    getChannelData: () => data,
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
};

const durationOf = (b: AudioBuffer): number => b.length / b.sampleRate;
const peakFreq = (b: AudioBuffer): number => {
  // Autocorrelation period estimate on the middle 60% of the buffer, avoiding
  // phase-vocoder boundary artifacts at the edges. Pick the SMALLEST lag with a
  // strong correlation — that is the fundamental period (harmonics correlate
  // equally well, so the largest lag would over-estimate the period).
  const d = b.getChannelData(0);
  const sr = b.sampleRate;
  const start = Math.floor(d.length * 0.2);
  const end = Math.floor(d.length * 0.8);
  const n = Math.max(2, end - start);
  const lagMin = Math.max(1, Math.floor(sr / 2000)); // up to 2 kHz
  const lagMax = Math.min(n, Math.floor(sr / 40));   // down to 40 Hz
  const scores: number[] = [];
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let sum = 0;
    let energy = 0;
    for (let i = start; i < end - lag; i++) {
      sum += d[i] * d[i + lag];
      energy += d[i] * d[i];
    }
    scores.push(energy > 0 ? sum / energy : 0);
  }
  // First lag whose score is close to the best, scanning low→high.
  const best = Math.max(...scores);
  const idx = scores.findIndex((s) => s > best * 0.9);
  const bestLag = lagMin + (idx >= 0 ? idx : scores.indexOf(best));
  return sr / bestLag;
};

describe('TimeStretch — stretchSampleBuffer', () => {
  it('preserves duration for a no-op stretch', () => {
    const src = makeTone(1);
    const { buffer } = stretchSampleBuffer(src, { timeFactor: 1 });
    expect(durationOf(buffer)).toBeCloseTo(durationOf(src), 1);
  });

  it('doubles duration with timeFactor=2 while preserving pitch', () => {
    const src = makeTone(1, 440);
    const { buffer } = stretchSampleBuffer(src, { timeFactor: 2 });
    expect(durationOf(buffer)).toBeGreaterThanOrEqual(durationOf(src) * 1.8);
    // Fundamental stays near 440 Hz.
    expect(Math.abs(peakFreq(buffer) - 440)).toBeLessThan(60);
  });

  it('halves duration with timeFactor=0.5 while preserving pitch', () => {
    const src = makeTone(1, 440);
    const { buffer } = stretchSampleBuffer(src, { timeFactor: 0.5 });
    expect(durationOf(buffer)).toBeLessThanOrEqual(durationOf(src) * 0.6);
    expect(Math.abs(peakFreq(buffer) - 440)).toBeLessThan(80);
  });

  it('shifts pitch up without changing duration', () => {
    const src = makeTone(1, 220);
    const { buffer } = stretchSampleBuffer(src, { pitchSemitones: 12 });
    expect(durationOf(buffer)).toBeCloseTo(durationOf(src), 1);
    // One octave up → ~440 Hz.
    expect(Math.abs(peakFreq(buffer) - 440)).toBeLessThan(90);
  });

  it('stretchToDuration derives the time factor', () => {
    const src = makeTone(1, 440);
    const { buffer, timeFactor } = stretchToDuration(src, 2);
    expect(timeFactor).toBeCloseTo(2, 2);
    expect(durationOf(buffer)).toBeGreaterThanOrEqual(1.8);
  });

  it('silence in → silence out', () => {
    const data = new Float32Array(16000);
    const src = {
      numberOfChannels: 1,
      sampleRate: 16000,
      length: 16000,
      duration: 1,
      getChannelData: () => data,
      copyFromChannel: () => {},
      copyToChannel: () => {},
    } as unknown as AudioBuffer;
    const { buffer } = stretchSampleBuffer(src, { timeFactor: 2 });
    const out = buffer.getChannelData(0);
    let maxAbs = 0;
    for (let i = 0; i < out.length; i++) maxAbs = Math.max(maxAbs, Math.abs(out[i]));
    expect(maxAbs).toBeLessThan(1e-9);
  });

  it('returns a new buffer reference (never mutates input)', () => {
    const src = makeTone(0.5, 440);
    const src0 = src.getChannelData(0);
    const snapshot = new Float32Array(src0);
    const { buffer } = stretchSampleBuffer(src, { timeFactor: 1.5 });
    expect(buffer).not.toBe(src);
    for (let i = 0; i < src0.length; i++) {
      expect(src0[i]).toBe(snapshot[i]);
    }
  });

  it('output is finite for typical inputs', () => {
    const src = makeTone(0.5, 220);
    const { buffer } = stretchSampleBuffer(src, { timeFactor: 1.5, pitchSemitones: 7 });
    const out = buffer.getChannelData(0);
    for (let i = 0; i < out.length; i++) {
      expect(Number.isFinite(out[i])).toBe(true);
    }
  });

  it('handles stereo input (two tone channels)', () => {
    const length = 8000;
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      left[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.5;
      right[i] = Math.sin((2 * Math.PI * 660 * i) / 16000) * 0.5;
    }
    const buffers = [left, right];
    const src = {
      numberOfChannels: 2,
      sampleRate: 16000,
      length,
      duration: length / 16000,
      getChannelData: (i: number) => buffers[i],
      copyFromChannel: () => {},
      copyToChannel: () => {},
    } as unknown as AudioBuffer;
    const { buffer } = stretchSampleBuffer(src, { timeFactor: 1.5 });
    expect(buffer.numberOfChannels).toBe(2);
    const outL = buffer.getChannelData(0);
    const outR = buffer.getChannelData(1);
    expect(outL.length).toBeGreaterThanOrEqual(Math.floor(length * 1.3));
    // At least one channel should have signal.
    let maxL = 0, maxR = 0;
    for (let i = 0; i < outL.length; i++) maxL = Math.max(maxL, Math.abs(outL[i]));
    for (let i = 0; i < outR.length; i++) maxR = Math.max(maxR, Math.abs(outR[i]));
    expect(maxL).toBeGreaterThan(0.01);
    expect(maxR).toBeGreaterThan(0.01);
  });
});
