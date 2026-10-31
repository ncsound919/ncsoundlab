/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Parity gate for the shared sampling contract. These cases are the same JSON
 * that `shared/kotlin-core/.../SampleEditTest.kt` runs; a divergence between NC
 * Sound Lab and NC Phone Beat fails one side of the pair.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STRIP_SETTINGS,
  applyGainDb,
  dbToLinear,
  fadeIn,
  fadeOut,
  keepSpans,
  msToFrames,
  nearestZeroCrossing,
  normalize,
  peak,
  removeDcOffset,
  reverse,
  trim,
  type StripSettings,
} from './sampleEdit';

interface ParityCase {
  id: string;
  signal: {
    amplitude?: number;
    leadSilenceMs?: number;
    toneMs?: number[];
    gapMs?: number[];
    toneMs2?: number[];
  };
  settings: StripSettings;
  expectSpans: number[][];
}

function contractPath(): string {
  const candidates = [
    resolve(process.cwd(), '../shared/contracts/sample-edit.v1.json'),
    resolve(process.cwd(), 'shared/contracts/sample-edit.v1.json'),
    resolve(process.cwd(), '../../shared/contracts/sample-edit.v1.json'),
  ];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // try the next location
    }
  }
  throw new Error(`sample-edit.v1.json not found from ${process.cwd()}`);
}

function signalFrom(spec: ParityCase['signal'], sampleRate: number): Float32Array {
  const amplitude = spec.amplitude ?? 0.5;
  const lead = spec.leadSilenceMs ?? 0;
  const firstTone = spec.toneMs?.[0] ?? 0;
  const gap = spec.gapMs?.[0] ?? 0;
  const secondTone = spec.toneMs2?.[0] ?? 0;
  const frames = Math.floor(((lead + firstTone + gap + secondTone) * sampleRate) / 1000);
  const out = new Float32Array(frames);
  let from = Math.floor((lead * sampleRate) / 1000);
  let to = from + Math.floor((firstTone * sampleRate) / 1000);
  for (let i = from; i < to; i++) out[i] = amplitude;
  from = to + Math.floor((gap * sampleRate) / 1000);
  to = from + Math.floor((secondTone * sampleRate) / 1000);
  for (let i = from; i < to; i++) out[i] = amplitude;
  return out;
}

describe('sample-edit parity cases', () => {
  const doc = JSON.parse(readFileSync(contractPath(), 'utf8'));
  const cases = doc.cases as { sampleRate: number; cases: ParityCase[] };

  it.each(cases.cases.map((c) => [c.id, c] as const))('%s', (_id, entry) => {
    const samples = signalFrom(entry.signal, cases.sampleRate);
    const spans = keepSpans(samples, 1, cases.sampleRate, entry.settings);
    expect(spans.map((s) => [s.startFrame, s.endFrameExclusive])).toEqual(entry.expectSpans);
  });
});

describe('sample-edit operations', () => {
  it('normalizes to the contract reference peak without mutating the input', () => {
    const input = new Float32Array([0.1, -0.2, 0.3, -0.4]);
    const out = normalize(input, 2);
    expect(20 * Math.log10(peak(out, 2))).toBeCloseTo(-0.3, 2);
    expect(input[0]).toBeCloseTo(0.1, 6);
  });

  it('fades with exact endpoints on both channels', () => {
    const frames = 100;
    const input = new Float32Array(frames * 2).fill(1);
    const inFade = fadeIn(input, 2, 20);
    expect(inFade[0]).toBe(0);
    expect(inFade[1]).toBe(0);
    expect(inFade[19 * 2]).toBeCloseTo(1, 5);
    expect(inFade[20 * 2]).toBe(1);

    const outFade = fadeOut(input, 2, 20);
    expect(outFade[(frames - 1) * 2]).toBe(0);
    expect(outFade[(frames - 1) * 2 + 1]).toBe(0);
    expect(outFade[(frames - 20) * 2]).toBeCloseTo(1, 5);
  });

  it('reverses frames without swapping channels', () => {
    const out = reverse(new Float32Array([0.1, -0.1, 0.2, -0.2, 0.3, -0.3]), 2);
    const expected = [0.3, -0.3, 0.2, -0.2, 0.1, -0.1];
    expected.forEach((value, i) => expect(out[i]).toBeCloseTo(value, 6));
  });

  it('trims and rebases the kept range', () => {
    const input = Float32Array.from({ length: 20 }, (_, i) => i);
    const out = trim(input, 2, 2, 5);
    expect(Array.from(out)).toEqual([4, 5, 6, 7, 8, 9]);
  });

  it('removes each channel DC offset', () => {
    const out = removeDcOffset(new Float32Array([1, 3, 1, 3, 1, 3]), 2);
    for (const v of out) expect(v).toBeCloseTo(0, 6);
  });

  it('finds the nearest zero crossing', () => {
    const samples = new Float32Array([0.5, 0.4, 0.3, 0.2, -0.1, -0.2, -0.3, -0.4, 0.1, 0.2]);
    expect(nearestZeroCrossing(samples, 1, 4, 8)).toBe(3);
    expect(nearestZeroCrossing(samples, 1, 2, 8)).toBe(3);
    expect(nearestZeroCrossing(new Float32Array([1, 1, 1]), 1, 1, 8)).toBe(1);
  });

  it('applies gain in dB', () => {
    const out = applyGainDb(new Float32Array([0.25, -0.25]), 6);
    expect(out[0]).toBeCloseTo(0.25 * dbToLinear(6), 5);
  });

  it('converts milliseconds at the session rate', () => {
    expect(msToFrames(10, 48000)).toBe(480);
    expect(msToFrames(350, 48000)).toBe(16800);
    expect(DEFAULT_STRIP_SETTINGS.thresholdDb).toBe(-45);
  });
});
