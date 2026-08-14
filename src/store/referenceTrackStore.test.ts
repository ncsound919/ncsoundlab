/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `src/store/referenceTrackStore.ts` — the session reference-track
 * store (A/B comparison, tempo matching).
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { useReferenceTrackStore } from './referenceTrackStore';

const fakeBuffer = { length: 44100 } as unknown as AudioBuffer;
const fakeMeta = {
  name: 'ref.wav',
  sourceSampleRate: 44100,
  durationSec: 1,
  channels: 2,
  sizeBytes: 176400,
  importedAt: '2026-08-01T00:00:00Z',
  formatLabel: 'WAV',
  bpm: 120,
  confidence: 0.9,
};

describe('referenceTrackStore', () => {
  beforeEach(() => {
    useReferenceTrackStore.getState().clear();
  });

  it('starts empty with a sensible default gain', () => {
    const s = useReferenceTrackStore.getState();
    expect(s.buffer).toBeNull();
    expect(s.meta).toBeNull();
    expect(s.gain).toBe(0.8);
    expect(s.playing).toBe(false);
    expect(s.muted).toBe(false);
  });

  it('setBuffer stores the buffer and metadata', () => {
    useReferenceTrackStore.getState().setBuffer(fakeBuffer, fakeMeta);
    const s = useReferenceTrackStore.getState();
    expect(s.buffer).toBe(fakeBuffer);
    expect(s.meta).toBe(fakeMeta);
  });

  it('setGain clamps into [0, 1]', () => {
    const { setGain } = useReferenceTrackStore.getState();
    setGain(1.5);
    expect(useReferenceTrackStore.getState().gain).toBe(1);
    setGain(-2);
    expect(useReferenceTrackStore.getState().gain).toBe(0);
    setGain(0.45);
    expect(useReferenceTrackStore.getState().gain).toBeCloseTo(0.45, 6);
  });

  it('setPlaying / setMuted toggle flags', () => {
    const { setPlaying, setMuted } = useReferenceTrackStore.getState();
    setPlaying(true);
    expect(useReferenceTrackStore.getState().playing).toBe(true);
    setMuted(true);
    expect(useReferenceTrackStore.getState().muted).toBe(true);
  });

  it('clear() drops the buffer/meta and stops playback but keeps gain', () => {
    useReferenceTrackStore.getState().setBuffer(fakeBuffer, fakeMeta);
    useReferenceTrackStore.getState().setGain(0.3);
    useReferenceTrackStore.getState().setPlaying(true);
    useReferenceTrackStore.getState().setMuted(true);
    useReferenceTrackStore.getState().clear();

    const s = useReferenceTrackStore.getState();
    expect(s.buffer).toBeNull();
    expect(s.meta).toBeNull();
    expect(s.playing).toBe(false);
    expect(s.gain).toBeCloseTo(0.3, 6); // gain is sticky by design
  });
});
