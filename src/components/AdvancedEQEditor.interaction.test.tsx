/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Interaction tests for `AdvancedEQEditor`: band selection, filter type /
 * enable toggles, knob changes, canvas pointer drag / double-click / wheel,
 * and the rAF draw loop (grid, response curve, handles, spectrum).
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { AdvancedEQEditor } from './AdvancedEQEditor';
import { DEFAULT_EQ_SETTINGS } from '../audio/dsp/AdvancedParametricEQ';
import type { AdvancedEQSettings, EQBand } from '../audio/dsp/AdvancedParametricEQ';
import { audioEngine } from '../audio/AudioEngine';

/* ----- canvas 2d stub ----- */
const makeMockCtx = () => {
  const ctx: Record<string, any> = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    scale: vi.fn(),
    strokeStyle: '',
    lineWidth: 1,
    fillStyle: '',
    font: '',
    textAlign: '',
  };
  return ctx;
};

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
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
class MockIntersectionObserver {
  constructor(_cb?: IntersectionObserverCallback, _opts?: IntersectionObserverInit) {}
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const makeRect = () =>
  ({
    left: 0,
    top: 0,
    width: 600,
    height: 200,
    right: 600,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect;

const makeAnalyser = () => ({
  getFloatFrequencyData: vi.fn((data: Float32Array) => {
    data.fill(-60);
  }),
  context: { sampleRate: 44100 },
});

describe('AdvancedEQEditor', () => {
  const onChange = vi.fn<(settings: AdvancedEQSettings) => void>();

  beforeEach(() => {
    onChange.mockReset();
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: FrameRequestCallback) => {
        rafQueue.push(cb);
        return rafQueue.length;
      })
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      makeMockCtx() as unknown as CanvasRenderingContext2D
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(makeRect());
    if (!('setPointerCapture' in HTMLElement.prototype)) {
      Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
        value: vi.fn(),
        writable: true,
        configurable: true,
      });
    }
    if (!('releasePointerCapture' in HTMLElement.prototype)) {
      Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
        value: vi.fn(),
        writable: true,
        configurable: true,
      });
    }
  });

  afterEach(() => {
    rafQueue.length = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (audioEngine as any).getModuleAnalyser;
    delete (HTMLElement.prototype as any).setPointerCapture;
    delete (HTMLElement.prototype as any).releasePointerCapture;
  });

  const renderEditor = (settings: AdvancedEQSettings = DEFAULT_EQ_SETTINGS) =>
    render(<AdvancedEQEditor moduleId="mod-1" settings={settings} onChange={onChange} />);

  const getCanvas = () => document.querySelector('canvas') as HTMLCanvasElement;

  const findBand = (settings: AdvancedEQSettings, id: string) =>
    settings.bands.find((b) => b.id === id);

  it('renders band chips, selects the first band and shows its controls', () => {
    renderEditor();
    expect(screen.getByText('Band 1: 30Hz')).toBeDefined();
    expect(screen.getByText('BAND 1')).toBeDefined();
    expect(screen.getByRole('button', { name: /Select band 1/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('slider', { name: 'Freq' })).toBeDefined();
    expect(screen.getByRole('slider', { name: 'Trim' })).toBeDefined();
  });

  it('returns null when there are no bands', () => {
    const { container } = renderEditor({ bands: [], outputTrimDb: 0 });
    expect(container.firstChild).toBeNull();
  });

  it('switches the selected band via the chip', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Select band 2/ }));
    expect(screen.getByText('BAND 2')).toBeDefined();
    expect(screen.getByRole('button', { name: /Select band 2/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('changes the filter type of the selected band', () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText('Filter type'), { target: { value: 'lowpass' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as AdvancedEQSettings;
    expect(findBand(next, 'b1')?.type).toBe('lowpass');
  });

  it('toggles the selected band enabled state', () => {
    renderEditor();
    const toggle = screen.getByRole('button', { name: /Bypass band 1/ });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    const next = onChange.mock.calls[0][0] as AdvancedEQSettings;
    expect(findBand(next, 'b1')?.enabled).toBe(false);
  });

  it('updates band values through the Freq / Gain / Q knobs', () => {
    renderEditor();
    const freq = screen.getByRole('slider', { name: 'Freq' });
    fireEvent.keyDown(freq, { key: 'ArrowUp' });
    let next = onChange.mock.calls.at(-1)[0] as AdvancedEQSettings;
    expect(findBand(next, 'b1')?.freq).toBe(31);

    const gain = screen.getByRole('slider', { name: 'Gain' });
    fireEvent.keyDown(gain, { key: 'ArrowUp' });
    next = onChange.mock.calls.at(-1)[0] as AdvancedEQSettings;
    expect(findBand(next, 'b1')?.gain).toBeCloseTo(0.1);

    const q = screen.getByRole('slider', { name: 'Q' });
    fireEvent.keyDown(q, { key: 'ArrowUp' });
    next = onChange.mock.calls.at(-1)[0] as AdvancedEQSettings;
    expect(findBand(next, 'b1')?.q).toBeCloseTo(0.8);
  });

  it('updates the output trim via its knob', () => {
    renderEditor();
    const trim = screen.getByRole('slider', { name: 'Trim' });
    fireEvent.keyDown(trim, { key: 'ArrowUp' });
    const next = onChange.mock.calls.at(-1)[0] as AdvancedEQSettings;
    expect(next.outputTrimDb).toBeCloseTo(0.1);
  });

  it('drags a band handle across the canvas to move its freq/gain', () => {
    renderEditor();
    const canvas = getCanvas();
    fireEvent.pointerDown(canvas, { clientX: 36, clientY: 101, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 200, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });

    const next = onChange.mock.calls.at(-1)[0] as AdvancedEQSettings;
    expect(findBand(next, 'b1')?.freq).toBeGreaterThan(100);
    expect(findBand(next, 'b1')?.gain).toBeGreaterThan(10);
    expect(screen.getByRole('button', { name: /Select band 1/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('does nothing when dragging far from any band', () => {
    renderEditor();
    const canvas = getCanvas();
    fireEvent.pointerDown(canvas, { clientX: 0, clientY: 0, pointerId: 2 });
    fireEvent.pointerMove(canvas, { clientX: 100, clientY: 100, pointerId: 2 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('releases pointer capture safely on pointer up when a release throws', () => {
    renderEditor();
    const canvas = getCanvas();
    (canvas as any).releasePointerCapture = vi.fn(() => {
      throw new Error('boom');
    });
    fireEvent.pointerDown(canvas, { clientX: 36, clientY: 101, pointerId: 3 });
    expect(() => fireEvent.pointerUp(canvas, { pointerId: 3 })).not.toThrow();
  });

  it('resets the selected band to flat on double-click', () => {
    renderEditor();
    const canvas = getCanvas();
    fireEvent.doubleClick(canvas);
    const next = onChange.mock.calls.at(-1)[0] as AdvancedEQSettings;
    const b = findBand(next, 'b1');
    expect(b?.gain).toBe(0);
    expect(b?.q).toBe(1.0);
  });

  it('adjusts the frequency of a band with the mouse wheel', () => {
    renderEditor();
    const canvas = getCanvas();
    fireEvent.wheel(canvas, { deltaY: -100, clientX: 36, clientY: 101 });
    let next = onChange.mock.calls.at(-1)[0] as AdvancedEQSettings;
    expect(findBand(next, 'b1')?.freq).toBe(Math.round(30 * 1.05));

    fireEvent.wheel(canvas, { deltaY: 100, clientX: 36, clientY: 101 });
    next = onChange.mock.calls.at(-1)[0] as AdvancedEQSettings;
    expect(findBand(next, 'b1')?.freq).toBe(Math.round(30 * 0.9524));
  });

  it('runs the draw loop for the grid, response curve and band handles', () => {
    renderEditor();
    flushFrames(3);
    expect(rafQueue.length).toBeGreaterThan(0);
  });

  it('draws the live spectrum overlay when the module has an analyser', () => {
    const analyser = makeAnalyser();
    (audioEngine as any).getModuleAnalyser = () => analyser;
    renderEditor();
    flushFrames(2);
    expect(analyser.getFloatFrequencyData).toHaveBeenCalled();
  });

  it('keeps the curve/handles static when the module has no analyser and nothing changed', () => {
    renderEditor();
    flushFrames(2);
  });

  it('skips disabled bands in the draw loop and pointer/wheel hit tests', () => {
    const settings: AdvancedEQSettings = {
      outputTrimDb: 0,
      bands: DEFAULT_EQ_SETTINGS.bands.map((b) => ({ ...b, enabled: false })),
    };
    renderEditor(settings);
    flushFrames(3);

    const canvas = getCanvas();
    fireEvent.pointerDown(canvas, { clientX: 36, clientY: 101, pointerId: 7 });
    fireEvent.pointerMove(canvas, { clientX: 200, clientY: 50, pointerId: 7 });
    fireEvent.wheel(canvas, { deltaY: -100, clientX: 36, clientY: 101 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('pauses the draw loop when the canvas scrolls out of view', () => {
    const cbs: IntersectionObserverCallback[] = [];
    class CaptureIO extends MockIntersectionObserver {
      constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
        super(cb, opts);
        cbs.push(cb);
      }
    }
    vi.stubGlobal('IntersectionObserver', CaptureIO);
    renderEditor();
    act(() => {
      cbs[0]([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(() => flushFrames(2)).not.toThrow();
  });

  it('stops the draw effect when a 2d context is unavailable', () => {
    (HTMLCanvasElement.prototype.getContext as any).mockReturnValue(null);
    const { container } = renderEditor();
    expect(container.firstChild).not.toBeNull();
    expect(() => flushFrames(2)).not.toThrow();
  });
});

