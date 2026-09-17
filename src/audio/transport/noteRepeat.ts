/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sample-accurate note-repeat scheduling (MPC-style hold-to-retrigger).
 *
 * Trigger times are computed on the audio clock. A look-ahead timer only
 * decides *when to schedule* the next hit; each hit is handed to the audio
 * engine with an explicit `when` so it lands on the musical grid instead of on
 * a jittery JS interval. The clock and timer are injectable so the scheduler is
 * unit-testable without an AudioContext.
 */

export interface NoteRepeatTimingOptions {
  bpm: number;
  /** Divisions per quarter note (1/4 = 1, 1/8 = 2, 1/16 = 4, 1/32 = 8). */
  divisionsPerQuarter: number;
  /** MPC swing 0..75 applied to odd repeats. */
  swingPercent?: number;
  /** Audio-clock time the first repeat lands on. */
  startTime: number;
  /** Number of hits to generate. */
  count: number;
}

/** Seconds between repeats for a BPM and a per-quarter-note division. */
export function noteRepeatIntervalSec(bpm: number, divisionsPerQuarter: number): number {
  const safeBpm = Math.max(1, bpm);
  const safeDiv = Math.max(1, divisionsPerQuarter);
  return 60 / safeBpm / safeDiv;
}

/** Audio-clock offset (from the first hit) of repeat `index`. */
export function noteRepeatOffsetSec(index: number, intervalSec: number, swingPercent = 0): number {
  const swing = index % 2 === 1 ? (Math.max(0, swingPercent) / 100) * intervalSec : 0;
  return index * intervalSec + swing;
}

/** Absolute audio-clock times for `count` repeats starting at `startTime`. */
export function noteRepeatTimes(opts: NoteRepeatTimingOptions): number[] {
  const interval = noteRepeatIntervalSec(opts.bpm, opts.divisionsPerQuarter);
  return Array.from({ length: Math.max(0, opts.count) }, (_, i) =>
    opts.startTime + noteRepeatOffsetSec(i, interval, opts.swingPercent)
  );
}

export interface NoteRepeatSchedulerOptions {
  bpm: number;
  divisionsPerQuarter: number;
  swingPercent?: number;
  velocity: number;
  /** Current audio-clock time in seconds. */
  getAudioTime: () => number;
  /** Called for each hit with the audio-clock time to schedule it at. */
  onTrigger: (when: number, velocity: number) => void;
  /** How far ahead (seconds) hits are scheduled. Default 0.15. */
  lookaheadSec?: number;
  /** Look-ahead timer period in ms. Default 25. */
  tickMs?: number;
  /** Injectable timer for tests. Defaults to `window.setInterval`. */
  setTimer?: (cb: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
}

export interface NoteRepeatScheduler {
  start(): void;
  stop(): void;
  /** Number of hits scheduled so far (observable for tests). */
  readonly scheduled: number;
}

/**
 * Look-ahead note-repeat scheduler. The first repeat lands one interval after
 * `start()` (the initial pad press is the first hit), then every interval —
 * with odd repeats swung by `swingPercent`.
 */
export function createNoteRepeatScheduler(opts: NoteRepeatSchedulerOptions): NoteRepeatScheduler {
  const lookahead = opts.lookaheadSec ?? 0.15;
  const tickMs = opts.tickMs ?? 25;
  const setTimer = opts.setTimer ?? ((cb: () => void, ms: number) => window.setInterval(cb, ms));
  const clearTimer = opts.clearTimer ?? ((id: number) => window.clearInterval(id));
  const interval = noteRepeatIntervalSec(opts.bpm, opts.divisionsPerQuarter);
  let timer: number | null = null;
  let startTime = 0;
  let nextIndex = 0;
  let running = false;

  const pump = (): void => {
    if (!running) return;
    const now = opts.getAudioTime();
    const horizon = now + lookahead;
    for (;;) {
      const when = startTime + noteRepeatOffsetSec(nextIndex, interval, opts.swingPercent);
      if (when > horizon) break;
      // Skip repeats the clock has already passed rather than firing a burst of
      // past-dated hits (e.g. after a tab was backgrounded and the clock jumps).
      if (when >= now - 0.001) opts.onTrigger(when, opts.velocity);
      nextIndex += 1;
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      // The pad press itself is hit 0, so repeats begin one interval later.
      startTime = opts.getAudioTime() + interval;
      nextIndex = 0;
      pump();
      timer = setTimer(pump, tickMs);
    },
    stop() {
      running = false;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    },
    get scheduled() {
      return nextIndex;
    },
  };
}
