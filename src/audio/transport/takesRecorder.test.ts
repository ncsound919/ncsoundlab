/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/audio/transport/takesRecorder.ts` (Phase 5.4).
 */

import { describe, expect, it, beforeAll } from 'vitest';
import {
  planLoopRecording,
  isInsidePunch,
  cycleAt,
  commitTake,
  muteOutsidePunch,
  selectKeeper,
  sortTakesKeeperFirst,
  type Take,
} from './takesRecorder';

class MockAudioBuffer {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  private data: Float32Array[];
  constructor(opts: { length: number; sampleRate: number; numberOfChannels: number }) {
    this.length = opts.length;
    this.sampleRate = opts.sampleRate;
    this.numberOfChannels = opts.numberOfChannels;
    this.data = Array.from({ length: opts.numberOfChannels }, () => new Float32Array(opts.length));
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(ch: number): Float32Array {
    return this.data[ch];
  }
  copyToChannel(src: Float32Array, ch: number): void {
    this.data[ch].set(src);
  }
}

beforeAll(() => {
  (globalThis as any).AudioBuffer = MockAudioBuffer;
});

const makeBuffer = (length: number, sampleRate = 1000, channels = 1): AudioBuffer => {
  const b = new AudioBuffer({ length, sampleRate, numberOfChannels: channels });
  for (let c = 0; c < channels; c++) b.getChannelData(c).fill(0.5);
  return b;
};

describe('planLoopRecording', () => {
  it('clamps loops to >= 1 and computes starts', () => {
    const plan = planLoopRecording({ loops: 3, loopLengthSec: 4 });
    expect(plan.loops).toBe(3);
    expect(plan.loopStartsSec).toEqual([0, 4, 8]);
    expect(plan.punch.enabled).toBe(false);
  });

  it('normalises an enabled punch region to within the loop', () => {
    const plan = planLoopRecording({ loops: 2, loopLengthSec: 4, punch: { inSec: 1, outSec: 99, enabled: true } });
    expect(plan.punch.enabled).toBe(true);
    expect(plan.punch.inSec).toBe(1);
    expect(plan.punch.outSec).toBe(4);
  });
});

describe('isInsidePunch / cycleAt', () => {
  it('is always inside when punch is disabled', () => {
    const plan = planLoopRecording({ loops: 2, loopLengthSec: 4 });
    for (let t = 0; t < 8; t += 0.5) expect(isInsidePunch(plan, t)).toBe(true);
  });

  it('respects the punch region per cycle', () => {
    const plan = planLoopRecording({ loops: 2, loopLengthSec: 4, punch: { inSec: 1, outSec: 3, enabled: true } });
    expect(isInsidePunch(plan, 0.5)).toBe(false);
    expect(isInsidePunch(plan, 2)).toBe(true);
    expect(isInsidePunch(plan, 3.5)).toBe(false);
    expect(isInsidePunch(plan, 4 + 2)).toBe(true); // second cycle
  });

  it('maps session time to the correct cycle', () => {
    const plan = planLoopRecording({ loops: 3, loopLengthSec: 4 });
    expect(cycleAt(plan, 0)).toBe(0);
    expect(cycleAt(plan, 4)).toBe(1);
    expect(cycleAt(plan, 9)).toBe(2);
    expect(cycleAt(plan, 100)).toBe(2); // clamped to last cycle
  });
});

describe('commitTake / muteOutsidePunch', () => {
  it('returns the take unchanged when punch is disabled', () => {
    const plan = planLoopRecording({ loops: 1, loopLengthSec: 1 });
    const buf = makeBuffer(1000);
    const { take } = commitTake(plan, 0, buf);
    expect(take.buffer).toBe(buf);
    expect(take.cycle).toBe(0);
  });

  it('mutes outside the punch region', () => {
    const plan = planLoopRecording({ loops: 1, loopLengthSec: 1, punch: { inSec: 0.25, outSec: 0.75, enabled: true } });
    const buf = makeBuffer(1000); // all 0.5
    const { take } = commitTake(plan, 0, buf);
    const d = take.buffer!.getChannelData(0);
    expect(d[0]).toBe(0);
    expect(d[500]).toBeCloseTo(0.5, 5);
    expect(d[999]).toBe(0);
  });
});

describe('selectKeeper / sortTakesKeeperFirst', () => {
  const mk = (id: string): Take => ({
    id,
    recordedAt: 'x',
    buffer: null,
    cycle: 0,
    loopLengthSec: 1,
    keep: false,
  });

  it('selectKeeper marks exactly one take', () => {
    const takes = selectKeeper([mk('a'), mk('b'), mk('c')], 'b');
    expect(takes.filter((t) => t.keep).map((t) => t.id)).toEqual(['b']);
  });

  it('sortTakesKeeperFirst moves the keeper to index 0', () => {
    const sorted = sortTakesKeeperFirst([mk('a'), mk('b'), mk('c')].map((t) => (t.id === 'c' ? { ...t, keep: true } : t)));
    expect(sorted[0].id).toBe('c');
  });
});
