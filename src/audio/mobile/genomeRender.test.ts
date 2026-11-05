/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  applyGrainScatter,
  bitCrush,
  drive,
  highPass,
  lowPass,
  pitchShift,
  renderGenome,
  tremolo,
} from './genomeRender';
import { analyseSamples } from './analysis';
import { makeGenome, mutate } from '../../lib/mobile/genome';
import { harmonics, peakOf, rmsOf, tone } from '../../tests/mobileSignals';

const SR = 48000;

const source = (seconds = 0.5, hz = 1000): Float32Array => tone(hz, seconds, SR, 0.5);

/** A genome that only re-records the source: no generated layers, no effects. */
const throughGenome = () =>
  makeGenome(11, {
    layers: [{ kind: 'recording', weight: 1 }],
    filter: { lowHz: 20, highHz: 20000, type: 'lohi' },
    pitch: { rootHz: 440, offsetCents: 0 },
    grain: { scatter: 0, sizeMs: 80, rateHz: 12 },
    crush: { bits: 32, downsample: 1 },
    drive: { amount: 0, mix: 0 },
    tremolo: { rateHz: 4, depth: 0 },
    gainDb: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
    transientLockEnabled: false,
    transientLockMs: 0,
  });

describe('renderGenome', () => {
  it('passes a bare genome through nearly untouched', () => {
    const input = source();
    const rendered = renderGenome(throughGenome(), { sampleRate: SR, source: input });
    expect(rendered.samples.length).toBe(input.length);
    expect(rendered.capped).toBe(false);
    // The filter edges are the only permitted difference.
    for (let i = 200; i < input.length - 200; i += 97) {
      expect(Math.abs(rendered.samples[i] - input[i])).toBeLessThan(0.01);
    }
  });

  it('is deterministic — the same genome renders byte-for-byte', () => {
    const genome = mutate(makeGenome(5), 0.8, { seed: 42 });
    const a = renderGenome(genome, { sampleRate: SR, source: source() });
    const b = renderGenome(genome, { sampleRate: SR, source: source() });
    expect(a.samples).toEqual(b.samples);
    expect(a.lockedFrames).toBe(b.lockedFrames);
  });

  it('renders differently from its parent at full strength', () => {
    const parent = makeGenome(5);
    const child = mutate(parent, 1, { seed: 42 });
    const parentRender = renderGenome(parent, { sampleRate: SR, source: source() }).samples;
    const childRender = renderGenome(child, { sampleRate: SR, source: source() }).samples;
    let different = 0;
    for (let i = 0; i < parentRender.length; i += 31) {
      if (Math.abs(parentRender[i] - childRender[i]) > 1e-3) different++;
    }
    expect(different).toBeGreaterThan(0);
  });

  it('adds sub content when a sub layer is present', () => {
    const input = source();
    const bare = analyseSamples(renderGenome(throughGenome(), { sampleRate: SR, source: input }).samples, SR);
    const withSub = analyseSamples(
      renderGenome(
        makeGenome(7, {
          layers: [
            { kind: 'recording', weight: 1 },
            { kind: 'sub', weight: 0.9, waveform: 'sine', freqHz: 55, decayS: 0.8 },
          ],
        }),
        { sampleRate: SR, source: input }
      ).samples,
      SR
    );
    expect(withSub.bands.sub).toBeGreaterThan(bare.bands.sub);
    expect(withSub.peak).toBeGreaterThan(0.5);
  });

  it('restores the recorded attack verbatim when the lock is on', () => {
    const input = source();
    const genome = mutate(makeGenome(9), 1, { seed: 3 });
    expect(genome.params.transientLockEnabled).toBe(true);
    const rendered = renderGenome(genome, { sampleRate: SR, source: input });
    expect(rendered.lockedFrames).toBeGreaterThan(0);
    for (let i = 0; i < rendered.lockedFrames; i++) {
      expect(rendered.samples[i]).toBe(input[i]);
    }
    // After the lock the mutation takes over.
    expect(rendered.samples[rendered.samples.length - 1]).not.toBe(input[input.length - 1]);
  });

  it('does not restore the attack when the lock is off', () => {
    const input = source();
    const genome = makeGenome(9, {
      layers: [
        { kind: 'recording', weight: 0.2 },
        { kind: 'noise', weight: 0.5, waveform: 'noise', decayS: 0.8, phaseOffset: 0.1 },
      ],
      transientLockEnabled: false,
      transientLockMs: 15,
    });
    const rendered = renderGenome(genome, { sampleRate: SR, source: input });
    expect(rendered.lockedFrames).toBe(0);
    expect(rendered.samples[0]).not.toBe(input[0]);
  });

  it('respects the length cap', () => {
    const rendered = renderGenome(throughGenome(), {
      sampleRate: SR,
      source: source(2),
      maxSeconds: 0.5,
    });
    expect(rendered.samples.length).toBe(Math.round(0.5 * SR));
    expect(rendered.capped).toBe(true);
    expect(rendered.durationSec).toBeCloseTo(0.5, 3);
  });

  it('never emits a sample outside full scale', () => {
    const loud = makeGenome(21, {
      layers: [
        { kind: 'recording', weight: 1 },
        { kind: 'synth', weight: 1, waveform: 'square', freqHz: 220, decayS: 1 },
        { kind: 'sub', weight: 1, waveform: 'sine', freqHz: 60, decayS: 1 },
      ],
      drive: { amount: 1, mix: 1 },
      gainDb: 12,
      transientLockEnabled: false,
    });
    const rendered = renderGenome(loud, { sampleRate: SR, source: source(1, 300) });
    expect(peakOf(rendered.samples)).toBeLessThanOrEqual(1);
    expect(peakOf(rendered.samples)).toBeGreaterThan(0.5);
  });

  it('survives an empty source', () => {
    const rendered = renderGenome(makeGenome(1), { sampleRate: SR, source: new Float32Array(0) });
    expect(rendered.samples.length).toBe(1);
    expect(Number.isFinite(rendered.samples[0])).toBe(true);
  });
});

