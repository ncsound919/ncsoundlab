/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exhaustive interaction coverage for `PerformanceControls`: enable/disable,
 * setup panel toggles, scale-lock / chord-mode / split controls, QWERTY pad
 * triggers (mapped, unmapped-layer, unknown key, shift velocity), melodic
 * note on/off (plain + chord mode), modifier/typing guards, and split-note
 * parsing fallback.
 */

import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerformanceControls } from './PerformanceControls';

const layers = [
  { id: 'layer-1', name: 'Drums', kind: 'drum', engine: 'sampler' },
  { id: 'layer-2', name: 'Bass', kind: 'bass', engine: 'synth' },
] as never;

const padSlots = (): (string | null)[] => {
  const slots: (string | null)[] = Array(16).fill(null);
  slots[0] = 'layer-1';
  return slots;
};

const baseProps = () => ({
  padSlots: padSlots(),
  layers,
  onTriggerPad: vi.fn(),
  onPlayNote: vi.fn(),
  onStopNote: vi.fn(),
});

const keyDown = (key: string, init: KeyboardEventInit = {}) => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  });
};
const keyUp = (key: string, init: KeyboardEventInit = {}) => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, ...init }));
  });
};

describe('PerformanceControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders collapsed with Keys On and a Setup toggle', () => {
    render(<PerformanceControls {...baseProps()} />);
    expect(screen.getByText('Performance')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Keys On' })).toBeDefined();
    expect(screen.getByRole('button', { name: /Setup/ })).toBeDefined();
    expect(screen.queryByText('Scale')).toBeNull();
  });

  it('toggles the setup panel open and closed', () => {
    render(<PerformanceControls {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Setup/ }));
    expect(screen.getByText('Scale')).toBeDefined();
    expect(screen.getByText('Chord')).toBeDefined();
    expect(screen.getByText('Split')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Hide/ }));
    expect(screen.queryByText('Scale')).toBeNull();
  });

  it('Keys Off suppresses all triggers until re-enabled', () => {
    const props = baseProps();
    render(<PerformanceControls {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Keys On' }));
    expect(screen.getByRole('button', { name: 'Keys Off' })).toBeDefined();
    keyDown('z');
    keyDown('a');
    expect(props.onTriggerPad).not.toHaveBeenCalled();
    expect(props.onPlayNote).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Keys Off' }));
    keyDown('z');
    expect(props.onTriggerPad).toHaveBeenCalledTimes(1);
  });

  it('triggers a mapped pad with full velocity and shift velocity', () => {
    const props = baseProps();
    render(<PerformanceControls {...props} />);
    keyDown('z');
    expect(props.onTriggerPad).toHaveBeenCalledWith(0, 1);

    keyDown('z', { shiftKey: true });
    const last = props.onTriggerPad.mock.calls.at(-1) as [number, number];
    expect(last[0]).toBe(0);
    expect(last[1]).toBeLessThan(1);
  });

  it('ignores pad keys with no layer assigned and unknown keys', () => {
    const props = baseProps();
    render(<PerformanceControls {...props} />);
    keyDown('x'); // padIndex 2 → null slot
    expect(props.onTriggerPad).not.toHaveBeenCalled();
    keyDown('q'); // neither pad nor note key
    expect(props.onTriggerPad).not.toHaveBeenCalled();
    expect(props.onPlayNote).not.toHaveBeenCalled();
  });

  it('plays and stops a melodic note on key down/up', () => {
    const props = baseProps();
    render(<PerformanceControls {...props} />);
    keyDown('a');
    expect(props.onPlayNote).toHaveBeenCalledTimes(1);
    expect(props.onPlayNote).toHaveBeenCalledWith(60, expect.any(Number));
    keyUp('a');
    expect(props.onStopNote).toHaveBeenCalledWith(60);
  });

  it('keyup for an unknown key is a no-op', () => {
    const props = baseProps();
    render(<PerformanceControls {...props} />);
    keyUp('q');
    expect(props.onStopNote).not.toHaveBeenCalled();
  });

  it('ignores modified keys and typing in form fields', () => {
    const props = baseProps();
    render(<PerformanceControls {...props} />);
    keyDown('z', { ctrlKey: true });
    keyDown('z', { metaKey: true });
    keyDown('z', { altKey: true });
    expect(props.onTriggerPad).not.toHaveBeenCalled();

    // Focus a text field: the typing guard skips triggers.
    fireEvent.click(screen.getByRole('button', { name: /Setup/ }));
    const splitNote = screen.getByDisplayValue('60') as HTMLInputElement;
    splitNote.focus();
    expect(document.activeElement?.tagName).toBe('INPUT');
    keyDown('z');
    keyDown('a');
    expect(props.onTriggerPad).not.toHaveBeenCalled();
    expect(props.onPlayNote).not.toHaveBeenCalled();
    splitNote.blur();
  });

  it('toggles scale lock and changes root + scale preset', () => {
    const props = baseProps();
    render(<PerformanceControls {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Setup/ }));
    const selects = screen.getAllByRole('combobox');
    // root select defaults to C.
    fireEvent.change(selects[0], { target: { value: 'G' } });
    fireEvent.change(selects[1], { target: { value: 'major' } });
    fireEvent.click(screen.getByRole('button', { name: /Scale lock (on|off)/ }));
    keyDown('a');
    expect(props.onPlayNote).toHaveBeenCalled();
    const midi = (props.onPlayNote.mock.calls[0] as [number, number])[0];
    expect(typeof midi).toBe('number');
    keyUp('a');
  });

  it('chord mode plays a chord per press and stops all tones on release', () => {
    const props = baseProps();
    render(<PerformanceControls {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Setup/ }));
    fireEvent.click(screen.getByRole('button', { name: /Chord mode (on|off)/ }));
    fireEvent.change(screen.getAllByRole('combobox')[2], { target: { value: 'min7' } });

    keyDown('f');
    expect(props.onPlayNote.mock.calls.length).toBeGreaterThan(1);
    keyUp('f');
    expect(props.onStopNote.mock.calls.length).toBe(props.onPlayNote.mock.calls.length);
    // Release without held notes is safe.
    keyUp('f');
  });

  it('configures the keyboard split: layers + split note + enable', () => {
    render(<PerformanceControls {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Setup/ }));
    const selects = screen.getAllByRole('combobox');
    // Lower + upper layer selects.
    fireEvent.change(selects[3], { target: { value: 'layer-1' } });
    fireEvent.change(selects[4], { target: { value: 'layer-2' } });
    expect((selects[3] as HTMLSelectElement).value).toBe('layer-1');
    expect((selects[4] as HTMLSelectElement).value).toBe('layer-2');

    const splitNote = screen.getByDisplayValue('60');
    fireEvent.change(splitNote, { target: { value: '64' } });
    expect((splitNote as HTMLInputElement).value).toBe('64');
    fireEvent.click(screen.getByRole('button', { name: /Split (on|off)/ }));
    expect(screen.getByRole('button', { name: /Split on/ })).toBeDefined();
  });

  it('falls back to middle C for an unparseable split note', () => {
    render(<PerformanceControls {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /Setup/ }));
    const splitNote = screen.getByDisplayValue('60');
    fireEvent.change(splitNote, { target: { value: '' } });
    expect((splitNote as HTMLInputElement).value).toBe('60');
  });

  it('unmounting removes the window listeners', () => {
    const props = baseProps();
    const { unmount } = render(<PerformanceControls {...props} />);
    unmount();
    keyDown('z');
    expect(props.onTriggerPad).not.toHaveBeenCalled();
  });
});
