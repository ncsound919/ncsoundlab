/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Fader } from './Fader';
import React from 'react';

describe('Fader Component', () => {
  it('renders label and value correctly', () => {
    const onChange = vi.fn();
    render(
      <Fader
        label="Volume"
        value={0.8}
        min={0}
        max={1}
        unit="dB"
        onChange={onChange}
      />
    );

    expect(screen.getByText('Volume')).toBeDefined();
    expect(screen.getByText('0.8')).toBeDefined();
  });

  it('handles keyboard navigation on fader', () => {
    const onChange = vi.fn();
    render(
      <Fader
        label="Send"
        value={0.2}
        min={0}
        max={1}
        step={0.1}
        onChange={onChange}
      />
    );

    const slider = screen.getByRole('slider');
    fireEvent.focus(slider);
    fireEvent.keyDown(slider, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(0.3);
  });
});
