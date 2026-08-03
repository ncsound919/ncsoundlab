/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for automation lane interpolation (Phase 2.3).
 */

import { describe, expect, it } from 'vitest';
import { interpolateAutomation, beatToAudioTime, makeEmptyLane } from './automation';
import type { AutomationPoint } from '../types';

describe('automation — interpolateAutomation', () => {
  const points: AutomationPoint[] = [
    { tick: 0, value: 0 },
    { tick: 4, value: 1 },
    { tick: 8, value: 0.5 },
  ];

  it('returns the default for an empty lane', () => {
    expect(interpolateAutomation([], 4, 0.42)).toBe(0.42);
  });

  it('returns the first value for ticks before the first point', () => {
    expect(interpolateAutomation(points, -2)).toBe(0);
  });

  it('returns the last value for ticks after the last point', () => {
    expect(interpolateAutomation(points, 100)).toBe(0.5);
  });

  it('returns the exact value at a point tick', () => {
    expect(interpolateAutomation(points, 4)).toBe(1);
  });

  it('linearly interpolates between two points', () => {
    expect(interpolateAutomation(points, 2)).toBeCloseTo(0.5, 5);
    expect(interpolateAutomation(points, 6)).toBeCloseTo(0.75, 5);
  });

  it('handles degenerate zero-span segments', () => {
    const same = [{ tick: 0, value: 1 }, { tick: 0, value: 9 }];
    expect(interpolateAutomation(same, 0)).toBe(9);
  });
});

describe('automation — beatToAudioTime', () => {
  const tempo = [
    { tick: 0, bpm: 120 },
    { tick: 8, bpm: 60 },
  ];

  it('falls back to 120 BPM when tempo map is empty', () => {
    // 4 16th-note beats at 120 BPM = 4 / 8 = 0.5s.
    expect(beatToAudioTime(4, [], 0)).toBeCloseTo(0.5, 5);
  });

  it('integrates a single tempo point at the song start', () => {
    expect(beatToAudioTime(4, [{ tick: 0, bpm: 120 }], 0)).toBeCloseTo(0.5, 5);
  });

  it('treats beat at the tempo boundary as still in the old segment', () => {
    // 8 16ths at 120 BPM = 1.0s (the new tempo kicks in after the boundary).
    expect(beatToAudioTime(8, tempo, 0)).toBeCloseTo(1.0, 5);
  });

  it('integrates across a tempo point boundary', () => {
    // 8 16ths at 120 BPM = 1.0s; +4 16ths at 60 BPM = 4 * (60/60)/4 = 1.0s; total 2.0s.
    expect(beatToAudioTime(12, tempo, 0)).toBeCloseTo(2.0, 5);
  });
});

describe('automation — makeEmptyLane', () => {
  it('creates an empty lane with sane defaults', () => {
    const lane = makeEmptyLane('vol-1', 'volume');
    expect(lane.id).toBe('vol-1');
    expect(lane.target).toBe('volume');
    expect(lane.points).toEqual([]);
    expect(lane.min).toBe(0);
    expect(lane.max).toBe(1);
  });

  it('accepts custom min/max', () => {
    const lane = makeEmptyLane('pan-1', 'pan', -1, 1);
    expect(lane.min).toBe(-1);
    expect(lane.max).toBe(1);
  });
});
