const secPerBeat = (bpm: number) => 60 / bpm;

/** Time in seconds to a 1/(timeCorrect*4) grid step. timeCorrect: 1=1/16, 2=1/8, 4=1/4. */
export function quantizeTime(timeSec: number, bpm: number, timeCorrect: 1 | 2 | 4): number {
  const grid = secPerBeat(bpm) / (4 / timeCorrect); // 1/16 grid by default
  return Math.round(timeSec / grid) * grid;
}

/** Step index (16th-note units) to seconds. */
export function stepIndexToSeconds(stepIdx: number, bpm: number): number {
  return (secPerBeat(bpm) / 4) * stepIdx;
}

/** Seconds back to step index, snapped to nearest. */
export function secondsToStepIndex(timeSec: number, bpm: number): number {
  const grid = secPerBeat(bpm) / 4;
  return Math.round(timeSec / grid);
}
