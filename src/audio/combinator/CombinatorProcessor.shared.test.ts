/** @license SPDX-License-Identifier: Apache-2.0 */
import { describe, expect, it, vi } from 'vitest';
import { CombinatorProcessor } from './CombinatorProcessor';
import { Sequencer } from './Sequencer';
import { MultibandSplitter } from './Multiband';
import type { CombinatorState, CombinatorSlot } from '../../types';

const SR = 48000;

function slot(overrides: Partial<CombinatorSlot> = {}): CombinatorSlot {
  return {
    id: 's1',
    moduleId: 'TRIM',
    enabled: true,
    mix: 1,
    preGainDb: 0,
    postGainDb: 0,
    polarity: false,
    bands: { low: true, mid: true, high: true },
    crossovers: [200, 2000],
    params: { gainDb: 12 },
    motion: 'macro',
    motionParams: { depth: 0, macro: 0.5 },
    locked: false,
    ...overrides,
  };
}

function state(slots: CombinatorSlot[], extra: Partial<CombinatorState> = {}): CombinatorState {
  return {
    slots,
    routes: [],
    masterMix: 1,
    bpm: 120,
    tightMode: true,
    xyAssign: { x: '', y: '' },
    morphAmount: 0,
    ...extra,
  };
}

/** Counts rising crossings of the mid-point of a modulated buffer. */
function risingCrossings(data: Float32Array): number {
  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mid = (min + max) / 2;
  let crossings = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i - 1] <= mid && data[i] > mid) crossings++;
  }
  return crossings;
}

describe('CombinatorProcessor timing (control rate must be frame-accurate)', () => {
  it('runs an LFO at its requested rate, not once-per-block speed', () => {
    const p = new CombinatorProcessor(SR, 120);
    p.setCombinator(
      state([
        slot({
          motion: 'lfo',
          motionParams: { depth: 1, rateHz: 6, shape: 'sine', target: 'gainDb' } as any,
          params: { gainDb: 12 },
          // gainDb is the motion target, so the module's gain sweeps.
        }),
      ]),
    );
    const frames = SR * 2;
    const out = new Float32Array(2);
    const buffer = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      p.processSampleInto(1, 1, out);
      buffer[i] = out[0];
    }
    // 6 Hz over two seconds: twelve sweeps. The old per-block advance ran the
    // LFO 32x slow and produced none.
    expect(risingCrossings(buffer)).toBeGreaterThanOrEqual(11);
    expect(risingCrossings(buffer)).toBeLessThanOrEqual(13);
  });

  it('advances the sequencer by elapsed frames, not by call count', () => {
    const seq = new Sequencer();
    seq.setSteps([1, 0]);
    seq.setTempo(120, 4, SR); // 6000 samples per step
    seq.setGlide(0);
    // 200 control blocks x 32 frames = 6400 frames: one step has elapsed.
    for (let i = 0; i < 200; i++) seq.tick(32);
    expect(seq.currentIndex()).toBe(1);
    // The default of one frame per call still models a per-sample caller.
    const perSample = new Sequencer();
    perSample.setSteps([1, 0]);
    perSample.setTempo(120, 4, SR);
    for (let i = 0; i < 5999; i++) perSample.tick();
    expect(perSample.currentIndex()).toBe(0);
    perSample.tick();
    expect(perSample.currentIndex()).toBe(1);
  });

  it('treats a centred macro as neutral', () => {
    const neutral = new CombinatorProcessor(SR, 120);
    neutral.setCombinator(
      state([slot({ motion: 'macro', motionParams: { depth: 1, macro: 0.5 }, params: { gainDb: 12 } })]),
    );
    const depth0 = new CombinatorProcessor(SR, 120);
    depth0.setCombinator(
      state([slot({ motion: 'macro', motionParams: { depth: 0, macro: 0.5 }, params: { gainDb: 12 } })]),
    );
    const a = new Float32Array(2);
    const b = new Float32Array(2);
    neutral.processSampleInto(0.5, 0.5, a);
    depth0.processSampleInto(0.5, 0.5, b);
    // factor (0.5 + 0.5) = 1 → gainDb 12 → x3.981, identical to no motion.
    expect(a[0]).toBeCloseTo(0.5 * Math.pow(10, 12 / 20), 3);
    expect(a[0]).toBeCloseTo(b[0], 6);
  });
});

