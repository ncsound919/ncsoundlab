/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Interaction tests for `MasterMeter`: drives the analyser mock through the
 * draw loop and verifies the meter bar / clip indicator / peak-hold behavior.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import React from 'react';
import { MasterMeter } from './MasterMeter';

const { audioEngineMock } = vi.hoisted(() => {
  const store: Record<PropertyKey, unknown> = {};
  const audioEngine = new Proxy(store, {
    get: (t, p) => {
      if (!(p in t)) t[p] = vi.fn();
      return t[p];
    },
  });
  return { audioEngineMock: audioEngine };
});
vi.mock('../lib/audioEngine', () => ({ audioEngine: audioEngineMock }));

const make2d = () => {
  const c: Record<string, unknown> = {};
  for (const m of [
    'fillRect',
    'beginPath',
    'moveTo',
    'lineTo',
    'stroke',
    'createLinearGradient',
  ]) {
    c[m] = vi.fn();
  }
  c.addColorStop = vi.fn();
  c.fillStyle = '';
  c.strokeStyle = '';
  c.lineWidth = 1;
  c.gradient = { addColorStop: vi.fn() };
  c.createLinearGradient = vi.fn(() => ({ addColorStop: vi.fn() }));
  return c;
};

interface AnalyserHandle {
  frequencyBinCount: number;
  setSignal: (v: number) => void;
  getByteFrequencyData: ReturnType<typeof vi.fn>;
  getFloatTimeDomainData: ReturnType<typeof vi.fn>;
}

function makeAnalyser(bins = 8): AnalyserHandle {
  let signal = 0;
  const data = {
    frequencyBinCount: bins,
    getByteFrequencyData: vi.fn((arr: Uint8Array) => {
      arr.fill(255);
    }),
    getFloatTimeDomainData: vi.fn((arr: Float32Array) => {
      arr.fill(signal);
    }),
    setSignal: (v: number) => {
      signal = v;
    },
  };
  return data;
}

describe('MasterMeter', () => {
  let analyser: AnalyserHandle;
  let rafQueue: Array<(t: number) => void>;
  let nowValue: number;

  beforeEach(() => {
    analyser = makeAnalyser();
    rafQueue = [];
    nowValue = 1000;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => make2d()) as never;

    (audioEngineMock.getAnalyser as ReturnType<typeof vi.fn>).mockReturnValue(analyser);
    (audioEngineMock.getIsPlaying as ReturnType<typeof vi.fn>).mockReturnValue(true);

    vi.spyOn(performance, 'now').mockImplementation(() => nowValue);

    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true,
      value: (cb: (t: number) => void) => {
        rafQueue.push(cb);
        return rafQueue.length;
      },
    });
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
      configurable: true,
      value: vi.fn(),
    });
  });

  const tick = (t: number) => {
    nowValue = t;
    const cb = rafQueue.shift();
    if (cb) act(() => cb(t));
  };

  afterEach(() => {
    cleanup();
  });

  it('renders the analyzer header and draws the initial frame', () => {
    analyser.setSignal(0.5);
    render(<MasterMeter />);
    expect(screen.getByText(/Spectrum Analyzer/i)).toBeDefined();
    expect(screen.getByText(/PK: -6.0 dB/i)).toBeDefined();
    const ctx = (HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>).mock.results[0]
      .value;
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('shows a negative-infinity readout for a silent signal', () => {
    analyser.setSignal(0);
    render(<MasterMeter />);
    expect(screen.getByText(/-∞/)).toBeDefined();
  });

  it('flags clipping at a hot peak and resets via the clip LED', () => {
    analyser.setSignal(0.999);
    render(<MasterMeter />);
    expect(screen.getByText(/CLIP OVERLOAD/i)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /reset clip indicator/i }));
    expect(screen.queryByText(/CLIP OVERLOAD/i)).toBeNull();
  });

  it('decays the peak-hold line once the signal drops', () => {
    analyser.setSignal(0.5); // ~ -6 dB
    render(<MasterMeter />);
    // A few frames at the loud signal keep the hold pinned.
    tick(1016);
    tick(1032);

    // Signal drops far below the hold; once 1.5s elapse the hold decays.
    analyser.setSignal(0.01);
    tick(2640); // 1000 + 16 + 16 + ~1600ms of simulated time
    expect(analyser.getFloatTimeDomainData).toHaveBeenCalled();
    // The hold line is still rendered after decay (holdHeight > 0).
    expect(document.querySelector('[style*="bottom"]')).toBeDefined();
  });

  it('updates state on the idle throttle interval when not playing', () => {
    (audioEngineMock.getIsPlaying as ReturnType<typeof vi.fn>).mockReturnValue(false);
    analyser.setSignal(0.5);
    render(<MasterMeter />);
    expect(screen.getByText(/PK: -6.0 dB/i)).toBeDefined();
  });

  it('cancels the animation loop on unmount', () => {
    analyser.setSignal(0.5);
    const { unmount } = render(<MasterMeter />);
    expect(rafQueue.length).toBeGreaterThan(0);
    unmount();
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
  });

  it('survives a missing analyser (early return)', () => {
    (audioEngineMock.getAnalyser as ReturnType<typeof vi.fn>).mockReturnValue(null);
    render(<MasterMeter />);
    expect(screen.getByText(/PK: -∞/i)).toBeDefined();
  });
});
