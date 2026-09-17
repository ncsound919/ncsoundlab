/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChannelStrip } from './ChannelStrip';
import { SoundLayer, DEFAULT_ENVELOPE, DEFAULT_FX } from '../types';

const makeLayer = (overrides: Record<string, unknown> = {}): SoundLayer =>
  ({
    id: 'l1',
    name: 'Kick',
    type: 'synth',
    enabled: true,
    gain: 0.8,
    pan: 0,
    pitch: 0,
    envelope: DEFAULT_ENVELOPE,
    fx: { ...DEFAULT_FX },
    ...overrides,
  } as unknown as SoundLayer);

const handlers = () => ({
  onSelectLayer: vi.fn(),
  onUpdateLayer: vi.fn(),
  onDuplicateLayer: vi.fn(),
  onCopyFX: vi.fn(),
  onPasteFX: vi.fn(),
  onRandomizePitchPan: vi.fn(),
  onReorderLayer: vi.fn(),
});

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  layer: makeLayer(),
  index: 0,
  isSelected: false,
  peak: 0.3,
  ...handlers(),
  ...overrides,
});

describe('ChannelStrip', () => {
  it('renders channel number, name and synth type label', () => {
    render(<ChannelStrip {...baseProps()} />);
    expect(screen.getByText('CH 01')).toBeDefined();
    expect(screen.getByText('Kick')).toBeDefined();
    expect(screen.getByText(/SYNTH/)).toBeDefined();
  });

  it('renders sample type label and padded numbers for later channels', () => {
    render(<ChannelStrip {...baseProps({ layer: makeLayer({ type: 'sample', name: 'Break' }), index: 9 })} />);
    expect(screen.getByText(/SAMPLE/)).toBeDefined();
    expect(screen.getByText('CH 10')).toBeDefined();
  });

  it('selects the layer when the strip is clicked', () => {
    const props = baseProps();
    const { container } = render(<ChannelStrip {...props} />);
    fireEvent.click(container.querySelector('[data-channel-strip]')!);
    expect(props.onSelectLayer).toHaveBeenCalledWith('l1');
  });

  it('toggles the power LED (enabled on/off)', () => {
    const props = baseProps();
    const { rerender } = render(<ChannelStrip {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bypass Track' }));
    expect(props.onUpdateLayer).toHaveBeenCalledWith('l1', { enabled: false });
    rerender(<ChannelStrip {...props} layer={makeLayer({ enabled: false })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Activate Track' }));
    expect(props.onUpdateLayer).toHaveBeenCalledWith('l1', { enabled: true });
  });

  it('dims the strip when the layer is disabled', () => {
    const { container } = render(<ChannelStrip {...baseProps({ layer: makeLayer({ enabled: false }) })} />);
    expect((container.querySelector('[data-channel-strip]') as HTMLElement).className).toContain('opacity-40');
  });

  it('toggles mute and solo', () => {
    const props = baseProps();
    render(<ChannelStrip {...props} />);
    fireEvent.click(screen.getByTitle('Mute Channel'));
    expect(props.onUpdateLayer).toHaveBeenCalledWith('l1', { muted: true });
    fireEvent.click(screen.getByTitle('Solo Channel'));
    expect(props.onUpdateLayer).toHaveBeenCalledWith('l1', { soloed: true });
  });

  it('disables the up reorder button at index 0 and calls reorder otherwise', () => {
    const first = baseProps({ index: 0 });
    const { unmount } = render(<ChannelStrip {...first} />);
    expect((screen.getByTitle('Move Layer Up') as HTMLButtonElement).disabled).toBe(true);
    unmount();
    const later = baseProps({ index: 2 });
    render(<ChannelStrip {...later} />);
    fireEvent.click(screen.getByTitle('Move Layer Up'));
    expect(later.onReorderLayer).toHaveBeenCalledWith('l1', 'up');
    fireEvent.click(screen.getByTitle('Move Layer Down'));
    expect(later.onReorderLayer).toHaveBeenCalledWith('l1', 'down');
  });

  it('does not crash on reorder clicks when no reorder callback is given', () => {
    const { onReorderLayer: _omit, ...rest } = baseProps({ index: 2 });
    void _omit;
    render(<ChannelStrip {...rest} />);
    fireEvent.click(screen.getByTitle('Move Layer Up'));
    fireEvent.click(screen.getByTitle('Move Layer Down'));
  });

  it('turns the Trigger Delay and PAN knobs', () => {
    const props = baseProps();
    render(<ChannelStrip {...props} />);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Trigger Delay' }), { key: 'ArrowUp' });
    expect(props.onUpdateLayer).toHaveBeenCalledWith('l1', { startTimeOffset: expect.any(Number) });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'PAN' }), { key: 'ArrowUp' });
    expect(props.onUpdateLayer).toHaveBeenCalledWith('l1', { pan: expect.any(Number) });
  });

  it('shows crop boundaries with defaults and custom values', () => {
    const { rerender } = render(<ChannelStrip {...baseProps()} />);
    expect(screen.getByText('0%')).toBeDefined();
    expect(screen.getByText('100%')).toBeDefined();
    rerender(<ChannelStrip {...baseProps({ layer: makeLayer({ playStartPct: 0.25, playEndPct: 0.75 }) })} />);
    expect(screen.getByText('25%')).toBeDefined();
    expect(screen.getByText('75%')).toBeDefined();
  });

  it('shows the send-level meter only when sendLevel is a number', () => {
    const { container, rerender } = render(<ChannelStrip {...baseProps()} />);
    expect(container.innerHTML).not.toContain('SND');
    rerender(<ChannelStrip {...baseProps({ sendLevel: 0.5 })} />);
    expect(screen.getByText('SND')).toBeDefined();
  });

  it('renders per-bus sends and updates them via range inputs', () => {
    const props = baseProps({ layer: makeLayer({ sends: { reverb: 0.5, delay: 0.25 } }) });
    const { container } = render(<ChannelStrip {...props} />);
    expect(container.querySelector('[data-sends-row]')).not.toBeNull();
    const reverb = screen.getByRole('slider', { name: 'reverb send level' }) as HTMLInputElement;
    fireEvent.change(reverb, { target: { value: '0.9' } });
    expect(props.onUpdateLayer).toHaveBeenCalledWith('l1', { sends: { reverb: 0.9, delay: 0.25 } });
    expect(screen.getByText('50%')).toBeDefined();
  });

  it('coerces non-numeric send levels to zero and hides empty sends', () => {
    const props = baseProps({ layer: makeLayer({ sends: { reverb: 'loud' } }) });
    const { container, unmount } = render(<ChannelStrip {...props} />);
    // Crop readout already shows 0%; the coerced send adds a second one
    expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('[data-sends-row]')).not.toBeNull();
    unmount();
    const bare = render(<ChannelStrip {...baseProps()} />);
    expect(bare.container.querySelector('[data-sends-row]')).toBeNull();
    bare.unmount();
  });

  it('shows the EQ badge from eqBands or enabled fx eq bands', () => {
    const { unmount } = render(<ChannelStrip {...baseProps({ eqBands: 3 })} />);
    expect(screen.getByText(/BAND/)).toBeDefined();
    unmount();
    const fxEq = { ...DEFAULT_FX, eq: [{ enabled: true }, { enabled: false }] } as unknown as typeof DEFAULT_FX;
    render(<ChannelStrip {...baseProps({ layer: makeLayer({ fx: fxEq }) })} />);
    expect(screen.getByText(/BAND/)).toBeDefined();
  });

  it('hides the EQ badge when there are no bands', () => {
    const { container } = render(<ChannelStrip {...baseProps()} />);
    expect(container.innerHTML).not.toContain('BAND');
  });

  it('renders peak meter gradients for low, mid and hot peaks', () => {
    // jsdom normalizes colors to rgb(), so match rgb triplets.
    const low = render(<ChannelStrip {...baseProps({ peak: 0.3 })} />);
    expect(low.container.innerHTML).toContain('16, 185, 129');
    low.unmount();
    const mid = render(<ChannelStrip {...baseProps({ peak: 0.7 })} />);
    expect(mid.container.innerHTML).toContain('245, 158, 11');
    mid.unmount();
    const hot = render(<ChannelStrip {...baseProps({ peak: 0.9 })} />);
    expect(hot.container.innerHTML).toContain('239, 68, 68');
    hot.unmount();
  });

  it('moves the GAIN fader', () => {
    const props = baseProps();
    render(<ChannelStrip {...props} />);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'GAIN' }), { key: 'ArrowUp' });
    expect(props.onUpdateLayer).toHaveBeenCalledWith('l1', { gain: expect.any(Number) });
  });

  it('fires all four quick actions', () => {
    const props = baseProps();
    render(<ChannelStrip {...props} />);
    fireEvent.click(screen.getByTitle('Duplicate Layer'));
    expect(props.onDuplicateLayer).toHaveBeenCalledWith('l1');
    fireEvent.click(screen.getByTitle('Copy FX Settings'));
    expect(props.onCopyFX).toHaveBeenCalledWith('l1');
    fireEvent.click(screen.getByTitle('Paste FX Settings'));
    expect(props.onPasteFX).toHaveBeenCalledWith('l1');
    fireEvent.click(screen.getByTitle('Randomize Pitch & Pan'));
    expect(props.onRandomizePitchPan).toHaveBeenCalledWith('l1');
  });

  it('does not crash on quick actions when callbacks are absent', () => {
    const { onDuplicateLayer: _a, onCopyFX: _b, onPasteFX: _c, onRandomizePitchPan: _d, ...rest } = baseProps();
    void [_a, _b, _c, _d];
    render(<ChannelStrip {...rest} />);
    fireEvent.click(screen.getByTitle('Duplicate Layer'));
    fireEvent.click(screen.getByTitle('Copy FX Settings'));
    fireEvent.click(screen.getByTitle('Paste FX Settings'));
    fireEvent.click(screen.getByTitle('Randomize Pitch & Pan'));
  });

  it('marks selected strips and bypassed data attributes', () => {
    const { container } = render(<ChannelStrip {...baseProps({ isSelected: true, bypassed: true })} />);
    const strip = container.querySelector('[data-channel-strip]') as HTMLElement;
    expect(strip.getAttribute('data-bypassed')).toBe('true');
    expect(strip.className).toContain('border-blue-500');
  });
});
