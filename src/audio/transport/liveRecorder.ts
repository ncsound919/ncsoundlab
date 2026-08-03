import type { Pattern, PatternCell } from '../../types';
import { quantizeTime, secondsToStepIndex } from './quantize';

export type LiveEvent =
  | { type: 'pad'; layerId: string; stepIdx: number; timeSec: number; velocity: number }
  | { type: 'note'; layerId: string; stepIdx: number; timeSec: number; velocity: number; note: number };

export interface LiveRecorder {
  start(bpm: number, timeCorrect: 1 | 2 | 4): void;
  recordEvent(event: LiveEvent, pattern: Pattern): void;
  stop(): void;
  isActive(): boolean;
  setStepLength(len: 16 | 32): void;
  dispose(): void;
}

export function createLiveRecorder(): LiveRecorder {
  let active = false;
  let bpm = 120;
  let timeCorrect: 1 | 2 | 4 = 1;
  let stepLength: 16 | 32 = 16;

  function resolveStep(eventTimeSec: number, explicitStepIdx: number): number {
    if (explicitStepIdx >= 0) return explicitStepIdx;
    const quantized = quantizeTime(eventTimeSec, bpm, timeCorrect);
    return Math.max(0, Math.min(stepLength - 1, secondsToStepIndex(quantized, bpm)));
  }

  return {
    start(_bpm: number, _timeCorrect: 1 | 2 | 4) {
      bpm = _bpm;
      timeCorrect = _timeCorrect;
      active = true;
    },
    recordEvent(event: LiveEvent, pattern: Pattern) {
      if (!active) return;
      const step = resolveStep(event.timeSec, event.stepIdx);
      const row = pattern.layerRows[event.layerId] ?? Array.from({ length: stepLength }, () => ({ on: false }));
      const next: PatternCell = row[step] ? { ...row[step] } : { on: false };
      next.on = true;
      next.velocity = event.velocity;
      if (event.type === 'note') next.note = event.note;
      const newRow = row.slice();
      newRow[step] = next;
      pattern.layerRows[event.layerId] = newRow;
    },
    stop() { active = false; },
    isActive() { return active; },
    setStepLength(len: 16 | 32) { stepLength = len; },
    dispose() { active = false; },
  };
}
