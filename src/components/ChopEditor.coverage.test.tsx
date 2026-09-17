/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Extra coverage for `ChopEditor`: transport toggle, wavesurfer event
 * callbacks, mode/zoom re-creation, equal/tap/smart slicing, marker dragging,
 * precision nudging and the per-slice metadata controls + send-to-pads paths.
 *
 * wavesurfer is mocked with a single mutable instance so the `on(...)` handlers
 * can be captured and fired directly. TimeStretch + the slice-region extractor
 * are stubbed (their real DSP/WebAudio paths are covered elsewhere); the pure
 * `slicesFromMarkers` / `autoMarkers` logic stays real.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => {
  const wsInstance = {
    on: vi.fn(),
    un: vi.fn(),
    loadBlob: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    isPlaying: vi.fn(() => false),
    getCurrentTime: vi.fn(() => 0.5),
    setTime: vi.fn(),
    zoom: vi.fn(),
    clearRegions: vi.fn(),
    addRegion: vi.fn(),
    setVolume: vi.fn(),
  };
  const create = vi.fn(() => wsInstance);
  const triggerLayer = vi.fn();
  return { wsInstance, create, triggerLayer };
});

vi.mock('wavesurfer.js', () => ({ default: { create: h.create } }));
vi.mock('wavesurfer.js/dist/plugins/timeline', () => ({ default: { create: vi.fn(() => ({})) } }));
vi.mock('wavesurfer.js/dist/plugins/spectrogram', () => ({ default: { create: vi.fn(() => ({})) } }));
vi.mock('wavesurfer.js/dist/plugins/minimap', () => ({ default: { create: vi.fn(() => ({})) } }));

vi.mock('../lib/audioEngine', () => ({
  audioEngine: { triggerLayer: h.triggerLayer, getContext: vi.fn(() => ({})) },
}));

vi.mock('../audio/dsp/TimeStretch', () => ({
  stretchSampleBuffer: vi.fn(() => ({ buffer: {}, timeFactor: 1, pitchSemitones: 0 })),
}));

vi.mock('../audio/onsetDetection', () => ({
  detectOnsets: vi.fn(() => [{ time: 0.01, strength: 1, sampleIndex: 100 }]),
}));

vi.mock('../lib/chopLogic', async (importOriginal: () => Promise<Record<string, unknown>>) => {
  const actual = await importOriginal();
  return { ...actual, sliceRegion: vi.fn(() => ({})) };
});

import { ChopEditor } from './ChopEditor';

const makeBuffer = (): AudioBuffer => {
  // A pulse every 256 samples gives autoMarkers/onset something to chew on.
  const data = Float32Array.from({ length: 2048 }, (_, i) => (i % 256 === 0 ? 0.8 : 0.05));
  return {
    length: data.length,
    sampleRate: 44100,
    duration: data.length / 44100,
    numberOfChannels: 1,
    getChannelData: () => data,
    copyToChannel: vi.fn(),
    copyFromChannel: vi.fn(),
  } as unknown as AudioBuffer;
};

const renderEditor = () => {
  const onSendToPads = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <ChopEditor
      buffer={makeBuffer()}
      fileName="break.wav"
      defaultCount={4}
      onSendToPads={onSendToPads}
      onClose={onClose}
    />,
  );
  return { onSendToPads, onClose, ...utils };
};

const markerNodes = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.cursor-ew-resize')) as HTMLElement[];

const padButtons = (container: HTMLElement) =>
  (Array.from(container.querySelectorAll('button')) as HTMLElement[]).filter((b) =>
    b.className.includes('aspect-square'),
  );

const eventHandler = (name: string) => {
  const call = h.wsInstance.on.mock.calls.find((c) => c[0] === name);
  if (!call) throw new Error(`no handler registered for ${name}`);
  return call[1] as (...args: unknown[]) => void;
};

