/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TransportBar } from './TransportBar';

const handlers = () => ({
  onBpmChange: vi.fn(),
  onPlayStop: vi.fn(),
  onUseTransportModeChange: vi.fn(),
  onTimeSignatureChange: vi.fn(),
  onStepLengthChange: vi.fn(),
  onSongModeToggle: vi.fn(),
  onRecordAudio: vi.fn(),
  onMixdown: vi.fn(),
});

const baseProps = (overrides: Record<string, unknown> = {}) => ({
  bpm: 120,
  isPlaying: false,
  useTransportMode: false,
  timeSignature: [4, 4] as [number, number],
  stepLength: 16 as 16 | 32,
  songModeActive: false,
  isRecordingAudio: false,
  isMixingDown: false,
  ...handlers(),
  ...overrides,
});

describe('TransportBar', () => {
  it('renders Play and starts playback on click', () => {
    const props = baseProps();
    render(<TransportBar {...props} />);
    const btn = screen.getByRole('button', { name: 'Play' });
    expect(btn).toBeDefined();
    fireEvent.click(btn);
    expect(props.onPlayStop).toHaveBeenCalledTimes(1);
  });

  it('renders Stop with the Stop aria-label when playing', () => {
    const props = baseProps({ isPlaying: true });
    render(<TransportBar {...props} />);
    const btn = screen.getByRole('button', { name: 'Stop' });
    fireEvent.click(btn);
    expect(props.onPlayStop).toHaveBeenCalledTimes(1);
  });

  it('changes BPM via the number input', () => {
    const props = baseProps({ bpm: 120 });
    const { container } = render(<TransportBar {...props} />);
    const input = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input.value).toBe('120');
    fireEvent.change(input, { target: { value: '140' } });
    expect(props.onBpmChange).toHaveBeenCalledWith(140);
  });

  it('toggles Tone Transport and Song Mode checkboxes', () => {
    const props = baseProps();
    const { container } = render(<TransportBar {...props} />);
    const boxes = container.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(boxes[0]);
    expect(props.onUseTransportModeChange).toHaveBeenCalledTimes(1);
    fireEvent.click(boxes[1]);
    expect(props.onSongModeToggle).toHaveBeenCalledTimes(1);
  });

  it('reflects checked states for both checkboxes', () => {
    render(<TransportBar {...baseProps({ useTransportMode: true, songModeActive: true })} />);
    const boxes = document.querySelectorAll('input[type="checkbox"]');
    expect((boxes[0] as HTMLInputElement).checked).toBe(true);
    expect((boxes[1] as HTMLInputElement).checked).toBe(true);
  });

  it('records audio and shows the recording state', () => {
    const idle = baseProps();
    const { rerender } = render(<TransportBar {...idle} />);
    fireEvent.click(screen.getByRole('button', { name: 'Record audio' }));
    expect(idle.onRecordAudio).toHaveBeenCalledTimes(1);

    const rec = baseProps({ isRecordingAudio: true });
    rerender(<TransportBar {...rec} />);
    const stopBtn = screen.getByRole('button', { name: 'Stop recording' });
    expect(stopBtn.textContent).toContain('Stop Audio');
    fireEvent.click(stopBtn);
    expect(rec.onRecordAudio).toHaveBeenCalledTimes(1);
  });

  it('mixes down when idle and disables while rendering', () => {
    const props = baseProps();
    const { rerender } = render(<TransportBar {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mixdown' }));
    expect(props.onMixdown).toHaveBeenCalledTimes(1);

    const busy = baseProps({ isMixingDown: true });
    rerender(<TransportBar {...busy} />);
    const btn = screen.getByRole('button', { name: 'Rendering…' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(busy.onMixdown).not.toHaveBeenCalled();
  });

  it('changes time signature to 3/4 and 6/8', () => {
    const props = baseProps();
    render(<TransportBar {...props} />);
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    // First select is Time Sig, second is Steps
    fireEvent.change(selects[0], { target: { value: '3/4' } });
    expect(props.onTimeSignatureChange).toHaveBeenCalledWith(3, 4);
    fireEvent.change(selects[0], { target: { value: '6/8' } });
    expect(props.onTimeSignatureChange).toHaveBeenCalledWith(6, 8);
  });

  it('reflects the current time signature value', () => {
    render(<TransportBar {...baseProps({ timeSignature: [6, 8] as [number, number] })} />);
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(selects[0].value).toBe('6/8');
  });

  it('changes step length between 16 and 32', () => {
    const props = baseProps();
    render(<TransportBar {...props} />);
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(selects[1].value).toBe('16');
    fireEvent.change(selects[1], { target: { value: '32' } });
    expect(props.onStepLengthChange).toHaveBeenCalledWith(32);
    fireEvent.change(selects[1], { target: { value: '16' } });
    expect(props.onStepLengthChange).toHaveBeenCalledWith(16);
  });
});
