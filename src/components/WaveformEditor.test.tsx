/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the wavesurfer-backed `WaveformEditor` — instance lifecycle,
 * crop-region wiring, external selection sync, playhead sync and mode/zoom.
 * wavesurfer and its plugins are mocked so the test drives the callbacks
 * deterministically.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WaveformEditor } from './WaveformEditor';

const h = vi.hoisted(() => {
  const region = { start: 0, end: 10, on: vi.fn(), setOptions: vi.fn() };
  const addRegion = vi.fn(() => region);
  const instances: any[] = [];
  return { region, addRegion, instances };
});

vi.mock('wavesurfer.js', () => ({
  default: {
    create: (opts: unknown) => {
      const inst: any = {
        opts,
        loadBlob: vi.fn(() => Promise.resolve()),
        once: vi.fn((_ev: string, cb: () => void) => {
          inst.readyCb = cb;
        }),
        on: vi.fn(),
        getDuration: vi.fn(() => 10),
        setTime: vi.fn(),
        destroy: vi.fn(),
      };
      h.instances.push(inst);
      return inst;
    },
  },
}));

vi.mock('wavesurfer.js/dist/plugins/regions', () => ({
  default: { create: () => ({ addRegion: h.addRegion }) },
  RegionsPlugin: { create: () => ({ addRegion: h.addRegion }) },
  Region: class Region {},
}));
vi.mock('wavesurfer.js/dist/plugins/timeline', () => ({ default: { create: () => ({}) } }));
vi.mock('wavesurfer.js/dist/plugins/spectrogram', () => ({ default: { create: () => ({}) } }));
vi.mock('wavesurfer.js/dist/plugins/minimap', () => ({ default: { create: () => ({}) } }));

const makeBuffer = () =>
  ({
    numberOfChannels: 1,
    length: 4410,
    sampleRate: 44100,
    duration: 10,
    getChannelData: () => new Float32Array(4410),
  }) as unknown as AudioBuffer;

const renderEditor = (over: Record<string, unknown> = {}) => {
  const onSelectionChange = vi.fn();
  const result = render(
    <WaveformEditor
      buffer={makeBuffer()}
      selectionStart={0}
      selectionEnd={1}
      onSelectionChange={onSelectionChange}
      {...over}
    />,
  );
  return { ...result, onSelectionChange };
};

describe('WaveformEditor', () => {
  beforeEach(() => {
    h.instances.length = 0;
    h.addRegion.mockClear();
    h.region.on.mockClear();
    h.region.setOptions.mockClear();
    h.region.start = 0;
    h.region.end = 10;
  });

  it('prompts when there is no buffer', () => {
    render(<WaveformEditor buffer={null} selectionStart={0} selectionEnd={1} onSelectionChange={vi.fn()} />);
    expect(screen.getByText(/No audio buffer to display/i)).toBeDefined();
    expect(h.instances).toHaveLength(0);
  });

  it('creates a wavesurfer instance and shows the duration', () => {
    renderEditor();
    expect(h.instances).toHaveLength(1);
    expect(screen.getByText(/10\.00s/)).toBeDefined();
  });

  it('adds the crop region on ready and reports normalized selections', () => {
    const { onSelectionChange } = renderEditor();
    const ws = h.instances[0];
    act(() => ws.readyCb());

    expect(h.addRegion).toHaveBeenCalled();
    const updateCb = h.region.on.mock.calls[0][1];
    h.region.start = 1;
    h.region.end = 5;
    act(() => updateCb());
    expect(onSelectionChange).toHaveBeenCalledWith(0.1, 0.5);
  });

  it('syncs the region when the selection prop changes externally', () => {
    const buf = makeBuffer();
    const { rerender } = render(
      <WaveformEditor buffer={buf} selectionStart={0} selectionEnd={1} onSelectionChange={vi.fn()} />,
    );
    act(() => h.instances[0].readyCb());

    rerender(
      <WaveformEditor buffer={buf} selectionStart={0} selectionEnd={0.5} onSelectionChange={vi.fn()} />,
    );
    expect(h.region.setOptions).toHaveBeenCalled();
  });

  it('syncs the playhead from the playbackTime prop', () => {
    const { rerender } = renderEditor();
    rerender(
      <WaveformEditor
        buffer={makeBuffer()}
        selectionStart={0}
        selectionEnd={1}
        onSelectionChange={vi.fn()}
        playbackTime={3}
      />,
    );
    expect(h.instances[h.instances.length - 1].setTime).toHaveBeenCalledWith(3);
  });

  it('recreates the instance when switching mode or zooming', () => {
    renderEditor();
    expect(h.instances).toHaveLength(1);

    fireEvent.click(screen.getAllByText('spectrogram')[0]);
    expect(h.instances.length).toBeGreaterThan(1);

    const before = h.instances.length;
    fireEvent.click(screen.getByTitle('Zoom in'));
    expect(h.instances.length).toBeGreaterThan(before);
  });

  it('exposes precision zoom controls and a live readout', () => {
    renderEditor();
    expect(screen.getByTitle('Fit to width')).toBeDefined();
    expect(screen.getByTitle('Zoom to selection')).toBeDefined();
    expect(screen.getByLabelText('Zoom')).toBeDefined();
    expect(screen.getByLabelText('Amplitude zoom')).toBeDefined();
    expect(screen.getByText('1.0×')).toBeDefined();

    fireEvent.click(screen.getByTitle('Zoom in'));
    expect(screen.getByText('2.0×')).toBeDefined();
    fireEvent.click(screen.getByTitle('Zoom out'));
    expect(screen.getByText('1.0×')).toBeDefined();
  });

  it('fits to width and zooms to the current selection', () => {
    const widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
    render(
      <WaveformEditor buffer={makeBuffer()} selectionStart={0} selectionEnd={0.5} onSelectionChange={vi.fn()} />,
    );
    // whole 10s buffer in 600px => 600 / (16 * 10) = 3.75
    fireEvent.click(screen.getByTitle('Fit to width'));
    expect(screen.getByText('3.8×')).toBeDefined();
    // 5s selection in 600px => 600 / (16 * 5) = 7.5
    fireEvent.click(screen.getByTitle('Zoom to selection'));
    expect(screen.getByText('7.5×')).toBeDefined();
    widthSpy.mockRestore();
  });

  it('responds to the zoom and amplitude sliders', () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText('Zoom'), { target: { value: '3' } });
    expect(screen.getByText('8.0×')).toBeDefined();

    const before = h.instances.length;
    fireEvent.change(screen.getByLabelText('Amplitude zoom'), { target: { value: '2' } });
    expect(h.instances.length).toBeGreaterThan(before);
  });

  it('destroys the wavesurfer instance on unmount', () => {
    const { unmount } = renderEditor();
    const ws = h.instances[0];
    unmount();
    expect(ws.destroy).toHaveBeenCalled();
  });
});
