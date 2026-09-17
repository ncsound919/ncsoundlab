import { describe, it, expect } from 'vitest';
import {
  calculatePatternDurationSec,
  calculateSongDurationSec,
  planMixdown,
  renderMixdown,
  renderArrangement,
  renderLayerStem,
} from './mixdown';
import { newEmptyPattern } from '../../store/patternStore';
import { DEFAULT_ENVELOPE, DEFAULT_FX, DEFAULT_SYNTH, type SoundLayer } from '../../types';

describe('calculatePatternDurationSec', () => {
  it('returns seconds for 16 steps at 120 BPM 4/4', () => {
    expect(calculatePatternDurationSec(16, 120, [4, 4])).toBeCloseTo(2.0, 5);
  });

  it('returns seconds for 32 steps at 120 BPM 4/4', () => {
    expect(calculatePatternDurationSec(32, 120, [4, 4])).toBeCloseTo(4.0, 5);
  });

  it('returns seconds for 16 steps at 90 BPM 3/4', () => {
    expect(calculatePatternDurationSec(16, 90, [3, 4])).toBeCloseTo((16 * 60 / 90) / 4, 5);
  });
});

describe('calculateSongDurationSec', () => {
  it('sums pattern durations across the chain', () => {
    const p = newEmptyPattern(['l1'], 120);
    const patterns = { A: p, B: { ...p, bpm: 120 }, C: p, D: p };
    expect(calculateSongDurationSec(patterns, { order: ['A', 'A'] })).toBeCloseTo(4.0, 5);
  });
});

describe('planMixdown', () => {
  it('schedules only on cells at their 16th-note times', () => {
    const p = newEmptyPattern(['l1'], 120);
    p.layerRows.l1[0] = { on: true };
    p.layerRows.l1[1] = { on: true };
    const plan = planMixdown({ patterns: { A: p }, chain: { order: ['A'] } });
    expect(plan.durationSec).toBeCloseTo(2.0, 5);
    expect(plan.cellTimings).toHaveLength(2);
    expect(plan.cellTimings[0].timeSec).toBeCloseTo(0, 5);
    expect(plan.cellTimings[1].timeSec).toBeCloseTo(0.125, 5);
  });
});

describe('renderMixdown', () => {
  it('returns an AudioBuffer of the correct duration for a 16-step pattern at 120 BPM', async () => {
    const p = newEmptyPattern(['l1'], 120);
    p.layerRows.l1[0] = { on: true };
    const buf = await renderMixdown({
      patterns: { A: p, B: p, C: p, D: p },
      chain: { order: ['A'] },
    });
    expect(buf).toBeTruthy();
    expect(buf.duration).toBeCloseTo(2.0, 1);
  }, 15000);
});

const synthLayer = (id = 'l1'): SoundLayer => ({
  id,
  name: 'Synth',
  type: 'synth',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: { ...DEFAULT_ENVELOPE },
  fx: { ...DEFAULT_FX },
  synth: { ...DEFAULT_SYNTH, frequency: 220 },
});

describe('renderArrangement (clip-accurate)', () => {
  it('renders a sub-bar clip start at its real time', async () => {
    const p = newEmptyPattern(['l1'], 120);
    p.layerRows.l1[0] = { on: true };
    const patterns = { A: p, B: p, C: p, D: p };
    const arrangement = {
      totalBeats: 8,
      clips: [{ id: 'c1', patternId: 'A' as const, startBeat: 4, beats: 4, loops: 1, muted: false }],
      tempoMap: [],
    };
    const buf = await renderArrangement({ arrangement, patterns, layers: [synthLayer()], sampleRate: 8000, tailSec: 0.5 });
    // Beat 4 at 120bpm = 2s, + 0.5s tail.
    expect(buf).toBeTruthy();
    expect(buf.duration).toBeGreaterThanOrEqual(2.4);
  }, 20000);
});

describe('renderLayerStem (pattern-accurate AAF stems)', () => {
  it('renders only the requested layer across the chain', async () => {
    const p = newEmptyPattern(['l1', 'l2'], 120);
    p.layerRows.l1[0] = { on: true };
    p.layerRows.l2[0] = { on: true };
    const buf = await renderLayerStem({
      patterns: { A: p, B: p, C: p, D: p },
      chain: { order: ['A'] },
      layer: synthLayer('l1'),
      sampleRate: 8000,
      tailSec: 0.25,
    });
    expect(buf).toBeTruthy();
    expect(buf.duration).toBeGreaterThanOrEqual(2.2);
  }, 20000);
});