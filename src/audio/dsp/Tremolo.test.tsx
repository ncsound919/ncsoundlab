/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Coverage for `src/audio/dsp/Tremolo.tsx` (`AdvancedTremoloEditor`), which
 * sat at ~29% statement coverage: LFO shape switching plus the Rate / Depth
 * knobs, including the `??` fallbacks for missing values.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import {
  AdvancedTremoloEditor,
  DEFAULT_TREMOLO_SETTINGS,
  type TremoloSettings,
} from './Tremolo';

describe('DEFAULT_TREMOLO_SETTINGS', () => {
  it('has sane musical defaults', () => {
    expect(DEFAULT_TREMOLO_SETTINGS).toMatchObject({ rate: 4, depth: 60, shape: 'sine' });
  });
});

describe('AdvancedTremoloEditor', () => {
  const onChange = vi.fn<(next: TremoloSettings) => void>();

  beforeEach(() => {
    onChange.mockReset();
  });

  const renderEditor = (settings: TremoloSettings = { ...DEFAULT_TREMOLO_SETTINGS }) =>
    render(<AdvancedTremoloEditor moduleId="trem-1" settings={settings} onChange={onChange} />);

  it('renders the engine header, shape buttons and both knobs', () => {
    renderEditor();
    expect(screen.getByText('TREMOLO LFO ENGINE')).toBeDefined();
    expect(screen.getByRole('button', { name: 'SINE' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'SQUARE' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'TRIANGLE' })).toBeDefined();
    expect(screen.getByRole('slider', { name: 'Rate' }).getAttribute('aria-valuenow')).toBe('4');
    expect(screen.getByRole('slider', { name: 'Depth' }).getAttribute('aria-valuenow')).toBe('60');
  });

  it('switches the LFO shape while preserving rate/depth', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'SQUARE' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ rate: 4, depth: 60, shape: 'square' });

    onChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'TRIANGLE' }));
    expect(onChange).toHaveBeenCalledWith({ rate: 4, depth: 60, shape: 'triangle' });
  });

  it('falls back to sine highlight when shape is undefined', () => {
    renderEditor({ rate: 4, depth: 60, shape: undefined });
    // Clicking SINE still emits a fully-specified settings object.
    fireEvent.click(screen.getByRole('button', { name: 'SINE' }));
    expect(onChange).toHaveBeenCalledWith({ rate: 4, depth: 60, shape: 'sine' });
  });

  it('updates rate through its knob', () => {
    renderEditor();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Rate' }), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.rate).toBeCloseTo(4.1, 5);
    expect(next.depth).toBe(60);
    expect(next.shape).toBe('sine');
  });

  it('updates depth through its knob', () => {
    renderEditor();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Depth' }), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.depth).toBe(61);
    expect(next.rate).toBe(4);
  });

  it('falls back to default knob positions when rate/depth are missing', () => {
    renderEditor({} as unknown as TremoloSettings);
    expect(screen.getByRole('slider', { name: 'Rate' }).getAttribute('aria-valuenow')).toBe('4');
    expect(screen.getByRole('slider', { name: 'Depth' }).getAttribute('aria-valuenow')).toBe('60');
  });
});