describe('render stages', () => {
  it('low-pass attenuates content above the corner', () => {
    const bright = source(0.5, 6000);
    const filtered = Float32Array.from(bright);
    lowPass(filtered, SR, 1000);
    expect(rmsOf(filtered)).toBeLessThan(rmsOf(bright) * 0.2);
    const dark = source(0.5, 200);
    const kept = Float32Array.from(dark);
    lowPass(kept, SR, 1000);
    expect(rmsOf(kept)).toBeGreaterThan(rmsOf(dark) * 0.9);
  });

  it('high-pass attenuates rumble but keeps the mid', () => {
    const rumble = source(0.5, 60);
    const filtered = Float32Array.from(rumble);
    highPass(filtered, SR, 500);
    expect(rmsOf(filtered)).toBeLessThan(rmsOf(rumble) * 0.2);
    const mid = source(0.5, 1000);
    const kept = Float32Array.from(mid);
    highPass(kept, SR, 500);
    expect(rmsOf(kept)).toBeGreaterThan(rmsOf(mid) * 0.9);
  });

  it('bit-crush reduces resolution and down-samples', () => {
    const clean = Float32Array.from(harmonics(220, 0.1, SR, 0.5));
    const crushed = Float32Array.from(clean);
    bitCrush(crushed, 4, 1);
    const distinct = new Set(Array.from(crushed).map((v) => v.toFixed(6))).size;
    const original = new Set(Array.from(clean).map((v) => v.toFixed(6))).size;
    expect(distinct).toBeLessThan(original);
    expect(distinct).toBeLessThanOrEqual(16);

    const held = Float32Array.from(clean);
    bitCrush(held, 16, 16);
    let heldSamples = 0;
    for (let i = 1; i < held.length; i++) if (held[i] === held[i - 1]) heldSamples++;
    expect(heldSamples / held.length).toBeGreaterThan(0.85);
  });

  it('drive adds harmonics and keeps the level sane', () => {
    const clean = Float32Array.from(source(0.3, 500));
    const saturated = Float32Array.from(clean);
    drive(saturated, 0.8, 1);
    const cleanAnalysis = analyseSamples(clean, SR);
    const satAnalysis = analyseSamples(saturated, SR);
    expect(peakOf(saturated)).toBeLessThanOrEqual(1);
    // A saturated sine spreads energy above its fundamental.
    expect(satAnalysis.bands.high).toBeGreaterThan(cleanAnalysis.bands.high);
  });

  it('drive at zero is a no-op', () => {
    const clean = Float32Array.from(source(0.1, 500));
    const copy = Float32Array.from(clean);
    drive(copy, 0, 0.5);
    expect(copy).toEqual(clean);
  });

  it('tremolo modulates at its rate and leaves a 0-depth signal alone', () => {
    const flat = Float32Array.from(source(1, 440));
    const copy = Float32Array.from(flat);
    tremolo(copy, SR, 4, 0);
    expect(copy).toEqual(flat);

    const modulated = Float32Array.from(source(1, 440));
    tremolo(modulated, SR, 4, 0.9);
    expect(rmsOf(modulated)).toBeLessThan(rmsOf(flat) * 0.8);
    // gain(t) = 0.55 + 0.45·cos(2π·4·t), so the minimum (0.10) is a quarter
    // period in — at t = 0.125 s — and full level returns at t = 0.25 s.
    const trough = modulated.subarray(Math.round(0.115 * SR), Math.round(0.135 * SR));
    expect(peakOf(trough)).toBeLessThan(0.12);
    expect(peakOf(modulated.subarray(0, Math.round(0.02 * SR)))).toBeGreaterThan(0.4);
  });

  it('pitch shift moves the measured pitch and keeps the length', () => {
    const input = source(0.5, 440);
    const shifted = Float32Array.from(input);
    pitchShift(shifted, 1200);
    expect(shifted.length).toBe(input.length);
    // An upward shift is half as long; the rest is silence (not a DC plateau).
    // Measure the region that actually carries the shifted material.
    const valid = Math.floor(input.length / 2);
    const analysis = analyseSamples(shifted.subarray(0, valid), SR);
    expect(Math.abs(analysis.centroidHz - 880)).toBeLessThan(120);
    expect(shifted[shifted.length - 1]).toBe(0);
  });

  it('pitch shift at zero cents is a no-op', () => {
    const input = Float32Array.from(source(0.2, 440));
    const copy = Float32Array.from(input);
    pitchShift(copy, 0);
    expect(copy).toEqual(input);
  });

  it('pads a downward shift instead of leaving a gap', () => {
    const input = source(0.5, 880);
    const shifted = Float32Array.from(input);
    pitchShift(shifted, -1200);
    expect(shifted[shifted.length - 1]).not.toBe(0);
  });

  it('grain scatter only replays material that already happened', () => {
    const input = source(1, 200);
    const scattered = Float32Array.from(input);
    applyGrainScatter(scattered, SR, () => 0, { scatter: 1, sizeMs: 20 });
    const grain = Math.round(0.02 * SR);
    // Every sample in a scattered grain must come from somewhere earlier.
    let borrowed = 0;
    for (let i = grain; i < 2 * grain; i++) {
      if (scattered[i] === 0 || Math.abs(scattered[i]) <= Math.abs(input[i])) borrowed++;
    }
    expect(borrowed / grain).toBeGreaterThan(0.9);
    // The attack itself is never touched (scatter starts at the second grain).
    for (let i = 0; i < grain; i++) expect(scattered[i]).toBe(input[i]);
  });

  it('grain scatter at zero leaves the buffer alone', () => {
    const input = Float32Array.from(source(0.3, 300));
    const copy = Float32Array.from(input);
    applyGrainScatter(copy, SR, () => 0, { scatter: 0, sizeMs: 20 });
    expect(copy).toEqual(input);
  });
});
