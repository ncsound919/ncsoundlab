/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coverage for `src/components/editors/ReverbUI.tsx` (convolution reverb
 * designer), previously at ~1%: preset helpers, category/preset selection,
 * every DSP knob, mode/reverse toggles, character/tone branches, the canvas
 * visualizer loop, and custom-IR upload.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ReverbUI } from './ReverbUI';
import { CONVOLUTION_REVERB_PRESETS } from '../../lib/convolutionAndTapePresets';
import { audioEngine } from '../../lib/audioEngine';

const DEFAULT_PRESET = CONVOLUTION_REVERB_PRESETS[0];

const makeMockCtx = () => {
  const gradient = { addColorStop: vi.fn() };
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    createRadialGradient: vi.fn(() => gradient),
  };
};

/** Shared canvas ctx double, so tests can prove the draw body executed. */
let mockCtx: ReturnType<typeof makeMockCtx>;

const rafQueue: FrameRequestCallback[] = [];
const flushFrames = (count: number) => {
  act(() => {
    for (let i = 0; i < count; i++) {
      const cb = rafQueue.shift();
      if (!cb) break;
      cb(16);
    }
  });
};

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const onChange = vi.fn<(s: any) => void>();

beforeEach(() => {
  onChange.mockReset();
  mockCtx = makeMockCtx();
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
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
  // NOTE: the visualizer measures its wrapper DIV, not the canvas — stub
  // Element, not HTMLCanvasElement, or the loop reads 0x0 forever.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 600,
    height: 280,
  } as DOMRect);
});

afterEach(() => {
  rafQueue.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const renderUI = (settings: any = {}) => render(<ReverbUI settings={settings} onChange={onChange} />);

function turnKnob(label: string): any {
  fireEvent.keyDown(screen.getByRole('slider', { name: label }), { key: 'ArrowUp' });
  expect(onChange).toHaveBeenCalled();
  const next = onChange.mock.calls.at(-1)[0];
  onChange.mockClear();
  return next;
}

describe('ReverbUI chrome', () => {
  it('renders the header, default preset badges and profile meters', () => {
    renderUI();
    expect(screen.getByText('Convolution Reverb')).toBeDefined();
    // The category appears in the badge, the filter buttons and the cards.
    expect(screen.getAllByText(DEFAULT_PRESET.category).length).toBeGreaterThan(0);
    expect(screen.getByText('Space Profile')).toBeDefined();
    expect(screen.getByText('Tail Length')).toBeDefined();
    expect(screen.getByText('DSP Chain')).toBeDefined();
    expect(screen.getByText('Preset Browser')).toBeDefined();
  });

  it('shows the Reverse IR badge only for reversed presets', () => {
    const reversed = CONVOLUTION_REVERB_PRESETS.find((p) => p.irProcessing.reverse)!;
    expect(reversed).toBeDefined();
    const { unmount } = renderUI({ convolutionPreset: reversed });
    expect(screen.getByText('Reverse IR')).toBeDefined();
    unmount();
    renderUI();
    expect(screen.queryByText('Reverse IR')).toBeNull();
  });

  it('shows the custom IR filename when one is loaded', () => {
    renderUI({ reverbIRUrl: 'hall.wav' });
    expect(screen.getByText('IR: hall.wav')).toBeDefined();
  });

  it('shows Load Custom IR when no IR is loaded', () => {
    renderUI();
    expect(screen.getByText('Load Custom IR')).toBeDefined();
  });
});

describe('ReverbUI preset selection', () => {
  it('filters the browser by category', () => {
    renderUI();
    const total = screen.getByText(/\d+ presets/);
    expect(total.textContent).toContain(`${Math.min(8, CONVOLUTION_REVERB_PRESETS.length)}`);
    fireEvent.click(screen.getByRole('button', { name: 'room' }));
    const roomCount = CONVOLUTION_REVERB_PRESETS.filter((p) => p.category === 'room').length;
    expect(screen.getByText(`${roomCount} presets`)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'all' }));
  });

  // NOTE: the `categoryColorMap[cat] || fallback` fallback is unreachable via
  // the UI — every preset category (room/hall/plate/special/fx) has a map
  // entry — so there is no honest test for it.

  it('selects a preset from the dropdown', () => {
    renderUI();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'game_arena_bowl' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.convolutionPreset.id).toBe('game_arena_bowl');
    expect(next.reverbMix).toBe(Math.round(next.convolutionPreset.mix.wet * 100));
    expect(next.reverbIRUrl).toBeUndefined();
    expect(next.reverbIRBuffer).toBeUndefined();
  });

  it('selects a preset from the browser cards', () => {
    renderUI();
    fireEvent.click(screen.getByText('Bright Plate'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].convolutionPreset.name).toBe('Bright Plate');
  });
});

