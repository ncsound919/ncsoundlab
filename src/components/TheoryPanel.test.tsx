/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TheoryPanel } from './TheoryPanel';

describe('TheoryPanel', () => {
  let onPlayNote: ReturnType<typeof vi.fn>;
  let onStopNote: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onPlayNote = vi.fn();
    onStopNote = vi.fn();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the empty state with controls and no optional actions', () => {
    render(<TheoryPanel onPlayNote={onPlayNote} onStopNote={onStopNote} />);
    expect(screen.getByText('Theory Assistant')).toBeDefined();
    expect(screen.getByRole('button', { name: /Generate/i })).toBeDefined();
    expect(screen.getByText(/Pick a key\/scale and hit Generate/)).toBeDefined();
    // Four selects: key, scale, mode, complexity
    expect(screen.getAllByRole('combobox').length).toBe(4);
    expect(screen.queryByRole('button', { name: /Apply to Pattern/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Roots/i })).toBeNull();
  });

  it('generates a progression and shows chords, summary and score', () => {
    render(<TheoryPanel onPlayNote={onPlayNote} onStopNote={onStopNote} />);
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    // Chord buttons appear (title starts with "Preview ")
    const chords = screen.getAllByTitle(/^Preview /);
    expect(chords.length).toBeGreaterThan(0);
    expect(screen.getByText(/beats ·/)).toBeDefined();
    expect(screen.getByText(/score /)).toBeDefined();
  });

  it('applies every control (key/scale/mode/bars/complexity/seed) before generating', () => {
    const onApplyToPattern = vi.fn();
    const onSendToPads = vi.fn();
    const { container } = render(
      <TheoryPanel onPlayNote={onPlayNote} onStopNote={onStopNote} onApplyToPattern={onApplyToPattern} onSendToPads={onSendToPads} />
    );
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    fireEvent.change(selects[0], { target: { value: 'G' } });
    fireEvent.change(selects[1], { target: { value: 'minor' } });
    fireEvent.change(selects[2], { target: { value: 'section' } });
    fireEvent.change(selects[3], { target: { value: '2' } });
    const bars = container.querySelector('input[type="number"]') as HTMLInputElement;
    const numbers = container.querySelectorAll('input[type="number"]');
    fireEvent.change(numbers[0], { target: { value: '4' } });
    fireEvent.change(numbers[1], { target: { value: '7' } });
    expect((numbers[0] as HTMLInputElement).value).toBe('4');
    expect((numbers[1] as HTMLInputElement).value).toBe('7');
    void bars;
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    expect(screen.getByText(/seed 7/)).toBeDefined();
    // Optional actions appear only when callbacks are provided
    expect(screen.getByRole('button', { name: /Apply to Pattern/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Roots/i })).toBeDefined();
  });

  it('previews a chord via the note path and auto-stops after 1.5s', () => {
    vi.useFakeTimers();
    render(<TheoryPanel onPlayNote={onPlayNote} onStopNote={onStopNote} />);
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    const first = screen.getAllByTitle(/^Preview /)[0];
    fireEvent.click(first);
    expect(onPlayNote).toHaveBeenCalled();
    // Highlight moves to the playing chord
    expect(first.className).toContain('bg-amber-500');
    act(() => { vi.advanceTimersByTime(1600); });
    expect(onStopNote).toHaveBeenCalled();
  });

  it('re-clicking another chord stops cleanly and rapid clicks do not stack timers', () => {
    vi.useFakeTimers();
    render(<TheoryPanel onPlayNote={onPlayNote} onStopNote={onStopNote} />);
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    const chords = screen.getAllByTitle(/^Preview /);
    if (chords.length < 2) {
      // Single-chord progression: same chord twice still plays twice
      fireEvent.click(chords[0]);
      fireEvent.click(chords[0]);
    } else {
      fireEvent.click(chords[0]);
      fireEvent.click(chords[1]);
    }
    expect(onPlayNote).toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1600); });
    expect(onStopNote).toHaveBeenCalled();
  });

  it('sends roots to pads and applies voiced chords to the pattern', () => {
    const onApplyToPattern = vi.fn();
    const onSendToPads = vi.fn();
    render(
      <TheoryPanel onPlayNote={onPlayNote} onStopNote={onStopNote} onApplyToPattern={onApplyToPattern} onSendToPads={onSendToPads} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    fireEvent.click(screen.getByRole('button', { name: /Roots/i }));
    expect(onSendToPads).toHaveBeenCalledTimes(1);
    const roots = onSendToPads.mock.calls[0][0] as string[];
    expect(Array.isArray(roots)).toBe(true);
    expect(roots.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Apply to Pattern/i }));
    expect(onApplyToPattern).toHaveBeenCalledTimes(1);
    expect(Array.isArray(onApplyToPattern.mock.calls[0][0])).toBe(true);
  });

  it('cleans up the preview timer on unmount without crashing', () => {
    vi.useFakeTimers();
    const { unmount } = render(<TheoryPanel onPlayNote={onPlayNote} onStopNote={onStopNote} />);
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    fireEvent.click(screen.getAllByTitle(/^Preview /)[0]);
    unmount();
    act(() => { vi.advanceTimersByTime(5000); });
    // The unmount effect cleared the pending 1.5s auto-stop, so it must never fire.
    expect(onStopNote).not.toHaveBeenCalled();
  });

  it('shows the placeholder hint again only before first generation', () => {
    render(<TheoryPanel onPlayNote={onPlayNote} onStopNote={onStopNote} />);
    expect(screen.queryByText(/Pick a key\/scale/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Generate/i }));
    expect(screen.queryByText(/Pick a key\/scale/)).toBeNull();
  });
});
