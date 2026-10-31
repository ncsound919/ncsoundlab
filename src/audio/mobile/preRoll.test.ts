/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  PreRollBuffer,
  TakeAssembler,
  preserveTransient,
  transientLockSamples,
} from './preRoll';
import { tone } from '../../tests/mobileSignals';

const SR = 1000;

describe('PreRollBuffer', () => {
  it('rejects a nonsensical sample rate', () => {
    expect(() => new PreRollBuffer(0)).toThrow();
    expect(() => new PreRollBuffer(Number.NaN)).toThrow();
  });

  it('returns held audio oldest-first', () => {
    const pre = new PreRollBuffer(SR, { windowMs: 100 });
    pre.push(Float32Array.from([1, 2, 3, 4]));
    expect([...pre.snapshot()]).toEqual([1, 2, 3, 4]);
    expect(pre.size).toBe(4);
    pre.push(Float32Array.from([5, 6]));
    expect([...pre.snapshot()]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('keeps only the most recent window once it wraps', () => {
    const pre = new PreRollBuffer(SR, { windowMs: 5 }); // 5 samples
    pre.push(Float32Array.from([1, 2, 3]));
    pre.push(Float32Array.from([4, 5, 6, 7]));
    expect([...pre.snapshot()]).toEqual([3, 4, 5, 6, 7]);
    expect(pre.size).toBe(5);
  });

  it('handles a push larger than the window', () => {
    const pre = new PreRollBuffer(SR, { windowMs: 3 });
    pre.push(Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
    expect([...pre.snapshot()]).toEqual([6, 7, 8]);
  });

  it('clears on demand', () => {
    const pre = new PreRollBuffer(SR, { windowMs: 10 });
    pre.push(Float32Array.from([1, 2]));
    pre.clear();
    expect(pre.size).toBe(0);
    expect(pre.snapshot().length).toBe(0);
  });
});

describe('TakeAssembler', () => {
  it('puts the pre-roll in front of the streamed audio', () => {
    const pre = new PreRollBuffer(SR, { windowMs: 100 });
    pre.push(Float32Array.from([0, 0, 5, 6, 7, 8]));
    const assembler = new TakeAssembler(pre, SR);
    assembler.begin();
    assembler.append(Float32Array.from([9, 10]));
    const take = assembler.finish();
    expect(take.samples.length).toBe(8);
    expect(take.preRollFrames).toBe(6);
    expect([...take.samples.slice(2)]).toEqual([5, 6, 7, 8, 9, 10]);
    expect(take.durationSec).toBeCloseTo(8 / SR, 5);
    expect(take.truncated).toBe(false);
  });

  it('fades a lead-in that starts mid-waveform', () => {
    const pre = new PreRollBuffer(SR, { windowMs: 10 });
    // Phase-shifted so the first sample is not already zero.
    const held = tone(50, 0.01, SR, 0.8, Math.PI / 3);
    pre.push(held);
    const assembler = new TakeAssembler(pre, SR, { leadInFadeMs: 3 });
    assembler.begin();
    const take = assembler.finish();
    expect(Math.abs(held[0])).toBeGreaterThan(0.5);
    expect(take.samples[0]).toBe(0);
    expect(Math.abs(take.samples[2])).toBeLessThan(Math.abs(held[2]));
  });

  it('leaves a clean attack alone when the lead-in already starts at zero', () => {
    const pre = new PreRollBuffer(SR, { windowMs: 10 });
    // A transient that begins on a zero crossing: fading it in would erase the
    // first frames of the attack, which is the whole reason pre-roll exists.
    const held = Float32Array.from([0, 0.9, 0.9, 0.9]);
    pre.push(held);
    const assembler = new TakeAssembler(pre, SR, { leadInFadeMs: 3 });
    assembler.begin();
    expect([...assembler.finish().samples]).toEqual([...held]);
  });

  it('truncates past the take limit and says so', () => {
    const pre = new PreRollBuffer(SR, { windowMs: 10 });
    const assembler = new TakeAssembler(pre, SR, { maxSeconds: 0.005 }); // 5 frames
    assembler.begin();
    assembler.append(Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
    const take = assembler.finish();
    expect(take.samples.length).toBe(5);
    expect(take.truncated).toBe(true);
  });

  it('copies appended chunks so the caller can reuse its buffer', () => {
    const pre = new PreRollBuffer(SR, { windowMs: 10 });
    const assembler = new TakeAssembler(pre, SR);
    assembler.begin();
    const chunk = Float32Array.from([1, 2, 3]);
    assembler.append(chunk);
    chunk[0] = 99;
    expect(assembler.finish().samples[0]).toBe(1);
  });
});

describe('transient lock', () => {
  it('converts milliseconds to frames', () => {
    expect(transientLockSamples(48000, 15)).toBe(720);
    expect(transientLockSamples(48000, 0)).toBe(0);
  });

  it('keeps the original attack and the mutated tail', () => {
    const source = tone(200, 0.05, 1000, 0.5, Math.PI / 3);
    const mutated = Float32Array.from(source, (v) => v * -1);
    const out = preserveTransient(source, mutated, 10, 1000, 2);
    expect([...out.slice(0, 10)]).toEqual([...source.slice(0, 10)]);
    expect(out[out.length - 1]).toBeCloseTo(mutated[mutated.length - 1], 6);
    // The crossfade starts at the source value and hands over to the mutation.
    expect(out[10]).toBe(source[10]);
    expect(out[11]).not.toBe(source[11]);
    expect(out[11]).not.toBe(mutated[11]);
    expect(Math.abs(out[11])).toBeLessThan(Math.abs(source[11]));
  });

  it('handles a lock longer than the buffer', () => {
    const source = tone(100, 0.005, 1000, 0.4);
    const out = preserveTransient(source, Float32Array.from(source, (v) => v * 2), 500, 1000);
    expect([...out]).toEqual([...source]);
  });
});
