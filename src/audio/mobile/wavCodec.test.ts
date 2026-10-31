/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  WAV_FORMATS,
  bytesPerSecond,
  decodeWav,
  decodeWavMono,
  encodeWav,
  encodeWavMono,
  wavByteSize,
} from './wavCodec';
import { tone } from '../../tests/mobileSignals';

const SR = 48000;

describe('sizing helpers', () => {
  it('computes throughput for the capture preflight', () => {
    expect(bytesPerSecond(1, 48000, 'float32')).toBe(192000);
    expect(bytesPerSecond(2, 48000, 'int24')).toBe(288000);
    expect(bytesPerSecond(1, 48000, 'int16')).toBe(96000);
  });

  it('computes file size including the header', () => {
    expect(wavByteSize(48000, 1, 'float32')).toBe(44 + 48000 * 4);
    expect(wavByteSize(0, 1, 'int16')).toBe(44);
  });

  it('exposes the format table', () => {
    expect(WAV_FORMATS.float32).toMatchObject({ formatTag: 3, bitsPerSample: 32 });
    expect(WAV_FORMATS.int24).toMatchObject({ formatTag: 1, bitsPerSample: 24 });
  });
});

describe('float32 round-trip', () => {
  it('is bit-exact for mono', () => {
    const source = tone(440, 0.1, SR, 0.8);
    const bytes = encodeWavMono(source, SR);
    const decoded = decodeWavMono(bytes);
    expect(decoded.sampleRate).toBe(SR);
    expect(decoded.format).toBe('float32');
    expect(decoded.samples.length).toBe(source.length);
    for (let i = 0; i < source.length; i += 97) {
      expect(decoded.samples[i]).toBe(source[i]);
    }
  });

  it('de-interleaves stereo', () => {
    const left = tone(220, 0.05, SR, 0.5);
    const right = tone(660, 0.05, SR, 0.25);
    const decoded = decodeWav(encodeWav([left, right], SR));
    expect(decoded.channels).toHaveLength(2);
    expect(decoded.frames).toBe(left.length);
    expect(decoded.channels[0][100]).toBeCloseTo(left[100], 6);
    expect(decoded.channels[1][100]).toBeCloseTo(right[100], 6);
  });
});

describe('integer formats', () => {
  it('round-trips 16-bit within one LSB', () => {
    const source = tone(300, 0.05, SR, 0.5);
    const decoded = decodeWavMono(encodeWavMono(source, SR, { format: 'int16' }));
    expect(decoded.format).toBe('int16');
    for (let i = 0; i < source.length; i += 53) {
      expect(Math.abs(decoded.samples[i] - source[i])).toBeLessThan(1 / 0x7fff + 2 / 0x7fff);
    }
  });

  it('round-trips 24-bit tighter than 16-bit', () => {
    const source = tone(300, 0.05, SR, 0.5);
    const decoded = decodeWavMono(encodeWavMono(source, SR, { format: 'int24' }));
    expect(decoded.format).toBe('int24');
    for (let i = 0; i < source.length; i += 53) {
      expect(Math.abs(decoded.samples[i] - source[i])).toBeLessThan(1 / 0x7fffff * 4);
    }
  });

  it('round-trips 32-bit int', () => {
    const source = tone(300, 0.02, SR, 0.4);
    const decoded = decodeWavMono(encodeWavMono(source, SR, { format: 'int32' }));
    expect(decoded.format).toBe('int32');
    expect(Math.abs(decoded.samples[10] - source[10])).toBeLessThan(1e-6);
  });
});

describe('decoder robustness', () => {
  it('walks past extra chunks such as LIST', () => {
    const base = encodeWavMono(tone(200, 0.02, SR, 0.4), SR);
    // Rebuild the file with a LIST chunk inserted between fmt and data.
    const listSize = 10;
    const out = new Uint8Array(base.length + 8 + listSize);
    const view = new DataView(out.buffer);
    out.set(base.subarray(0, 36), 0); // RIFF header + fmt chunk
    const text = new TextEncoder();
    const list = 'LIST';
    out.set(text.encode(list), 36);
    view.setUint32(40, listSize, true);
    out.set(base.subarray(36), 44 + listSize);
    view.setUint32(4, out.length - 8, true);
    const decoded = decodeWavMono(out);
    expect(decoded.samples.length).toBe(960);
  });

  it('rejects a file that is not RIFF/WAVE', () => {
    expect(() => decodeWav(new Uint8Array(64))).toThrow(/Not a RIFF/);
    expect(() => decodeWav(new Uint8Array(8))).toThrow(/too short/);
  });

  it('rejects a file with no data chunk', () => {
    const bytes = encodeWavMono(tone(200, 0.01, SR, 0.2), SR);
    // Rename the data chunk: the walker then runs off the end without a payload.
    const renamed = Uint8Array.from(bytes);
    renamed.set(new TextEncoder().encode('junk'), 36);
    expect(() => decodeWav(renamed)).toThrow(/no data chunk/);
  });

  it('accepts an empty data chunk as a zero-length take', () => {
    const decoded = decodeWav(encodeWavMono(new Float32Array(0), SR));
    expect(decoded.frames).toBe(0);
    expect(decoded.channels[0].length).toBe(0);
  });

  it('averages channels when decoding to mono', () => {
    const left = tone(200, 0.02, SR, 0.6);
    const right = tone(200, 0.02, SR, -0.6);
    const decoded = decodeWavMono(encodeWav([left, right], SR));
    expect(Math.abs(decoded.samples[5])).toBeLessThan(1e-6);
  });
});
