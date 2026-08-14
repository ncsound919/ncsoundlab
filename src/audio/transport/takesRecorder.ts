/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 5.4 — loop recording with multiple takes + punch-in/out.
 *
 * Model for the takes browser: a recording pass can run for N loop cycles,
 * accumulating one AudioBuffer (take) per cycle. Punch-in/out lets the user
 * define a region [inSec, outSec] and only audio that lands inside the region
 * is committed to the take (the rest is retained as silence so the take stays
 * aligned to the loop length).
 *
 * The heavy lifting (MediaRecorder) lives in `audioCapture.ts`; this module is
 * the pure orchestration layer (take list, region math, cycle state) so it is
 * fully unit-testable without a mic.
 */

export interface Take {
  id: string;
  /** ISO timestamp when the take was captured. */
  recordedAt: string;
  /** The recorded AudioBuffer (or null for an empty/void take). */
  buffer: AudioBuffer | null;
  /** Loop index within the recording session (0-based). */
  cycle: number;
  /** Duration in seconds the take is aligned to (the loop length). */
  loopLengthSec: number;
  /** Whether the user has marked this take as the keeper. */
  keep: boolean;
}

export interface PunchRegion {
  /** Region start in seconds (0 = start of loop). */
  inSec: number;
  /** Region end in seconds (0 = end of loop / full length). */
  outSec: number;
  /** Region enabled? */
  enabled: boolean;
}

export interface LoopRecordOptions {
  /** Number of loops to record for (1..N). */
  loops: number;
  /** Loop length in seconds. */
  loopLengthSec: number;
  /** Optional punch-in/out region. */
  punch?: PunchRegion;
  /** ID prefix (default 'take'). */
  idPrefix?: string;
}

export interface LoopRecordPlan {
  /** Total number of passes. */
  loops: number;
  /** Seconds per loop. */
  loopLengthSec: number;
  /** Precomputed punch region in seconds. */
  punch: { inSec: number; outSec: number; enabled: boolean };
  /** For each loop index, the seconds offset of its start. */
  loopStartsSec: number[];
}

/**
 * Duration of one sequencer pattern loop in seconds. A pattern is `stepLength`
 * 16th-notes, i.e. `stepLength / 4` beats (16 steps = 4 beats = 1 bar at 4/4).
 * This is the loop length loop-recording takes must align to — the old inline
 * call-site computed `stepLength` *beats*, which made every take 4x the
 * pattern loop for a 16-step pattern.
 */
export function patternLoopLengthSec(stepLength: number, bpm: number): number {
  return (stepLength * (60 / bpm)) / 4;
}

/**
 * Build a recording plan for `loops` passes. Punch-in/out defaults to the full
 * loop when disabled.
 */
export function planLoopRecording(opts: LoopRecordOptions): LoopRecordPlan {
  const loops = Math.max(1, Math.floor(opts.loops));
  const loopLengthSec = Math.max(0.05, opts.loopLengthSec);
  const punchIn = opts.punch?.enabled ? Math.max(0, opts.punch.inSec ?? 0) : 0;
  const punchOut = opts.punch?.enabled && (opts.punch.outSec ?? 0) > 0
    ? Math.min(loopLengthSec, opts.punch.outSec!)
    : loopLengthSec;
  const starts: number[] = [];
  for (let i = 0; i < loops; i++) starts.push(i * loopLengthSec);
  return {
    loops,
    loopLengthSec,
    punch: { inSec: punchIn, outSec: punchOut, enabled: opts.punch?.enabled ?? false },
    loopStartsSec: starts,
  };
}

/**
 * Whether a given transport position (seconds into the session) is inside the
 * punch region for its cycle. When punch is disabled this is always true.
 */
export function isInsidePunch(plan: LoopRecordPlan, positionSec: number): boolean {
  if (!plan.punch.enabled) return true;
  const inLoop = positionSec % plan.loopLengthSec;
  return inLoop >= plan.punch.inSec && inLoop <= plan.punch.outSec;
}

/**
 * Which loop cycle a session position falls into (0-based).
 */
export function cycleAt(plan: LoopRecordPlan, positionSec: number): number {
  const idx = Math.floor(positionSec / plan.loopLengthSec);
  return Math.max(0, Math.min(plan.loops - 1, idx));
}

export interface TakeCommit {
  id: string;
  take: Take;
}

/**
 * Commit a recorded buffer as a take for the given cycle. If a punch region is
 * enabled, the region outside [in,out] is muted so the take stays aligned.
 */
export function commitTake(
  plan: LoopRecordPlan,
  cycle: number,
  buffer: AudioBuffer,
  idPrefix = 'take'
): TakeCommit {
  const id = `${idPrefix}-${Date.now()}-${cycle}`;
  let out = buffer;
  if (plan.punch.enabled) {
    out = muteOutsidePunch(buffer, plan.punch.inSec, plan.punch.outSec, plan.loopLengthSec);
  }
  return {
    id,
    take: {
      id,
      recordedAt: new Date().toISOString(),
      buffer: out,
      cycle,
      loopLengthSec: plan.loopLengthSec,
      keep: false,
    },
  };
}

/**
 * Mute every sample outside the punch region (per loop length). Pure — copies
 * the input into a new buffer-shaped object (browser `AudioBuffer`).
 */
export function muteOutsidePunch(
  buffer: AudioBuffer,
  inSec: number,
  outSec: number,
  loopLengthSec: number
): AudioBuffer {
  const sr = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const out = new AudioBuffer({ numberOfChannels: channels, length: buffer.length, sampleRate: sr });
  const inIdx = Math.max(0, Math.floor(inSec * sr));
  const outIdx = Math.max(inIdx, Math.min(buffer.length, Math.floor(outSec * sr)));
  for (let c = 0; c < channels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    dst.set(src); // copy whole
    for (let i = 0; i < inIdx; i++) dst[i] = 0;
    for (let i = outIdx; i < buffer.length; i++) dst[i] = 0;
  }
  void loopLengthSec;
  return out;
}

/**
 * Keeps a take as the "keeper" and un-keeps the others.
 */
export function selectKeeper(takes: Take[], takeId: string): Take[] {
  return takes.map((t) => ({ ...t, keep: t.id === takeId }));
}

/**
 * Re-order takes so the keeper is first (a convenience for playback/export).
 */
export function sortTakesKeeperFirst(takes: Take[]): Take[] {
  return [...takes].sort((a, b) => (b.keep ? 1 : 0) - (a.keep ? 1 : 0));
}
