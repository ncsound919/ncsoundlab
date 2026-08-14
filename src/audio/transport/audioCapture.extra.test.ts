/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extra coverage for `src/audio/transport/audioCapture.ts` — the
 * `createAudioCapture` lifecycle (start / stop / decode / dispose) with a
 * stubbed MediaRecorder + getUserMedia, plus the MediaRecorder-support probe.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAudioCapture, isMediaRecorderSupported } from './audioCapture';

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  start = vi.fn();
  stop = vi.fn(() => {
    // Fire the dataavailable listener synchronously, like the real API does
    // after the (async) stop completes.
    const fn = this.listeners['dataavailable'];
    if (fn) fn({ data: new Blob(['audio'], { type: 'audio/webm' }) });
  });
  private listeners: Record<string, (e: any) => void> = {};
  addEventListener = vi.fn((type: string, fn: (e: any) => void) => {
    this.listeners[type] = fn;
  });
  constructor(public stream: MediaStream) {}
}

describe('isMediaRecorderSupported', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when window.MediaRecorder exists', () => {
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    expect(isMediaRecorderSupported()).toBe(true);
  });
});

describe('createAudioCapture', () => {
  let getUserMedia: any;

  beforeEach(() => {
    getUserMedia = vi.fn(async () => {
      return {
        getTracks: vi.fn(() => [{ stop: vi.fn() }, { stop: vi.fn() }]),
      };
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('start() rejects when MediaRecorder is unavailable', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    const cap = createAudioCapture();
    await expect(cap.start()).rejects.toThrow(/MediaRecorder not available/);
  });

  it('start() acquires the stream, starts a recorder and returns the stream', async () => {
    const cap = createAudioCapture();
    const stream = await cap.start();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(stream).toBeTruthy();
  });

  it('stop() throws when there is no active recorder', async () => {
    const cap = createAudioCapture();
    await expect(cap.stop()).rejects.toThrow(/No active recorder/);
  });

  it('stop() collects the blob, stops tracks and clears the active recorder', async () => {
    const cap = createAudioCapture();
    const stream = await cap.start();
    const trackStop = vi.fn();
    Object.defineProperty(stream, 'getTracks', { value: () => [{ stop: trackStop }] });
    const blob = await cap.stop();
    expect(blob).toBeTruthy();
    expect(trackStop).toHaveBeenCalled();
  });

  it('decodeBlobToBuffer reads the blob and decodes via the context', async () => {
    const cap = createAudioCapture();
    const decodeAudioData = vi.fn(async () => ({ length: 10 } as AudioBuffer));
    const ctx = { decodeAudioData } as unknown as BaseAudioContext;
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' });
    const out = await cap.decodeBlobToBuffer(blob, ctx);
    expect(out).toEqual({ length: 10 });
    expect(decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it('dispose() stops any active tracks and clears state', async () => {
    const cap = createAudioCapture();
    const stream = await cap.start();
    const trackStop = vi.fn();
    Object.defineProperty(stream, 'getTracks', { value: () => [{ stop: trackStop }] });
    cap.dispose();
    expect(trackStop).toHaveBeenCalled();
    // A second dispose is a harmless no-op.
    cap.dispose();
  });
});
