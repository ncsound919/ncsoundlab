/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the look-ahead note-repeat scheduler. The clock and timer are
 * injected, so no AudioContext or real timer is needed.
 */

import { describe, expect, it } from 'vitest';
import {
  noteRepeatIntervalSec,
  noteRepeatOffsetSec,
  noteRepeatTimes,
  createNoteRepeatScheduler,
} from './noteRepeat';

describe('noteRepeat timing math', () => {
  it('computes the interval for a bpm and division', () => {
    expect(noteRepeatIntervalSec(120, 4)).toBeCloseTo(0.125, 6); // 1/16 at 120
    expect(noteRepeatIntervalSec(120, 2)).toBeCloseTo(0.25, 6); // 1/8
    expect(noteRepeatIntervalSec(60, 4)).toBeCloseTo(0.25, 6);
  });

  it('applies swing to odd repeats only', () => {
    const interval = 0.25;
    expect(noteRepeatOffsetSec(0, interval, 60)).toBeCloseTo(0, 6);
    expect(noteRepeatOffsetSec(1, interval, 60)).toBeCloseTo(0.25 + 0.15, 6);
    expect(noteRepeatOffsetSec(2, interval, 60)).toBeCloseTo(0.5, 6);
  });

  it('generates absolute times from the start time', () => {
    const times = noteRepeatTimes({
      bpm: 120,
      divisionsPerQuarter: 4,
      swingPercent: 0,
      startTime: 10,
      count: 3,
    });
    expect(times).toHaveLength(3);
    expect(times[0]).toBeCloseTo(10, 6);
    expect(times[1]).toBeCloseTo(10.125, 6);
    expect(times[2]).toBeCloseTo(10.25, 6);
  });
});

describe('createNoteRepeatScheduler', () => {
  it('schedules repeats one interval apart on the audio clock', () => {
    let clock = 5;
    const timers: Array<() => void> = [];
    const hits: Array<{ when: number; velocity: number }> = [];
    let id = 0;
    const scheduler = createNoteRepeatScheduler({
      bpm: 120,
      divisionsPerQuarter: 4,
      velocity: 0.75,
      getAudioTime: () => clock,
      onTrigger: (when, velocity) => hits.push({ when, velocity }),
      lookaheadSec: 0.5,
      tickMs: 10,
      setTimer: (cb) => {
        timers.push(cb);
        return id++;
      },
      clearTimer: () => {
        /* no-op */
      },
    });
    scheduler.start();
    // First pump at clock=5 with a 0.5s look-ahead schedules 5.125..5.5.
    expect(hits).toHaveLength(4);
    expect(hits[0].when).toBeCloseTo(5.125, 6);
    expect(hits[0].velocity).toBe(0.75);

    // Advance the clock and run the look-ahead tick: horizon 5.8.
    clock = 5.3;
    timers[timers.length - 1]();
    expect(hits.map((h) => h.when)).toEqual([5.125, 5.25, 5.375, 5.5, 5.625, 5.75]);
  });

  it('skips repeats the audio clock has already passed and stops cleanly', () => {
    let clock = 0;
    let cleared = 0;
    const hits: number[] = [];
    let pump: (() => void) | null = null;
    const scheduler = createNoteRepeatScheduler({
      bpm: 120,
      divisionsPerQuarter: 4,
      velocity: 1,
      getAudioTime: () => clock,
      onTrigger: (when) => hits.push(when),
      lookaheadSec: 0.2,
      tickMs: 10,
      setTimer: (cb) => { pump = cb; return 1; },
      clearTimer: () => { cleared++; },
    });
    scheduler.start();
    expect(hits).toHaveLength(1);
    expect(hits[0]).toBeCloseTo(0.125, 6);

    // Clock jumps well ahead: the look-ahead must not fire a burst of hits
    // whose times are already in the past.
    const before = hits.length;
    clock = 1.0;
    pump!();
    expect(hits.slice(before).every((t) => t >= 1.0 - 0.001)).toBe(true);
    expect(hits.slice(before).length).toBeGreaterThan(0);

    scheduler.stop();
    expect(cleared).toBe(1);
  });
});