describe('ReverbUI DSP knobs', () => {
  it('updates pre-EQ through HP Freq and Tilt EQ', () => {
    renderUI();
    const hp = turnKnob('HP Freq');
    expect(hp.convolutionPreset.preEq.hpFreq).toBeGreaterThan(DEFAULT_PRESET.preEq.hpFreq);
    expect(hp.reverbMix).toBe(Math.round(DEFAULT_PRESET.mix.wet * 100));
    const tilt = turnKnob('Tilt EQ');
    expect(tilt.convolutionPreset.preEq.tiltAmount).toBeGreaterThan(
      DEFAULT_PRESET.preEq.tiltAmount,
    );
  });

  it('updates IR processing through Time Warp and IR Low Shelf', () => {
    renderUI();
    const warp = turnKnob('Time Warp');
    expect(warp.convolutionPreset.irProcessing.stretchFactor).toBeGreaterThan(
      DEFAULT_PRESET.irProcessing.stretchFactor,
    );
    const shelf = turnKnob('IR Low Shelf');
    expect(shelf.convolutionPreset.irProcessing.irLowShelfDb).toBeGreaterThan(
      DEFAULT_PRESET.irProcessing.irLowShelfDb,
    );
  });

  it('updates post-EQ through Damp, Presence and Air Boost', () => {
    renderUI();
    const damp = turnKnob('Damp');
    expect(damp.convolutionPreset.postEq.dampingFreq).toBeGreaterThan(
      DEFAULT_PRESET.postEq.dampingFreq,
    );
    const presence = turnKnob('Presence');
    expect(presence.convolutionPreset.postEq.presenceDb).toBeGreaterThan(
      DEFAULT_PRESET.postEq.presenceDb,
    );
    const air = turnKnob('Air Boost');
    expect(air.convolutionPreset.postEq.airDb).toBeGreaterThan(DEFAULT_PRESET.postEq.airDb);
  });

  it('updates the tail through Sat Drive and Tail Mod', () => {
    renderUI();
    const sat = turnKnob('Sat Drive');
    expect(sat.convolutionPreset.nonlinearTail.saturationAmount).toBeGreaterThan(
      DEFAULT_PRESET.nonlinearTail.saturationAmount,
    );
    const mod = turnKnob('Tail Mod');
    expect(mod.convolutionPreset.nonlinearTail.tailModDepth).toBeGreaterThan(
      DEFAULT_PRESET.nonlinearTail.tailModDepth,
    );
  });

  it('updates the blend through Wet Mix, deriving dry from wet', () => {
    renderUI();
    const next = turnKnob('Wet Mix');
    const wet = Math.min(1, Math.round(DEFAULT_PRESET.mix.wet * 100) / 100 + 0.01);
    expect(next.convolutionPreset.mix.wet).toBeCloseTo(wet, 5);
    expect(next.convolutionPreset.mix.dry).toBeCloseTo(Math.min(1, Math.max(0, 1 - wet * 0.5)), 5);
  });
});

describe('ReverbUI toggles and derived labels', () => {
  it('toggles the convolver mode between fullband and multiband', () => {
    renderUI();
    const mode = DEFAULT_PRESET.irProcessing.mode;
    const btn = screen.getByRole('button', { name: mode });
    fireEvent.click(btn);
    const next = onChange.mock.calls[0][0];
    expect(next.convolutionPreset.irProcessing.mode).toBe(
      mode === 'fullband' ? 'multiband' : 'fullband',
    );
  });

  it('toggles reverse on and off', () => {
    renderUI();
    fireEvent.click(screen.getByRole('button', { name: /Disabled/ }));
    expect(onChange.mock.calls[0][0].convolutionPreset.irProcessing.reverse).toBe(
      !DEFAULT_PRESET.irProcessing.reverse,
    );
  });

  it.each([
    { tilt: 0.5, label: 'Brighter feed' },
    { tilt: -0.5, label: 'Darker feed' },
    { tilt: 0, label: 'Balanced feed' },
  ])('shows $label for tilt $tilt', ({ tilt, label }) => {
    const preset = {
      ...DEFAULT_PRESET,
      preEq: { ...DEFAULT_PRESET.preEq, tiltAmount: tilt },
    };
    const { unmount } = renderUI({ convolutionPreset: preset });
    expect(screen.getByText(label)).toBeDefined();
    unmount();
  });

  it.each([
    {
      name: 'bright',
      postEq: { airDb: 12, presenceDb: 6, dampingFreq: 20000 },
      label: 'Bright / open',
    },
    {
      name: 'balanced',
      postEq: { airDb: 0, presenceDb: 0, dampingFreq: 10000 },
      label: 'Balanced',
    },
    {
      name: 'dark',
      postEq: { airDb: -6, presenceDb: -6, dampingFreq: 1000 },
      label: 'Dark / damped',
    },
  ])('summarizes the tone as $label for a $name preset', ({ postEq, label }) => {
    const preset = { ...DEFAULT_PRESET, postEq: { ...DEFAULT_PRESET.postEq, ...postEq } };
    const { unmount } = renderUI({ convolutionPreset: preset });
    expect(screen.getByText(label)).toBeDefined();
    unmount();
  });

  it('formats damping Hz across the Hz/kHz branches', () => {
    for (const [freq, text] of [
      [20000, '20kHz'],
      [5000, '5.0kHz'],
      [800, '800Hz'],
    ] as const) {
      const preset = { ...DEFAULT_PRESET, postEq: { ...DEFAULT_PRESET.postEq, dampingFreq: freq } };
      const { unmount } = renderUI({ convolutionPreset: preset });
      expect(screen.getByText(text)).toBeDefined();
      unmount();
    }
  });
});

