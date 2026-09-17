/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tests for `LayerMixer` — console shell, channel strips, master strip,
 * playback controls, mute/solo clearing, per-layer EQ and the real-time
 * metering effect.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import { LayerMixer } from './LayerMixer';
import { DEFAULT_ENVELOPE, DEFAULT_FX, type SoundLayer } from '../types';

const makeLayer = (over: Partial<SoundLayer> = {}): SoundLayer => ({
  id: 'layer-1',
  name: 'Kick',
  type: 'sample',
  enabled: true,
  gain: 0.8,
  pan: 0,
  pitch: 0,
  envelope: DEFAULT_ENVELOPE,
  fx: { ...DEFAULT_FX },
  ...over,
});

type Props = ComponentProps<typeof LayerMixer>;

const renderMixer = (over: Partial<Props> = {}) => {
  const props: Props = {
    layers: [makeLayer()],
    selectedLayerId: 'layer-1',
    onSelectLayer: vi.fn(),
    onUpdateLayer: vi.fn(),
    onPlayLayer: vi.fn(),
    onPlayAll: vi.fn(),
    onStop: vi.fn(),
    isPlaying: false,
    loopEnabled: false,
    onToggleLoop: vi.fn(),
    masterLevel: 0.8,
    onUpdateMasterLevel: vi.fn(),
    onDuplicateLayer: vi.fn(),
    onCopyFX: vi.fn(),
    onPasteFX: vi.fn(),
    onRandomizePitchPan: vi.fn(),
    onReorderLayer: vi.fn(),
    ...over,
  };
  return { ...render(<LayerMixer {...props} />), props };
};

describe('LayerMixer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the console shell with no layers', () => {
    renderMixer({ layers: [], selectedLayerId: null });
    expect(screen.getByText('CONSOLE_BOARD_STATION')).toBeDefined();
    expect(screen.getByText('MAIN_MIXER')).toBeDefined();
  });

  it('renders a channel strip and the per-layer EQ panel for the selection', () => {
    renderMixer();
    expect(screen.getByText('Kick')).toBeDefined();
    expect(screen.getByText(/Parametric EQ/)).toBeDefined();
  });

  it('updates a layer from the channel strip controls', () => {
    const { props } = renderMixer();
    fireEvent.click(screen.getByTitle('Bypass Track'));
    expect(props.onUpdateLayer).toHaveBeenCalledWith('layer-1', { enabled: false });

    fireEvent.click(screen.getByTitle('Mute Channel'));
    expect(props.onUpdateLayer).toHaveBeenCalledWith('layer-1', { muted: true });

    fireEvent.click(screen.getByTitle('Solo Channel'));
    expect(props.onUpdateLayer).toHaveBeenCalledWith('layer-1', { soloed: true });
  });

  it('clears all mutes and solos', () => {
    const { props } = renderMixer({
      layers: [makeLayer({ id: 'a', muted: true }), makeLayer({ id: 'b', soloed: true })],
    });
    fireEvent.click(screen.getByText(/Clear Mutes/i));
    expect(props.onUpdateLayer).toHaveBeenCalledWith('a', { muted: false });

    fireEvent.click(screen.getByText(/Clear Solos/i));
    expect(props.onUpdateLayer).toHaveBeenCalledWith('b', { soloed: false });
  });

  it('wires the transport buttons', () => {
    const { props } = renderMixer();
    fireEvent.click(screen.getByTitle('Enable Loop Playback'));
    expect(props.onToggleLoop).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Stop All Sources Instantly'));
    expect(props.onStop).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Trigger All Enabled Tracks Combined'));
    expect(props.onPlayAll).toHaveBeenCalled();
  });

  it('shows playing state and toggles fullscreen', () => {
    renderMixer({ isPlaying: true, loopEnabled: true });
    expect(screen.getByText(/Playing Mix/i)).toBeDefined();
    expect(screen.getByText(/LOOPING/i)).toBeDefined();
    fireEvent.click(screen.getByTitle('Fullscreen Mixer'));
    expect(screen.getByTitle('Exit Fullscreen')).toBeDefined();
  });

  it('updates the master level from the master fader', () => {
    const { props } = renderMixer();
    fireEvent.keyDown(screen.getByLabelText('LR_VOL'), { key: 'ArrowUp' });
    expect(props.onUpdateMasterLevel).toHaveBeenCalled();
  });

  it('writes EQ band changes back to the selected layer', () => {
    const { props } = renderMixer();
    fireEvent.click(screen.getByText(/Bypass All/i));
    expect(props.onUpdateLayer).toHaveBeenCalledWith(
      'layer-1',
      expect.objectContaining({ fx: expect.objectContaining({ eq: expect.any(Array) }) }),
    );
  });

  it('runs the metering loop while playing and cleans it up on unmount', () => {
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCancel = globalThis.cancelAnimationFrame;
    let cb: FrameRequestCallback | null = null;
    (globalThis as any).requestAnimationFrame = (fn: FrameRequestCallback) => {
      cb = fn;
      return 42;
    };
    const cancel = vi.fn();
    (globalThis as any).cancelAnimationFrame = cancel;

    try {
      const { unmount } = renderMixer({ isPlaying: true });
      expect(cb).toBeTypeOf('function');
      act(() => cb!(16));
      unmount();
      expect(cancel).toHaveBeenCalledWith(42);
    } finally {
      (globalThis as any).requestAnimationFrame = originalRaf;
      (globalThis as any).cancelAnimationFrame = originalCancel;
    }
  });
});
