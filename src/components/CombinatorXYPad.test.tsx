import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CombinatorXYPad } from './CombinatorXYPad';

describe('CombinatorXYPad', () => {
  it('renders canvas', () => {
    render(<CombinatorXYPad x={0.5} y={0.5} onChange={() => {}} />);
    expect(screen.getByText(/0.50/)).toBeTruthy();
  });

  it('calls onChange on pointer down', () => {
    const onChange = vi.fn();
    render(<CombinatorXYPad x={0.5} y={0.5} onChange={onChange} />);
    const canvas = document.querySelector('canvas')!;
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
    expect(onChange).toHaveBeenCalled();
  });

  it('record toggle', () => {
    const onToggle = vi.fn();
    render(<CombinatorXYPad x={0.5} y={0.5} onChange={() => {}} recording={false} onRecordToggle={onToggle} />);
    fireEvent.click(screen.getByText('Record'));
    expect(onToggle).toHaveBeenCalled();
  });
});
