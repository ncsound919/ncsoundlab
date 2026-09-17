/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coverage for `src/components/AdvancedCompEditor.tsx`, previously at ~3%:
 * mode switching (+ per-mode labels), every knob, preset select (including
 * the unknown-id early return), auto-release, the GR canvas loop (grid,
 * zero-size, missing ctx, visibility pause), and unmount cleanup.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { AdvancedCompEditor } from './AdvancedCompEditor';
import {
  DEFAULT_COMPRESSOR_SETTINGS,
  type AdvancedCompressorSettings,
} from '../audio/dsp/AdvancedCompressor';
import { audioEngine } from '../audio/AudioEngine';

const makeMockCtx = () => ({
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  closePath: vi.fn(),
  scale: vi.fn(),
  setTransform: vi.fn(),
});

const rafQueue: FrameRequestCallback[] = [];
const flushFrames = (count: number) => {
  act(() => {
    for (let i = 0; i < count; i++) {
      const cb = rafQueue.shift();
      if (!cb) break;
      cb(0);
    }
  });
};

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
    MockResizeObserver.instances.push(this);
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const ioCallbacks: IntersectionObserverCallback[] = [];
class CaptureIO {
  constructor(cb: IntersectionObserverCallback) {
    ioCallbacks.push(cb);
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

/** Shared canvas ctx double, so tests can prove the draw body executed. */
let mockCtx: ReturnType<typeof makeMockCtx>;

const onChange = vi.fn<(s: AdvancedCompressorSettings) => void>();

const renderEditor = (settings: AdvancedCompressorSettings = DEFAULT_COMPRESSOR_SETTINGS) =>
  render(<AdvancedCompEditor moduleId="comp-1" settings={settings} onChange={onChange} />);

beforeEach(() => {
  onChange.mockReset();
  ioCallbacks.length = 0;
  MockResizeObserver.instances.length = 0;
  mockCtx = makeMockCtx();
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.stubGlobal('IntersectionObserver', CaptureIO);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    }),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    mockCtx as unknown as CanvasRenderingContext2D,
  );
  // NOTE: the meter measures its wrapper DIV, not the canvas — stub Element,
  // not HTMLCanvasElement, or the loop reads 0x0 forever.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 300,
    height: 96,
  } as DOMRect);
  (audioEngine as any).getModuleGainReduction = vi.fn(() => 6);
});

afterEach(() => {
  rafQueue.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (audioEngine as any).getModuleGainReduction;
});

