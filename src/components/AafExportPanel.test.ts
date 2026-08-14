/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `pcmToAudioBuffer` in `src/components/AafExportPanel.tsx`. The
 * function de-interleaves little-endian PCM bytes into a real AudioBuffer
 * via OfflineAudioContext (mocked in tests/setup.ts).
 */

import { describe, expect, it } from 'vitest';
import { pcmToAudioBuffer } from './AafExportPanel';

// Build little-endian PCM bytes for a fixed 16-bit buffer.
function buildPcm16(samples: Array<{ l: number; r: number }>): Uint8Array {
  const out = new Uint8Array(samples.length * 2 * 2);
  const view = new DataView(out.buffer);
  samples.forEach((s, i) => {
    const l = Math.max(-32768, Math.min(32767, Math.round(s.l * 0x8000)));
    const r = Math.max(-32768, Math.min(32767, Math.round(s.r * 0x8000)));
    view.setInt16(i * 4, l, true);
    view.setInt16(i * 4 + 2, r, true);
  });
  return out;
}

describe('pcmToAudioBuffer', () => {
  it('de-interleaves stereo 16-bit PCM into matching channels', () => {
    const pcm = buildPcm16([
      { l: 0.5, r: -0.5 },
      { l: 1.0, r: -1.0 },
      { l: 0.0, r: 0.25 },
    ]);
    const buffer = pcmToAudioBuffer(pcm, 48000, 2, 16);

    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.length).toBe(3);
    expect(buffer.sampleRate).toBe(48000);

    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    expect(left[0]).toBeCloseTo(0.5, 4);
    expect(right[0]).toBeCloseTo(-0.5, 4);
    expect(left[1]).toBeCloseTo(1.0, 4);
    expect(right[1]).toBeCloseTo(-1.0, 4);
    expect(left[2]).toBeCloseTo(0, 4);
    expect(right[2]).toBeCloseTo(0.25, 4);
  });

  it('handles mono by de-interleaving a single channel', () => {
    const out = new Uint8Array(4); // 2 frames x 1 ch x 16bit
    const view = new DataView(out.buffer);
    view.setInt16(0, Math.round(0.25 * 0x8000), true);
    view.setInt16(2, Math.round(-0.75 * 0x8000), true);

    const buffer = pcmToAudioBuffer(out, 44100, 1, 16);
    const ch = buffer.getChannelData(0);
    expect(ch.length).toBe(2);
    expect(ch[0]).toBeCloseTo(0.25, 4);
    expect(ch[1]).toBeCloseTo(-0.75, 4);
  });

  it('clamps degenerate channels to at least 1', () => {
    const pcm = buildPcm16([{ l: 0.25, r: -0.25 }]);
    const buffer = pcmToAudioBuffer(pcm, 44100, 0, 16);
    expect(buffer.numberOfChannels).toBe(1);
    expect(buffer.getChannelData(0)[0]).toBeCloseTo(0.25, 4);
  });

  it('produces an empty buffer for empty PCM input', () => {
    const buffer = pcmToAudioBuffer(new Uint8Array(0), 44100, 2, 16);
    expect(buffer.numberOfChannels).toBe(2);
    expect(buffer.length).toBe(1); // Math.max(1, frames)
  });
});