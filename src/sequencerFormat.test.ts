import { describe, it, expect } from 'vitest';
import { exportV2, importExport } from './sequencerFormat';
import { newEmptyPattern } from './store/patternStore';
import type { SequenceExportV1, SequenceExportV2 } from './types';

describe('sequencerFormat', () => {
  it('exports a v2 file with bpm, timeSig, stepLength, swing, pattern', () => {
    const p = newEmptyPattern(['l1', 'l2'], 132, 3, 4, 32, 0.2);
    p.layerRows.l1[0] = { on: true, velocity: 110 };
    const data: SequenceExportV2 = exportV2('A', p, { order: ['A'] });
    expect(data.version).toBe(2);
    expect(data.bpm).toBe(132);
    expect(data.timeSignature).toEqual([3, 4]);
    expect(data.stepLength).toBe(32);
    expect(data.swing).toBe(0.2);
    expect(data.pattern.l1[0].on).toBe(true);
  });

  it('imports a v1 file via migration to v2', () => {
    const v1: SequenceExportV1 = {
      format: 'ncsoundlab-mpc-sequence',
      version: 1,
      bpm: 90, steps: 16, ppq: 96,
      pattern: { l1: Array.from({ length: 16 }, () => ({ on: false })) },
    };
    const out = importExport(v1);
    expect(out.version).toBe(2);
    expect(out.bpm).toBe(90);
    expect(out.timeSignature).toEqual([4, 4]);
  });

  it('round-trips v2 export -> import', () => {
    const p = newEmptyPattern(['x'], 100);
    p.layerRows.x[4] = { on: true };
    const exported = exportV2('A', p);
    const reimported = importExport(exported);
    expect(reimported.pattern.x[4].on).toBe(true);
  });
});
