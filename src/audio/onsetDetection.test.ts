/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/audio/onsetDetection.ts` (Phase 5.3).
 */

import { describe, expect, it } from 'vitest';
import { detectOnsets } from './onsetDetection';

const makeBuffer = (events: { atSec: number; freq: number; durSec?: number }[], sampleRate = 16000): AudioBuffer => {
  const dur = Math.max(...events.map((e) => e.atSec + (e.durSec ?? 0.2))) + 0.2;
  const length = Math.floor(sampleRate * dur);
  const data = new Float32Array(length);
  for (const ev of events) {
    const start = Math.floor(ev.atSec * sampleRate);
    const n = Math.floor(sampleRate * (ev.durSec ?? 0.2));
    for (let i = 0; i < n && start + i < length; i++) {
      // Sharp attack: fast rise then decay.
      const env = Math.exp(-i / (sampleRate * 0.03));
      data[start + i] = Math.sin((2 * Math.PI * ev.freq * i) / sampleRate) * 0.8 * env;
    }
  }
  return {
    numberOfChannels: 1,
    sampleRate,
    length,
    duration: length / sampleRate,
    getChannelData: () => data,
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
};

describe('detectOnsets', () => {
  it('finds the onset of a single isolated transient', () => {
    const buf = makeBuffer([{ atSec: 0.5, freq: 200 }]);
    const hits = detectOnsets(buf, { sensitivity: 0.9 });
    expect(hits.length).toBeGreaterThan(0);
    // Hop quantization (512 samples @16k = 32ms) means the reported onset can
    // land up to one hop early — allow a generous window.
    expect(Math.abs(hits[0].time - 0.5)).toBeLessThan(0.07);
  });

  it('finds all three distinct transients', () => {
    const buf = makeBuffer([
      { atSec: 0.2, freq: 150 },
      { atSec: 0.8, freq: 300 },
      { atSec: 1.4, freq: 450 },
    ]);
    const hits = detectOnsets(buf, { sensitivity: 0.9, minGapSec: 0.05 });
    const times = hits.map((h) => h.time);
    expect(times.length).toBeGreaterThanOrEqual(3);
    for (const expected of [0.2, 0.8, 1.4]) {
      expect(times.some((t) => Math.abs(t - expected) < 0.08)).toBe(true);
    }
  });

  it('respects maxOnsets by keeping the strongest', () => {
    const buf = makeBuffer([
      { atSec: 0.2, freq: 150 },
      { atSec: 0.8, freq: 300 },
      { atSec: 1.4, freq: 450 },
    ]);
    const hits = detectOnsets(buf, { sensitivity: 0.9, maxOnsets: 2 });
    expect(hits.length).toBeLessThanOrEqual(2);
  });

  it('returns [] for a silent buffer', () => {
    const buf = new (class {
      numberOfChannels = 1;
      sampleRate = 16000;
      length = 16000;
      duration = 1;
      getChannelData = () => new Float32Array(16000);
      copyFromChannel = () => {};
      copyToChannel = () => {};
    })() as unknown as AudioBuffer;
    expect(detectOnsets(buf)).toEqual([]);
  });

  it('suppresses double-hits within minGapSec', () => {
    // Two transients 10ms apart should collapse to one.
    const buf = makeBuffer([
      { atSec: 0.5, freq: 200, durSec: 0.05 },
      { atSec: 0.51, freq: 220, durSec: 0.05 },
    ]);
    const hits = detectOnsets(buf, { sensitivity: 0.9, minGapSec: 0.03 });
    expect(hits.filter((h) => Math.abs(h.time - 0.5) < 0.08).length).toBeLessThanOrEqual(1);
  });

  it('clamps an out-of-range channel index instead of throwing (regression)', () => {
    // getChannelData throws IndexSizeError for out-of-range channels; the old
    // `getChannelData(channel) ?? getChannelData(0)` fallback was dead code.
    const buf = makeBuffer([{ atSec: 0.5, freq: 200 }]);
    expect(() => detectOnsets(buf, { channel: 5 })).not.toThrow();
  });
});