describe('ReverbUI visualizer', () => {
  it('runs the draw loop once frames are flushed', () => {
    renderUI();
    flushFrames(3);
    // The draw loop keeps scheduling itself, and actually paints:
    // grid strokes, the filled tail, the motion line, bars, particles, labels.
    expect(rafQueue.length).toBeGreaterThan(0);
    expect(mockCtx.setTransform).toHaveBeenCalled();
    expect(mockCtx.clearRect).toHaveBeenCalled();
    expect(mockCtx.fillRect).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();
    expect(mockCtx.fill).toHaveBeenCalled();
    expect(mockCtx.arc).toHaveBeenCalled();
    expect(mockCtx.fillText).toHaveBeenCalled();
  });

  it('re-queues when the container has no size yet', () => {
    (Element.prototype.getBoundingClientRect as any).mockReturnValue({
      width: 0,
      height: 0,
    } as DOMRect);
    renderUI();
    flushFrames(2);
    expect(rafQueue.length).toBeGreaterThan(0);
  });

  it('re-queues when no 2d context is available', () => {
    (HTMLCanvasElement.prototype.getContext as any).mockReturnValue(null);
    renderUI();
    flushFrames(2);
    expect(rafQueue.length).toBeGreaterThan(0);
  });

  it('draws the reversed tail when the preset is reversed', () => {
    const reversed = CONVOLUTION_REVERB_PRESETS.find((p) => p.irProcessing.reverse)!;
    renderUI({ convolutionPreset: reversed });
    flushFrames(2);
    expect(rafQueue.length).toBeGreaterThan(0);
  });

  it('disconnects the observer and cancels the loop on unmount', () => {
    const { unmount } = renderUI();
    flushFrames(1);
    unmount();
    expect(vi.mocked(window.cancelAnimationFrame)).toHaveBeenCalled();
  });
});

describe('ReverbUI custom IR upload', () => {
  const fileInput = () =>
    document.querySelector('input[type="file"]') as HTMLInputElement;

  it('opens the file picker when the Load Custom IR button is clicked', () => {
    renderUI();
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(screen.getByTitle(/Load Custom IR File/));
    expect(clickSpy).toHaveBeenCalled();
  });

  it('ignores a change event with no file', () => {
    renderUI();
    fireEvent.change(fileInput(), { target: { files: [] } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('loads a custom IR through decodeAudioData', async () => {
    const fakeBuffer = { duration: 1.2 } as unknown as AudioBuffer;
    (audioEngine.getContext as any).mockReturnValue({
      decodeAudioData: vi.fn().mockResolvedValue(fakeBuffer),
    });
    renderUI();
    const file = new File(['ir-bytes'], 'hall.wav', { type: 'audio/wav' });
    await act(async () => {
      fireEvent.change(fileInput(), { target: { files: [file] } });
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.reverbIRUrl).toBe('hall.wav');
    expect(next.reverbIRBuffer).toBe(fakeBuffer);
    expect(next.convolutionPreset.name).toBe('hall.wav');
    expect(next.convolutionPreset.category).toBe('custom');
  });

  it('logs an error when IR decoding fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (audioEngine.getContext as any).mockReturnValue({
      decodeAudioData: vi.fn().mockRejectedValue(new Error('bad ir')),
    });
    renderUI();
    const file = new File(['nope'], 'bad.wav', { type: 'audio/wav' });
    await act(async () => {
      fireEvent.change(fileInput(), { target: { files: [file] } });
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
  });
});
