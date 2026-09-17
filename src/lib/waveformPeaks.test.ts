/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { computePeaks, peaksToPath, type PeakSource } from './waveformPeaks';

const source = (samples: number[]): PeakSource => ({
  length: samples.length,
  getChannelData: () => Float32Array.from(samples),
});

describe('computePeaks', () => {
  it('returns zeros for missing or empty sources', () => {
    expect(computePeaks(null, 4)).toEqual([0, 0, 0, 0]);
    expect(computePeaks(source([]), 4)).toEqual([0, 0, 0, 0]);
    expect(computePeaks(source([1, 2]), 0)).toEqual([]);
  });

  it('normalises the loudest bucket to 1', () => {
    const peaks = computePeaks(source([0.5, 0.5, 1, 1]), 2);
    expect(peaks).toHaveLength(2);
    expect(Math.max(...peaks)).toBeCloseTo(1);
    expect(peaks[1]).toBeCloseTo(1);
    expect(peaks[0]).toBeCloseTo(0.5);
  });

  it('buckets all samples and takes the peak magnitude', () => {
    // 8 samples / 4 buckets => pairs: [-1,0.1] [0.2,-0.4] [0.3,0.2] [0.1,0]
    const peaks = computePeaks(source([-1, 0.1, 0.2, -0.4, 0.3, 0.2, 0.1, 0]), 4);
    expect(peaks).toHaveLength(4);
    expect(peaks[0]).toBeCloseTo(1); // |-1|
    expect(peaks[1]).toBeCloseTo(0.4);
    expect(peaks[2]).toBeCloseTo(0.3);
    expect(peaks[3]).toBeCloseTo(0.1);
  });
});

describe('peaksToPath', () => {
  it('is empty without peaks', () => {
    expect(peaksToPath([], 48, 16)).toBe('');
  });

  it('produces a closed mirrored path', () => {
    const path = peaksToPath([1, 0.5, 1], 48, 16);
    expect(path.startsWith('M')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    expect(path).toContain('L');
  });
});