describe('CombinatorProcessor shared-catalog behaviour', () => {
  it('pushes preset vocabulary through the shared catalog', () => {
    const p = new CombinatorProcessor(SR, 120);
    p.setCombinator(
      state([
        slot({
          moduleId: 'FILTER',
          params: { cutoff: 900, resonance: 8 },
          motion: 'macro',
          motionParams: { depth: 0, macro: 0.5 },
        }),
      ]),
    );
    const rt = (p as any).runtimes[0];
    const chain = rt.processors[0].slots;
    expect(chain[0].kind).toBe('FILTER');
    expect(chain[0].params.lpHz).toBe(900);
    expect(chain[0].params.hpHz).toBe(0);
  });

  it('keeps a slot\'s DSP state when only a parameter moves', () => {
    const p = new CombinatorProcessor(SR, 120);
    p.setCombinator(state([slot({ params: { gainDb: 6 } })]));
    const before = (p as any).runtimes[0].processors[0];
    p.setCombinator(state([slot({ params: { gainDb: 9 } })]));
    const after = (p as any).runtimes[0].processors[0];
    expect(after).toBe(before);
    // A module/band/motion change is what forces a rebuild.
    p.setCombinator(state([slot({ params: { gainDb: 9 }, moduleId: 'SATURATION' })]));
    expect((p as any).runtimes[0].processors[0]).not.toBe(before);
  });

  it('skips unknown modules instead of inserting a dead slot', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = new CombinatorProcessor(SR, 120);
    p.setCombinator(state([slot({ moduleId: 'MODULE_FROM_THE_FUTURE' })]));
    expect(p.isEmpty).toBe(true);
    p.setCombinator(state([slot()]));
    expect(p.isEmpty).toBe(false);
    warn.mockRestore();
  });

  it('honours a soloed band and the slot mix in multiband mode', () => {
    const p = new CombinatorProcessor(SR, 120);
    p.setCombinator(
      state([
        slot({
          moduleId: 'FILTER',
          bands: { low: true, mid: false, high: true },
          mix: 0, // dry
          params: { cutoff: 400 },
        }),
      ]),
    );
    const out = new Float32Array(2);
    p.processSampleInto(0.4, -0.4, out);
    // mix 0 must be fully dry even when the slot is split across bands.
    expect(out[0]).toBeCloseTo(0.4, 6);
    expect(out[1]).toBeCloseTo(-0.4, 6);
  });

  it('applies XY assignments only when the pad leaves centre', () => {
    const plain = new CombinatorProcessor(SR, 120);
    plain.setCombinator(state([slot({ params: { gainDb: 12 } })]));
    const centred = new CombinatorProcessor(SR, 120);
    centred.setCombinator(
      state([slot({ params: { gainDb: 12 } })], { xyAssign: { x: 's1.gainDb', y: '' } }),
    );
    const pushed = new CombinatorProcessor(SR, 120);
    pushed.setCombinator(
      state([slot({ params: { gainDb: 12 } })], {
        xyAssign: { x: 's1.gainDb', y: '' },
        xyPos: { x: 1, y: 0.5 },
      }),
    );
    const a = new Float32Array(2);
    const b = new Float32Array(2);
    const c = new Float32Array(2);
    plain.processSampleInto(0.25, 0.25, a);
    centred.processSampleInto(0.25, 0.25, b);
    pushed.processSampleInto(0.25, 0.25, c);
    expect(b[0]).toBeCloseTo(a[0], 6); // a centred pad is a no-op
    expect(c[0]).toBeGreaterThan(b[0] * 1.2); // x=1 lifts the gain by 25 %
  });

  it('rebuilds runtimes at the new rate when the sample rate changes', () => {
    const p = new CombinatorProcessor(SR, 120);
    p.setCombinator(state([slot()]));
    const before = (p as any).runtimes[0].processors[0];
    p.setSampleRate(44100);
    expect((p as any).sampleRate).toBe(44100);
    expect((p as any).runtimes[0].processors[0]).not.toBe(before);
    const out = new Float32Array(2);
    p.processSampleInto(0.5, 0.5, out);
    expect(Number.isFinite(out[0])).toBe(true);
  });
});

describe('MultibandSplitter', () => {
  it('reconstructs the input from its three bands', () => {
    const m = new MultibandSplitter(SR, 200, 2000);
    for (let i = 0; i < 2048; i++) {
      const x = Math.sin((i * 2 * Math.PI * 440) / SR) * 0.7 + Math.sin((i * 2 * Math.PI * 3000) / SR) * 0.2;
      const bands = m.process(x, x * 0.5);
      const sum = bands.low[0] + bands.mid[0] + bands.high[0];
      expect(sum).toBeCloseTo(x, 5);
      const sumR = bands.low[1] + bands.mid[1] + bands.high[1];
      expect(sumR).toBeCloseTo(x * 0.5, 5);
    }
  });

  it('keeps the channels independent', () => {
    const m = new MultibandSplitter(SR, 200, 2000);
    // Feed only the left channel; a shared filter state would smear it right.
    for (let i = 0; i < 512; i++) m.process(1, 0);
    const bands = m.process(1, 0);
    expect(Math.abs(bands.low[1])).toBeLessThan(1e-6);
    expect(Math.abs(bands.high[1])).toBeLessThan(1e-6);
    expect(bands.low[0]).toBeGreaterThan(0.1);
  });

  it('settles to a flat split around the crossover', () => {
    const m = new MultibandSplitter(SR, 1000, 1000);
    let low = 0;
    let high = 0;
    for (let i = 0; i < SR / 2; i++) {
      const bands = m.process(1, 1);
      low = bands.low[0];
      high = bands.high[0];
    }
    // At the crossover each LR4 leg sits at -6 dB, so low + high ≈ 1.
    expect(low + high).toBeCloseTo(1, 1);
  });
});
