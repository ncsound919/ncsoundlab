/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HeaderTransport, bpmFromTaps } from './HeaderTransport';

describe('bpmFromTaps', () => {
  it('needs at least two taps', () => {
    expect(bpmFromTaps([])).toBeNull();
    expect(bpmFromTaps([1000])).toBeNull();
  });

  it('computes tempo from the average interval', () => {
    expect(bpmFromTaps([0, 500, 1000])).toBe(120);
    expect(bpmFromTaps([0, 600])).toBe(100);
  });

  it('clamps to the supported range', () => {
    expect(bpmFromTaps([0, 10])).toBe(240);
    expect(bpmFromTaps([0, 5000])).toBe(60);
  });
});

describe('HeaderTransport', () => {
  const make = () => ({
    isPlaying: false,
    onTogglePlay: vi.fn(),
    bpm: 120,
    onBpmChange: vi.fn(),
    keyName: 'C',
    scaleName: 'major',
  });

  it('toggles playback', () => {
    const p = make();
    render(<HeaderTransport {...p} />);
    fireEvent.click(screen.getByLabelText(/play master mix/i));
    expect(p.onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('nudges tempo and clamps typed values', () => {
    const p = make();
    render(<HeaderTransport {...p} />);
    fireEvent.click(screen.getByLabelText('Increase tempo'));
    expect(p.onBpmChange).toHaveBeenLastCalledWith(121);
    fireEvent.change(screen.getByLabelText('Tempo BPM'), { target: { value: '999' } });
    expect(p.onBpmChange).toHaveBeenLastCalledWith(240);
  });

  it('shows the current key and scale', () => {
    render(<HeaderTransport {...make()} />);
    expect(screen.getByTitle(/Current key & scale/i).textContent).toContain('C major');
  });

  it('decreases tempo', () => {
    const p = make();
    render(<HeaderTransport {...p} />);
    fireEvent.click(screen.getByLabelText('Decrease tempo'));
    expect(p.onBpmChange).toHaveBeenLastCalledWith(119);
  });

  it('estimates tempo from taps', () => {
    const p = make();
    let clock = 0;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock);
    try {
      render(<HeaderTransport {...p} />);
      const tap = screen.getByLabelText('Tap tempo');
      clock = 0; fireEvent.click(tap);
      clock = 500; fireEvent.click(tap);
      clock = 1000; fireEvent.click(tap);
      expect(p.onBpmChange).toHaveBeenLastCalledWith(120);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('ignores a stale tap after a long pause', () => {
    const p = make();
    let clock = 0;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clock);
    try {
      render(<HeaderTransport {...p} />);
      const tap = screen.getByLabelText('Tap tempo');
      clock = 0; fireEvent.click(tap);      // t=0
      clock = 5000; fireEvent.click(tap);   // t=5000 -> resets the tap buffer
      clock = 5500; fireEvent.click(tap);   // t=5500 -> 500ms interval => 120 bpm
      expect(p.onBpmChange).toHaveBeenLastCalledWith(120);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
