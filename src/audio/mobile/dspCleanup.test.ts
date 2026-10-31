/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLEANUP,
  applyCleanup,
  applyFades,
  deClick,
  gate,
  lowCut,
  normalisePeak,
  removeDcOffset,
  spectralDenoise,
  suggestCleanupParams,
} from './dspCleanup';
import { analyseSamples } from './analysis';
import { hits, mixInto, noise, peakOf, rmsOf, silence, tone } from '../../tests/mobileSignals';

const SR = 48000;

describe('removeDcOffset', () => {
  it('centres a biased buffer and reports the offset', () => {
    const biased = tone(300, 0.2, SR, 0.3);
    for (let i = 0; i < biased.length; i++) biased[i] += 0.2;
    const offset = removeDcOffset(biased);
    expect(offset).toBeCloseTo(0.2, 2);
    expect(Math.abs(analyseSamples(biased, SR).dcOffset)).toBeLessThan(0.01);
  });

  it('returns 0 for an empty buffer', () => {
    expect(removeDcOffset(new Float32Array(0))).toBe(0);
  });
});

describe('lowCut', () => {
  it('attenuates rumble far more than a mid-range tone', () => {
    const rumble = tone(30, 0.5, SR, 0.5);
    const voice = tone(1000, 0.5, SR, 0.5);
    const rumbleBefore = rmsOf(rumble);
    const voiceBefore = rmsOf(voice);
    lowCut(rumble, SR, 120);
    lowCut(voice, SR, 120);
    expect(rmsOf(rumble) / rumbleBefore).toBeLessThan(0.35);
    expect(rmsOf(voice) / voiceBefore).toBeGreaterThan(0.85);
  });

  it('ignores a zero corner frequency', () => {
    const signal = tone(100, 0.1, SR, 0.3);
    const copy = Float32Array.from(signal);
    lowCut(signal, SR, 0);
    expect([...signal]).toEqual([...copy]);
  });
});

describe('deClick', () => {
  it('repairs isolated spikes', () => {
    const clean = tone(200, 0.2, SR, 0.4);
    const clicked = Float32Array.from(clean);
    clicked[2000] = 0.98;
    clicked[2001] = -0.98;
    const fixed = deClick(clicked, SR, { sensitivity: 0.8 });
    expect(fixed).toBeGreaterThan(0);
    expect(peakOf(clicked)).toBeLessThan(peakOf(Float32Array.from(clean)) * 3);
  });

  it('leaves clean audio alone', () => {
    const clean = tone(200, 0.2, SR, 0.4);
    const copy = Float32Array.from(clean);
    expect(deClick(copy, SR)).toBe(0);
    expect([...copy]).toEqual([...clean]);
  });

  it('does nothing on a buffer that is too short or silent', () => {
    expect(deClick(new Float32Array(4), SR)).toBe(0);
    expect(deClick(silence(0.1, SR), SR)).toBe(0);
  });
});

describe('spectralDenoise', () => {
  it('lowers a steady hiss while keeping the hit', () => {
    const hiss = noise(1.0, SR, 0.02, 3);
    const material = mixInto(hits([{ atSec: 0.45, freq: 300, decaySec: 0.08 }], 1.0, SR), hiss);
    const before = rmsOf(material.subarray(0, 0.3 * SR));
    const copy = Float32Array.from(material);
    spectralDenoise(copy, SR, { reductionDb: 12 });
    const after = rmsOf(copy.subarray(0, 0.3 * SR));
    expect(after).toBeLessThan(before);
    // The transient must survive: denoise is not a gate.
    expect(peakOf(copy)).toBeGreaterThan(0.5);
  });

  it('is a no-op for buffers shorter than two frames', () => {
    const tiny = toyBuffer(500);
    const copy = Float32Array.from(tiny);
    spectralDenoise(copy, SR);
    expect([...copy]).toEqual([...tiny]);
  });
});