describe('AdvancedCompEditor chrome', () => {
  it('renders the GR meter, mode buttons and knobs', () => {
    renderEditor();
    expect(screen.getByLabelText('Compressor gain reduction meter')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Compressor mode VCA' })).toBeDefined();
    expect(screen.getByRole('slider', { name: 'Thresh' })).toBeDefined();
    expect(screen.getByRole('slider', { name: 'Mix' })).toBeDefined();
    expect(screen.getByLabelText('Compressor preset')).toBeDefined();
    expect(screen.getByLabelText('Auto release')).toBeDefined();
  });

  it('marks the active mode pressed', () => {
    renderEditor();
    expect(
      screen.getByRole('button', { name: 'Compressor mode VCA' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Compressor mode OPTO' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });
});

describe('AdvancedCompEditor modes', () => {
  it.each([
    { mode: 'opto', thresh: 'Peak Reduct', makeup: 'Gain', badge: 'Fixed ~4:1' },
    { mode: 'fet', thresh: 'Input Level', makeup: 'Output', badge: null },
    { mode: 'vca', thresh: 'Thresh', makeup: 'Makeup', badge: null },
    { mode: 'clean', thresh: 'Thresh', makeup: 'Makeup', badge: null },
  ] as const)('switches to $mode with its labels', ({ mode, thresh, makeup, badge }) => {
    const { unmount } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: `Compressor mode ${mode.toUpperCase()}` }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mode }));
    onChange.mockClear();
    // Re-render under the new mode to assert its labels/badges.
    unmount();
    renderEditor({ ...DEFAULT_COMPRESSOR_SETTINGS, mode });
    expect(screen.getByRole('slider', { name: thresh })).toBeDefined();
    expect(screen.getByRole('slider', { name: makeup })).toBeDefined();
    if (badge) expect(screen.getByText(badge)).toBeDefined();
    unmount();
  });

  it('shows the opto fixed-ratio badges', () => {
    renderEditor({ ...DEFAULT_COMPRESSOR_SETTINGS, mode: 'opto' });
    expect(screen.getByText('Fixed ~4:1')).toBeDefined();
    expect(screen.getByText('~10ms Opto')).toBeDefined();
    expect(screen.getByText('Multi-Stage')).toBeDefined();
  });
});

describe('AdvancedCompEditor knobs and controls', () => {
  function turnKnob(label: string): AdvancedCompressorSettings {
    fireEvent.keyDown(screen.getByRole('slider', { name: label }), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)[0] as AdvancedCompressorSettings;
    onChange.mockClear();
    return next;
  }

  it('updates threshold / ratio / attack / release / makeup', () => {
    renderEditor();
    expect(turnKnob('Thresh').threshold).toBeGreaterThan(DEFAULT_COMPRESSOR_SETTINGS.threshold);
    expect(turnKnob('Ratio').ratio).toBeGreaterThan(DEFAULT_COMPRESSOR_SETTINGS.ratio);
    expect(turnKnob('Attack').attackMs).toBeGreaterThan(DEFAULT_COMPRESSOR_SETTINGS.attackMs);
    expect(turnKnob('Release').releaseMs).toBeGreaterThan(DEFAULT_COMPRESSOR_SETTINGS.releaseMs);
    expect(turnKnob('Makeup').makeupGain).toBeGreaterThan(DEFAULT_COMPRESSOR_SETTINGS.makeupGain);
  });

  it('updates the parallel mix', () => {
    renderEditor({ ...DEFAULT_COMPRESSOR_SETTINGS, mixPercent: 50 });
    // Mix at 50 + step 1.
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Mix' }), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mixPercent: 51 }));
  });

  it('applies a preset from the dropdown', () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText('Compressor preset'), {
      target: { value: 'vocal-opto' },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as AdvancedCompressorSettings;
    expect(next.mode).toBe('opto');
    expect(next.threshold).toBe(-22);
    expect(next.ratio).toBe(4);
  });

  it('ignores an unknown preset id', () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText('Compressor preset'), {
      target: { value: 'no-such-preset' },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('toggles auto release', () => {
    renderEditor();
    fireEvent.click(screen.getByLabelText('Auto release'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ autoRelease: true }));
  });
});

describe('AdvancedCompEditor meter loop', () => {
  it('polls gain reduction and keeps the loop alive', () => {
    renderEditor();
    flushFrames(3);
    expect((audioEngine as any).getModuleGainReduction).toHaveBeenCalledWith('comp-1');
    // Proves the draw body itself executed (grid + curve strokes).
    expect(mockCtx.clearRect).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();
    expect(mockCtx.fillText).toHaveBeenCalled();
    expect(rafQueue.length).toBeGreaterThan(0);
  });

  it('handles a null gain-reduction reading', () => {
    (audioEngine as any).getModuleGainReduction = vi.fn(() => null);
    renderEditor();
    expect(() => flushFrames(2)).not.toThrow();
  });

  it('re-queues when the meter has no size yet', () => {
    (Element.prototype.getBoundingClientRect as any).mockReturnValue({
      width: 0,
      height: 0,
    } as DOMRect);
    renderEditor();
    flushFrames(2);
    expect(rafQueue.length).toBeGreaterThan(0);
  });

  it('stops drawing when no 2d context is available', () => {
    (HTMLCanvasElement.prototype.getContext as any).mockReturnValue(null);
    renderEditor();
    expect(() => flushFrames(2)).not.toThrow();
  });

  it('pauses when scrolled out of view and resumes when visible', () => {
    renderEditor();
    expect(ioCallbacks).toHaveLength(1);
    const cancel = vi.mocked(window.cancelAnimationFrame);
    cancel.mockClear();
    act(() => {
      ioCallbacks[0]([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    flushFrames(1);
    // The queued draw ran while invisible and cancelled its own handle.
    expect(cancel).toHaveBeenCalled();
    expect(() => flushFrames(2)).not.toThrow();
    act(() => {
      ioCallbacks[0]([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(() => flushFrames(2)).not.toThrow();
  });

  it('re-measures the meter when the container resizes', () => {
    renderEditor();
    expect(MockResizeObserver.instances).toHaveLength(1);
    mockCtx.clearRect.mockClear();
    act(() => {
      MockResizeObserver.instances[0].callback([], {} as ResizeObserver);
    });
    flushFrames(1);
    expect(mockCtx.clearRect).toHaveBeenCalled();
  });

  it('cleans up observers and the loop on unmount', () => {
    const { unmount } = renderEditor();
    flushFrames(1);
    unmount();
    expect(vi.mocked(window.cancelAnimationFrame)).toHaveBeenCalled();
  });
});
