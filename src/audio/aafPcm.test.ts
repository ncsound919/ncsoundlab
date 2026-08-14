/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the AAF PCM helpers (Phase 4.5).
 */

import { describe, expect, it } from 'vitest';
import {
  base64FromBytes,
  bytesFromBase64,
  deinterleavePcm,
  floatToInt24,
  interleavePcm,
  int24ToFloat,
  padPcmTo,
} from './aafPcm';

describe('aafPcm — base64', () => {
  it('round-trips bytes through base64', () => {
    const bytes = new Uint8Array([0, 7, 14, 21, 251, 1, 2, 3]);
    expect(bytesFromBase64(base64FromBytes(bytes))).toEqual(bytes);
  });

  it('handles large buffers in chunks', () => {
    const bytes = new Uint8Array(200_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
    const round = bytesFromBase64(base64FromBytes(bytes));
    expect(round.length).toBe(bytes.length);
    expect(round[199_999]).toBe(bytes[199_999]);
  });
});

describe('aafPcm — 24-bit conversion', () => {
  it('quantizes + clamps float to int24', () => {
    expect(floatToInt24(0)).toBe(0);
    expect(floatToInt24(1)).toBe(0x7fffff);
    expect(floatToInt24(-1)).toBe(0x800000);
    expect(floatToInt24(2)).toBe(0x7fffff); // clamped
    expect(floatToInt24(0.5)).toBe(0x400000);
  });

  it('round-trips a sample through bytes', () => {
    const v = floatToInt24(-0.5);
    const b0 = v & 0xff;
    const b1 = (v >> 8) & 0xff;
    const b2 = (v >> 16) & 0xff;
    expect(int24ToFloat(b0, b1, b2)).toBeCloseTo(-0.5, 5);
  });
});

describe('aafPcm — interleave/deinterleave', () => {
  it('interleaves stereo 24-bit frames L,R,L,R', () => {
    const l = new Float32Array([1, 0.5, 0]);
    const r = new Float32Array([-1, -0.5, 0.25]);
    const pcm = interleavePcm([l, r], 3, 24);
    expect(pcm.length).toBe(3 * 2 * 3); // 18 bytes

    const back = deinterleavePcm(pcm, 2, 24);
    expect(back).toHaveLength(2);
    expect(back[0][0]).toBeCloseTo(1, 4);
    expect(back[1][0]).toBeCloseTo(-1, 4);
    expect(back[0][1]).toBeCloseTo(0.5, 4);
    expect(back[1][2]).toBeCloseTo(0.25, 4);
  });

  it('round-trips 16-bit mono', () => {
    const ch = new Float32Array([0, 0.5, -1, 1]);
    const pcm = interleavePcm([ch], 4, 16);
    const back = deinterleavePcm(pcm, 1, 16);
    expect(back[0][1]).toBeCloseTo(0.5, 4);
    expect(back[0][2]).toBeCloseTo(-1, 4);
    expect(back[0][3]).toBeCloseTo(1, 4);
  });

  it('treats short channels as silence', () => {
    const ch = new Float32Array([1]);
    const pcm = interleavePcm([ch], 4, 16);
    expect(pcm.length).toBe(8);
    // remaining 3 frames are silence (±1 LSB TPDF dither noise at most)
    expect(Math.abs(new DataView(pcm.buffer).getInt16(2, true))).toBeLessThanOrEqual(1);
  });
});

describe('aafPcm — padPcmTo', () => {
  it('pads with silence and truncates', () => {
    const pcm = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const padded = padPcmTo(pcm, 4, 2, 1); // want 8 bytes
    expect(padded.length).toBe(8);
    expect(Array.from(padded.slice(0, 6))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(padded[6]).toBe(0);
    expect(padded[7]).toBe(0);

    const truncated = padPcmTo(pcm, 2, 2, 1); // want 4 bytes
    expect(Array.from(truncated)).toEqual([1, 2, 3, 4]);
  });
});
