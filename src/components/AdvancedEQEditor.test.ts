/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the pure coordinate-mapping helpers in
 * `src/components/AdvancedEQEditor.tsx`: `freqToX`, `dbToY`, `xToFreq`,
 * `yToGain`, and `formatFreqLabel`.
 */

import { describe, expect, it } from 'vitest';
import {
  freqToX,
  dbToY,
  xToFreq,
  yToGain,
  formatFreqLabel,
  DB_RANGE_CONST,
} from './AdvancedEQEditor';

describe('freqToX (log2 frequency → pixel-x)', () => {
  it('maps 20 Hz to 0 and 20 kHz to the full width', () => {
    expect(freqToX(20, 600)).toBeCloseTo(0, 5);
    expect(freqToX(20000, 600)).toBeCloseTo(600, 5);
  });

  it('is logarithmic: the octave midpoint lands below the linear midpoint', () => {
    const width = 600;
    const x = freqToX(200, width); // 20→200 is one decade out ~10
    // 20 Hz → 0, 20 kHz → 600. 200 Hz is log2(200/20)=3.32 decades of the 10-decade span.
    const expected = (Math.log2(200 / 20) / Math.log2(20000 / 20)) * width;
    expect(x).toBeCloseTo(expected, 5);
    expect(x).toBeLessThan(width / 2);
  });

  it('doubling the frequency advances by the same fixed pixel offset (octave spacing)', () => {
    const width = 600;
    const x100 = freqToX(100, width);
    const x200 = freqToX(200, width);
    const x400 = freqToX(400, width);
    expect(x200 - x100).toBeCloseTo(x400 - x200, 5);
  });

  it('clamps frequencies below 20 Hz to the 20 Hz position', () => {
    expect(freqToX(5, 600)).toBeCloseTo(0, 5);
    expect(freqToX(-1, 600)).toBeCloseTo(0, 5);
  });
});

describe('dbToY (dB → pixel-y)', () => {
  const h = 200;
  it('maps 0 dB to the vertical center', () => {
    expect(dbToY(0, h)).toBeCloseTo(h / 2, 5);
  });
  it('maps +24 dB to the top and -24 dB to the bottom', () => {
    expect(dbToY(DB_RANGE_CONST, h)).toBeCloseTo(0, 5);
    expect(dbToY(-DB_RANGE_CONST, h)).toBeCloseTo(h, 5);
  });
  it('is linear in dB', () => {
    expect(dbToY(12, h)).toBeCloseTo(h / 2 - (12 / DB_RANGE_CONST) * (h / 2), 5);
  });
});

describe('xToFreq (pixel-x → frequency, inverse of freqToX)', () => {
  it('round-trips freqToX → xToFreq', () => {
    const width = 600;
    for (const f of [20, 50, 100, 440, 2000, 10000, 20000]) {
      const x = freqToX(f, width);
      const back = xToFreq(x, width);
      // xToFreq rounds to integer Hz; allow 1 Hz each side plus FP slop.
      expect(Math.abs(back - f)).toBeLessThanOrEqual(1.5);
    }
  });

  it('maps 0 → 20 Hz and width → 20 kHz', () => {
    expect(xToFreq(0, 600)).toBe(20);
    expect(xToFreq(600, 600)).toBe(20000);
  });

  it('clamps x outside [0, width]', () => {
    expect(xToFreq(-50, 600)).toBe(20);
    expect(xToFreq(9999, 600)).toBe(20000);
  });
});

describe('yToGain (pixel-y → dB, inverse of dbToY)', () => {
  const h = 200;
  it('round-trips dbToY → yToGain (within the 0.1 dB rounding)', () => {
    for (const db of [-24, -12, -6, 0, 6, 12, 24]) {
      const y = dbToY(db, h);
      const back = yToGain(y, h);
      expect(Math.abs(back - db)).toBeLessThanOrEqual(0.06);
    }
  });
  it('maps center to 0 dB and top/bottom to ±24 dB', () => {
    expect(yToGain(h / 2, h)).toBe(0);
    expect(yToGain(0, h)).toBe(DB_RANGE_CONST);
    expect(yToGain(h, h)).toBe(-DB_RANGE_CONST);
  });
});

describe('formatFreqLabel', () => {
  it('formats >= 1000 Hz as kHz', () => {
    expect(formatFreqLabel(1000)).toBe('1k');
    expect(formatFreqLabel(5000)).toBe('5k');
    expect(formatFreqLabel(20000)).toBe('20k');
  });
  it('formats < 1000 Hz as the raw number', () => {
    expect(formatFreqLabel(20)).toBe('20');
    expect(formatFreqLabel(440)).toBe('440');
    expect(formatFreqLabel(999)).toBe('999');
  });
});