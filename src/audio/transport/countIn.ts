export const COUNT_IN_BEATS = 4;

export interface CountInBeat {
  index: number;
  timeSec: number;
  isAccent: boolean;
}

export function buildCountInBeats(beats: number, bpm: number): CountInBeat[] {
  const secPerBeat = 60 / bpm;
  const out: CountInBeat[] = [];
  for (let i = 0; i < beats; i++) {
    out.push({ index: i, timeSec: i * secPerBeat, isAccent: i === 0 });
  }
  return out;
}

/**
 * Whether a transport position (in seconds since start) is still inside the
 * count-in window. Once the window ends, the count-in is "done" and the
 * record/playback continues without further lead-in.
 */
export function isCountInActive(positionSec: number, bpm: number, beats = COUNT_IN_BEATS): boolean {
  const secPerBeat = 60 / bpm;
  return positionSec < beats * secPerBeat;
}
