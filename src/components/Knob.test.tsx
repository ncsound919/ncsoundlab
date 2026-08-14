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

  it('handles ArrowDown / ArrowLeft decrement', () => {
    const onChange = vi.fn();
    render(<Knob label="Gain" value={0.5} min={0} max={1} step={0.1} onChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.focus(slider);
    fireEvent.keyDown(slider, { key: 'ArrowDown' });
    expect(onChange).toHaveBeenCalledWith(0.4);
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(0.4);
  });

  it('uses a fine step for the Shift key', () => {
    const onChange = vi.fn();
    render(<Knob label="Gain" value={0.55} min={0} max={1} step={0.05} onChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.focus(slider);
    fireEvent.keyDown(slider, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(0.6);
    fireEvent.keyDown(slider, { key: 'ArrowUp', shiftKey: true });
    expect(onChange).toHaveBeenCalledWith(0.55);
  });

  it('commits a typed value via the input field', () => {
    const onChange = vi.fn();
    render(<Knob label="Gain" value={0.5} min={0} max={1} step={0.1} onChange={onChange} />);
    fireEvent.click(screen.getByText('0.5'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0.7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(0.7);
  });

  it('cancels editing on Escape and ignores invalid input on blur', () => {
    const onChange = vi.fn();
    render(<Knob label="Gain" value={0.5} min={0} max={1} step={0.1} onChange={onChange} />);
    fireEvent.click(screen.getByText('0.5'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.click(screen.getByText('0.5'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abc' } });
    fireEvent.blur(screen.getByRole('textbox'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('drags the knob to change the value, honoring shift sensitivity', () => {
    const onChange = vi.fn();
    render(<Knob label="Cutoff" value={500} min={20} max={20000} onChange={onChange} />);
    const slider = screen.getByRole('slider');
    (slider as any).setPointerCapture = vi.fn();
    fireEvent.pointerDown(slider, { clientY: 100, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerMove(document, { clientY: 80, pointerId: 1 });
    expect(onChange).toHaveBeenCalled();
    fireEvent.pointerUp(document, { pointerId: 1 });
  });

  it('snaps to integers when dragging with alt held', () => {
    const onChange = vi.fn();
    render(<Knob label="Ratio" value={4} min={1} max={20} step={0.01} onChange={onChange} />);
    const slider = screen.getByRole('slider');
    (slider as any).setPointerCapture = vi.fn();
    fireEvent.pointerDown(slider, { clientY: 100, pointerId: 2, pointerType: 'mouse' });
    fireEvent.pointerMove(document, { clientY: 50, pointerId: 2, altKey: true });
    fireEvent.pointerUp(document, { pointerId: 2 });
    expect(onChange).toHaveBeenCalled();
  });
});
