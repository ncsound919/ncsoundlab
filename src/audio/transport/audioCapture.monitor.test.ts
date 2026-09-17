/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coverage for the `createAudioCapture` input-monitor and threshold
 * (auto-record) paths, with a stubbed MediaRecorder + getUserMedia + a fake
 * AudioContext.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAudioCapture } from './audioCapture';

class MockMediaRecorder {
  start = vi.fn();
  stop = vi.fn(() => {
    const fn = this.listeners['dataavailable'];
    if (fn) fn({ data: new Blob(['audio'], { type: 'audio/webm' }) });
  });
  private listeners: Record<string, (e: any) => void> = {};
  addEventListener = vi.fn((type: string, fn: (e: any) => void) => {
    this.listeners[type] = fn;
  });
  removeEventListener = vi.fn();
  constructor(public stream: MediaStream) {}
}

function makeFakeContext() {
  const gainParam = { value: 0 };
  const gain = { gain: gainParam, connect: vi.fn(), disconnect: vi.fn() };
  const analyserData = new Float32Array(1024).fill(0);
  const analyser = {
    fftSize: 2048,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getFloatTimeDomainData: vi.fn((arr: Float32Array) => {
      arr.set(analyserData.subarray(0, arr.length));
    }),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const ctx = {
    createMediaStreamSource: vi.fn(() => source),
    createAnalyser: vi.fn(() => analyser),
    createGain: vi.fn(() => gain),
    destination: {},
  };
  return {
    ctx: ctx as unknown as AudioContext,
    gain,
    gainParam,
    analyser,
    analyserData,
    source,
  };
}

describe('createAudioCapture monitor + threshold', () => {
  beforeEach(() => {
    const getUserMedia = vi.fn(async () => ({
      getTracks: vi.fn(() => [{ stop: vi.fn() }, { stop: vi.fn() }]),
    }));
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

  it('routes the monitor to the destination when enabled before start', async () => {
    const { ctx, gainParam } = makeFakeContext();
    const cap = createAudioCapture();
    expect(cap.isMonitorEnabled()).toBe(false);
    expect(cap.getInputLevelDb()).toBeNull();

    cap.enableMonitor(ctx, 0.7);
    expect(cap.isMonitorEnabled()).toBe(true);
    await cap.start();
    expect(gainParam.value).toBeCloseTo(0.7, 6);

    cap.setMonitorLevel(0.2);
    expect(gainParam.value).toBeCloseTo(0.2, 6);

    cap.disableMonitor();
    expect(cap.isMonitorEnabled()).toBe(false);
    expect(gainParam.value).toBe(0);
  });

  it('measures the input level through the monitor analyser', async () => {
    const f = makeFakeContext();
    f.analyserData.fill(0.5);
    const cap = createAudioCapture();
    await cap.start({ monitor: { context: f.ctx, level: 0 } });
    // Silent monitor (level 0) still measures: 0.5 RMS ≈ -6.02 dBFS.
    expect(cap.isMonitorEnabled()).toBe(false);
    expect(cap.getInputLevelDb()).toBeCloseTo(-6.02, 2);
  });

  it('holds the take until the threshold is reached', async () => {
    const f = makeFakeContext();
    const cap = createAudioCapture();
    let calls = 0;
    const sampleLevelDb = () => {
      calls++;
      return calls <= 2 ? -100 : -10;
    };
    await cap.start({ monitor: { context: f.ctx, level: 0 }, thresholdDb: -30, sampleLevelDb });
    // Two polls below threshold, then the passing sample.
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  it('starts immediately when the threshold is already met', async () => {
    const f = makeFakeContext();
    const cap = createAudioCapture();
    const sampleLevelDb = vi.fn(() => -10);
    await cap.start({ monitor: { context: f.ctx, level: 0 }, thresholdDb: -30, sampleLevelDb });
    expect(sampleLevelDb).toHaveBeenCalledTimes(1);
  });

  it('starts immediately when no measurement context is available', async () => {
    const cap = createAudioCapture();
    const sampleLevelDb = vi.fn(() => -100);
    // No monitor context → nothing to gate on; the take must not hang.
    await cap.start({ thresholdDb: -30, sampleLevelDb });
    expect(sampleLevelDb).not.toHaveBeenCalled();
  });

  it('gives up waiting after the threshold timeout and starts anyway', async () => {
    const f = makeFakeContext();
    const cap = createAudioCapture();
    const t0 = Date.now();
    await cap.start({
      monitor: { context: f.ctx, level: 0 },
      thresholdDb: -30,
      thresholdTimeoutMs: 60,
      sampleLevelDb: () => -100,
    });
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it('tears the monitor chain down on stop', async () => {
    const f = makeFakeContext();
    const cap = createAudioCapture();
    cap.enableMonitor(f.ctx, 0.5);
    await cap.start();
    await cap.stop();
    expect(f.gain.disconnect).toHaveBeenCalled();
    expect(f.source.disconnect).toHaveBeenCalled();
  });
});
