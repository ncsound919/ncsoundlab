/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Knob } from './Knob';
import React from 'react';

describe('Knob Component', () => {
  it('renders label and current value', () => {
    const onChange = vi.fn();
    render(
      <Knob
        label="Cutoff"
        value={1000}
        min={20}
        max={20000}
        unit="Hz"
        onChange={onChange}
      />
    );

    expect(screen.getByText('Cutoff')).toBeDefined();
    expect(screen.getByText('1.0k')).toBeDefined();
  });

  it('handles keyboard increment/decrement', () => {
    const onChange = vi.fn();
    render(
      <Knob
        label="Gain"
        value={0.5}
        min={0}
        max={1}
        step={0.1}
        onChange={onChange}
      />
    );

    const slider = screen.getByRole('slider');
    fireEvent.focus(slider);
    fireEvent.keyDown(slider, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(0.6);
  });

  it('handles Home and End keys', () => {
    const onChange = vi.fn();
    render(
      <Knob
        label="Resonance"
        value={1}
        min={0.1}
        max={20}
        onChange={onChange}
      />
    );

    const slider = screen.getByRole('slider');
    fireEvent.focus(slider);
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(onChange).toHaveBeenCalledWith(0.1);

    fireEvent.keyDown(slider, { key: 'End' });
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it('supports double click to reset', () => {
    const onChange = vi.fn();
    render(
      <Knob
        label="Detune"
        value={12}
        min={-24}
        max={24}
        defaultValue={0}
        onChange={onChange}
      />
    );

    const slider = screen.getByRole('slider');
    fireEvent.doubleClick(slider);
    expect(onChange).toHaveBeenCalledWith(0);
  });
});
