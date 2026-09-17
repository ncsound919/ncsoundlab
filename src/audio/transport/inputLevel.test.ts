/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for input-level measurement (threshold auto-record math).
 */

import { describe, it, expect } from 'vitest';
import { rmsDbFromFloatSamples, analyserLevelDb, meetsThreshold } from './inputLevel';

describe('rmsDbFromFloatSamples', () => {
  it('measures a full-scale DC signal at ~0 dBFS', () => {
    expect(rmsDbFromFloatSamples(new Float32Array([1, 1, 1, 1]))).toBeCloseTo(0, 6);
  });

  it('measures a half-scale signal at ~-6 dBFS', () => {
    expect(rmsDbFromFloatSamples(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(-6.02, 2);
  });

  it('returns -Infinity for silence or empty input', () => {
    expect(rmsDbFromFloatSamples(new Float32Array([0, 0, 0]))).toBe(Number.NEGATIVE_INFINITY);
    expect(rmsDbFromFloatSamples(new Float32Array(0))).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('analyserLevelDb', () => {
  it('reads time-domain data from an analyser-like', () => {
    const analyser = {
      fftSize: 4,
      getFloatTimeDomainData: (arr: Float32Array) => arr.set([0.5, -0.5, 0.5, -0.5]),
    };
    expect(analyserLevelDb(analyser)).toBeCloseTo(-6.02, 2);
  });

  it('returns null for a missing or throwing analyser', () => {
    expect(analyserLevelDb(null)).toBeNull();
    expect(analyserLevelDb(undefined)).toBeNull();
    expect(
      analyserLevelDb({
        fftSize: 4,
        getFloatTimeDomainData: () => {
          throw new Error('nope');
        },
      })
    ).toBeNull();
  });
});

describe('meetsThreshold', () => {
  it('passes everything when no threshold is set', () => {
    expect(meetsThreshold(null)).toBe(true);
    expect(meetsThreshold(-100)).toBe(true);
  });

  it('gates on the threshold otherwise', () => {
    expect(meetsThreshold(-20, -30)).toBe(true);
    expect(meetsThreshold(-40, -30)).toBe(false);
    expect(meetsThreshold(null, -30)).toBe(false);
  });
});
