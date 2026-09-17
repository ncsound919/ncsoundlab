/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for the MPD226-framed sampler unit: the full-width screen hosts the
 * waveform editor, the chassis/branding render, and the decorative control
 * surface is present.
 */

import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SamplerUnit } from './SamplerUnit';
import { useSamplerStore } from '../../store/samplerStore';
import { audioEngine } from '../../lib/audioEngine';

vi.mock('wavesurfer.js', () => ({
  default: {
    create: () => ({
      loadBlob: vi.fn(() => Promise.resolve()),
      once: vi.fn(),
      on: vi.fn(),
      getDuration: vi.fn(() => 10),
      setTime: vi.fn(),
      destroy: vi.fn(),
    }),
  },
}));
vi.mock('wavesurfer.js/dist/plugins/regions', () => ({
  default: { create: () => ({ addRegion: vi.fn(() => ({ on: vi.fn(), setOptions: vi.fn() })) }) },
  RegionsPlugin: { create: () => ({ addRegion: vi.fn(() => ({ on: vi.fn(), setOptions: vi.fn() })) }) },
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

describe('SamplerUnit', () => {
  beforeEach(() => {
    useSamplerStore.getState().clearBridge();
  });

  it('renders the MPD226 chassis with a full-width screen', () => {
    const { container } = render(
      <SamplerUnit buffer={makeBuffer()} selectionStart={0} selectionEnd={1} onSelectionChange={vi.fn()} layerName="Kick 808" />
    );
    expect(container.querySelector('[data-sampler-unit]')).toBeTruthy();
    expect(container.querySelector('[data-sampler-screen]')).toBeTruthy();
    expect(screen.getByText('AKAI')).toBeTruthy();
    expect(screen.getByText('MPD226')).toBeTruthy();
    expect(screen.getByText(/Sample Editor · Kick 808/)).toBeTruthy();
    // The waveform editor is mounted inside the screen.
    expect(container.querySelector('[data-waveform-editor]')).toBeTruthy();
  });

  it('shows the empty state when there is no buffer', () => {
    render(<SamplerUnit buffer={null} selectionStart={0} selectionEnd={1} onSelectionChange={vi.fn()} />);
    expect(screen.getByText(/No audio buffer to display/i)).toBeTruthy();
  });

  it('registers a bridge that drives the editor and runs DSP', () => {
    const onApplyEffect = vi.fn();
    const onSelectionChange = vi.fn();
    render(
      <SamplerUnit
        buffer={makeBuffer()}
        selectionStart={0}
        selectionEnd={0.5}
        onSelectionChange={onSelectionChange}
        layerName="Kick"
        onApplyEffect={onApplyEffect}
      />
    );
    const bridge = useSamplerStore.getState().bridge;
    expect(bridge).toBeTruthy();
    expect(useSamplerStore.getState().layerName).toBe('Kick');

    bridge!.reverse();
    bridge!.fadeOut();
    expect(onApplyEffect).toHaveBeenCalledWith('reverse');
    expect(onApplyEffect).toHaveBeenCalledWith('fadeout');

    act(() => bridge!.setParam('selStart', 0.25));
    expect(onSelectionChange).toHaveBeenCalled();

    act(() => {
      bridge!.setParam('zoom', 8);
      bridge!.setParam('amp', 2);
      bridge!.setParam('pitch', 3);
      bridge!.setParam('gain', 0.5);
      bridge!.setParam('selEnd', 0.9);
      bridge!.setParam('selLength', 0.2);
      bridge!.setParam('selCenter', 0.5);
    });
    expect(screen.getByText('8.0×')).toBeTruthy();

    // These need a real audio context — they must stay safe (no-op) without one.
    expect(() => bridge!.pad(3, 0.9)).not.toThrow();
    expect(() => bridge!.preview()).not.toThrow();
    expect(() => bridge!.stop()).not.toThrow();
    expect(() => bridge!.invert()).not.toThrow();
    expect(() => bridge!.normalize()).not.toThrow();
    expect(() => bridge!.crop()).not.toThrow();
    expect(() => bridge!.fadeIn()).not.toThrow();
    expect(() => bridge!.glitch()).not.toThrow();
  });

  it('clears its bridge on unmount', () => {
    const { unmount } = render(
      <SamplerUnit buffer={makeBuffer()} selectionStart={0} selectionEnd={1} onSelectionChange={vi.fn()} />
    );
    expect(useSamplerStore.getState().bridge).toBeTruthy();
    unmount();
    expect(useSamplerStore.getState().bridge).toBeNull();
  });

  it('previews the selection region, not the whole buffer', () => {
    const fakeSrc = {
      buffer: null,
      playbackRate: { value: 1 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const fakeCtx = {
      createBufferSource: vi.fn(() => fakeSrc),
      createGain: vi.fn(() => ({ gain: { value: 0 }, connect: vi.fn() })),
      destination: {},
    };
    const spy = vi.spyOn(audioEngine, 'getContext').mockReturnValue(fakeCtx as never);
    try {
      render(<SamplerUnit buffer={makeBuffer()} selectionStart={0.25} selectionEnd={0.5} onSelectionChange={vi.fn()} />);
      act(() => {
        useSamplerStore.getState().bridge!.preview();
      });
      // Buffer duration is 10s: selection 0.25..0.5 → start at 2.5s for 2.5s.
      expect(fakeSrc.start).toHaveBeenCalledWith(0, 2.5, 2.5);
    } finally {
      spy.mockRestore();
    }
  });
});