describe('gate', () => {
  it('attenuates a quiet bed and passes the transient', () => {
    const bed = noise(0.6, SR, 0.002, 11);
    const material = mixInto(bed, hits([{ atSec: 0.3, freq: 120, amp: 0.9, decaySec: 0.05 }], 0.6, SR));
    const before = peakOf(material);
    const openRatio = gate(material, SR, { thresholdDb: -48, holdMs: 80, releaseMs: 120, range: 0.9 });
    expect(openRatio).toBeGreaterThan(0);
    expect(openRatio).toBeLessThan(0.9);
    expect(peakOf(material)).toBeGreaterThan(before * 0.8);
  });

  it('leaves continuous loud material fully open', () => {
    const loud = tone(400, 0.3, SR, 0.5);
    const ratio = gate(loud, SR, { thresholdDb: -48 });
    expect(ratio).toBeGreaterThan(0.95);
  });

  it('returns 1 for an empty buffer', () => {
    expect(gate(new Float32Array(0), SR)).toBe(1);
  });
});

describe('fades and normalisation', () => {
  it('starts and ends at silence', () => {
    const signal = tone(300, 0.2, SR, 0.5);
    applyFades(signal, SR, 5, 20);
    expect(Math.abs(signal[0])).toBeLessThan(1e-6);
    expect(Math.abs(signal[signal.length - 1])).toBeLessThan(1e-6);
  });

  it('normalises to the requested peak', () => {
    const signal = tone(300, 0.2, SR, 0.2);
    const { gainDb, limited } = normalisePeak(signal, -1);
    expect(gainDb).toBeGreaterThan(0);
    expect(limited).toBe(false);
    expect(peakOf(signal)).toBeCloseTo(0.891, 2);
  });

  it('reports a no-op and an empty buffer', () => {
    expect(normalisePeak(new Float32Array(0), -1)).toEqual({ gainDb: 0, limited: false });
    const already = tone(300, 0.1, SR, Math.pow(10, -1 / 20));
    expect(normalisePeak(already, -1).gainDb).toBeCloseTo(0, 1);
  });
});

describe('applyCleanup', () => {
  it('returns a new buffer, keeps the master intact, and reports each step', () => {
    const material = mixInto(tone(300, 0.3, SR, 0.2), noise(0.3, SR, 0.01, 5));
    const master = Float32Array.from(material);
    const { samples, report } = applyCleanup(material, SR, {
      lowCutHz: 60,
      denoise: true,
      gate: true,
      normalize: true,
      normalizePeakDb: -1,
    });
    expect([...material]).toEqual([...master]);
    expect(samples).not.toBe(master);
    expect(report.applied.length).toBeGreaterThanOrEqual(4);
    expect(report.applied.join(' ')).toMatch(/Low cut/);
    expect(report.gateOpenRatio).toBeGreaterThanOrEqual(0);
    expect(peakOf(samples)).toBeLessThanOrEqual(1);
    // Cleanup must not leave audible DC behind. It cannot be compared to
    // dcBefore directly: normalisation scales whatever DC remains.
    expect(Math.abs(report.dcAfter)).toBeLessThan(0.01);
  });

  it('uses defaults when nothing is passed', () => {
    const { report } = applyCleanup(tone(200, 0.1, SR, 0.2), SR);
    expect(report.applied.join(' ')).toMatch(new RegExp(`Low cut ${DEFAULT_CLEANUP.lowCutHz} Hz`));
  });
});

describe('suggestCleanupParams', () => {
  it('opens the gate and enables denoise on a hissy capture', () => {
    // Quiet enough that most frames are near the -60 dBFS silence floor.
    const hiss = noise(0.5, SR, 0.0004, 21);
    const material = mixInto(hiss, hits([{ atSec: 0.25, freq: 200, decaySec: 0.05 }], 0.5, SR));
    const suggestion = suggestCleanupParams(analyseSamples(material, SR));
    expect(suggestion.gate).toBe(true);
    expect(suggestion.denoise).toBe(true);
    expect(suggestion.gateThresholdDb).toBeLessThan(0);
  });

  it('keeps a dense, dark capture ungated with a lower corner', () => {
    const suggestion = suggestCleanupParams(analyseSamples(tone(60, 0.4, SR, 0.6), SR));
    expect(suggestion.gate).toBe(false);
    expect(suggestion.lowCutHz).toBe(60);
  });
});

function toyBuffer(length: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = Math.sin(i / 10) * 0.3;
  return out;
}
