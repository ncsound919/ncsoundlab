import { describe, it, expect } from 'vitest';
import { createLiveRecorder, type LiveEvent } from './liveRecorder';
import { newEmptyPattern } from '../../store/patternStore';

describe('liveRecorder', () => {
  it('starts in stopped state', () => {
    const r = createLiveRecorder();
    expect(r.isActive()).toBe(false);
    r.dispose();
  });

  it('records a pad hit and merges into the pattern (overdub: existing on stays on)', () => {
    const r = createLiveRecorder();
    r.start(120, 1);
    const pattern = newEmptyPattern(['kick'], 120);
    const event: LiveEvent = { type: 'pad', layerId: 'kick', stepIdx: 0, timeSec: 0, velocity: 100 };
    r.recordEvent(event, pattern);
    r.stop();
    expect(pattern.layerRows.kick[0].on).toBe(true);
    expect(pattern.layerRows.kick[0].velocity).toBe(100);
    r.dispose();
  });

  it('overdub: a second hit on the same step overwrites the velocity (MPC-style)', () => {
    const r = createLiveRecorder();
    r.start(120, 1);
    const pattern = newEmptyPattern(['snare'], 120);
    r.recordEvent({ type: 'pad', layerId: 'snare', stepIdx: 4, timeSec: 0.083, velocity: 80 }, pattern);
    r.recordEvent({ type: 'pad', layerId: 'snare', stepIdx: 4, timeSec: 0.084, velocity: 127 }, pattern);
    r.stop();
    expect(pattern.layerRows.snare[4].velocity).toBe(127);
    r.dispose();
  });

  it('quantizes a hit to the grid based on timeCorrect', () => {
    const r = createLiveRecorder();
    r.start(120, 1); // 1/16 grid, secPer16 = 0.125
    const pattern = newEmptyPattern(['hat'], 120);
    // A hit slightly off the grid (30ms late) snaps to the nearest 16th.
    r.recordEvent({ type: 'pad', layerId: 'hat', stepIdx: -1, timeSec: 0.030, velocity: 100 }, pattern);
    r.stop();
    expect(pattern.layerRows.hat[0].on).toBe(true);
    r.dispose();
  });

  it('captures a piano note at the current step', () => {
    const r = createLiveRecorder();
    r.start(120, 1);
    const pattern = newEmptyPattern(['keys'], 120);
    r.recordEvent({ type: 'note', layerId: 'keys', stepIdx: 8, timeSec: 0.33, velocity: 90, note: 60 }, pattern);
    r.stop();
    expect(pattern.layerRows.keys[8].note).toBe(60);
    r.dispose();
  });
});
