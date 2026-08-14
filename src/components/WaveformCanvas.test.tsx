/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the pure waveform helpers in `src/components/WaveformCanvas.tsx`:
 * `calcPeakCols`, `computeWaveformPeaks`, and `pctFromClientX`.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import {
  calcPeakCols,
  computeWaveformPeaks,
  pctFromClientX,
  WaveformCanvas,
} from './WaveformCanvas';

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

describe('calcPeakCols', () => {
  it('uses step = ceil(data/width) and cols = ceil(data/step) capped at width', () => {
    const { step, cols } = calcPeakCols(44100, 800);
    expect(step).toBe(56); // ceil(44100/800) = 56
    expect(cols).toBe(788); // ceil(44100/56) = 788 < 800
  });

  it('returns all samples in a single column for very short data', () => {
    const { step, cols } = calcPeakCols(10, 800);
    expect(step).toBe(1);
    expect(cols).toBe(10);
  });

  it('clamps cols to the css width (data shorter than width)', () => {
    const { step, cols } = calcPeakCols(400, 800);
    expect(cols).toBe(400);
    expect(step).toBe(1);
  });

  it('handles zero-length data without producing NaN columns', () => {
    const { step, cols } = calcPeakCols(0, 800);
    expect(step).toBe(1);
    expect(cols).toBe(0);
  });
});

describe('computeWaveformPeaks', () => {
  it('computes min/max per column in [min,max] pairs', () => {
    // step=2, cols=3: buckets [0,1]=[-1,0.5], [2,3]=[0.3,-0.7], [4,5]=[0.9,-0.2]
    const data = new Float32Array([-1, 0.5, 0.3, -0.7, 0.9, -0.2]);
    const peaks = computeWaveformPeaks(data, 3, 2);
    expect(peaks.length).toBe(6);
    expect(peaks[0]).toBe(-1);
    expect(peaks[1]).toBeCloseTo(0.5, 5);
    expect(peaks[2]).toBeCloseTo(-0.7, 5);
    expect(peaks[3]).toBeCloseTo(0.3, 5);
    expect(peaks[4]).toBeCloseTo(-0.2, 5);
    expect(peaks[5]).toBeCloseTo(0.9, 5);
  });

  it('initializes empty buckets to [1, -1]', () => {
    const data = new Float32Array([1, 2, 3, 4]);
    const peaks = computeWaveformPeaks(data, 4, 1); // every bucket filled, plus none
    // One extra column with no samples -> untouched [1,-1]
    const sparse = computeWaveformPeaks(data, 5, 1);
    expect(sparse[8]).toBe(1);
    expect(sparse[9]).toBe(-1);
  });

  it('handles a single-column downsampling (step > 1)', () => {
    const data = new Float32Array([0.1, -0.4, 0.2, 0.7]);
    const peaks = computeWaveformPeaks(data, 2, 2);
    expect(peaks[0]).toBeCloseTo(-0.4, 5);
    expect(peaks[1]).toBeCloseTo(0.1, 5);
    expect(peaks[2]).toBeCloseTo(0.2, 5);
    expect(peaks[3]).toBeCloseTo(0.7, 5);
  });

  it('is deterministic across calls with the same input', () => {
    const data = new Float32Array([0.5, -0.5, 0.25, -0.25, 1, -1]);
    const a = computeWaveformPeaks(data, 3, 2);
    const b = computeWaveformPeaks(data, 3, 2);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('pctFromClientX', () => {
  const rect = { left: 100, width: 400 };

  it('maps the left edge to 0 and the right edge to 1', () => {
    expect(pctFromClientX(100, rect)).toBe(0);
    expect(pctFromClientX(500, rect)).toBe(1);
  });

  it('maps the midpoint to 0.5', () => {
    expect(pctFromClientX(300, rect)).toBe(0.5);
  });

  it('clamps values outside the rect', () => {
    expect(pctFromClientX(50, rect)).toBe(0);
    expect(pctFromClientX(900, rect)).toBe(1);
  });

  it('handles a zero-width rect by returning 0 (NaN guard via clamp)', () => {
    const z = pctFromClientX(100, { left: 100, width: 0 });
    expect(Number.isNaN(z)).toBe(false);
  });
});

/* ── Component render paths ──────────────────────────────────────────────── */

const make2d = () => {
  const c: Record<string, unknown> = {};
  for (const m of ['save', 'scale', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'restore', 'arc', 'fill', 'fillText']) {
    c[m] = vi.fn();
  }
  c.fillStyle = '';
  c.strokeStyle = '';
  c.lineWidth = 1;
  c.font = '';
  return c;
};

const makeBuffer = (len = 1000): AudioBuffer => {
  const data = new Float32Array(len);
  for (let i = 0; i < len; i++) data[i] = Math.sin(i / 50) * 0.5;
  return { numberOfChannels: 1, length: len, sampleRate: 44100, duration: len / 44100, getChannelData: () => data } as unknown as AudioBuffer;
};

describe('WaveformCanvas render', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => make2d()) as never;
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, writable: true, configurable: true });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: vi.fn(() => 1) });
    Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: vi.fn() });
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
    (audioEngineMock.getIsPlaying as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (audioEngineMock.getPlaybackProgress as ReturnType<typeof vi.fn>).mockReturnValue(0.5);
    (audioEngineMock.getAnalyser as ReturnType<typeof vi.fn>).mockReturnValue(null);
  });

  it('draws a buffer waveform (scratch buffers + peak trace)', () => {
    render(<WaveformCanvas buffer={makeBuffer()} />);
    const ctx = (HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('draws a flat idle line when there is no buffer', () => {
    render(<WaveformCanvas buffer={null} />);
    const ctx = (HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('renders the real-time analyser spectrum and playhead while playing', () => {
    (audioEngineMock.getIsPlaying as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (audioEngineMock.getAnalyser as ReturnType<typeof vi.fn>).mockReturnValue({
      frequencyBinCount: 256,
      getByteFrequencyData: vi.fn(),
    });
    render(<WaveformCanvas buffer={makeBuffer()} isPlaying />);
    const ctx = (HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.arc).toHaveBeenCalled(); // playhead cap
  });

  it('draws the selection overlay between start and end', () => {
    render(<WaveformCanvas buffer={makeBuffer()} selectionStart={0.2} selectionEnd={0.6} />);
    const ctx = (HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(ctx.fillText).toHaveBeenCalled(); // boundary % tags
  });

  it('updates the selection when dragging on the canvas', () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <WaveformCanvas buffer={makeBuffer()} onSelectionChange={onSelectionChange} />,
    );
    const canvas = container.querySelector('canvas')!;
    (canvas as unknown as Record<string, unknown>).setPointerCapture = vi.fn();
    (canvas as unknown as Record<string, unknown>).hasPointerCapture = vi.fn(() => true);
    (canvas as unknown as Record<string, unknown>).releasePointerCapture = vi.fn();
    fireEvent.pointerDown(canvas, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    expect(onSelectionChange).toHaveBeenCalled();
  });
});