describe('ChopEditor coverage', () => {
  beforeEach(() => {
    h.create.mockClear();
    h.triggerLayer.mockClear();
    Object.values(h.wsInstance).forEach((fn) => fn.mockClear());
    h.wsInstance.isPlaying.mockReturnValue(false);
    h.wsInstance.getCurrentTime.mockReturnValue(0.5);

    Element.prototype.setPointerCapture = vi.fn() as never;
    Element.prototype.releasePointerCapture = vi.fn() as never;
    Element.prototype.getBoundingClientRect = vi.fn(
      () =>
        ({ left: 0, top: 0, right: 500, bottom: 100, width: 500, height: 100, x: 0, y: 0 }) as DOMRect,
    ) as never;
  });

  it('toggles play and stop from the transport button', () => {
    renderEditor();
    const btn = screen.getByRole('button', { name: /Play Sample/ });
    fireEvent.click(btn);
    expect(h.wsInstance.play).toHaveBeenCalledTimes(1);
    expect(h.wsInstance.pause).not.toHaveBeenCalled();

    h.wsInstance.isPlaying.mockReturnValue(true);
    fireEvent.click(btn);
    expect(h.wsInstance.pause).toHaveBeenCalledTimes(1);
  });

  it('fires the captured wavesurfer event callbacks', () => {
    renderEditor();

    act(() => eventHandler('play')());
    expect(screen.getByRole('button', { name: /Stop/ })).toBeDefined();

    act(() => eventHandler('timeupdate')(1.23));
    expect(screen.getByText(/time 1\.23s/)).toBeDefined();

    h.wsInstance.getCurrentTime.mockReturnValue(0.75);
    act(() => eventHandler('interaction')());
    expect(h.wsInstance.getCurrentTime).toHaveBeenCalled();
    expect(screen.getByText(/time 0\.75s/)).toBeDefined();

    act(() => eventHandler('pause')());
    expect(screen.getByRole('button', { name: /Play Sample/ })).toBeDefined();
  });

  it('recreates wavesurfer on mode and zoom changes', () => {
    renderEditor();
    expect(h.create).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'spectrogram' }));
    expect(h.create).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'waveform' }));
    expect(h.create).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByTitle('Zoom in'));
    expect(h.create).toHaveBeenCalledTimes(4);

    fireEvent.click(screen.getByTitle('Zoom out'));
    expect(h.create).toHaveBeenCalledTimes(5);
  });

  it('runs the smart, onset and clear slicing actions', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Smart/ }));
    fireEvent.click(screen.getByRole('button', { name: /Onset/ }));
    expect(screen.getByText(/markers:/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Clear/ }));
    expect(screen.getByText(/1 slices/)).toBeDefined();
  });

  it('equal slicing produces pad rows and the header slice count', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Equal/ }));
    expect(screen.getByText(/4 slices/)).toBeDefined();
    expect(screen.getByText('PAD 01')).toBeDefined();
    expect(screen.getByText('PAD 04')).toBeDefined();
  });

  it('drops a marker from a tap pad only while tap mode is on', () => {
    const { container } = renderEditor();
    const pads = padButtons(container);
    expect(pads).toHaveLength(16);

    // Tap mode off -> early return, no marker added.
    fireEvent.pointerDown(pads[0], { pointerId: 1 });
    expect(screen.getByText('markers: 0')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Tap to Chop/ }));
    // The buffer is ~0.046s long, so keep tap times inside it.
    h.wsInstance.getCurrentTime.mockReturnValue(0.01);
    fireEvent.pointerDown(pads[0], { pointerId: 2 });
    expect(screen.getByText('markers: 1')).toBeDefined();
    expect(screen.getByText(/2 slices/)).toBeDefined();

    h.wsInstance.getCurrentTime.mockReturnValue(0.03);
    fireEvent.pointerDown(pads[1], { pointerId: 3 });
    expect(screen.getByText('markers: 2')).toBeDefined();
    expect(screen.getByText(/3 slices/)).toBeDefined();
  });

  it('drags a marker and removes one on double-click', () => {
    const { container } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Equal/ }));
    expect(markerNodes(container)).toHaveLength(3);

    const first = markerNodes(container)[0];
    fireEvent.pointerDown(first, { pointerId: 1, clientX: 250 });
    fireEvent.pointerMove(first, { pointerId: 1, clientX: 300 });
    fireEvent.pointerUp(first, { pointerId: 1 });
    expect(screen.getByText(/Marker 1/)).toBeDefined();

    // A move without a preceding drag-down is a no-op.
    fireEvent.pointerMove(markerNodes(container)[0], { pointerId: 9, clientX: 10 });

    fireEvent.doubleClick(markerNodes(container)[0]);
    expect(markerNodes(container)).toHaveLength(2);
  });

  it('nudges the selected marker and edits its position/removal', () => {
    const { container } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Equal/ }));
    fireEvent.pointerDown(markerNodes(container)[0], { pointerId: 1 });

    for (const name of ['-1ms', '-10ms', '-100ms', '+1ms', '+10ms', '+100ms']) {
      fireEvent.click(screen.getByRole('button', { name }));
    }
    fireEvent.change(screen.getByLabelText('Marker position %'), { target: { value: '40' } });
    expect(screen.getByText('40%')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
    expect(screen.queryByText(/Marker 1/)).toBeNull();
  });

  it('auditions slices and edits the per-slice metadata', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Equal/ }));

    fireEvent.click(screen.getAllByTitle('Audition slice')[0]);
    expect(h.triggerLayer).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Slice 1 name'), { target: { value: 'KICK' } });
    expect((screen.getByLabelText('Slice 1 name') as HTMLInputElement).value).toBe('KICK');

    fireEvent.change(screen.getAllByLabelText('Root key')[0], { target: { value: 'D' } });
    expect((screen.getAllByLabelText('Root key')[0] as HTMLSelectElement).value).toBe('D');

    fireEvent.change(screen.getByLabelText('Slice 1 gain'), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText('Slice 1 tune'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Slice 1 time stretch'), { target: { value: '1.5' } });
    expect(screen.getByText('+5st')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Slice 1 tune'), { target: { value: '-3' } });
    expect(screen.getByText('-3st')).toBeDefined();

    fireEvent.click(screen.getAllByTitle('Select slice boundary')[1]);
    expect(screen.getByText(/Marker 2/)).toBeDefined();
  });

  it('sends named slices to the pads', () => {
    const { onSendToPads } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Equal/ }));
    fireEvent.click(screen.getByRole('button', { name: /Send Slices/ }));

    expect(onSendToPads).toHaveBeenCalledTimes(1);
    const sounds = onSendToPads.mock.calls[0][0];
    expect(sounds).toHaveLength(4);
    expect(sounds[0].name).toBe('BREAK_CHOP_01');
    expect(sounds[3].name).toBe('BREAK_CHOP_04');
    expect(sounds[0].start).toBeCloseTo(0);
    expect(sounds[3].end).toBeCloseTo(1);
  });

  it('routes stretched slices through the DSP path before sending', () => {
    const { onSendToPads } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Equal/ }));
    fireEvent.change(screen.getByLabelText('Slice 1 time stretch'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: /Send Slices/ }));

    const sounds = onSendToPads.mock.calls[0][0];
    expect(sounds[0].start).toBe(0);
    expect(sounds[0].end).toBe(1);
    expect(sounds[0].buffer).toEqual({});
  });

  it('closes the editor', () => {
    const { onClose } = renderEditor();
    fireEvent.click(screen.getByTitle('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('warns when the waveform blob fails to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    h.wsInstance.loadBlob.mockRejectedValueOnce(new Error('decode failed'));
    renderEditor();
    await waitFor(() => expect(warn).toHaveBeenCalledWith('Chop editor waveform load failed:', expect.any(Error)));
    warn.mockRestore();
  });
});
