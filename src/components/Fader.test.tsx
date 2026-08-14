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

  it('handles ArrowDown, Home and End keys', () => {
    const onChange = vi.fn();
    render(
      <Fader label="Send" value={0.5} min={0} max={1} step={0.1} onChange={onChange} />
    );
    const slider = screen.getByRole('slider');
    fireEvent.focus(slider);
    fireEvent.keyDown(slider, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenCalledWith(0.4);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(0.4);
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(onChange).toHaveBeenCalledWith(0);
    fireEvent.keyDown(slider, { key: 'End' });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('resets to defaultValue on double-click', () => {
    const onChange = vi.fn();
    render(
      <Fader label="Send" value={0.8} min={0} max={1} defaultValue={0.5} onChange={onChange} />
    );
    const slider = screen.getByRole('slider');
    fireEvent.doubleClick(slider);
    expect(onChange).toHaveBeenCalledWith(0.5);
  });

  it('drags the track to set the value', () => {
    const onChange = vi.fn();
    render(
      <Fader label="Volume" value={0.5} min={0} max={1} step={0.01} onChange={onChange} />
    );
    const slider = screen.getByRole('slider');
    (slider as any).setPointerCapture = vi.fn();
    slider.getBoundingClientRect = () =>
      ({ top: 0, bottom: 128, left: 0, right: 36, width: 36, height: 128 }) as DOMRect;
    fireEvent.pointerDown(slider, { clientY: 100, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerMove(document, { clientY: 32, pointerId: 1 });
    expect(onChange).toHaveBeenCalled();
    fireEvent.pointerUp(document, { pointerId: 1 });
  });
});
